import { createHash, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  PenelopeEnglishStyleProfileSchema,
  type PenelopeEnglishStyleProfile,
} from "@/src/contracts/world-narrator";
import { HashSchema, IdentifierSchema } from "@/src/contracts/common";
import {
  W5BlindAssignmentSchema,
  W5CaseIdSchema,
  W5CreatorRatingSheetSchema,
  W5PrivateCallPlanSchema,
  W5PublicCreatorTextSchema,
  type W5CommonSceneAuthority,
} from "@/scripts/w5/contracts";
import { canonicalJson } from "@/src/domain/canonical-json";
import { W5PublicManifestSchema } from "@/scripts/w5/private-store";

const SHA256 = /^[a-f0-9]{64}$/u;
const SESSION_ID = /^w5-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$/u;

export const W5_PRIVATE_PLAN_PREFIX = "plan-" as const;

export const W5BlindMapEntrySchema = z
  .object({
    blindLabel: z.string().regex(/^sample-[a-z]$/u),
    callId: IdentifierSchema,
  })
  .strict();

export const W5PrivateSessionPlanSchema = z
  .object({
    schemaVersion: z.literal("w5.private_session_plan.v1"),
    sessionId: z.string().regex(SESSION_ID),
    createdAt: z.string().datetime({ offset: true }),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    scenarioSha256: HashSchema,
    maskCommitmentSha256: HashSchema,
    secretMaskSeedHex: z.string().regex(/^[a-f0-9]{64}$/u),
    calls: z.array(W5PrivateCallPlanSchema).length(6),
    blindMap: z.array(W5BlindMapEntrySchema).length(6),
    structuralNoRender: z
      .object({
        caseId: z.literal("case.absurd_no_render"),
        commonAuthorityHash: HashSchema,
        rendererCallCount: z.literal(0),
        criticCallCount: z.literal(0),
        endingId: IdentifierSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((plan, context) => {
    const expectedCommitment = createHash("sha256")
      .update(
        canonicalJson({
          secretMaskSeedHex: plan.secretMaskSeedHex,
          calls: plan.calls,
          blindMap: plan.blindMap,
        }),
      )
      .digest("hex");
    if (expectedCommitment !== plan.maskCommitmentSha256) {
      context.addIssue({
        code: "custom",
        path: ["maskCommitmentSha256"],
        message: "W5 mask commitment does not match the private seed.",
      });
    }
    const callIds = plan.calls.map(({ callId }) => callId);
    if (new Set(callIds).size !== callIds.length) {
      context.addIssue({
        code: "custom",
        path: ["calls"],
        message: "W5 call IDs must be unique.",
      });
    }
    const orderIndexes = plan.calls.map(({ orderIndex }) => orderIndex);
    const sortedOrderIndexes = [...orderIndexes].sort((left, right) => left - right);
    if (
      new Set(orderIndexes).size !== orderIndexes.length ||
      sortedOrderIndexes.some((value, index) => value !== index)
    ) {
      context.addIssue({
        code: "custom",
        path: ["calls"],
        message: "W5 call order must be contiguous from zero.",
      });
    }
    const mappedCalls = plan.blindMap.map(({ callId }) => callId).sort();
    if (JSON.stringify(mappedCalls) !== JSON.stringify([...callIds].sort())) {
      context.addIssue({
        code: "custom",
        path: ["blindMap"],
        message: "W5 blind map must cover every call exactly once.",
      });
    }
    const labels = plan.blindMap.map(({ blindLabel }) => blindLabel);
    if (new Set(labels).size !== labels.length) {
      context.addIssue({
        code: "custom",
        path: ["blindMap"],
        message: "W5 blind labels must be unique.",
      });
    }

    const byCallId = new Map(plan.calls.map((call) => [call.callId, call]));
    const expected = [
      ["call.normal.baseline", "case.normal_observation", "baseline_a", "legacy_baseline", "unchanged", 0, 0],
      ["call.normal.candidate", "case.normal_observation", "candidate_b_present", "candidate_2_2", "present", 1, 1],
      ["call.controlled.candidate", "case.controlled_discovery", "candidate_b_present", "candidate_2_2", "present", 1, 2],
      ["call.controlled.baseline", "case.controlled_discovery", "baseline_a", "legacy_baseline", "unchanged", 0, 3],
      ["call.tense.present", "case.normal_observation", "candidate_b_present", "candidate_2_2", "present", 1, null],
      ["call.tense.past", "case.normal_observation", "candidate_b_past", "candidate_2_2", "past", 1, null],
    ] as const;
    for (const [
      callId,
      caseId,
      harnessId,
      outputContract,
      tense,
      maximumCriticCalls,
      fixedOrderIndex,
    ] of expected) {
      const call = byCallId.get(callId);
      const matches =
        call !== undefined &&
        call.caseId === caseId &&
        call.harnessId === harnessId &&
        call.outputContract === outputContract &&
        call.tense === tense &&
        call.maximumCriticCalls === maximumCriticCalls &&
        (fixedOrderIndex === null || call.orderIndex === fixedOrderIndex);
      if (!matches) {
        context.addIssue({
          code: "custom",
          path: ["calls"],
          message: `W5 call wiring is invalid for ${callId}.`,
        });
      }
    }
    const d5Indexes = [
      byCallId.get("call.tense.present")?.orderIndex,
      byCallId.get("call.tense.past")?.orderIndex,
    ].sort();
    if (JSON.stringify(d5Indexes) !== JSON.stringify([4, 5])) {
      context.addIssue({
        code: "custom",
        path: ["calls"],
        message: "W5 D5 calls must occupy the final two randomized slots.",
      });
    }
    const seed = Buffer.from(plan.secretMaskSeedHex, "hex");
    const expectedD5Order =
      hmac(seed, "d5-order").localeCompare(hmac(seed, "d5-order-alt")) <= 0
        ? ["call.tense.present", "call.tense.past"]
        : ["call.tense.past", "call.tense.present"];
    const actualD5Order = [...plan.calls]
      .sort(({ orderIndex: left }, { orderIndex: right }) => left - right)
      .slice(4)
      .map(({ callId }) => callId);
    if (canonicalJson(actualD5Order) !== canonicalJson(expectedD5Order)) {
      context.addIssue({
        code: "custom",
        path: ["calls"],
        message: "W5 D5 call order does not match the committed mask seed.",
      });
    }
    const expectedBlindMap = [...plan.calls]
      .sort((left, right) =>
        hmac(seed, left.callId).localeCompare(hmac(seed, right.callId)),
      )
      .map(({ callId }, index) => ({
        blindLabel: maskedLabels[index],
        callId,
      }));
    if (canonicalJson(plan.blindMap) !== canonicalJson(expectedBlindMap)) {
      context.addIssue({
        code: "custom",
        path: ["blindMap"],
        message: "W5 blind map does not match the committed mask seed.",
      });
    }
    const normalHashes = plan.calls
      .filter(({ caseId }) => caseId === "case.normal_observation")
      .map(({ commonAuthorityHash }) => commonAuthorityHash);
    const controlledHashes = plan.calls
      .filter(({ caseId }) => caseId === "case.controlled_discovery")
      .map(({ commonAuthorityHash }) => commonAuthorityHash);
    if (
      new Set(normalHashes).size !== 1 ||
      new Set(controlledHashes).size !== 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["calls"],
        message: "W5 calls for the same case must share one common authority hash.",
      });
    }
  });

export type W5PrivateSessionPlan = z.infer<typeof W5PrivateSessionPlanSchema>;

export const W5CapturedSampleSchema = z
  .object({
    blindLabel: z.string().regex(/^sample-[a-z]$/u),
    callId: IdentifierSchema,
    caseId: W5CaseIdSchema,
    commonAuthorityHash: HashSchema,
    finalOutputSha256: HashSchema,
    finalProse: z.string().trim().min(1).max(24_000),
    disposition: z.string().trim().min(1).max(80),
    rendererCallCount: z.literal(1),
    criticCallCount: z.union([z.literal(0), z.literal(1)]),
    privateCaptureIds: z.array(z.string().min(1)).min(1).max(2),
    finalCaptureId: z.string().min(1).max(80),
    pipelineEvidenceArtifactId: z.string().min(1).max(80).nullable(),
    pipelineEvidenceSha256: HashSchema.nullable(),
  })
  .strict()
  .superRefine((sample, context) => {
    if (!sample.privateCaptureIds.includes(sample.finalCaptureId)) {
      context.addIssue({
        code: "custom",
        path: ["finalCaptureId"],
        message: "W5 final capture ID must name one recorded process call.",
      });
    }
    const isBaseline = sample.callId.endsWith(".baseline");
    const hasPipelineEvidence =
      sample.pipelineEvidenceArtifactId !== null &&
      sample.pipelineEvidenceSha256 !== null;
    if (
      (sample.pipelineEvidenceArtifactId === null) !==
      (sample.pipelineEvidenceSha256 === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pipelineEvidenceSha256"],
        message: "W5 pipeline evidence ID and hash must be present together.",
      });
    }
    if (isBaseline === hasPipelineEvidence) {
      context.addIssue({
        code: "custom",
        path: ["pipelineEvidenceArtifactId"],
        message:
          "Candidate slots require private pipeline evidence; legacy baseline slots must not invent it.",
      });
    }
  });

export const W5PrivateCaptureResultSchema = z
  .object({
    schemaVersion: z.literal("w5.private_capture_result.v1"),
    sessionId: z.string().regex(SESSION_ID),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    scenarioSha256Before: HashSchema,
    scenarioSha256After: HashSchema,
    maskCommitmentSha256: HashSchema,
    runtimePreflightArtifactId: z.string().min(1).max(80),
    runtimePreflightSha256: HashSchema,
    samples: z.array(W5CapturedSampleSchema).length(6),
    blindAssignments: z.array(W5BlindAssignmentSchema).length(6),
    structuralNoRender: W5PrivateSessionPlanSchema.shape.structuralNoRender,
    fullManifest: W5PublicManifestSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.scenarioSha256Before !== result.scenarioSha256After) {
      context.addIssue({
        code: "custom",
        path: ["scenarioSha256After"],
        message: "W5 capture mutated canonical scenario authority.",
      });
    }
    const sampleLabels = result.samples.map(({ blindLabel }) => blindLabel).sort();
    const assignmentLabels = result.blindAssignments
      .map(({ blindLabel }) => blindLabel)
      .sort();
    if (JSON.stringify(sampleLabels) !== JSON.stringify(assignmentLabels)) {
      context.addIssue({
        code: "custom",
        path: ["blindAssignments"],
        message: "W5 blind assignments do not cover captured samples.",
      });
    }
    const sampleByLabel = new Map(
      result.samples.map((sample) => [sample.blindLabel, sample]),
    );
    const assignmentCallIds = result.blindAssignments.map(({ callId }) => callId);
    if (new Set(assignmentCallIds).size !== assignmentCallIds.length) {
      context.addIssue({
        code: "custom",
        path: ["blindAssignments"],
        message: "W5 reveal assignments must use unique call IDs.",
      });
    }
    for (const assignment of result.blindAssignments) {
      const sample = sampleByLabel.get(assignment.blindLabel);
      if (
        !sample ||
        sample.callId !== assignment.callId ||
        sample.finalOutputSha256 !== assignment.finalOutputSha256
      ) {
        context.addIssue({
          code: "custom",
          path: ["blindAssignments"],
          message: `W5 reveal assignment is not bound to ${assignment.blindLabel}.`,
        });
      }
    }
  });

export type W5PrivateCaptureResult = z.infer<
  typeof W5PrivateCaptureResultSchema
>;

export const assertW5CaptureMatchesPlan = ({
  plan,
  capture,
}: {
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
}): void => {
  if (
    capture.sessionId !== plan.sessionId ||
    capture.sourceRevision !== plan.sourceRevision ||
    capture.maskCommitmentSha256 !== plan.maskCommitmentSha256 ||
    capture.scenarioSha256Before !== plan.scenarioSha256 ||
    capture.scenarioSha256After !== plan.scenarioSha256 ||
    canonicalJson(capture.structuralNoRender) !==
      canonicalJson(plan.structuralNoRender)
  ) {
    throw new Error("w5_capture_plan_binding_invalid");
  }
  const expectedCallByLabel = new Map(
    plan.blindMap.map(({ blindLabel, callId }) => [blindLabel, callId]),
  );
  const planCallById = new Map(plan.calls.map((call) => [call.callId, call]));
  const assignmentByLabel = new Map(
    capture.blindAssignments.map((assignment) => [
      assignment.blindLabel,
      assignment,
    ]),
  );
  const observedCallIds = new Set<string>();
  for (const sample of capture.samples) {
    const expectedCallId = expectedCallByLabel.get(sample.blindLabel);
    const call = planCallById.get(sample.callId);
    const assignment = assignmentByLabel.get(sample.blindLabel);
    if (
      expectedCallId !== sample.callId ||
      call === undefined ||
      call.caseId !== sample.caseId ||
      call.commonAuthorityHash !== sample.commonAuthorityHash ||
      assignment?.callId !== sample.callId ||
      assignment.finalOutputSha256 !== sample.finalOutputSha256
    ) {
      throw new Error(`w5_capture_plan_sample_mismatch:${sample.blindLabel}`);
    }
    observedCallIds.add(sample.callId);
  }
  if (
    observedCallIds.size !== plan.calls.length ||
    plan.calls.some(({ callId }) => !observedCallIds.has(callId))
  ) {
    throw new Error("w5_capture_plan_call_coverage_invalid");
  }
};

export const W5CreatorDecisionPacketSchema = z
  .object({
    schemaVersion: z.literal("w5.creator_decision_packet.v2"),
    sessionId: z.string().regex(SESSION_ID),
    reviewBundleSha256: HashSchema,
    sheets: z.array(W5CreatorRatingSheetSchema).length(6),
    preferredTenseSample: z.union([
      z.string().regex(/^sample-[a-z]$/u),
      z.literal("no_preference"),
    ]),
    finalQualityDecision: z.enum(["pass", "revise_once", "reject"]),
    correctionReceipt: z
      .object({
        rejectionReason: z.string().trim().min(1).max(1_000),
        unspecifiedLever: z.string().trim().min(1).max(600),
        publicReasonSummary: W5PublicCreatorTextSchema,
        publicUnspecifiedLeverSummary: W5PublicCreatorTextSchema,
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((packet, context) => {
    const labels = packet.sheets.map(({ blindLabel }) => blindLabel);
    if (new Set(labels).size !== labels.length) {
      context.addIssue({
        code: "custom",
        path: ["sheets"],
        message: "W5 creator sheets must use unique blind labels.",
      });
    }
    const needsCorrection = packet.finalQualityDecision !== "pass";
    if (needsCorrection !== (packet.correctionReceipt !== null)) {
      context.addIssue({
        code: "custom",
        path: ["correctionReceipt"],
        message:
          "A revise or reject decision requires one correction receipt; an all-accept packet must not invent one.",
      });
    }
    if (
      packet.finalQualityDecision === "pass" &&
      packet.sheets.every(({ creatorDecision }) => creatorDecision !== "accept")
    ) {
      context.addIssue({
        code: "custom",
        path: ["finalQualityDecision"],
        message: "A quality PASS requires at least one accepted product sample.",
      });
    }
  });

export type W5CreatorDecisionPacket = z.infer<
  typeof W5CreatorDecisionPacketSchema
>;

const maskedLabels = [
  "sample-a",
  "sample-b",
  "sample-c",
  "sample-d",
  "sample-e",
  "sample-f",
] as const;

const hmac = (seed: Buffer, value: string): string =>
  createHmac("sha256", seed).update(value).digest("hex");

const planFileName = (sessionId: string): string =>
  `${W5_PRIVATE_PLAN_PREFIX}${sessionId}.json`;

export const w5PlanFileName = (sessionId: string): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return planFileName(sessionId);
};

export const w5CaptureFileName = (sessionId: string): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return `capture-${sessionId}.json`;
};

export const w5BlindPacketFileName = (sessionId: string): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return `blind-review-${sessionId}.md`;
};

export const w5DecisionFileName = (sessionId: string): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return `creator-decision-${sessionId}.json`;
};

export const w5DecisionDraftFileName = (sessionId: string): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return `creator-decision-draft-${sessionId}.json`;
};

export const w5OperationalEvidenceRootFileName = (
  sessionId: string,
): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return `operational-evidence-root-${sessionId}.json`;
};

export const w5CaptureReservationFileName = (sessionId: string): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return `capture-reservation-${sessionId}.json`;
};

export const w5RuntimePreflightFileName = (sessionId: string): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return `runtime-${sessionId}.json`;
};

const assertSlotIndex = (slotIndex: number): void => {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 5) {
    throw new Error("w5_slot_index_invalid");
  }
};

export const w5SlotReservationFileName = (
  sessionId: string,
  slotIndex: number,
): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  assertSlotIndex(slotIndex);
  return `slot-${sessionId}-${slotIndex}-reserved.json`;
};

export const w5SlotCompletionFileName = (
  sessionId: string,
  slotIndex: number,
): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  assertSlotIndex(slotIndex);
  return `slot-${sessionId}-${slotIndex}-complete.json`;
};

export const w5PipelineEvidenceFileName = (
  sessionId: string,
  slotIndex: number,
): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  assertSlotIndex(slotIndex);
  return `pipeline-${sessionId}-${slotIndex}.json`;
};

export const w5FailureFileName = (sessionId: string): string => {
  if (!SESSION_ID.test(sessionId)) throw new Error("w5_session_id_invalid");
  return `failure-${sessionId}.json`;
};

export const withW5Tense = (
  styleProfileInput: PenelopeEnglishStyleProfile,
  tense: "present" | "past",
): PenelopeEnglishStyleProfile => {
  const styleProfile = structuredClone(
    PenelopeEnglishStyleProfileSchema.parse(styleProfileInput),
  );
  styleProfile.levers.tense.value = tense;
  return PenelopeEnglishStyleProfileSchema.parse(styleProfile);
};

export const buildW5PrivateSessionPlan = ({
  sourceRevision,
  scenarioSha256,
  authorities,
  now = new Date(),
  seed = randomBytes(32),
}: {
  sourceRevision: string;
  scenarioSha256: string;
  authorities: readonly W5CommonSceneAuthority[];
  now?: Date;
  seed?: Buffer;
}): W5PrivateSessionPlan => {
  if (seed.byteLength !== 32) throw new Error("w5_mask_seed_invalid");
  if (!SHA256.test(scenarioSha256)) throw new Error("w5_scenario_hash_invalid");
  const byCase = new Map(
    authorities.map((authority) => [authority.projection.caseId, authority]),
  );
  const normal = byCase.get("case.normal_observation");
  const controlled = byCase.get("case.controlled_discovery");
  const absurd = byCase.get("case.absurd_no_render");
  if (!normal || !controlled || !absurd) {
    throw new Error("w5_case_authority_missing");
  }

  const d5PresentFirst = hmac(seed, "d5-order").localeCompare(
    hmac(seed, "d5-order-alt"),
  ) <= 0;
  const rawCalls = [
    {
      callId: "call.normal.baseline",
      caseId: "case.normal_observation",
      targetTurn: normal.projection.targetTurn,
      harnessId: "baseline_a",
      commonAuthorityHash: normal.commonAuthorityHash,
      requestedModel: "gpt-5.6-sol",
      actualModelIdentity: "unreported",
      outputContract: "legacy_baseline",
      tense: "unchanged",
      maximumCriticCalls: 0,
    },
    {
      callId: "call.normal.candidate",
      caseId: "case.normal_observation",
      targetTurn: normal.projection.targetTurn,
      harnessId: "candidate_b_present",
      commonAuthorityHash: normal.commonAuthorityHash,
      requestedModel: "gpt-5.6-sol",
      actualModelIdentity: "unreported",
      outputContract: "candidate_2_2",
      tense: "present",
      maximumCriticCalls: 1,
    },
    {
      callId: "call.controlled.candidate",
      caseId: "case.controlled_discovery",
      targetTurn: controlled.projection.targetTurn,
      harnessId: "candidate_b_present",
      commonAuthorityHash: controlled.commonAuthorityHash,
      requestedModel: "gpt-5.6-sol",
      actualModelIdentity: "unreported",
      outputContract: "candidate_2_2",
      tense: "present",
      maximumCriticCalls: 1,
    },
    {
      callId: "call.controlled.baseline",
      caseId: "case.controlled_discovery",
      targetTurn: controlled.projection.targetTurn,
      harnessId: "baseline_a",
      commonAuthorityHash: controlled.commonAuthorityHash,
      requestedModel: "gpt-5.6-sol",
      actualModelIdentity: "unreported",
      outputContract: "legacy_baseline",
      tense: "unchanged",
      maximumCriticCalls: 0,
    },
    ...(d5PresentFirst
      ? [
          {
            callId: "call.tense.present",
            caseId: "case.normal_observation",
            targetTurn: normal.projection.targetTurn,
            harnessId: "candidate_b_present",
            commonAuthorityHash: normal.commonAuthorityHash,
            requestedModel: "gpt-5.6-sol",
            actualModelIdentity: "unreported",
            outputContract: "candidate_2_2",
            tense: "present",
            maximumCriticCalls: 1,
          },
          {
            callId: "call.tense.past",
            caseId: "case.normal_observation",
            targetTurn: normal.projection.targetTurn,
            harnessId: "candidate_b_past",
            commonAuthorityHash: normal.commonAuthorityHash,
            requestedModel: "gpt-5.6-sol",
            actualModelIdentity: "unreported",
            outputContract: "candidate_2_2",
            tense: "past",
            maximumCriticCalls: 1,
          },
        ]
      : [
          {
            callId: "call.tense.past",
            caseId: "case.normal_observation",
            targetTurn: normal.projection.targetTurn,
            harnessId: "candidate_b_past",
            commonAuthorityHash: normal.commonAuthorityHash,
            requestedModel: "gpt-5.6-sol",
            actualModelIdentity: "unreported",
            outputContract: "candidate_2_2",
            tense: "past",
            maximumCriticCalls: 1,
          },
          {
            callId: "call.tense.present",
            caseId: "case.normal_observation",
            targetTurn: normal.projection.targetTurn,
            harnessId: "candidate_b_present",
            commonAuthorityHash: normal.commonAuthorityHash,
            requestedModel: "gpt-5.6-sol",
            actualModelIdentity: "unreported",
            outputContract: "candidate_2_2",
            tense: "present",
            maximumCriticCalls: 1,
          },
        ]),
  ].map((call, orderIndex) => W5PrivateCallPlanSchema.parse({ ...call, orderIndex }));

  const orderedForMask = [...rawCalls].sort((left, right) =>
    hmac(seed, left.callId).localeCompare(hmac(seed, right.callId)),
  );
  const blindMap = orderedForMask.map(({ callId }, index) =>
    W5BlindMapEntrySchema.parse({ blindLabel: maskedLabels[index], callId }),
  );
  const iso = now.toISOString();
  const sessionId = `w5-${iso
    .slice(0, 19)
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace("T", "t")}z-${hmac(seed, sourceRevision).slice(0, 8)}`;
  return W5PrivateSessionPlanSchema.parse({
    schemaVersion: "w5.private_session_plan.v1",
    sessionId,
    createdAt: iso,
    sourceRevision,
    scenarioSha256,
    maskCommitmentSha256: createHash("sha256")
      .update(
        canonicalJson({
          secretMaskSeedHex: seed.toString("hex"),
          calls: rawCalls,
          blindMap,
        }),
      )
      .digest("hex"),
    secretMaskSeedHex: seed.toString("hex"),
    calls: rawCalls,
    blindMap,
    structuralNoRender: {
      caseId: "case.absurd_no_render",
      commonAuthorityHash: absurd.commonAuthorityHash,
      rendererCallCount: 0,
      criticCallCount: 0,
      endingId: "ending.canon_contained",
    },
  });
};

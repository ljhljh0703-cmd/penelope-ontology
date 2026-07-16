import { z } from "zod";
import type { LiveCreatorFinalizationResult } from "@/src/application/live-creator-finalizer";
import {
  CreatorDecisionResultSchema,
  CreatorDecisionSchema,
  type CreatorDecision,
} from "@/src/contracts/creator-decision";
import { HashSchema, IdentifierSchema, VersionSchema } from "@/src/contracts/common";
import { ModelDraftSchema, type ModelDraft } from "@/src/contracts/model-draft";
import { CanonProposalSchema } from "@/src/contracts/proposal";
import {
  HardViolationSchema,
  LiveRunRequestSchema,
  RunResultSchema,
  type RunRequest,
  type RunResult,
} from "@/src/contracts/run";
import {
  SimulationSnapshotSchema,
  SimulationTransitionRecordSchema,
} from "@/src/contracts/simulation";
import { hasValidOverlayHash, hasValidProposalHash } from "@/src/domain/canon-overlay";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import {
  buildSimulationSnapshot,
  hasValidSnapshotHash,
  rebaseSnapshot,
  snapshotPayload,
} from "@/src/domain/simulation";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  evaluateLiveRedSailRunResult,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
} from "@/src/evidence/live-scenario-contract";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

const EXPECTED_CONTROL_IDS = [
  "replay.grounded_penelope",
  "replay.helen_conflict",
  "replay.living_hector",
  "replay.penelope_knows_ogygia",
] as const;
const EXPECTED_CONTROL_COUNT = EXPECTED_CONTROL_IDS.length;
const HARBOR_WATCH_VARIABLE_ID = "harbor_watch";
const RED_SAIL_RULE_ID = "rule.creator.red_sail_signal";

const InternalReplayStageSchema = z
  .object({
    stageId: IdentifierSchema,
    kind: z.literal("run"),
    passed: z.boolean(),
    detail: z.string().min(1),
  })
  .strict();

const InternalReplayCaseSchema = z
  .object({
    id: IdentifierSchema,
    description: z.string().min(1),
    passed: z.boolean(),
    stages: z.array(InternalReplayStageSchema).length(1),
  })
  .strict();

const InternalOverlayReplaySchema = z
  .object({
    suiteId: z.literal("approved_overlay_regression"),
    overlayId: z.literal("creator_canon"),
    overlayVersion: VersionSchema,
    overlayHash: HashSchema,
    passed: z.boolean(),
    cases: z.array(InternalReplayCaseSchema).length(EXPECTED_CONTROL_COUNT),
  })
  .strict();

const InternalSimulationActionResultSchema = z
  .object({
    status: z.enum(["applied", "blocked"]),
    snapshot: SimulationSnapshotSchema,
    transition: SimulationTransitionRecordSchema,
    violations: z.array(HardViolationSchema),
  })
  .strict();

const InternalFinalizationBaseFields = {
  verifiedRun: RunResultSchema,
  proposal: CanonProposalSchema,
  decision: CreatorDecisionResultSchema,
  finalSnapshot: SimulationSnapshotSchema,
} as const;

const InternalLiveCreatorFinalizationSchema = z.discriminatedUnion("status", [
  z
    .object({
      ...InternalFinalizationBaseFields,
      status: z.literal("rejected"),
      overlayReplay: z.null(),
      transitionResults: z.tuple([]),
    })
    .strict(),
  z
    .object({
      ...InternalFinalizationBaseFields,
      status: z.literal("applied"),
      overlayReplay: InternalOverlayReplaySchema,
      transitionResults: z.tuple([
        InternalSimulationActionResultSchema,
        InternalSimulationActionResultSchema,
      ]),
    })
    .strict(),
]);

const AuthorityEvidenceSchema = z
  .object({
    overlayId: z.literal("creator_canon"),
    overlayVersion: VersionSchema,
    overlayHash: HashSchema,
    stateHash: HashSchema,
    turnIndex: z.number().int().min(0).max(2),
  })
  .strict();

const ReplayEvidenceSchema = z
  .object({
    suiteId: z.literal("approved_overlay_regression"),
    overlayHash: HashSchema,
    caseCount: z.literal(EXPECTED_CONTROL_COUNT),
    passedCaseCount: z.literal(EXPECTED_CONTROL_COUNT),
    replaySha256: HashSchema,
  })
  .strict();

const TransitionLinkEvidenceSchema = z
  .object({
    stepIndex: z.union([z.literal(1), z.literal(2)]),
    variableId: z.literal(HARBOR_WATCH_VARIABLE_ID),
    fromValue: z.enum(["idle", "watching"]),
    toValue: z.enum(["watching", "signal_seen"]),
    fromStateHash: HashSchema,
    toStateHash: HashSchema,
  })
  .strict();

const addEvidenceIssue = (
  context: z.RefinementCtx,
  message: string,
  path: PropertyKey[] = [],
): void => {
  context.addIssue({ code: "custom", message, path });
};

export const LiveHarnessEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("live_creator_harness"),
    scenarioContractId: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.id),
    finalizationStatus: z.enum(["applied", "rejected"]),
    requestSha256: HashSchema,
    runId: IdentifierSchema,
    liveDraftSha256: HashSchema,
    proposal: z
      .object({
        id: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.expected.proposalId),
        proposalHash: HashSchema,
      })
      .strict(),
    decision: z
      .object({
        action: z.enum(["accept", "edit", "reject"]),
        decisionSha256: HashSchema,
      })
      .strict(),
    baseAuthority: AuthorityEvidenceSchema,
    finalAuthority: AuthorityEvidenceSchema,
    rebasedStateHash: HashSchema.nullable(),
    replay: ReplayEvidenceSchema.nullable(),
    transitions: z.array(TransitionLinkEvidenceSchema).max(2),
    transitionChainSha256: HashSchema.nullable(),
    rawNarrativePublic: z.literal(false),
    creatorDecisionTextPublic: z.literal(false),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.baseAuthority.overlayId !== evidence.finalAuthority.overlayId) {
      addEvidenceIssue(context, "Overlay identity changed across finalization.", [
        "finalAuthority",
        "overlayId",
      ]);
    }

    if (evidence.finalizationStatus === "rejected") {
      if (evidence.decision.action !== "reject") {
        addEvidenceIssue(context, "Rejected evidence requires a reject decision.", [
          "decision",
          "action",
        ]);
      }
      if (
        evidence.finalAuthority.overlayVersion !== evidence.baseAuthority.overlayVersion ||
        evidence.finalAuthority.overlayHash !== evidence.baseAuthority.overlayHash ||
        evidence.finalAuthority.stateHash !== evidence.baseAuthority.stateHash ||
        evidence.finalAuthority.turnIndex !== evidence.baseAuthority.turnIndex
      ) {
        addEvidenceIssue(context, "Rejected evidence must preserve overlay and state authority.", [
          "finalAuthority",
        ]);
      }
      if (
        evidence.rebasedStateHash !== null ||
        evidence.replay !== null ||
        evidence.transitions.length !== 0 ||
        evidence.transitionChainSha256 !== null
      ) {
        addEvidenceIssue(context, "Rejected evidence cannot contain replay or transition proof.");
      }
      return;
    }

    if (evidence.decision.action === "reject") {
      addEvidenceIssue(context, "Applied evidence cannot bind a reject decision.", [
        "decision",
        "action",
      ]);
    }
    if (
      evidence.finalAuthority.overlayVersion !== evidence.baseAuthority.overlayVersion + 1 ||
      evidence.finalAuthority.overlayHash === evidence.baseAuthority.overlayHash
    ) {
      addEvidenceIssue(context, "Applied evidence requires one new overlay version and hash.", [
        "finalAuthority",
      ]);
    }
    if (
      evidence.finalAuthority.turnIndex !== evidence.baseAuthority.turnIndex + 2 ||
      evidence.finalAuthority.stateHash === evidence.baseAuthority.stateHash
    ) {
      addEvidenceIssue(context, "Applied evidence requires the registered two-step state change.", [
        "finalAuthority",
      ]);
    }
    if (!evidence.rebasedStateHash || !evidence.replay) {
      addEvidenceIssue(context, "Applied evidence requires rebase and replay proof.");
      return;
    }
    if (evidence.replay.overlayHash !== evidence.finalAuthority.overlayHash) {
      addEvidenceIssue(context, "Replay proof is not bound to the final overlay hash.", [
        "replay",
        "overlayHash",
      ]);
    }
    const [step1, step2] = evidence.transitions;
    if (
      evidence.transitions.length !== 2 ||
      !step1 ||
      !step2 ||
      step1.stepIndex !== 1 ||
      step1.fromValue !== "idle" ||
      step1.toValue !== "watching" ||
      step1.fromStateHash !== evidence.rebasedStateHash ||
      step2.stepIndex !== 2 ||
      step2.fromValue !== "watching" ||
      step2.toValue !== "signal_seen" ||
      step2.fromStateHash !== step1.toStateHash ||
      step2.toStateHash !== evidence.finalAuthority.stateHash
    ) {
      addEvidenceIssue(context, "Applied evidence has a broken red-sail transition chain.", [
        "transitions",
      ]);
    }
    if (
      evidence.transitionChainSha256 !== sha256Canonical(evidence.transitions)
    ) {
      addEvidenceIssue(context, "Transition-chain digest is invalid.", [
        "transitionChainSha256",
      ]);
    }
  });

export type LiveHarnessEvidence = z.infer<typeof LiveHarnessEvidenceSchema>;

const exact = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right);

const fail = (message: string): never => {
  throw new Error(`Live harness evidence rejected: ${message}`);
};

const hasExactExpectedRulePatch = (
  decision: CreatorDecision,
): boolean => {
  if (decision.action !== "edit" || decision.patches.length !== 1) return false;
  const patch = decision.patches[0];
  const expected = LIVE_RED_SAIL_SCENARIO_CONTRACT.expected.patch;
  return (
    patch?.op === "add_rule" &&
    patch.rule.id === expected.rule.id &&
    patch.rule.kind === expected.rule.kind &&
    patch.rule.description === expected.rule.description
  );
};

const assertRunAuthority = (
  request: LiveRunRequest,
  result: RunResult,
): ModelDraft => {
  const expectedRequest = buildLiveEvidenceRunRequest({
    overlay: request.overlay,
    snapshot: request.snapshot,
    styleProfileId: request.styleProfileId,
  });
  if (!exact(request, expectedRequest)) {
    fail("the live request is not the exact preregistered red-sail request");
  }
  const verdict = evaluateLiveRedSailRunResult(result);
  if (!verdict.ok) {
    fail(`the live result failed the red-sail contract (${verdict.issues.join(",")})`);
  }
  const modelOutcome = result.modelOutcome;
  if (modelOutcome.outcome !== "completed") {
    fail("the live result does not contain a completed draft");
  }
  if (!("draft" in modelOutcome)) {
    fail("the completed live result is missing its draft");
  }
  const modelDraft = ModelDraftSchema.parse(
    (modelOutcome as { draft: unknown }).draft,
  );
  const expectedRunId = `run.${sha256Canonical({
    request,
    modelOutcome,
  }).slice(0, 20)}`;
  if (
    result.runId !== expectedRunId ||
    !exact(result.currentSnapshot, request.snapshot) ||
    !exact(result.proposedNextSnapshot, request.snapshot)
  ) {
    fail("the live result is not bound to the exact request and base snapshot");
  }
  return modelDraft;
};

const assertSharedFinalizationAuthority = ({
  request,
  result,
  creatorDecision,
  finalization,
}: {
  request: LiveRunRequest;
  result: RunResult;
  creatorDecision: CreatorDecision;
  finalization: z.infer<typeof InternalLiveCreatorFinalizationSchema>;
}): void => {
  const proposal = result.proposals[0];
  if (
    !proposal ||
    result.proposals.length !== 1 ||
    !hasValidProposalHash(proposal) ||
    !exact(finalization.verifiedRun, result) ||
    !exact(finalization.proposal, proposal) ||
    creatorDecision.proposalId !== proposal.id ||
    creatorDecision.proposalHash !== proposal.proposalHash ||
    creatorDecision.baseOverlayId !== request.overlay.id ||
    creatorDecision.baseOverlayVersion !== request.overlay.version ||
    creatorDecision.baseOverlayHash !== request.overlay.hash
  ) {
    fail("the finalization, decision, proposal, and live result do not share one authority");
  }
  if (creatorDecision.action === "edit" && !hasExactExpectedRulePatch(creatorDecision)) {
    fail("the edit changed semantic rule authority");
  }
  if (
    !hasValidOverlayHash(finalization.decision.overlay) ||
    !hasValidSnapshotHash(finalization.decision.snapshot) ||
    !hasValidSnapshotHash(finalization.finalSnapshot)
  ) {
    fail("the finalization contains an invalid canonical hash");
  }
};

const assertAppliedFinalization = ({
  request,
  creatorDecision,
  finalization,
}: {
  request: LiveRunRequest;
  creatorDecision: Exclude<CreatorDecision, { action: "reject" }>;
  finalization: Extract<
    z.infer<typeof InternalLiveCreatorFinalizationSchema>,
    { status: "applied" }
  >;
}): void => {
  const { decision, overlayReplay, transitionResults } = finalization;
  if (
    decision.status !== "applied" ||
    decision.overlay.id !== request.overlay.id ||
    decision.overlay.version !== request.overlay.version + 1 ||
    decision.overlay.hash === request.overlay.hash ||
    !exact(decision.snapshot, rebaseSnapshot(request.snapshot, decision.overlay))
  ) {
    fail("the applied decision does not form the exact overlay-and-rebase step");
  }

  const expectedPatch =
    creatorDecision.action === "edit"
      ? creatorDecision.patches[0]
      : finalization.proposal.patches[0];
  const addedRule = decision.overlay.rules.find(({ id }) => id === RED_SAIL_RULE_ID);
  if (
    !expectedPatch ||
    expectedPatch.op !== "add_rule" ||
    !addedRule ||
    decision.overlay.claims.length !== request.overlay.claims.length ||
    decision.overlay.rules.length !== request.overlay.rules.length + 1 ||
    !exact(decision.overlay.claims, request.overlay.claims) ||
    !exact(
      decision.overlay.rules.filter(({ id }) => id !== RED_SAIL_RULE_ID),
      request.overlay.rules,
    ) ||
    addedRule.kind !== expectedPatch.rule.kind ||
    addedRule.description !== expectedPatch.rule.description ||
    (addedRule.displayDescription ?? null) !==
      (expectedPatch.rule.displayDescription ?? null) ||
    addedRule.layerId !== "creator_canon" ||
    addedRule.status !== "active"
  ) {
    fail("the final overlay is not the one exact red-sail rule application");
  }

  const replayIds = overlayReplay.cases.map(({ id }) => id).sort();
  const expectedReplayIds = [...EXPECTED_CONTROL_IDS].sort();
  if (
    !overlayReplay.passed ||
    overlayReplay.overlayId !== decision.overlay.id ||
    overlayReplay.overlayVersion !== decision.overlay.version ||
    overlayReplay.overlayHash !== decision.overlay.hash ||
    !exact(replayIds, expectedReplayIds) ||
    overlayReplay.cases.some(
      (replayCase) =>
        !replayCase.passed ||
        replayCase.stages.length !== 1 ||
        !replayCase.stages[0]?.passed,
    )
  ) {
    fail("the final overlay did not pass the four registered replay controls");
  }

  const expectedValues = [
    { from: "idle", to: "watching" },
    { from: "watching", to: "signal_seen" },
  ] as const;
  let priorSnapshot = decision.snapshot;
  for (const [index, transitionResult] of transitionResults.entries()) {
    const expected = expectedValues[index];
    const action = transitionResult.transition.action;
    const expectedSnapshot = expected
      ? buildSimulationSnapshot({
          ...snapshotPayload(priorSnapshot),
          turnIndex: priorSnapshot.turnIndex + 1,
          variables: priorSnapshot.variables.map((variable) =>
            variable.id === HARBOR_WATCH_VARIABLE_ID
              ? { ...variable, value: expected.to }
              : variable,
          ),
        })
      : null;
    if (
      !expected ||
      !expectedSnapshot ||
      transitionResult.status !== "applied" ||
      transitionResult.violations.length !== 0 ||
      transitionResult.transition.status !== "applied" ||
      action.actorEntityId !== "telemachus" ||
      action.authorizingIntentId !== "intent.telemachus" ||
      !exact(action.contributingIntentIds, ["intent.penelope"]) ||
      action.op !== "set_variable" ||
      action.variableId !== HARBOR_WATCH_VARIABLE_ID ||
      action.from !== expected.from ||
      action.to !== expected.to ||
      !exact(action.evidenceClaimIds, []) ||
      !exact(action.evidenceRuleIds, [RED_SAIL_RULE_ID]) ||
      transitionResult.transition.fromStateHash !== priorSnapshot.stateHash ||
      transitionResult.transition.toStateHash !== transitionResult.snapshot.stateHash ||
      !exact(transitionResult.transition.toSnapshot, transitionResult.snapshot) ||
      !exact(transitionResult.snapshot, expectedSnapshot)
    ) {
      fail("the deterministic red-sail transition chain is malformed");
    }
    priorSnapshot = transitionResult.snapshot;
  }
  const lastTransition = transitionResults[1];
  if (
    !exact(finalization.finalSnapshot, lastTransition.snapshot) ||
    finalization.finalSnapshot.turnIndex !== request.snapshot.turnIndex + 2 ||
    finalization.finalSnapshot.variables.find(
      ({ id }) => id === HARBOR_WATCH_VARIABLE_ID,
    )?.value !== "signal_seen"
  ) {
    fail("the final snapshot is not the registered signal-seen state");
  }
};

const assertRejectedFinalization = ({
  request,
  creatorDecision,
  finalization,
}: {
  request: LiveRunRequest;
  creatorDecision: Extract<CreatorDecision, { action: "reject" }>;
  finalization: Extract<
    z.infer<typeof InternalLiveCreatorFinalizationSchema>,
    { status: "rejected" }
  >;
}): void => {
  if (
    creatorDecision.action !== "reject" ||
    finalization.decision.status !== "rejected" ||
    !exact(finalization.decision.overlay, request.overlay) ||
    !exact(finalization.decision.snapshot, request.snapshot) ||
    !exact(finalization.finalSnapshot, request.snapshot) ||
    finalization.overlayReplay !== null ||
    finalization.transitionResults.length !== 0
  ) {
    fail("a rejected decision changed authority or carried execution proof");
  }
};

export const buildLiveHarnessEvidence = ({
  liveRequest: liveRequestInput,
  verifiedLiveRun: verifiedLiveRunInput,
  creatorDecision: creatorDecisionInput,
  finalization: finalizationInput,
}: {
  liveRequest: LiveRunRequest;
  verifiedLiveRun: RunResult;
  creatorDecision: CreatorDecision;
  finalization: LiveCreatorFinalizationResult;
}): LiveHarnessEvidence => {
  const liveRequest = LiveRunRequestSchema.parse(liveRequestInput);
  const verifiedLiveRun = RunResultSchema.parse(verifiedLiveRunInput);
  const creatorDecision = CreatorDecisionSchema.parse(creatorDecisionInput);
  const finalization = InternalLiveCreatorFinalizationSchema.parse(finalizationInput);
  const liveDraft = assertRunAuthority(liveRequest, verifiedLiveRun);
  assertSharedFinalizationAuthority({
    request: liveRequest,
    result: verifiedLiveRun,
    creatorDecision,
    finalization,
  });

  if (finalization.status === "rejected" && creatorDecision.action === "reject") {
    assertRejectedFinalization({
      request: liveRequest,
      creatorDecision,
      finalization,
    });
  } else if (
    finalization.status === "applied" &&
    creatorDecision.action !== "reject"
  ) {
    assertAppliedFinalization({
      request: liveRequest,
      creatorDecision,
      finalization,
    });
  } else {
    fail("the finalization status and creator decision action do not agree");
  }

  const proposal = verifiedLiveRun.proposals[0];
  if (!proposal) fail("the verified live run has no proposal");
  const finalOverlay = finalization.decision.overlay;
  const replay =
    finalization.status === "applied"
      ? {
          suiteId: finalization.overlayReplay.suiteId,
          overlayHash: finalization.overlayReplay.overlayHash,
          caseCount: finalization.overlayReplay.cases.length,
          passedCaseCount: finalization.overlayReplay.cases.filter(({ passed }) => passed)
            .length,
          replaySha256: sha256Canonical(finalization.overlayReplay),
        }
      : null;
  const transitions =
    finalization.status === "applied"
      ? finalization.transitionResults.map((result, index) => ({
          stepIndex: (index + 1) as 1 | 2,
          variableId: HARBOR_WATCH_VARIABLE_ID,
          fromValue: result.transition.action.from as "idle" | "watching",
          toValue: result.transition.action.to as "watching" | "signal_seen",
          fromStateHash: result.transition.fromStateHash,
          toStateHash: result.transition.toStateHash,
        }))
      : [];

  return LiveHarnessEvidenceSchema.parse({
    schemaVersion: 1,
    evidenceType: "live_creator_harness",
    scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
    finalizationStatus: finalization.status,
    requestSha256: sha256Canonical(liveRequest),
    runId: verifiedLiveRun.runId,
    liveDraftSha256: sha256Canonical(liveDraft),
    proposal: {
      id: proposal.id,
      proposalHash: proposal.proposalHash,
    },
    decision: {
      action: creatorDecision.action,
      decisionSha256: sha256Canonical(creatorDecision),
    },
    baseAuthority: {
      overlayId: liveRequest.overlay.id,
      overlayVersion: liveRequest.overlay.version,
      overlayHash: liveRequest.overlay.hash,
      stateHash: liveRequest.snapshot.stateHash,
      turnIndex: liveRequest.snapshot.turnIndex,
    },
    finalAuthority: {
      overlayId: finalOverlay.id,
      overlayVersion: finalOverlay.version,
      overlayHash: finalOverlay.hash,
      stateHash: finalization.finalSnapshot.stateHash,
      turnIndex: finalization.finalSnapshot.turnIndex,
    },
    rebasedStateHash:
      finalization.status === "applied"
        ? finalization.decision.snapshot.stateHash
        : null,
    replay,
    transitions,
    transitionChainSha256:
      finalization.status === "applied" ? sha256Canonical(transitions) : null,
    rawNarrativePublic: false,
    creatorDecisionTextPublic: false,
  });
};

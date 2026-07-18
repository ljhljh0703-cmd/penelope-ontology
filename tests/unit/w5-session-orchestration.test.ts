import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  buildW5CaseSessions,
  buildW5CommonSceneAuthority,
} from "@/scripts/w5/cases";
import {
  W5PrivateCaptureResultSchema,
  W5PrivateSessionPlanSchema,
  W5CreatorDecisionPacketSchema,
  assertW5CaptureMatchesPlan,
  buildW5PrivateSessionPlan,
} from "@/scripts/w5/session";
import { W5_CRITICAL_PATHS } from "@/scripts/w5/repository";
import { w5CaptureId } from "@/scripts/w5/live-calls";
import {
  assertW5CaptureIdBindings,
  assertW5FullManifestBinding,
  assertW5SampleOperationalBinding,
} from "@/scripts/w5/capture-binding";
import { buildW5PublicManifest } from "@/scripts/w5/private-store";
import {
  buildW5CreatorDecisionDraft,
  buildW5ReviewBundle,
} from "@/scripts/w5/publication";
import { sha256Bytes } from "@/scripts/w5/recording-process-runner";

const buildPlan = () => {
  const scenario = getOdysseyBook19WorldSimulation();
  return buildW5PrivateSessionPlan({
    sourceRevision: "a".repeat(40),
    scenarioSha256: sha256Canonical(scenario),
    authorities: buildW5CaseSessions({ scenario }).map(
      buildW5CommonSceneAuthority,
    ),
    now: new Date("2026-07-18T12:34:56.000Z"),
    seed: Buffer.alloc(32, 7),
  });
};

describe("W5 session orchestration contract", () => {
  it("pins balanced AB/BA calls, two independent tense calls, and a committed blind map", () => {
    const plan = buildPlan();

    expect(plan.calls.slice(0, 4).map(({ callId, orderIndex }) => [callId, orderIndex])).toEqual([
      ["call.normal.baseline", 0],
      ["call.normal.candidate", 1],
      ["call.controlled.candidate", 2],
      ["call.controlled.baseline", 3],
    ]);
    expect(plan.calls.slice(4).map(({ callId }) => callId).sort()).toEqual([
      "call.tense.past",
      "call.tense.present",
    ]);
    expect(plan.calls.slice(4).map(({ orderIndex }) => orderIndex).sort()).toEqual([4, 5]);
    expect(new Set(plan.blindMap.map(({ blindLabel }) => blindLabel)).size).toBe(6);
    expect(plan.structuralNoRender).toMatchObject({
      rendererCallCount: 0,
      criticCallCount: 0,
      endingId: "ending.canon_contained",
    });
    expect(W5PrivateSessionPlanSchema.parse(plan)).toEqual(plan);
  });

  it("rejects a private plan whose baseline is rewired as a candidate", () => {
    const plan = buildPlan();
    const tampered = structuredClone(plan);
    tampered.calls[0]!.harnessId = "candidate_b_present";
    tampered.calls[0]!.outputContract = "candidate_2_2";
    tampered.calls[0]!.tense = "present";
    tampered.calls[0]!.maximumCriticCalls = 1;

    expect(W5PrivateSessionPlanSchema.safeParse(tampered).success).toBe(false);
  });

  it("binds the blind map and randomized tense order to the committed seed", () => {
    const plan = buildPlan();
    const remapped = structuredClone(plan);
    const firstLabel = remapped.blindMap[0]!.blindLabel;
    remapped.blindMap[0]!.blindLabel = remapped.blindMap[1]!.blindLabel;
    remapped.blindMap[1]!.blindLabel = firstLabel;
    expect(W5PrivateSessionPlanSchema.safeParse(remapped).success).toBe(false);

    const reordered = structuredClone(plan);
    const present = reordered.calls.find(
      ({ callId }) => callId === "call.tense.present",
    )!;
    const past = reordered.calls.find(
      ({ callId }) => callId === "call.tense.past",
    )!;
    [present.orderIndex, past.orderIndex] = [past.orderIndex, present.orderIndex];
    expect(W5PrivateSessionPlanSchema.safeParse(reordered).success).toBe(false);
  });

  it("binds every reveal triple to the corresponding captured sample", () => {
    const plan = buildPlan();
    const callById = new Map(plan.calls.map((call) => [call.callId, call]));
    const samples = plan.blindMap.map(({ blindLabel, callId }, index) => {
      const call = callById.get(callId)!;
      const expectedCaptureId = w5CaptureId({
        sessionId: plan.sessionId,
        callId,
        callIndex: 1,
      });
      return {
        blindLabel,
        callId,
        caseId: call.caseId,
        commonAuthorityHash: call.commonAuthorityHash,
        finalOutputSha256: String(index + 1).repeat(64),
        finalProse: `Private sample ${index + 1}.`,
        disposition:
          call.harnessId === "baseline_a"
            ? "baseline_validated"
            : "creator_review",
        rendererCallCount: 1 as const,
        criticCallCount: 0 as const,
        privateCaptureIds: [expectedCaptureId],
        finalCaptureId: expectedCaptureId,
        pipelineEvidenceArtifactId:
          call.harnessId === "baseline_a" ? null : `pipeline-${index + 1}`,
        pipelineEvidenceSha256:
          call.harnessId === "baseline_a" ? null : "e".repeat(64),
      };
    });
    const valid = {
      schemaVersion: "w5.private_capture_result.v1" as const,
      sessionId: plan.sessionId,
      sourceRevision: plan.sourceRevision,
      scenarioSha256Before: plan.scenarioSha256,
      scenarioSha256After: plan.scenarioSha256,
      maskCommitmentSha256: plan.maskCommitmentSha256,
      runtimePreflightArtifactId: "runtime-receipt",
      runtimePreflightSha256: "d".repeat(64),
      samples,
      blindAssignments: samples.map(
        ({ blindLabel, callId, finalOutputSha256 }) => ({
          blindLabel,
          callId,
          finalOutputSha256,
        }),
      ),
      structuralNoRender: plan.structuralNoRender,
      fullManifest: {
        schemaVersion: "w5-public-manifest.v1" as const,
        manifestId: "manifest.0123456789abcdef",
        sourceRevision: plan.sourceRevision,
        maskCommitmentSha256: plan.maskCommitmentSha256,
        slots: samples.map((_sample, index) => ({
          maskedSlotId: `slot.${String(index + 1).padStart(2, "0")}`,
          artifactIds: [`artifact.${String(index + 1).padStart(3, "0")}`],
          callCount: 1,
        })),
        artifacts: samples.map((sample, index) => ({
          artifactId: `artifact.${String(index + 1).padStart(3, "0")}`,
          bytes: 1,
          sha256: sample.finalOutputSha256,
        })),
      },
    };
    expect(W5PrivateCaptureResultSchema.safeParse(valid).success).toBe(true);
    assertW5CaptureMatchesPlan({
      plan,
      capture: W5PrivateCaptureResultSchema.parse(valid),
    });
    assertW5CaptureIdBindings({
      plan,
      capture: W5PrivateCaptureResultSchema.parse(valid),
    });

    const tampered = structuredClone(valid);
    tampered.blindAssignments[0]!.finalOutputSha256 = "f".repeat(64);
    expect(W5PrivateCaptureResultSchema.safeParse(tampered).success).toBe(false);

    const revealSwap = structuredClone(valid);
    const present = revealSwap.samples.find(
      ({ callId }) => callId === "call.tense.present",
    )!;
    const past = revealSwap.samples.find(
      ({ callId }) => callId === "call.tense.past",
    )!;
    [present.callId, past.callId] = [past.callId, present.callId];
    for (const sample of [present, past]) {
      const assignment = revealSwap.blindAssignments.find(
        ({ blindLabel }) => blindLabel === sample.blindLabel,
      )!;
      assignment.callId = sample.callId;
    }
    const schemaValidSwap = W5PrivateCaptureResultSchema.parse(revealSwap);
    expect(() =>
      assertW5CaptureMatchesPlan({ plan, capture: schemaValidSwap }),
    ).toThrow("w5_capture_plan_sample_mismatch");

    const captureIdSwap = structuredClone(valid);
    const idPresent = captureIdSwap.samples.find(
      ({ callId }) => callId === "call.tense.present",
    )!;
    const idPast = captureIdSwap.samples.find(
      ({ callId }) => callId === "call.tense.past",
    )!;
    idPresent.privateCaptureIds = [...idPast.privateCaptureIds];
    idPresent.finalCaptureId = idPast.finalCaptureId;
    const schemaValidIdSwap = W5PrivateCaptureResultSchema.parse(captureIdSwap);
    expect(() =>
      assertW5CaptureIdBindings({ plan, capture: schemaValidIdSwap }),
    ).toThrow("w5_capture_id_call_mismatch");

    const parsedValid = W5PrivateCaptureResultSchema.parse(valid);
    const receiptByCall = new Map(
      parsedValid.samples.map((sample, index) => [
        sample.callId,
        [
          {
            captureId: sample.privateCaptureIds[0]!,
            artifacts: [
              {
                artifactId: "00-metadata",
                byteLength: index + 1,
                sha256: String(index + 3).repeat(64),
              },
            ],
            receiptSha256: String(index + 4).repeat(64),
          },
        ],
      ]),
    );
    const manifestBound = W5PrivateCaptureResultSchema.parse({
      ...parsedValid,
      fullManifest: buildW5PublicManifest({
        manifestId: `manifest.${sha256Bytes(Buffer.from(plan.sessionId)).slice(0, 16)}`,
        sourceRevision: plan.sourceRevision,
        maskCommitmentSha256: plan.maskCommitmentSha256,
        slots: parsedValid.samples.map((sample) => ({
          maskedSlotId: `slot.${String(
            [...parsedValid.samples]
              .sort(({ blindLabel: left }, { blindLabel: right }) =>
                left.localeCompare(right),
              )
              .findIndex(({ blindLabel }) => blindLabel === sample.blindLabel) +
              1,
          ).padStart(2, "0")}`,
          captures: receiptByCall.get(sample.callId)!,
        })),
      }),
    });
    expect(() =>
      assertW5FullManifestBinding({
        plan,
        capture: manifestBound,
        receiptsByCall: receiptByCall,
      }),
    ).not.toThrow();
    const forgedManifest = structuredClone(manifestBound);
    forgedManifest.fullManifest.artifacts[0]!.sha256 = "f".repeat(64);
    expect(() =>
      assertW5FullManifestBinding({
        plan,
        capture: forgedManifest,
        receiptsByCall: receiptByCall,
      }),
    ).toThrow("w5_full_manifest_raw_mismatch");

    const firstReviewBundle = buildW5ReviewBundle({
      plan,
      capture: manifestBound,
      operationalEvidenceRootSha256: "1".repeat(64),
    });
    const changedReviewCapture = structuredClone(manifestBound);
    changedReviewCapture.samples[0]!.finalProse += " Changed.";
    const changedReviewBundle = buildW5ReviewBundle({
      plan,
      capture: changedReviewCapture,
      operationalEvidenceRootSha256: "1".repeat(64),
    });
    expect(changedReviewBundle.reviewBundleSha256).not.toBe(
      firstReviewBundle.reviewBundleSha256,
    );
    expect(
      buildW5ReviewBundle({
        plan,
        capture: manifestBound,
        operationalEvidenceRootSha256: "2".repeat(64),
      }).reviewBundleSha256,
    ).not.toBe(firstReviewBundle.reviewBundleSha256);
  });

  it("rejects downgrading a completed critic slot to the renderer output", () => {
    const plan = buildPlan();
    const call = plan.calls.find(
      ({ callId }) => callId === "call.normal.candidate",
    )!;
    const captureIds = [1, 2].map((callIndex) =>
      w5CaptureId({ sessionId: plan.sessionId, callId: call.callId, callIndex }),
    );
    const captureReceipts = captureIds.map((captureId, index) => ({
      captureId,
      artifacts: [
        {
          artifactId: "03-final",
          byteLength: index + 1,
          sha256: String(index + 1).repeat(64),
        },
      ],
      receiptSha256: String(index + 3).repeat(64),
    }));
    const sample = {
      blindLabel: "sample-a",
      callId: call.callId,
      caseId: call.caseId,
      commonAuthorityHash: call.commonAuthorityHash,
      finalOutputSha256: "a".repeat(64),
      finalProse: "Final critic product.",
      disposition: "accepted",
      rendererCallCount: 1 as const,
      criticCallCount: 1 as const,
      privateCaptureIds: captureIds,
      finalCaptureId: captureIds[1]!,
      pipelineEvidenceArtifactId: "pipeline-proof",
      pipelineEvidenceSha256: "b".repeat(64),
    };
    const completion = {
      schemaVersion: "w5.slot_completion.v2" as const,
      sessionId: plan.sessionId,
      callId: call.callId,
      orderIndex: call.orderIndex,
      finalOutputSha256: sample.finalOutputSha256,
      disposition: sample.disposition,
      rendererCallCount: 1 as const,
      criticCallCount: 1 as const,
      privateCaptureIds: captureIds,
      privateCaptureReceiptSha256: captureReceipts.map(
        ({ receiptSha256 }) => receiptSha256,
      ),
      finalCaptureId: captureIds[1]!,
      pipelineEvidenceSha256: sample.pipelineEvidenceSha256,
    };
    const pipelineEvidence = {
      schemaVersion: "w5.pipeline_evidence.v2" as const,
      sessionId: plan.sessionId,
      callId: call.callId,
      finalOutputSha256: sample.finalOutputSha256,
      disposition: sample.disposition,
      preflight: {},
      validation: {},
      trace: {},
      rendererCallCount: 1 as const,
      criticCallCount: 1 as const,
      privateCaptureIds: captureIds,
      privateCaptureReceiptSha256: captureReceipts.map(
        ({ receiptSha256 }) => receiptSha256,
      ),
      finalCaptureId: captureIds[1]!,
      warningCount: 1,
      publishReady: true,
      stateTransitionAllowed: true,
    };
    const pipelineEvidenceReceipt = {
      artifactId: sample.pipelineEvidenceArtifactId,
      byteLength: 100,
      sha256: sample.pipelineEvidenceSha256,
    };
    expect(() =>
      assertW5SampleOperationalBinding({
        sessionId: plan.sessionId,
        call,
        sample,
        completion,
        pipelineEvidence,
        pipelineEvidenceReceipt,
        captureReceipts,
      }),
    ).not.toThrow();

    const downgraded = {
      ...sample,
      criticCallCount: 0 as const,
      privateCaptureIds: [captureIds[0]!],
      finalCaptureId: captureIds[0]!,
    };
    expect(() =>
      assertW5SampleOperationalBinding({
        sessionId: plan.sessionId,
        call,
        sample: downgraded,
        completion,
        pipelineEvidence,
        pipelineEvidenceReceipt,
        captureReceipts: [captureReceipts[0]!],
      }),
    ).toThrow("w5_slot_completion_mismatch");

    expect(() =>
      assertW5SampleOperationalBinding({
        sessionId: plan.sessionId,
        call,
        sample: { ...sample, finalCaptureId: captureIds[0]! },
        completion,
        pipelineEvidence,
        pipelineEvidenceReceipt,
        captureReceipts,
      }),
    ).toThrow("w5_operational_capture_mismatch");
  });

  it("requires the creator decision to name the exact reviewed bundle", () => {
    const plan = buildPlan();
    const criterionIds = [
      "clarity",
      "character_desire",
      "causal_legibility",
      "consequence_continuity",
      "no_report_register",
      "dialogue_turns_scene",
      "scene_continuity",
      "fair_consequence",
      "desire_to_continue",
    ] as const;
    const decision = {
      schemaVersion: "w5.creator_decision_packet.v2" as const,
      sessionId: plan.sessionId,
      reviewBundleSha256: "a".repeat(64),
      sheets: ["a", "b", "c", "d", "e", "f"].map((suffix) => ({
        blindLabel: `sample-${suffix}`,
        ratings: criterionIds.map((criterionId) => ({
          criterionId,
          score: 4,
          rationale: "Creator private rationale.",
          publicRationale: "The causal sequence remains clear.",
        })),
        tensePreference: null,
        creatorDecision: "accept" as const,
      })),
      preferredTenseSample: "no_preference" as const,
      finalQualityDecision: "pass" as const,
      correctionReceipt: null,
    };
    expect(W5CreatorDecisionPacketSchema.safeParse(decision).success).toBe(true);
    const unbound = structuredClone(decision) as Partial<typeof decision>;
    delete unbound.reviewBundleSha256;
    expect(W5CreatorDecisionPacketSchema.safeParse(unbound).success).toBe(false);
  });

  it("provides a complete private decision draft without inventing creator scores", () => {
    const plan = buildPlan();
    const callById = new Map(plan.calls.map((call) => [call.callId, call]));
    const capture = W5PrivateCaptureResultSchema.parse({
      schemaVersion: "w5.private_capture_result.v1",
      sessionId: plan.sessionId,
      sourceRevision: plan.sourceRevision,
      scenarioSha256Before: plan.scenarioSha256,
      scenarioSha256After: plan.scenarioSha256,
      maskCommitmentSha256: plan.maskCommitmentSha256,
      runtimePreflightArtifactId: "runtime-proof",
      runtimePreflightSha256: "a".repeat(64),
      samples: plan.blindMap.map(({ blindLabel, callId }, index) => {
        const call = callById.get(callId)!;
        const captureId = w5CaptureId({
          sessionId: plan.sessionId,
          callId,
          callIndex: 1,
        });
        return {
          blindLabel,
          callId,
          caseId: call.caseId,
          commonAuthorityHash: call.commonAuthorityHash,
          finalOutputSha256: String(index + 1).repeat(64),
          finalProse: `Sample ${index + 1}.`,
          disposition: "accepted",
          rendererCallCount: 1,
          criticCallCount: 0,
          privateCaptureIds: [captureId],
          finalCaptureId: captureId,
          pipelineEvidenceArtifactId:
            call.harnessId === "baseline_a" ? null : `pipeline-${index + 1}`,
          pipelineEvidenceSha256:
            call.harnessId === "baseline_a" ? null : "b".repeat(64),
        };
      }),
      blindAssignments: plan.blindMap.map(({ blindLabel, callId }, index) => ({
        blindLabel,
        callId,
        finalOutputSha256: String(index + 1).repeat(64),
      })),
      structuralNoRender: plan.structuralNoRender,
      fullManifest: {
        schemaVersion: "w5-public-manifest.v1",
        manifestId: "manifest.0123456789abcdef",
        sourceRevision: plan.sourceRevision,
        maskCommitmentSha256: plan.maskCommitmentSha256,
        slots: plan.blindMap.map((_entry, index) => ({
          maskedSlotId: `slot.${String(index + 1).padStart(2, "0")}`,
          artifactIds: [`artifact.${String(index + 1).padStart(3, "0")}`],
          callCount: 1,
        })),
        artifacts: plan.blindMap.map((_entry, index) => ({
          artifactId: `artifact.${String(index + 1).padStart(3, "0")}`,
          bytes: 1,
          sha256: String(index + 1).repeat(64),
        })),
      },
    });
    const draft = buildW5CreatorDecisionDraft({
      plan,
      capture,
      reviewBundleSha256: "c".repeat(64),
    });
    expect(draft.sheets).toHaveLength(6);
    expect(draft.sheets.every(({ ratings }) => ratings.length === 9)).toBe(true);
    expect(draft.sheets.flatMap(({ ratings }) => ratings).every(
      ({ score, rationale, publicRationale }) =>
        score === null && rationale === "" && publicRationale === "",
    )).toBe(true);
    expect(draft.correctionReceipt).toEqual({
      rejectionReason: "",
      unspecifiedLever: "",
      publicReasonSummary: "",
      publicUnspecifiedLeverSummary: "",
    });
    expect(W5CreatorDecisionPacketSchema.safeParse(draft).success).toBe(false);
  });

  it("includes every live orchestration entrypoint and narration dependency in the exact-SHA closure", () => {
    expect(W5_CRITICAL_PATHS).toEqual(
      expect.arrayContaining([
        "scripts/prepare-w5-ab.ts",
        "scripts/capture-w5-ab.ts",
        "scripts/finalize-w5-ab.ts",
        "src/adapters/codex-cli",
        "src/contracts",
        "src/domain",
      ]),
    );
  });

  it("publishes the full call manifest only from the post-rating finalizer", () => {
    const captureSource = readFileSync(
      path.join(process.cwd(), "scripts/capture-w5-ab.ts"),
      "utf8",
    );
    const finalizeSource = readFileSync(
      path.join(process.cwd(), "scripts/finalize-w5-ab.ts"),
      "utf8",
    );

    expect(captureSource).not.toContain('fileName: "W5-HASH-MANIFEST.json"');
    expect(finalizeSource).toContain('fileName: "W5-HASH-MANIFEST.json"');
    const decisionCompatibility = finalizeSource.indexOf(
      "assertW5PrivateJsonTargetCompatible",
    );
    const publicCompatibility = finalizeSource.indexOf(
      "assertW5PublicWriteCompatible",
    );
    const decisionWrite = finalizeSource.indexOf(
      "writeW5PrivateJsonOnceOrMatch({",
    );
    const manifestWrite = finalizeSource.indexOf(
      "writeW5PublicJsonOnceOrMatch({",
    );
    expect(decisionCompatibility).toBeGreaterThan(-1);
    expect(publicCompatibility).toBeGreaterThan(-1);
    expect(decisionCompatibility).toBeLessThan(decisionWrite);
    expect(publicCompatibility).toBeLessThan(decisionWrite);
    expect(decisionWrite).toBeLessThan(manifestWrite);
  });

  it("does not print a blind label beside the fixed live-call order", () => {
    const captureSource = readFileSync(
      path.join(process.cwd(), "scripts/capture-w5-ab.ts"),
      "utf8",
    );
    const progressBlock = captureSource.slice(
      captureSource.indexOf('status: "W5_SLOT_CAPTURED"'),
      captureSource.indexOf("const samples = liveResults.map"),
    );
    expect(progressBlock).not.toContain("blindLabel");
    expect(progressBlock).not.toContain("orderIndex:");
  });

  it("recovers capture publication without invoking the model again", () => {
    const captureSource = readFileSync(
      path.join(process.cwd(), "scripts/capture-w5-ab.ts"),
      "utf8",
    );
    const existingCaptureCheck = captureSource.indexOf(
      "const existingCapture = await readW5PrivateJsonIfExists",
    );
    const runtimePreflight = captureSource.indexOf(
      "const runtime = await prepareW5CodexRuntime",
    );
    expect(existingCaptureCheck).toBeGreaterThan(-1);
    expect(existingCaptureCheck).toBeLessThan(runtimePreflight);
    expect(captureSource).toContain("writeW5PrivateTextOnceOrMatch");
    expect(captureSource).toContain("writeW5PublicJsonOnceOrMatch");
    expect(captureSource).toContain(
      "W5_CAPTURE_PUBLICATION_RECOVERED_CREATOR_REVIEW_REQUIRED",
    );
  });
});

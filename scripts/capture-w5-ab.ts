import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import { PenelopeEnglishStyleProfileSchema } from "@/src/contracts/world-narrator";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import {
  assertW5CommonSceneAuthorityParity,
  buildW5CaseSessions,
  buildW5CommonSceneAuthority,
} from "@/scripts/w5/cases";
import {
  W5BlindAssignmentSchema,
  type W5PreparedCaseRun,
} from "@/scripts/w5/contracts";
import {
  assertW5PrivateCaptureIdsAvailable,
  assertW5PrivateFilesAvailable,
  buildW5PublicManifest,
  readW5PrivateJson,
  readW5PrivateJsonIfExists,
  readW5PrivateJsonWithReceipt,
  writeW5PrivateJsonOnce,
  writeW5PrivateJsonOnceOrMatch,
  writeW5PrivateTextOnceOrMatch,
} from "@/scripts/w5/private-store";
import {
  W5PrivateCaptureResultSchema,
  W5PrivateSessionPlanSchema,
  w5BlindPacketFileName,
  w5CaptureReservationFileName,
  w5CaptureFileName,
  w5DecisionDraftFileName,
  w5FailureFileName,
  w5OperationalEvidenceRootFileName,
  w5PipelineEvidenceFileName,
  w5PlanFileName,
  w5RuntimePreflightFileName,
  w5SlotCompletionFileName,
  w5SlotReservationFileName,
  withW5Tense,
  type W5PrivateCaptureResult,
  type W5PrivateSessionPlan,
} from "@/scripts/w5/session";
import {
  assertW5CriticalTreeClean,
  resolveW5RepositoryRoot,
} from "@/scripts/w5/repository";
import {
  runW5CandidateCall,
  runW5LegacyBaselineCall,
  w5CaptureId,
  type W5LiveCallResult,
} from "@/scripts/w5/live-calls";
import { verifyLegacyBaselinePins } from "@/scripts/w5/baseline-a";
import { verifyCandidate22Pin } from "@/scripts/w5/authority-pins";
import {
  W5_PUBLIC_SESSION_DIRECTORY,
  assertW5PublicTargetsAvailable,
  assertW5PublicWriteCompatible,
  w5PublicCaptureFileNames,
  writeW5PublicJsonOnceOrMatch,
  writeW5PublicMarkdownOnceOrMatch,
} from "@/scripts/w5/public-store";
import { sha256Bytes } from "@/scripts/w5/recording-process-runner";
import { prepareW5CodexRuntime } from "@/scripts/w5/cli-runtime";
import { computeW5OperationalEvidenceRoot } from "@/scripts/w5/capture-binding";
import {
  buildW5CreatorDecisionDraft,
  buildW5PlanCommitment,
  buildW5ReviewBundle,
} from "@/scripts/w5/publication";

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`w5_argument_missing:${name}`);
  }
  return value;
};

const byCaseId = (runs: readonly W5PreparedCaseRun[]) =>
  new Map(runs.map((run) => [run.definition.caseId, run]));

const assertNoRenderProof = (run: W5PreparedCaseRun): void => {
  if (
    run.target.disposition !== "no_render" ||
    run.target.expectedRendererCallCount !== 0 ||
    run.target.expectedCriticCallCount !== 0 ||
    run.target.receipt.action.status !== "unsupported" ||
    run.finalSession.state.endingId !== "ending.canon_contained"
  ) {
    throw new Error("w5_structural_no_render_drift");
  }
  const before = run.target.beforeSession.state;
  const after = run.target.session.state;
  const stableBefore = {
    actors: before.actors,
    flags: before.flags,
    clocks: before.clocks,
    knowledge: before.knowledge,
    firedReactionRuleIds: before.firedReactionRuleIds,
  };
  const stableAfter = {
    actors: after.actors,
    flags: after.flags,
    clocks: after.clocks,
    knowledge: after.knowledge,
    firedReactionRuleIds: after.firedReactionRuleIds,
  };
  if (canonicalJson(stableBefore) !== canonicalJson(stableAfter)) {
    throw new Error("w5_structural_no_render_granted_gain");
  }
  if (after.turn !== before.turn + 1) {
    throw new Error("w5_structural_no_render_did_not_advance_time");
  }
};

const publishW5CaptureArtifacts = async ({
  repoRoot,
  plan,
  capture,
  recovered,
}: {
  repoRoot: string;
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
  recovered: boolean;
}): Promise<void> => {
  const operationalEvidence = await computeW5OperationalEvidenceRoot({
    repoRoot,
    plan,
    capture,
  });
  const publicFiles = w5PublicCaptureFileNames(plan.maskCommitmentSha256);
  await assertW5PublicWriteCompatible({
    repoRoot,
    fileName: publicFiles.planCommitment,
    source: canonicalJson(buildW5PlanCommitment(plan)),
  });
  const reviewBundle = buildW5ReviewBundle({
    plan,
    capture,
    operationalEvidenceRootSha256:
      operationalEvidence.operationalEvidenceRootSha256,
  });
  await writeW5PrivateJsonOnceOrMatch({
    root: repoRoot,
    relativeName: w5OperationalEvidenceRootFileName(plan.sessionId),
    value: {
      ...operationalEvidence.payload,
      operationalEvidenceRootSha256:
        operationalEvidence.operationalEvidenceRootSha256,
    },
  });
  const blindReceipt = await writeW5PrivateTextOnceOrMatch({
    root: repoRoot,
    relativeName: w5BlindPacketFileName(plan.sessionId),
    text: reviewBundle.blindPacketMarkdown,
  });
  const commitmentReceipt = await writeW5PublicJsonOnceOrMatch({
    repoRoot,
    fileName: publicFiles.blindCommitments,
    value: reviewBundle.blindCommitments,
  });
  const ratingReceipt = await writeW5PublicMarkdownOnceOrMatch({
    repoRoot,
    fileName: publicFiles.creatorRatingSheet,
    markdown: reviewBundle.creatorRatingSheetMarkdown,
  });
  if (
    blindReceipt.sha256 !== reviewBundle.blindPacketSha256 ||
    commitmentReceipt.sha256 !== reviewBundle.blindCommitmentsSha256 ||
    ratingReceipt.sha256 !== reviewBundle.creatorRatingSheetSha256
  ) {
    throw new Error("w5_review_bundle_receipt_mismatch");
  }
  const decisionDraftName = w5DecisionDraftFileName(plan.sessionId);
  const decisionDraft = buildW5CreatorDecisionDraft({
    plan,
    capture,
    reviewBundleSha256: reviewBundle.reviewBundleSha256,
  });
  const existingDecisionDraft = await readW5PrivateJsonIfExists({
    root: repoRoot,
    relativeName: decisionDraftName,
  });
  const decisionDraftReceipt =
    existingDecisionDraft === null
      ? await writeW5PrivateJsonOnce({
          root: repoRoot,
          relativeName: decisionDraftName,
          value: decisionDraft,
        })
      : (
          await readW5PrivateJsonWithReceipt({
            root: repoRoot,
            relativeName: decisionDraftName,
          })
        ).receipt;
  process.stdout.write(
    `${JSON.stringify({
      status: recovered
        ? "W5_CAPTURE_PUBLICATION_RECOVERED_CREATOR_REVIEW_REQUIRED"
        : "W5_CAPTURE_COMPLETE_CREATOR_REVIEW_REQUIRED",
      sessionId: plan.sessionId,
      blindReceipt,
      publicCommitmentSha256: commitmentReceipt.sha256,
      publicRatingSheetSha256: ratingReceipt.sha256,
      reviewBundleSha256: reviewBundle.reviewBundleSha256,
      operationalEvidenceRootSha256:
        operationalEvidence.operationalEvidenceRootSha256,
      decisionDraftReceipt,
      blindPacketLocator: `private-submission/w5-ab/${w5BlindPacketFileName(plan.sessionId)}`,
      ratingSheetLocator: `${W5_PUBLIC_SESSION_DIRECTORY}/${publicFiles.creatorRatingSheet}`,
      decisionDraftLocator: `private-submission/w5-ab/${decisionDraftName}`,
    })}\n`,
  );
};

const main = async (): Promise<void> => {
  const sessionId = argument("--session");
  const repoRoot = await resolveW5RepositoryRoot(process.cwd());
  const plan = W5PrivateSessionPlanSchema.parse(
    await readW5PrivateJson({
      root: repoRoot,
      relativeName: w5PlanFileName(sessionId),
    }),
  );
  assertW5CriticalTreeClean({
    repoRoot,
    expectedRevision: plan.sourceRevision,
  });
  verifyLegacyBaselinePins({ repoRoot });
  await verifyCandidate22Pin({ repoRoot });
  const existingCapture = await readW5PrivateJsonIfExists({
    root: repoRoot,
    relativeName: w5CaptureFileName(sessionId),
  });
  if (existingCapture !== null) {
    await publishW5CaptureArtifacts({
      repoRoot,
      plan,
      capture: W5PrivateCaptureResultSchema.parse(existingCapture),
      recovered: true,
    });
    return;
  }
  const runtime = await prepareW5CodexRuntime();

  const scenario = getOdysseyBook19WorldSimulation();
  const scenarioSha256Before = sha256Canonical(scenario);
  if (scenarioSha256Before !== plan.scenarioSha256) {
    throw new Error("w5_scenario_authority_changed");
  }
  const presentRuns = buildW5CaseSessions({ scenario });
  const pastRuns = buildW5CaseSessions({
    scenario,
    styleProfile: withW5Tense(
      PenelopeEnglishStyleProfileSchema.parse(styleProfileJson),
      "past",
    ),
  });
  const presentByCase = byCaseId(presentRuns);
  const pastByCase = byCaseId(pastRuns);
  for (const present of presentRuns) {
    const past = pastByCase.get(present.definition.caseId);
    if (!past) throw new Error("w5_past_case_missing");
    assertW5CommonSceneAuthorityParity(
      buildW5CommonSceneAuthority(present),
      buildW5CommonSceneAuthority(past),
    );
  }
  const structural = presentByCase.get("case.absurd_no_render");
  if (!structural) throw new Error("w5_structural_case_missing");
  assertNoRenderProof(structural);
  const structuralAuthority = buildW5CommonSceneAuthority(structural);
  if (
    structuralAuthority.commonAuthorityHash !==
      plan.structuralNoRender.commonAuthorityHash ||
    structural.finalSession.state.endingId !== plan.structuralNoRender.endingId
  ) {
    throw new Error("w5_structural_authority_changed");
  }

  const blindByCall = new Map(
    plan.blindMap.map(({ callId, blindLabel }) => [callId, blindLabel]),
  );
  const liveResults: W5LiveCallResult[] = [];
  const orderedCalls = [...plan.calls].sort(
    ({ orderIndex: left }, { orderIndex: right }) => left - right,
  );
  const publicFiles = w5PublicCaptureFileNames(plan.maskCommitmentSha256);
  const privateTargets = [
    w5CaptureReservationFileName(sessionId),
    w5RuntimePreflightFileName(sessionId),
    w5CaptureFileName(sessionId),
    w5BlindPacketFileName(sessionId),
    w5DecisionDraftFileName(sessionId),
    w5OperationalEvidenceRootFileName(sessionId),
    w5FailureFileName(sessionId),
    ...orderedCalls.flatMap((call) => [
      w5SlotReservationFileName(sessionId, call.orderIndex),
      w5SlotCompletionFileName(sessionId, call.orderIndex),
      ...(call.harnessId === "baseline_a"
        ? []
        : [w5PipelineEvidenceFileName(sessionId, call.orderIndex)]),
    ]),
  ];
  await assertW5PrivateFilesAvailable({
    root: repoRoot,
    relativeNames: privateTargets,
  });
  await assertW5PrivateCaptureIdsAvailable({
    root: repoRoot,
    captureIds: orderedCalls.flatMap((call) =>
      Array.from({ length: 1 + call.maximumCriticCalls }, (_, index) =>
        w5CaptureId({
          sessionId,
          callId: call.callId,
          callIndex: index + 1,
        }),
      ),
    ),
  });
  await assertW5PublicTargetsAvailable({
    repoRoot,
    fileNames: [
      publicFiles.blindCommitments,
      publicFiles.creatorRatingSheet,
    ],
  });
  await assertW5PublicWriteCompatible({
    repoRoot,
    fileName: publicFiles.planCommitment,
    source: canonicalJson(buildW5PlanCommitment(plan)),
  });
  await writeW5PrivateJsonOnce({
    root: repoRoot,
    relativeName: w5CaptureReservationFileName(sessionId),
    value: {
      schemaVersion: "w5.capture_reservation.v1",
      sessionId,
      sourceRevision: plan.sourceRevision,
      maskCommitmentSha256: plan.maskCommitmentSha256,
      callCount: orderedCalls.length,
    },
  });
  const runtimeReceipt = await writeW5PrivateJsonOnce({
    root: repoRoot,
    relativeName: w5RuntimePreflightFileName(sessionId),
    value: runtime.receipt,
  });
  let completedSlots = 0;
  for (const call of orderedCalls) {
    const run = (call.tense === "past" ? pastByCase : presentByCase).get(
      call.caseId,
    );
    if (!run || run.target.disposition !== "render") {
      throw new Error(`w5_render_case_missing:${call.callId}`);
    }
    const authority = buildW5CommonSceneAuthority(run);
    if (authority.commonAuthorityHash !== call.commonAuthorityHash) {
      throw new Error(`w5_common_authority_changed:${call.callId}`);
    }
    await writeW5PrivateJsonOnce({
      root: repoRoot,
      relativeName: w5SlotReservationFileName(sessionId, call.orderIndex),
      value: {
        schemaVersion: "w5.slot_reservation.v1",
        sessionId,
        callId: call.callId,
        orderIndex: call.orderIndex,
        commonAuthorityHash: call.commonAuthorityHash,
      },
    });
    const result =
      call.harnessId === "baseline_a"
        ? await runW5LegacyBaselineCall({
            repoRoot,
            sessionId,
            call,
            rendererRequest: run.target.rendererRequest,
            privateValidation: run.target.artifacts.privateValidationMaterial,
            command: runtime.command,
          })
        : await runW5CandidateCall({
            repoRoot,
            sessionId,
            call,
            artifacts: run.target.artifacts,
            command: runtime.command,
          });
    liveResults.push(result);
    await writeW5PrivateJsonOnce({
      root: repoRoot,
      relativeName: w5SlotCompletionFileName(sessionId, call.orderIndex),
      value: {
        schemaVersion: "w5.slot_completion.v2",
        sessionId,
        callId: call.callId,
        orderIndex: call.orderIndex,
        finalOutputSha256: result.finalOutputSha256,
        disposition: result.disposition,
        rendererCallCount: result.rendererCallCount,
        criticCallCount: result.criticCallCount,
        privateCaptureIds: result.captures.map(({ captureId }) => captureId),
        privateCaptureReceiptSha256: result.captures.map(
          ({ receiptSha256 }) => receiptSha256,
        ),
        finalCaptureId: result.finalCaptureId,
        pipelineEvidenceSha256: result.pipelineEvidence?.sha256 ?? null,
      },
    });
    completedSlots += 1;
    process.stdout.write(
      `${JSON.stringify({
        status: "W5_SLOT_CAPTURED",
        completedSlots,
        remainingSlots: orderedCalls.length - completedSlots,
      })}\n`,
    );
  }

  const samples = liveResults.map((result) => {
    const call = plan.calls.find(({ callId }) => callId === result.callId);
    const blindLabel = blindByCall.get(result.callId);
    if (!call || !blindLabel) throw new Error("w5_captured_call_unmapped");
    return {
      blindLabel,
      callId: call.callId,
      caseId: call.caseId,
      commonAuthorityHash: call.commonAuthorityHash,
      finalOutputSha256: result.finalOutputSha256,
      finalProse: result.finalProse,
      disposition: result.disposition,
      rendererCallCount: result.rendererCallCount,
      criticCallCount: result.criticCallCount,
      privateCaptureIds: result.captures.map(({ captureId }) => captureId),
      finalCaptureId: result.finalCaptureId,
      pipelineEvidenceArtifactId: result.pipelineEvidence?.artifactId ?? null,
      pipelineEvidenceSha256: result.pipelineEvidence?.sha256 ?? null,
    };
  });
  const blindAssignments = samples.map((sample) =>
    W5BlindAssignmentSchema.parse({
      blindLabel: sample.blindLabel,
      callId: sample.callId,
      finalOutputSha256: sample.finalOutputSha256,
    }),
  );
  const fullManifest = buildW5PublicManifest({
    manifestId: `manifest.${sha256Bytes(Buffer.from(sessionId)).slice(0, 16)}`,
    sourceRevision: plan.sourceRevision,
    maskCommitmentSha256: plan.maskCommitmentSha256,
    slots: samples.map((sample) => ({
      maskedSlotId: `slot.${String(
        [...samples]
          .sort(({ blindLabel: left }, { blindLabel: right }) => left.localeCompare(right))
          .findIndex(({ blindLabel }) => blindLabel === sample.blindLabel) + 1,
      ).padStart(2, "0")}`,
      captures:
        liveResults.find(({ callId }) => callId === sample.callId)?.captures ?? [],
    })),
  });
  const scenarioSha256After = sha256Canonical(scenario);
  const captureResult = W5PrivateCaptureResultSchema.parse({
    schemaVersion: "w5.private_capture_result.v1",
    sessionId,
    sourceRevision: plan.sourceRevision,
    scenarioSha256Before,
    scenarioSha256After,
    maskCommitmentSha256: plan.maskCommitmentSha256,
    runtimePreflightArtifactId: runtimeReceipt.artifactId,
    runtimePreflightSha256: runtimeReceipt.sha256,
    samples,
    blindAssignments,
    structuralNoRender: plan.structuralNoRender,
    fullManifest,
  });
  await writeW5PrivateJsonOnce({
    root: repoRoot,
    relativeName: w5CaptureFileName(sessionId),
    value: captureResult,
  });
  await publishW5CaptureArtifacts({
    repoRoot,
    plan,
    capture: captureResult,
    recovered: false,
  });
};

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : "w5_capture_failed";
  try {
    const sessionId = argument("--session");
    const repoRoot = await resolveW5RepositoryRoot(process.cwd());
    await writeW5PrivateJsonOnce({
      root: repoRoot,
      relativeName: w5FailureFileName(sessionId),
      value: { status: "W5_CAPTURE_STOPPED", sessionId, error: message },
    });
  } catch {
    // The original failure remains authoritative; no retry or overwrite occurs.
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

import { LegacyBaselineOutputSchema } from "@/scripts/w5/baseline-a";
import { w5CaptureId } from "@/scripts/w5/live-calls";
import {
  assertW5PrivateCaptureIdsAvailable,
  buildW5PublicManifest,
  readW5PrivateCaptureFinal,
  readW5PrivateCaptureReceipt,
  readW5PrivateJsonIfExists,
  readW5PrivateJsonWithReceipt,
  type W5PrivateArtifactReceipt,
  type W5PrivateCaptureReceipt,
} from "@/scripts/w5/private-store";
import { sha256Bytes } from "@/scripts/w5/recording-process-runner";
import {
  assertW5CaptureMatchesPlan,
  w5CaptureFileName,
  w5PipelineEvidenceFileName,
  w5RuntimePreflightFileName,
  w5SlotCompletionFileName,
  type W5PrivateCaptureResult,
  type W5PrivateSessionPlan,
} from "@/scripts/w5/session";
import { ModelNarrationOutputSchema } from "@/src/contracts/world-narrator";
import { canonicalJson } from "@/src/domain/canonical-json";
import { z } from "zod";
import {
  assertW5PublicTargetMatches,
  w5PublicCaptureFileNames,
} from "@/scripts/w5/public-store";
import { buildW5PlanCommitment } from "@/scripts/w5/publication";

const SHA256 = /^[a-f0-9]{64}$/u;

const W5SlotCompletionSchema = z
  .object({
    schemaVersion: z.literal("w5.slot_completion.v2"),
    sessionId: z.string(),
    callId: z.string(),
    orderIndex: z.number().int().min(0).max(5),
    finalOutputSha256: z.string().regex(SHA256),
    disposition: z.string().min(1),
    rendererCallCount: z.literal(1),
    criticCallCount: z.union([z.literal(0), z.literal(1)]),
    privateCaptureIds: z.array(z.string()).min(1).max(2),
    privateCaptureReceiptSha256: z.array(z.string().regex(SHA256)).min(1).max(2),
    finalCaptureId: z.string(),
    pipelineEvidenceSha256: z.string().regex(SHA256).nullable(),
  })
  .strict();

const W5PipelineEvidenceSchema = z
  .object({
    schemaVersion: z.literal("w5.pipeline_evidence.v2"),
    sessionId: z.string(),
    callId: z.string(),
    finalOutputSha256: z.string().regex(SHA256),
    disposition: z.string().min(1),
    preflight: z.unknown(),
    validation: z.unknown(),
    trace: z.unknown(),
    rendererCallCount: z.literal(1),
    criticCallCount: z.union([z.literal(0), z.literal(1)]),
    privateCaptureIds: z.array(z.string()).min(1).max(2),
    privateCaptureReceiptSha256: z.array(z.string().regex(SHA256)).min(1).max(2),
    finalCaptureId: z.string(),
    warningCount: z.number().int().nonnegative(),
    publishReady: z.boolean(),
    stateTransitionAllowed: z.boolean(),
  })
  .strict();

const W5RuntimeReceiptSchema = z
  .object({
    schemaVersion: z.literal("w5.codex_cli_runtime.v1"),
    transport: z.literal("codex_cli"),
    requestedModel: z.literal("gpt-5.6-sol"),
    actualModelIdentity: z.literal("unreported"),
    reasoningEffort: z.literal("unreported"),
    commandPath: z.string().min(1),
    commandFileBytes: z.number().int().positive(),
    commandFileSha256: z.string().regex(SHA256),
    cliVersion: z.string().min(1),
    auth: z.literal("chatgpt"),
    requiredFlags: z.array(z.string()).min(1),
  })
  .strict();

type W5SlotCompletion = z.infer<typeof W5SlotCompletionSchema>;
type W5PipelineEvidence = z.infer<typeof W5PipelineEvidenceSchema>;

export const deriveW5FinalProseFromRaw = ({
  harnessId,
  rawFinalBytes,
}: {
  harnessId: "baseline_a" | "candidate_b_present" | "candidate_b_past";
  rawFinalBytes: Uint8Array;
}): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(rawFinalBytes).toString("utf8").trim()) as unknown;
  } catch {
    throw new Error("w5_raw_final_json_invalid");
  }
  if (harnessId === "baseline_a") {
    return LegacyBaselineOutputSchema.parse(parsed).prose;
  }
  return ModelNarrationOutputSchema.parse(parsed).readerProse.paragraphs
    .map(({ text }) => text)
    .join("\n\n");
};

export const assertW5SampleRawBinding = ({
  harnessId,
  finalOutputSha256,
  finalProse,
  rawFinalBytes,
}: {
  harnessId: "baseline_a" | "candidate_b_present" | "candidate_b_past";
  finalOutputSha256: string;
  finalProse: string;
  rawFinalBytes: Uint8Array;
}): void => {
  if (sha256Bytes(rawFinalBytes) !== finalOutputSha256) {
    throw new Error("w5_raw_final_hash_mismatch");
  }
  if (
    deriveW5FinalProseFromRaw({ harnessId, rawFinalBytes }) !== finalProse
  ) {
    throw new Error("w5_raw_final_prose_mismatch");
  }
};

export const assertW5CaptureIdBindings = ({
  plan,
  capture,
}: {
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
}): void => {
  const callById = new Map(plan.calls.map((call) => [call.callId, call]));
  const allCaptureIds = new Set<string>();
  for (const sample of capture.samples) {
    const call = callById.get(sample.callId);
    if (!call || sample.criticCallCount > call.maximumCriticCalls) {
      throw new Error("w5_capture_id_call_mismatch");
    }
    const expectedCaptureIds = Array.from(
      { length: sample.rendererCallCount + sample.criticCallCount },
      (_, index) =>
        w5CaptureId({
          sessionId: plan.sessionId,
          callId: sample.callId,
          callIndex: index + 1,
        }),
    );
    if (
      JSON.stringify(sample.privateCaptureIds) !==
        JSON.stringify(expectedCaptureIds) ||
      sample.finalCaptureId !== expectedCaptureIds.at(-1)
    ) {
      throw new Error(`w5_capture_id_call_mismatch:${sample.blindLabel}`);
    }
    for (const captureId of expectedCaptureIds) {
      if (allCaptureIds.has(captureId)) {
        throw new Error("w5_capture_id_reused");
      }
      allCaptureIds.add(captureId);
    }
  }
};

export const assertW5SampleOperationalBinding = ({
  sessionId,
  call,
  sample,
  completion,
  pipelineEvidence,
  pipelineEvidenceReceipt,
  captureReceipts,
}: {
  sessionId: string;
  call: W5PrivateSessionPlan["calls"][number];
  sample: W5PrivateCaptureResult["samples"][number];
  completion: W5SlotCompletion;
  pipelineEvidence: W5PipelineEvidence | null;
  pipelineEvidenceReceipt: W5PrivateArtifactReceipt | null;
  captureReceipts: readonly W5PrivateCaptureReceipt[];
}): void => {
  const captureIds = captureReceipts.map(({ captureId }) => captureId);
  const receiptHashes = captureReceipts.map(
    ({ receiptSha256 }) => receiptSha256,
  );
  if (
    sample.finalCaptureId !== sample.privateCaptureIds.at(-1) ||
    canonicalJson(captureIds) !== canonicalJson(sample.privateCaptureIds)
  ) {
    throw new Error(`w5_operational_capture_mismatch:${sample.blindLabel}`);
  }
  const expectedCompletion: W5SlotCompletion = {
    schemaVersion: "w5.slot_completion.v2",
    sessionId,
    callId: call.callId,
    orderIndex: call.orderIndex,
    finalOutputSha256: sample.finalOutputSha256,
    disposition: sample.disposition,
    rendererCallCount: sample.rendererCallCount,
    criticCallCount: sample.criticCallCount,
    privateCaptureIds: [...sample.privateCaptureIds],
    privateCaptureReceiptSha256: receiptHashes,
    finalCaptureId: sample.finalCaptureId,
    pipelineEvidenceSha256: sample.pipelineEvidenceSha256,
  };
  if (canonicalJson(completion) !== canonicalJson(expectedCompletion)) {
    throw new Error(`w5_slot_completion_mismatch:${sample.blindLabel}`);
  }

  if (call.harnessId === "baseline_a") {
    if (
      pipelineEvidence !== null ||
      pipelineEvidenceReceipt !== null ||
      sample.pipelineEvidenceArtifactId !== null ||
      sample.pipelineEvidenceSha256 !== null
    ) {
      throw new Error(`w5_baseline_pipeline_evidence_invalid:${sample.blindLabel}`);
    }
    return;
  }
  if (
    pipelineEvidence === null ||
    pipelineEvidenceReceipt === null ||
    sample.pipelineEvidenceArtifactId !== pipelineEvidenceReceipt.artifactId ||
    sample.pipelineEvidenceSha256 !== pipelineEvidenceReceipt.sha256
  ) {
    throw new Error(`w5_pipeline_evidence_receipt_mismatch:${sample.blindLabel}`);
  }
  const expectedPipelineBinding = {
    sessionId,
    callId: call.callId,
    finalOutputSha256: sample.finalOutputSha256,
    disposition: sample.disposition,
    rendererCallCount: sample.rendererCallCount,
    criticCallCount: sample.criticCallCount,
    privateCaptureIds: [...sample.privateCaptureIds],
    privateCaptureReceiptSha256: receiptHashes,
    finalCaptureId: sample.finalCaptureId,
  };
  for (const [key, expected] of Object.entries(expectedPipelineBinding)) {
    if (
      canonicalJson(pipelineEvidence[key as keyof W5PipelineEvidence]) !==
      canonicalJson(expected)
    ) {
      throw new Error(`w5_pipeline_evidence_mismatch:${sample.blindLabel}:${key}`);
    }
  }
};

export const assertW5FullManifestBinding = ({
  plan,
  capture,
  receiptsByCall,
}: {
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
  receiptsByCall: ReadonlyMap<string, readonly W5PrivateCaptureReceipt[]>;
}): void => {
  const recomputedManifest = buildW5PublicManifest({
    manifestId: `manifest.${sha256Bytes(Buffer.from(plan.sessionId)).slice(0, 16)}`,
    sourceRevision: plan.sourceRevision,
    maskCommitmentSha256: plan.maskCommitmentSha256,
    slots: capture.samples.map((sample) => ({
      maskedSlotId: `slot.${String(
        [...capture.samples]
          .sort(({ blindLabel: left }, { blindLabel: right }) =>
            left.localeCompare(right),
          )
          .findIndex(({ blindLabel }) => blindLabel === sample.blindLabel) + 1,
      ).padStart(2, "0")}`,
      captures: receiptsByCall.get(sample.callId) ?? [],
    })),
  });
  if (canonicalJson(capture.fullManifest) !== canonicalJson(recomputedManifest)) {
    throw new Error("w5_full_manifest_raw_mismatch");
  }
};

export const assertW5CaptureRawBindings = async ({
  repoRoot,
  plan,
  capture,
}: {
  repoRoot: string;
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
}): Promise<void> => {
  assertW5CaptureMatchesPlan({ plan, capture });
  assertW5CaptureIdBindings({ plan, capture });
  const runtimeName = w5RuntimePreflightFileName(plan.sessionId);
  const runtimeRecord = await readW5PrivateJsonWithReceipt({
    root: repoRoot,
    relativeName: runtimeName,
  });
  W5RuntimeReceiptSchema.parse(runtimeRecord.value);
  if (
    capture.runtimePreflightArtifactId !== runtimeRecord.receipt.artifactId ||
    capture.runtimePreflightSha256 !== runtimeRecord.receipt.sha256
  ) {
    throw new Error("w5_runtime_receipt_mismatch");
  }

  const callById = new Map(plan.calls.map((call) => [call.callId, call]));
  const receiptsByCall = new Map<string, readonly W5PrivateCaptureReceipt[]>();
  const unusedCaptureIds: string[] = [];
  for (const sample of capture.samples) {
    const call = callById.get(sample.callId);
    if (!call) throw new Error("w5_capture_plan_call_missing");
    const captureReceipts = await Promise.all(
      sample.privateCaptureIds.map((captureId) =>
        readW5PrivateCaptureReceipt({ root: repoRoot, captureId }),
      ),
    );
    receiptsByCall.set(sample.callId, captureReceipts);
    for (
      let index = sample.privateCaptureIds.length + 1;
      index <= 1 + call.maximumCriticCalls;
      index += 1
    ) {
      unusedCaptureIds.push(
        w5CaptureId({
          sessionId: plan.sessionId,
          callId: call.callId,
          callIndex: index,
        }),
      );
    }

    const completionRecord = await readW5PrivateJsonWithReceipt({
      root: repoRoot,
      relativeName: w5SlotCompletionFileName(
        plan.sessionId,
        call.orderIndex,
      ),
    });
    const completion = W5SlotCompletionSchema.parse(completionRecord.value);
    const pipelineName = w5PipelineEvidenceFileName(
      plan.sessionId,
      call.orderIndex,
    );
    const pipelineRecord = await readW5PrivateJsonIfExists({
      root: repoRoot,
      relativeName: pipelineName,
    });
    const pipelineWithReceipt =
      pipelineRecord === null
        ? null
        : await readW5PrivateJsonWithReceipt({
            root: repoRoot,
            relativeName: pipelineName,
          });
    const pipelineEvidence = pipelineWithReceipt
      ? W5PipelineEvidenceSchema.parse(pipelineWithReceipt.value)
      : null;
    assertW5SampleOperationalBinding({
      sessionId: plan.sessionId,
      call,
      sample,
      completion,
      pipelineEvidence,
      pipelineEvidenceReceipt: pipelineWithReceipt?.receipt ?? null,
      captureReceipts,
    });

    const rawFinalBytes = await readW5PrivateCaptureFinal({
      root: repoRoot,
      captureId: sample.finalCaptureId,
    });
    assertW5SampleRawBinding({
      harnessId: call.harnessId,
      finalOutputSha256: sample.finalOutputSha256,
      finalProse: sample.finalProse,
      rawFinalBytes,
    });
  }
  await assertW5PrivateCaptureIdsAvailable({
    root: repoRoot,
    captureIds: unusedCaptureIds,
  });

  assertW5FullManifestBinding({ plan, capture, receiptsByCall });
};

export const computeW5OperationalEvidenceRoot = async ({
  repoRoot,
  plan,
  capture,
}: {
  repoRoot: string;
  plan: W5PrivateSessionPlan;
  capture: W5PrivateCaptureResult;
}) => {
  await assertW5CaptureRawBindings({ repoRoot, plan, capture });
  const publicFiles = w5PublicCaptureFileNames(plan.maskCommitmentSha256);
  const planCommitmentReceipt = await assertW5PublicTargetMatches({
    repoRoot,
    fileName: publicFiles.planCommitment,
    source: canonicalJson(buildW5PlanCommitment(plan)),
  });
  const captureResultRecord = await readW5PrivateJsonWithReceipt({
    root: repoRoot,
    relativeName: w5CaptureFileName(plan.sessionId),
  });
  if (canonicalJson(captureResultRecord.value) !== canonicalJson(capture)) {
    throw new Error("w5_capture_result_file_mismatch");
  }
  const runtimeRecord = await readW5PrivateJsonWithReceipt({
    root: repoRoot,
    relativeName: w5RuntimePreflightFileName(plan.sessionId),
  });
  const slotCompletionReceipts: Array<{
    orderIndex: number;
    sha256: string;
  }> = [];
  const pipelineEvidenceReceipts: Array<{
    orderIndex: number;
    sha256: string;
  }> = [];
  for (const call of [...plan.calls].sort(
    ({ orderIndex: left }, { orderIndex: right }) => left - right,
  )) {
    const completion = await readW5PrivateJsonWithReceipt({
      root: repoRoot,
      relativeName: w5SlotCompletionFileName(
        plan.sessionId,
        call.orderIndex,
      ),
    });
    slotCompletionReceipts.push({
      orderIndex: call.orderIndex,
      sha256: completion.receipt.sha256,
    });
    if (call.harnessId !== "baseline_a") {
      const pipeline = await readW5PrivateJsonWithReceipt({
        root: repoRoot,
        relativeName: w5PipelineEvidenceFileName(
          plan.sessionId,
          call.orderIndex,
        ),
      });
      pipelineEvidenceReceipts.push({
        orderIndex: call.orderIndex,
        sha256: pipeline.receipt.sha256,
      });
    }
  }
  const payload = {
    schemaVersion: "w5.operational_evidence_root.v1" as const,
    sessionId: plan.sessionId,
    sourceRevision: plan.sourceRevision,
    planCommitmentSha256: planCommitmentReceipt.sha256,
    captureResultSha256: captureResultRecord.receipt.sha256,
    runtimeReceiptSha256: runtimeRecord.receipt.sha256,
    slotCompletionReceipts,
    pipelineEvidenceReceipts,
    fullManifestSha256: sha256Bytes(
      Buffer.from(canonicalJson(capture.fullManifest), "utf8"),
    ),
  };
  return {
    payload,
    operationalEvidenceRootSha256: sha256Bytes(
      Buffer.from(canonicalJson(payload), "utf8"),
    ),
  };
};

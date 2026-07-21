import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCodexCliEnvironment } from "@/src/adapters/codex-cli/execution-contract";
import {
  CODEX_CLI_NARRATION_RENDERER_W5_MODEL,
  createCodexCliNarrationRenderer,
} from "@/src/adapters/codex-cli/world-narrator";
import {
  DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES,
  DEFAULT_CODEX_CLI_TIMEOUT_MS,
  runCodexCliProcess,
} from "@/src/adapters/codex-cli/process-runner";
import { runWorldNarrationPipeline } from "@/src/application/world-narration-pipeline";
import type { WorldNarrationPipelineArtifacts } from "@/src/application/world-simulation-service";
import type { NarrationRendererRequest } from "@/src/contracts/world-narrator";
import { canonicalJson } from "@/src/domain/canonical-json";
import {
  buildLegacyBaselineArgs,
  buildLegacyBaselinePrompt,
  buildLegacyBaselineRequest,
  LEGACY_BASELINE_OUTPUT_JSON_SCHEMA,
  validateLegacyBaselineOutput,
  verifyLegacyBaselinePins,
} from "@/scripts/w5/baseline-a";
import type { W5PrivateCallPlan } from "@/scripts/w5/contracts";
import {
  createRecordingProcessRunner,
  sha256Bytes,
} from "@/scripts/w5/recording-process-runner";
import {
  writeW5PrivateCapture,
  writeW5PrivateJsonOnce,
  type W5PrivateArtifactReceipt,
  type W5PrivateCaptureReceipt,
} from "@/scripts/w5/private-store";
import {
  w5PipelineEvidenceFileName,
  withW5Tense,
} from "@/scripts/w5/session";

export type W5LiveCallResult = {
  callId: string;
  finalProse: string;
  finalOutputSha256: string;
  disposition: string;
  rendererCallCount: 1;
  criticCallCount: 0 | 1;
  captures: readonly W5PrivateCaptureReceipt[];
  finalCaptureId: string;
  pipelineEvidence: W5PrivateArtifactReceipt | null;
};

export const w5CaptureId = ({
  sessionId,
  callId,
  callIndex,
}: {
  sessionId: string;
  callId: string;
  callIndex: number;
}): string =>
  `cap-${sha256Bytes(Buffer.from(`${sessionId}:${callId}`, "utf8")).slice(0, 16)}-${String(callIndex).padStart(2, "0")}`;

const createPrivateRecorder = ({
  repoRoot,
  sessionId,
  callId,
}: {
  repoRoot: string;
  sessionId: string;
  callId: string;
}) => {
  const captures: W5PrivateCaptureReceipt[] = [];
  const recording = createRecordingProcessRunner({
    inner: runCodexCliProcess,
    onRecord: async (record) => {
      const receipt = await writeW5PrivateCapture({
        root: repoRoot,
        captureId: w5CaptureId({
          sessionId,
          callId,
          callIndex: captures.length + 1,
        }),
        capture: record,
      });
      captures.push(receipt);
    },
  });
  return { ...recording, captures };
};

const readStructuredOutput = async ({
  outputPath,
  outputLimitBytes,
}: {
  outputPath: string;
  outputLimitBytes: number;
}): Promise<unknown> => {
  const stat = await lstat(outputPath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 2 ||
    stat.size > outputLimitBytes
  ) {
    throw new Error("w5_legacy_output_unsafe");
  }
  return JSON.parse((await readFile(outputPath, "utf8")).trim()) as unknown;
};

export const runW5LegacyBaselineCall = async ({
  repoRoot,
  sessionId,
  call,
  rendererRequest,
  privateValidation,
  command,
  env = process.env,
}: {
  repoRoot: string;
  sessionId: string;
  call: W5PrivateCallPlan;
  rendererRequest: NarrationRendererRequest;
  privateValidation: WorldNarrationPipelineArtifacts["privateValidationMaterial"];
  command: string;
  env?: NodeJS.ProcessEnv;
}): Promise<W5LiveCallResult> => {
  if (call.harnessId !== "baseline_a" || call.maximumCriticCalls !== 0) {
    throw new Error("w5_legacy_call_plan_invalid");
  }
  verifyLegacyBaselinePins({ repoRoot });
  const request = buildLegacyBaselineRequest(rendererRequest);
  const prompt = buildLegacyBaselinePrompt(request);
  const timeoutMs = DEFAULT_CODEX_CLI_TIMEOUT_MS;
  const outputLimitBytes = DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES;
  const root = await mkdtemp(path.join(tmpdir(), "penelope-w5-legacy-"));
  const workspace = path.join(root, "workspace");
  const ioDirectory = path.join(root, "io");
  await Promise.all([mkdir(workspace), mkdir(ioDirectory)]);
  const schemaPath = path.join(ioDirectory, "legacy-output.schema.json");
  const outputPath = path.join(ioDirectory, "last-message.json");
  await writeFile(
    schemaPath,
    `${canonicalJson(LEGACY_BASELINE_OUTPUT_JSON_SCHEMA)}\n`,
    { flag: "wx" },
  );
  const recording = createPrivateRecorder({ repoRoot, sessionId, callId: call.callId });
  try {
    const processResult = await recording.runner({
      command,
      args: buildLegacyBaselineArgs({ schemaPath, outputPath }),
      cwd: workspace,
      stdin: prompt,
      env: buildCodexCliEnvironment(env),
      timeoutMs,
      outputLimitBytes,
    });
    if (
      processResult.timedOut ||
      processResult.exitCode !== 0 ||
      processResult.signal !== null
    ) {
      throw new Error("w5_legacy_process_failed");
    }
    const output = await readStructuredOutput({ outputPath, outputLimitBytes });
    const validation = validateLegacyBaselineOutput({
      request,
      output,
      privateValidation,
    });
    if (!validation.ok) {
      throw new Error(`w5_legacy_validation_failed:${validation.code}`);
    }
    if (recording.records.length !== 1 || recording.captures.length !== 1) {
      throw new Error("w5_legacy_capture_count_invalid");
    }
    const finalMessage = recording.records[0]?.finalMessage;
    if (!finalMessage) throw new Error("w5_legacy_final_message_missing");
    return {
      callId: call.callId,
      finalProse: validation.output.prose,
      finalOutputSha256: finalMessage.sha256,
      disposition: "baseline_validated",
      rendererCallCount: 1,
      criticCallCount: 0,
      captures: recording.captures,
      finalCaptureId: recording.captures[0]!.captureId,
      pipelineEvidence: null,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

export const runW5CandidateCall = async ({
  repoRoot,
  sessionId,
  call,
  artifacts: artifactsInput,
  command,
  env = process.env,
}: {
  repoRoot: string;
  sessionId: string;
  call: W5PrivateCallPlan;
  artifacts: WorldNarrationPipelineArtifacts;
  command: string;
  env?: NodeJS.ProcessEnv;
}): Promise<W5LiveCallResult> => {
  if (
    call.harnessId === "baseline_a" ||
    call.maximumCriticCalls !== 1 ||
    (call.tense !== "present" && call.tense !== "past")
  ) {
    throw new Error("w5_candidate_call_plan_invalid");
  }
  const artifacts = structuredClone(artifactsInput);
  artifacts.styleProfile = withW5Tense(artifacts.styleProfile, call.tense);
  const recording = createPrivateRecorder({ repoRoot, sessionId, callId: call.callId });
  const adapter = createCodexCliNarrationRenderer({
    env,
    commandResolver: async () => command,
    processRunner: recording.runner,
    requestedModel: CODEX_CLI_NARRATION_RENDERER_W5_MODEL,
  });
  const result = await runWorldNarrationPipeline({
    artifacts,
    renderer: adapter,
    critic: adapter,
  });
  if (
    result.disposition !== "accepted" &&
    result.disposition !== "creator_review"
  ) {
    throw new Error(`w5_candidate_pipeline_failed:${result.disposition}`);
  }
  if (!result.modelOutput) throw new Error("w5_candidate_output_missing");
  const expectedCalls = result.rendererCallCount + result.criticCallCount;
  if (
    result.rendererCallCount !== 1 ||
    recording.records.length !== expectedCalls ||
    recording.captures.length !== expectedCalls
  ) {
    throw new Error("w5_candidate_capture_count_invalid");
  }
  const finalCanonical = canonicalJson(result.modelOutput);
  const finalRecord = [...recording.records].reverse().find((record) => {
    if (!record.finalMessage) return false;
    try {
      return canonicalJson(
        JSON.parse(record.finalMessage.bytes.toString("utf8")) as unknown,
      ) === finalCanonical;
    } catch {
      return false;
    }
  });
  const finalMessage = finalRecord?.finalMessage;
  if (!finalMessage) throw new Error("w5_candidate_final_message_missing");
  const finalRecordIndex = recording.records.findIndex(
    (record) => record === finalRecord,
  );
  if (finalRecordIndex !== recording.records.length - 1) {
    throw new Error("w5_candidate_critic_did_not_produce_final_output");
  }
  const finalCaptureId = recording.captures[finalRecordIndex]?.captureId;
  if (!finalCaptureId) throw new Error("w5_candidate_final_capture_missing");
  const pipelineEvidence = await writeW5PrivateJsonOnce({
    root: repoRoot,
    relativeName: w5PipelineEvidenceFileName(sessionId, call.orderIndex),
    value: {
      schemaVersion: "w5.pipeline_evidence.v2",
      sessionId,
      callId: call.callId,
      finalOutputSha256: finalMessage.sha256,
      disposition: result.disposition,
      preflight: result.preflight,
      validation: result.validation,
      trace: result.trace,
      rendererCallCount: result.rendererCallCount,
      criticCallCount: result.criticCallCount,
      privateCaptureIds: recording.captures.map(({ captureId }) => captureId),
      privateCaptureReceiptSha256: recording.captures.map(
        ({ receiptSha256 }) => receiptSha256,
      ),
      finalCaptureId,
      warningCount: result.warningCount,
      publishReady: result.publishReady,
      stateTransitionAllowed: result.stateTransitionAllowed,
    },
  });
  return {
    callId: call.callId,
    finalProse: result.modelOutput.readerProse.paragraphs
      .map(({ text }) => text)
      .join("\n\n"),
    finalOutputSha256: finalMessage.sha256,
    disposition: result.disposition,
    rendererCallCount: 1,
    criticCallCount: result.criticCallCount,
    captures: recording.captures,
    finalCaptureId,
    pipelineEvidence,
  };
};

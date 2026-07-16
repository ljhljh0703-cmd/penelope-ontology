import { createHash, randomUUID } from "node:crypto";
import {
  access,
  link,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { loadGpt56Config, type Environment } from "@/src/adapters/openai/gpt56-config";
import { createOpenAiNarrativeModel } from "@/src/adapters/openai/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import type { RunRequest, RunResult } from "@/src/contracts/run";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  LiveCaptureRecoverySchema,
  type LiveCaptureAttemptReceipt,
  type LiveCaptureOutcome,
} from "@/src/evidence/live-capture-contracts";
import {
  LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  LIVE_RED_SAIL_WORLD_PACK_SHA256,
  evaluateLiveRedSailRunResult,
} from "@/src/evidence/live-scenario-contract";
import { sanitizeLiveEvidence } from "@/src/evidence/sanitize-live-evidence";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;
type LiveModelOutcome = RunResult["modelOutcome"]["outcome"];

type LiveEvidenceFileSystem = {
  access: typeof access;
  link: typeof link;
  mkdir: typeof mkdir;
  rm: typeof rm;
  writeFile: typeof writeFile;
};

export type CaptureLiveEvidenceResult = {
  rawPath: string;
  publicPath: string;
  attemptReceiptPath: string;
  receipt: LiveCaptureAttemptReceipt;
};

export type CaptureLiveEvidenceOptions = {
  root: string;
  env: Environment;
  request: LiveRunRequest;
  worldPackId: string;
  worldPackSha256: string;
  run: (request: LiveRunRequest) => Promise<RunResult>;
  attemptId?: string;
  now?: () => string;
  fileSystem?: LiveEvidenceFileSystem;
  sanitize?: typeof sanitizeLiveEvidence;
};

export type RegisteredLiveCaptureMode = "primary" | "retry";

const nodeFileSystem: LiveEvidenceFileSystem = {
  access,
  link,
  mkdir,
  rm,
  writeFile,
};

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

export const sanitizeRegisteredLiveEvidence: typeof sanitizeLiveEvidence = (
  result,
  capturedAt,
  authority,
) => {
  const verdict = evaluateLiveRedSailRunResult(result);
  if (!verdict.ok) {
    throw new LiveEvidenceCaptureError(
      "live_scenario_contract_failed",
      "The live result did not satisfy the preregistered scenario contract.",
    );
  }
  return sanitizeLiveEvidence(result, capturedAt, authority);
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const assertAbsent = async (
  filePath: string,
  fileSystem: LiveEvidenceFileSystem,
  label: string,
): Promise<void> => {
  try {
    await fileSystem.access(filePath);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  throw new LiveEvidenceCaptureError(
    "live_evidence_already_exists",
    `Refusing to replace existing ${label}.`,
  );
};

const sha256Text = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const publicErrorCode = (value: string): string =>
  /^[a-z0-9_]{1,80}$/.test(value) ? value : "typed_model_failure";

const publicModelId = (value: string | null | undefined): string | null =>
  value && /^gpt-5\.6(?:$|-[A-Za-z0-9._-]+$)/.test(value) ? value : null;

const safeAttemptId = (value: string): string => {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    throw new LiveEvidenceCaptureError(
      "live_attempt_id_invalid",
      "The live evidence attempt ID must be a short filesystem-safe identifier.",
    );
  }
  return value;
};

const atomicWriteOnce = async ({
  targetPath,
  source,
  attemptId,
  fileSystem,
  label,
}: {
  targetPath: string;
  source: string;
  attemptId: string;
  fileSystem: LiveEvidenceFileSystem;
  label: string;
}): Promise<void> => {
  const temporaryPath = `${targetPath}.${attemptId}.tmp`;
  let temporaryCreated = false;
  try {
    await assertAbsent(targetPath, fileSystem, label);
    await fileSystem.writeFile(temporaryPath, source, {
      encoding: "utf8",
      flag: "wx",
    });
    temporaryCreated = true;
    // Hard-link creation is atomic and fails with EEXIST instead of replacing a
    // target that appears after preflight. The temp file is in the same directory.
    try {
      await fileSystem.link(temporaryPath, targetPath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new LiveEvidenceCaptureError(
          "live_evidence_target_conflict",
          `Refusing to replace a concurrent ${label}.`,
        );
      }
      throw error;
    }
  } finally {
    if (temporaryCreated) {
      await fileSystem.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
};

export class LiveEvidenceCaptureError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LiveEvidenceCaptureError";
  }
}

export class LiveEvidenceTypedRunError extends LiveEvidenceCaptureError {
  constructor(
    readonly outcome: Exclude<LiveModelOutcome, "completed">,
    readonly modelErrorCode: string,
  ) {
    super(
      "live_model_typed_failure",
      `Live evidence was not persisted because the model outcome was ${outcome}.`,
    );
    this.name = "LiveEvidenceTypedRunError";
  }
}

export const getLiveEvidenceCapturePaths = (root: string, attemptId: string) => {
  const rawDirectory = path.join(root, "artifacts", "live");
  const publicDirectory = path.join(root, "artifacts", "evidence");
  return {
    rawDirectory,
    publicDirectory,
    attemptDirectory: path.join(rawDirectory, "live-capture-attempts"),
    rawPath: path.join(rawDirectory, "live-run.json"),
    publicPath: path.join(publicDirectory, "live-sanitized.json"),
    lockPath: path.join(rawDirectory, "live-capture.lock.json"),
    attemptRecoveryPath: path.join(
      rawDirectory,
      "live-capture-attempts",
      `${attemptId}.pending.json`,
    ),
    attemptReceiptPath: path.join(
      rawDirectory,
      "live-capture-attempts",
      `${attemptId}.json`,
    ),
  };
};

const captureError = (code: string, message: string): LiveEvidenceCaptureError =>
  new LiveEvidenceCaptureError(code, message);

const isTargetConflict = (error: unknown): boolean =>
  error instanceof LiveEvidenceCaptureError &&
  error.code === "live_evidence_target_conflict";

export const captureLiveEvidence = async ({
  root,
  env,
  request,
  worldPackId,
  worldPackSha256,
  run,
  attemptId: attemptIdInput = randomUUID(),
  now = () => new Date().toISOString(),
  fileSystem = nodeFileSystem,
  sanitize = sanitizeLiveEvidence,
}: CaptureLiveEvidenceOptions): Promise<CaptureLiveEvidenceResult> => {
  const attemptId = safeAttemptId(attemptIdInput);
  const config = loadGpt56Config(env);
  const paths = getLiveEvidenceCapturePaths(root, attemptId);
  const requestSha256 = sha256Canonical(request);

  // All durable-state and configuration checks happen before the lock and model dispatch.
  await Promise.all([
    assertAbsent(paths.rawPath, fileSystem, "raw live evidence"),
    assertAbsent(paths.publicPath, fileSystem, "sanitized live evidence"),
    assertAbsent(paths.attemptRecoveryPath, fileSystem, "live recovery sentinel"),
    assertAbsent(paths.attemptReceiptPath, fileSystem, "live attempt receipt"),
  ]);
  await Promise.all([
    fileSystem.mkdir(paths.publicDirectory, { recursive: true }),
    fileSystem.mkdir(paths.attemptDirectory, { recursive: true }),
  ]);

  let lockAcquired = false;
  try {
    await fileSystem.writeFile(
      paths.lockPath,
      pretty({
        schemaVersion: 1,
        evidenceType: "live_capture_lock",
        attemptId,
        reservedAt: now(),
      }),
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw captureError(
        "live_capture_in_progress",
        "Another live evidence capture is already active.",
      );
    }
    throw error;
  }
  lockAcquired = true;

  try {
    await atomicWriteOnce({
      targetPath: paths.attemptRecoveryPath,
      source: pretty(
        LiveCaptureRecoverySchema.parse({
          schemaVersion: 1,
          evidenceType: "live_capture_recovery",
          attemptId,
          requestSha256,
          requestedModel: config.model,
          reservedAt: now(),
          state: "dispatch_reserved",
        }),
      ),
      attemptId,
      fileSystem,
      label: "live recovery sentinel",
    });
  } catch {
    try {
      await fileSystem.rm(paths.lockPath, { force: false });
    } catch {
      throw captureError(
        "live_capture_lock_release_failed",
        "The live capture lock could not be released after reservation failed.",
      );
    }
    throw captureError(
      "live_attempt_recovery_write_failed",
      "The live attempt could not reserve a durable pre-dispatch recovery record.",
    );
  }

  let dispatchedAt: string | null = null;
  let finishedAt: string | null = null;
  let result: RunResult | null = null;
  let captureOutcome: LiveCaptureOutcome = "run_threw";
  let errorCode: string | null = "live_run_threw";
  let rawPersisted = false;
  let publicPersisted = false;
  let sanitizedEvidenceSha256: string | null = null;
  let primaryError: unknown = null;
  let receipt: LiveCaptureAttemptReceipt | null = null;
  let receiptError: unknown = null;
  let recoveryError: unknown = null;
  let lockError: unknown = null;

  try {
    dispatchedAt = now();
    try {
      result = await run(request);
      finishedAt = now();
    } catch {
      finishedAt = now();
      captureOutcome = "run_threw";
      errorCode = "live_run_threw";
      primaryError = captureError(
        "live_run_threw",
        "The live evidence run failed before returning a typed model outcome.",
      );
    }

    if (result !== null) {
      const { modelOutcome } = result;
      if (modelOutcome.outcome !== "completed") {
        captureOutcome = "typed_failure";
        errorCode = publicErrorCode(modelOutcome.error.code);
        primaryError = new LiveEvidenceTypedRunError(
          modelOutcome.outcome,
          errorCode,
        );
      } else if (modelOutcome.trace.mode !== "live") {
        captureOutcome = "invalid_live_result";
        errorCode = "fixture_result_rejected";
        primaryError = captureError(
          "fixture_result_rejected",
          "A fixture result cannot be persisted as live evidence.",
        );
      } else {
        let sanitized: ReturnType<typeof sanitizeLiveEvidence> | null = null;
        try {
          sanitized = sanitize(result, finishedAt ?? now(), {
            worldPackId,
            worldPackSha256,
            request,
          });
        } catch {
          captureOutcome = "sanitization_failed";
          errorCode = "live_evidence_sanitization_failed";
          primaryError = captureError(
            "live_evidence_sanitization_failed",
            "The completed live result failed the evidence authority or privacy gate.",
          );
        }

        if (sanitized !== null) {
          sanitizedEvidenceSha256 = sha256Canonical(sanitized);
          try {
            await atomicWriteOnce({
              targetPath: paths.rawPath,
              source: pretty(result),
              attemptId,
              fileSystem,
              label: "raw live evidence",
            });
            rawPersisted = true;
          } catch (error) {
            const targetConflict = isTargetConflict(error);
            captureOutcome = targetConflict ? "raw_target_conflict" : "raw_write_failed";
            errorCode = targetConflict
              ? "raw_live_evidence_target_exists"
              : "raw_live_evidence_write_failed";
            primaryError = captureError(
              errorCode,
              targetConflict
                ? "Concurrent raw live evidence already owns the canonical path."
                : "The completed live result could not be persisted atomically.",
            );
          }

          if (rawPersisted) {
            try {
              await atomicWriteOnce({
                targetPath: paths.publicPath,
                source: pretty(sanitized),
                attemptId,
                fileSystem,
                label: "sanitized live evidence",
              });
              publicPersisted = true;
              captureOutcome = "persisted";
              errorCode = null;
            } catch (error) {
              const targetConflict = isTargetConflict(error);
              captureOutcome = targetConflict
                ? "public_target_conflict"
                : "public_write_failed";
              errorCode = targetConflict
                ? "public_live_evidence_target_exists"
                : "public_live_evidence_write_failed";
              try {
                await fileSystem.rm(paths.rawPath, { force: false });
                rawPersisted = false;
                primaryError = captureError(
                  errorCode,
                  targetConflict
                    ? "Concurrent sanitized evidence already owns the canonical path."
                    : "The sanitized public evidence could not be published atomically.",
                );
              } catch {
                captureOutcome = "canonical_rollback_failed";
                errorCode = "live_evidence_pair_rollback_failed";
                primaryError = captureError(
                  "live_evidence_pair_rollback_failed",
                  "The incomplete canonical evidence pair requires manual recovery.",
                );
              }
            }
          }
        }
      }
    }
  } finally {
    if (dispatchedAt !== null) {
      finishedAt ??= now();
      const trace = result?.modelOutcome.trace;
      const responseId = trace?.responseId ?? null;
      receipt = {
        schemaVersion: 1,
        evidenceType: "live_capture_attempt",
        attemptId,
        requestSha256,
        dispatchedAt,
        finishedAt,
        requestedModel: config.model,
        actualModel: publicModelId(trace?.actualModel),
        modelOutcome: result?.modelOutcome.outcome ?? "not_returned",
        captureOutcome,
        errorCode,
        retryable:
          result && result.modelOutcome.outcome !== "completed"
            ? result.modelOutcome.error.retryable
            : null,
        responseIdSha256: responseId ? sha256Text(responseId) : null,
        sanitizedEvidenceSha256,
        inputTokens: trace?.inputTokens ?? null,
        outputTokens: trace?.outputTokens ?? null,
        rawPersisted,
        publicPersisted,
      };
      try {
        await atomicWriteOnce({
          targetPath: paths.attemptReceiptPath,
          source: pretty(receipt),
          attemptId,
          fileSystem,
          label: "live attempt receipt",
        });
      } catch (error) {
        receiptError = error;
      }
    }
    if (receiptError === null && dispatchedAt !== null) {
      try {
        await fileSystem.rm(paths.attemptRecoveryPath, { force: false });
      } catch (error) {
        recoveryError = error;
      }
    }
    if (lockAcquired && receiptError === null && recoveryError === null) {
      try {
        await fileSystem.rm(paths.lockPath, { force: false });
      } catch (error) {
        lockError = error;
      }
    }
  }

  if (receiptError !== null) {
    throw captureError(
      "live_attempt_receipt_write_failed",
      "The dispatched live attempt could not be recorded safely.",
    );
  }
  if (recoveryError !== null) {
    throw captureError(
      "live_attempt_recovery_release_failed",
      "The completed attempt receipt exists, but its recovery sentinel requires manual cleanup.",
    );
  }
  if (lockError !== null) {
    throw captureError(
      "live_capture_lock_release_failed",
      "The live capture lock could not be released.",
    );
  }
  if (primaryError !== null) throw primaryError;
  if (receipt === null || !rawPersisted || !publicPersisted) {
    throw captureError(
      "live_capture_incomplete",
      "The live capture did not reach its complete persisted state.",
    );
  }

  return {
    rawPath: paths.rawPath,
    publicPath: paths.publicPath,
    attemptReceiptPath: paths.attemptReceiptPath,
    receipt,
  };
};

export const captureRegisteredLiveEvidence = async (
  options: Omit<CaptureLiveEvidenceOptions, "attemptId" | "sanitize"> & {
    mode?: RegisteredLiveCaptureMode;
  },
): Promise<CaptureLiveEvidenceResult> => {
  const { mode = "primary", ...captureOptions } = options;
  if (
    sha256Canonical(captureOptions.request) !== LIVE_RED_SAIL_REQUEST_SHA256 ||
    captureOptions.worldPackId !== LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.id ||
    captureOptions.worldPackSha256 !== LIVE_RED_SAIL_WORLD_PACK_SHA256
  ) {
    throw new LiveEvidenceCaptureError(
      "live_registered_authority_mismatch",
      "The paid capture does not match the preregistered live authority.",
    );
  }
  return captureLiveEvidence({
    ...captureOptions,
    attemptId:
      mode === "primary"
        ? LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID
        : LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
    sanitize: sanitizeRegisteredLiveEvidence,
  });
};

export class LiveCaptureCliError extends Error {
  constructor(readonly code: "arguments_invalid") {
    super(code);
    this.name = "LiveCaptureCliError";
  }
}

export const parseLiveCaptureArgs = (
  args: readonly string[],
): RegisteredLiveCaptureMode => {
  if (args.length === 0) return "primary";
  if (args.length === 1 && args[0] === "--retry") return "retry";
  throw new LiveCaptureCliError("arguments_invalid");
};

const registeredAttemptIdFor = (mode: RegisteredLiveCaptureMode) =>
  mode === "primary"
    ? LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID
    : LIVE_RED_SAIL_RETRY_ATTEMPT_ID;

type RegisteredLiveExecutionInput = {
  root: string;
  env: Environment;
  mode: RegisteredLiveCaptureMode;
};

type RegisteredLivePreflight = (
  input: RegisteredLiveExecutionInput,
) => Promise<unknown>;

type RegisteredLiveDispatch = (
  input: RegisteredLiveExecutionInput,
) => Promise<void>;

const dispatchRegisteredLiveCapture: RegisteredLiveDispatch = async ({
  root,
  env,
  mode,
}) => {
  const [worldPack, overlay, snapshot] = await Promise.all([
    loadDemoWorldPack(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
  ]);
  const liveModel = createOpenAiNarrativeModel({
    env,
    styleProfiles: worldPack.styleProfiles,
  });
  const run = createRunOrchestrator({
    worldPack,
    fixtureModel: fixtureNarrativeModel,
    liveModel,
  });
  const request = buildLiveEvidenceRunRequest({
    overlay,
    snapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
  });
  await captureRegisteredLiveEvidence({
    root,
    env,
    request,
    worldPackId: worldPack.meta.id,
    worldPackSha256: sha256Canonical(worldPack),
    run,
    mode,
  });
};

export const executeRegisteredLiveCapture = async ({
  root,
  env,
  mode,
  preflight,
  dispatch = dispatchRegisteredLiveCapture,
}: RegisteredLiveExecutionInput & {
  preflight?: RegisteredLivePreflight;
  dispatch?: RegisteredLiveDispatch;
}): Promise<void> => {
  const preflightLive =
    preflight ??
    (async (input: RegisteredLiveExecutionInput) => {
      const { preflightLiveEvidence } = await import(
        "@/src/evidence/live-preflight"
      );
      await preflightLiveEvidence(input);
    });
  await preflightLive({ root, env, mode });
  await dispatch({ root, env, mode });
};

const PUBLIC_LIVE_CAPTURE_FAILURE_CODES = new Set([
  "arguments_invalid",
  "configuration_invalid",
  "approval_missing",
  "approval_invalid",
  "retry_approval_missing",
  "retry_approval_invalid",
  "retry_receipt_missing",
  "retry_receipt_invalid",
  "repository_root_invalid",
  "registered_input_invalid",
  "registered_hash_mismatch",
  "authority_mismatch",
  "capture_path_unsafe",
  "private_path_not_ignored",
  "public_path_ignored",
  "capture_target_exists",
  "live_attempt_id_invalid",
  "live_evidence_already_exists",
  "live_capture_in_progress",
  "live_capture_lock_release_failed",
  "live_attempt_recovery_write_failed",
  "live_run_threw",
  "live_model_typed_failure",
  "fixture_result_rejected",
  "live_evidence_sanitization_failed",
  "raw_live_evidence_target_exists",
  "raw_live_evidence_write_failed",
  "public_live_evidence_target_exists",
  "public_live_evidence_write_failed",
  "live_evidence_pair_rollback_failed",
  "live_attempt_receipt_write_failed",
  "live_attempt_recovery_release_failed",
  "live_capture_incomplete",
  "live_registered_authority_mismatch",
]);

const stableFailureCode = (error: unknown): string => {
  let candidate: string | null = null;
  if (error instanceof LiveEvidenceCaptureError || error instanceof LiveCaptureCliError) {
    candidate = error.code;
  }
  if (
    candidate === null &&
    error instanceof Error &&
    error.name === "LivePreflightError" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    candidate = error.code;
  }
  return candidate !== null && PUBLIC_LIVE_CAPTURE_FAILURE_CODES.has(candidate)
    ? candidate
    : "unexpected_failure";
};

export const runLiveCaptureCli = async ({
  args = [],
  root = process.cwd(),
  env = process.env,
  execute = executeRegisteredLiveCapture,
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  args?: readonly string[];
  root?: string;
  env?: Environment;
  execute?: typeof executeRegisteredLiveCapture;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
} = {}): Promise<number> => {
  try {
    const mode = parseLiveCaptureArgs(args);
    await execute({ root, env, mode });
    stdout.write(
      `${JSON.stringify({ schemaVersion: 1, evidenceType: "live_capture", captured: true, mode, attemptId: registeredAttemptIdFor(mode) })}\n`,
    );
    return 0;
  } catch (error) {
    stderr.write(
      `${JSON.stringify({ schemaVersion: 1, evidenceType: "live_capture", captured: false, code: stableFailureCode(error) })}\n`,
    );
    return 1;
  }
};

export const isDirectExecution = (
  moduleUrl: string,
  entryPath: string | undefined = process.argv[1],
): boolean =>
  entryPath !== undefined &&
  path.resolve(entryPath) === path.resolve(fileURLToPath(moduleUrl));

if (isDirectExecution(import.meta.url)) {
  void runLiveCaptureCli({ args: process.argv.slice(2) }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

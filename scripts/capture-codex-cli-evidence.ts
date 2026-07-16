import { createHash } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCodexCliCaptureAttempt,
  parseCodexCliCaptureModeArgs,
  type CodexCliCaptureAttemptId,
  type CodexCliCaptureMode,
} from "@/src/adapters/codex-cli/attempt";
import type {
  CodexCliApprovalAuthority,
  CodexCliTrace,
} from "@/src/adapters/codex-cli/contracts";
import {
  CodexCliCaptureReceiptSchema,
  CodexCliDispatchReservationSchema,
  CodexCliRawCaptureSchema,
  type CodexCliCaptureReceipt,
} from "@/src/adapters/codex-cli/capture-contracts";
import type { CodexCliProcessDiagnostics } from "@/src/adapters/codex-cli/process-diagnostics";
import {
  createCodexCliNarrativeModel,
  type CodexCliNarrativeModelOptions,
} from "@/src/adapters/codex-cli/narrative-model";
import {
  getCodexCliCapturePaths,
  preflightCodexCliEvidence,
  type CodexCliInspector,
  type CodexCliPreflightLoaders,
} from "@/src/adapters/codex-cli/preflight";
import {
  buildCodexCliSanitizedEvidence,
} from "@/src/adapters/codex-cli/red-sail-evidence";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import { LIVE_RED_SAIL_SCENARIO_CONTRACT } from "@/src/evidence/live-scenario-contract";
import {
  CodexCliCommandResolutionError,
  resolveCodexCliCommand,
} from "@/src/adapters/codex-cli/command";

export class CodexCliCaptureError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CodexCliCaptureError";
  }
}

export type CaptureCodexCliEvidenceOptions = {
  root: string;
  command?: string;
  env?: NodeJS.ProcessEnv;
  inspector?: CodexCliInspector;
  loaders?: CodexCliPreflightLoaders;
  processRunner?: CodexCliNarrativeModelOptions["processRunner"];
  now?: () => string;
  mode?: CodexCliCaptureMode;
};

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

const atomicWriteOnce = async (
  targetPath: string,
  source: string,
  label: string,
  attemptId: CodexCliCaptureAttemptId,
): Promise<void> => {
  const temporaryPath = `${targetPath}.${attemptId}.tmp`;
  let temporaryCreated = false;
  try {
    await writeFile(temporaryPath, source, { encoding: "utf8", flag: "wx" });
    temporaryCreated = true;
    await link(temporaryPath, targetPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new CodexCliCaptureError(`${label}_target_exists`);
    }
    throw new CodexCliCaptureError(`${label}_write_failed`);
  } finally {
    if (temporaryCreated) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
};

const failedReceipt = ({
  cliVersion,
  dispatchedAt,
  finishedAt,
  failureCode,
  retryable,
  authority,
  approvalAuthoritySha256,
  trace = null,
  processDiagnostics,
  attemptId,
}: {
  cliVersion: string;
  dispatchedAt: string;
  finishedAt: string;
  failureCode: string;
  retryable: boolean;
  authority: CodexCliApprovalAuthority;
  approvalAuthoritySha256: string;
  trace?: CodexCliTrace | null;
  processDiagnostics?: CodexCliProcessDiagnostics;
  attemptId: CodexCliCaptureAttemptId;
}): CodexCliCaptureReceipt =>
  CodexCliCaptureReceiptSchema.parse({
    schemaVersion: 1,
    evidenceType: "codex_cli_capture_attempt",
    attemptId,
    scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
    transport: "codex_cli",
    requestSha256: authority.requestSha256,
    worldPackSha256: authority.worldPackSha256,
    modelInputSha256: authority.modelInputSha256,
    promptSha256: authority.promptSha256,
    outputSchemaSha256: authority.outputSchemaSha256,
    executionContractSha256: authority.executionContractSha256,
    approvalAuthoritySha256,
    requestedModel: "gpt-5.6-sol",
    actualModel: null,
    responseId: null,
    actualModelObserved: false,
    responseIdObserved: false,
    cliVersion,
    dispatchedAt,
    finishedAt,
    outcome: "typed_failure",
    failureCode,
    retryable,
    usage: trace?.usage ?? null,
    threadIdSha256: trace
      ? createHash("sha256").update(trace.threadId).digest("hex")
      : null,
    jsonlSha256: trace?.jsonlSha256 ?? null,
    finalMessageSha256: trace?.finalMessageSha256 ?? null,
    sanitizedEvidenceSha256: null,
    rawPersisted: false,
    publicPersisted: false,
    ...(attemptId === getCodexCliCaptureAttempt("retry").attemptId
      ? { processDiagnostics: processDiagnostics ?? null }
      : processDiagnostics
        ? { processDiagnostics }
        : {}),
  });

export const captureCodexCliEvidence = async ({
  root,
  command = "codex",
  env = process.env,
  inspector,
  loaders,
  processRunner,
  now = () => new Date().toISOString(),
  mode = "primary",
}: CaptureCodexCliEvidenceOptions): Promise<CodexCliCaptureReceipt> => {
  const attempt = getCodexCliCaptureAttempt(mode);
  const { report, bundle, approval } = await preflightCodexCliEvidence({
    root,
    command,
    inspector,
    loaders,
    mode,
    env,
  });
  const realRoot = await realpath(root);
  const paths = getCodexCliCapturePaths(realRoot, mode);
  await Promise.all([
    mkdir(path.dirname(paths.rawPath), { recursive: true }),
    mkdir(path.dirname(paths.publicPath), { recursive: true }),
  ]);
  for (const directory of [
    path.dirname(paths.rawPath),
    path.dirname(paths.publicPath),
  ]) {
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(directory)) !== directory ||
      !directory.startsWith(`${realRoot}${path.sep}`)
    ) {
      throw new CodexCliCaptureError("capture_path_unsafe");
    }
  }

  const reservedAt = now();
  try {
    await writeFile(
      paths.lockPath,
      pretty({
        schemaVersion: 1,
        evidenceType: "codex_cli_capture_lock",
        attemptId: attempt.attemptId,
        transport: "codex_cli",
        reservedAt,
      }),
      { encoding: "utf8", flag: "wx" },
    );
  } catch {
    throw new CodexCliCaptureError("capture_in_progress");
  }

  let reservationWritten = false;
  let dispatchStarted = false;
  let terminalReceiptPersisted = false;
  try {
    await atomicWriteOnce(
      paths.reservationPath,
      pretty(
        CodexCliDispatchReservationSchema.parse({
          schemaVersion: 1,
          evidenceType: "codex_cli_dispatch_reservation",
          attemptId: attempt.attemptId,
          scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
          transport: "codex_cli",
          requestSha256: bundle.authority.requestSha256,
          worldPackSha256: bundle.authority.worldPackSha256,
          modelInputSha256: bundle.authority.modelInputSha256,
          promptSha256: bundle.authority.promptSha256,
          outputSchemaSha256: bundle.authority.outputSchemaSha256,
          executionContractSha256:
            bundle.authority.executionContractSha256,
          approvalAuthoritySha256: bundle.approvalAuthoritySha256,
          requestedModel: "gpt-5.6-sol",
          reservedAt,
        }),
      ),
      "dispatch_reservation",
      attempt.attemptId,
    );
    reservationWritten = true;

    const model = createCodexCliNarrativeModel({
      styleProfiles: bundle.worldPack.styleProfiles,
      cliVersion: report.cliVersion,
      dispatchApproval: approval,
      outputSchema: bundle.outputSchema,
      command,
      env,
      processRunner,
    });
    const dispatchedAt = now();
    dispatchStarted = true;
    const generation = await model.generate(bundle.request, bundle.evidence);
    const finishedAt = now();

    if (generation.outcome.outcome !== "completed") {
      const receipt = failedReceipt({
        cliVersion: report.cliVersion,
        dispatchedAt,
        finishedAt,
        failureCode: generation.outcome.failure.code,
        retryable: generation.outcome.failure.retryable,
        authority: bundle.authority,
        approvalAuthoritySha256: bundle.approvalAuthoritySha256,
        processDiagnostics: generation.processDiagnostics,
        attemptId: attempt.attemptId,
      });
      await atomicWriteOnce(
        paths.receiptPath,
        pretty(receipt),
        "capture_receipt",
        attempt.attemptId,
      );
      terminalReceiptPersisted = true;
      throw new CodexCliCaptureError(generation.outcome.failure.code);
    }
    if (!generation.privateCapture) {
      const receipt = failedReceipt({
        cliVersion: report.cliVersion,
        dispatchedAt,
        finishedAt,
        failureCode: "codex_cli_private_capture_missing",
        retryable: false,
        authority: bundle.authority,
        approvalAuthoritySha256: bundle.approvalAuthoritySha256,
        attemptId: attempt.attemptId,
      });
      await atomicWriteOnce(
        paths.receiptPath,
        pretty(receipt),
        "capture_receipt",
        attempt.attemptId,
      );
      terminalReceiptPersisted = true;
      throw new CodexCliCaptureError("codex_cli_private_capture_missing");
    }

    let sanitized: ReturnType<typeof buildCodexCliSanitizedEvidence>;
    let raw: ReturnType<typeof CodexCliRawCaptureSchema.parse>;
    try {
      sanitized = buildCodexCliSanitizedEvidence({
        capturedAt: finishedAt,
        request: bundle.request,
        worldPackSha256: bundle.authority.worldPackSha256,
        styleProfile: bundle.styleProfile,
        outcome: generation.outcome,
      });
      raw = CodexCliRawCaptureSchema.parse({
        schemaVersion: 1,
        evidenceType: "codex_cli_raw_capture",
        scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
        capturedAt: finishedAt,
        transport: "codex_cli",
        request: bundle.request,
        outcome: generation.outcome,
        privateCapture: generation.privateCapture,
      });
    } catch {
      const receipt = failedReceipt({
        cliVersion: report.cliVersion,
        dispatchedAt,
        finishedAt,
        failureCode: "codex_cli_semantic_validation_failed",
        retryable: false,
        authority: bundle.authority,
        approvalAuthoritySha256: bundle.approvalAuthoritySha256,
        trace: generation.outcome.trace,
        processDiagnostics: generation.processDiagnostics,
        attemptId: attempt.attemptId,
      });
      await atomicWriteOnce(
        paths.receiptPath,
        pretty(receipt),
        "capture_receipt",
        attempt.attemptId,
      );
      terminalReceiptPersisted = true;
      throw new CodexCliCaptureError("codex_cli_semantic_validation_failed");
    }

    let rawPersisted = false;
    let publicPersisted = false;
    try {
      await atomicWriteOnce(
        paths.rawPath,
        pretty(raw),
        "raw_capture",
        attempt.attemptId,
      );
      rawPersisted = true;
      await atomicWriteOnce(
        paths.publicPath,
        pretty(sanitized),
        "public_evidence",
        attempt.attemptId,
      );
      publicPersisted = true;
    } catch (error) {
      const code = error instanceof CodexCliCaptureError
        ? error.code
        : "capture_persistence_failed";
      const receipt = CodexCliCaptureReceiptSchema.parse({
        ...failedReceipt({
          cliVersion: report.cliVersion,
          dispatchedAt,
          finishedAt,
          failureCode: code,
          retryable: false,
          authority: bundle.authority,
          approvalAuthoritySha256: bundle.approvalAuthoritySha256,
          trace: generation.outcome.trace,
          processDiagnostics: generation.processDiagnostics,
          attemptId: attempt.attemptId,
        }),
        outcome: "persistence_failure",
        usage: generation.outcome.trace.usage,
        threadIdSha256: createHash("sha256")
          .update(generation.outcome.trace.threadId)
          .digest("hex"),
        jsonlSha256: generation.outcome.trace.jsonlSha256,
        finalMessageSha256: generation.outcome.trace.finalMessageSha256,
        sanitizedEvidenceSha256: sha256Canonical(sanitized),
        rawPersisted,
        publicPersisted,
        ...(attempt.attemptId === getCodexCliCaptureAttempt("retry").attemptId
          ? { processDiagnostics: generation.processDiagnostics ?? null }
          : generation.processDiagnostics
            ? { processDiagnostics: generation.processDiagnostics }
            : {}),
      });
      await atomicWriteOnce(
        paths.receiptPath,
        pretty(receipt),
        "capture_receipt",
        attempt.attemptId,
      );
      terminalReceiptPersisted = true;
      throw new CodexCliCaptureError(code);
    }

    const receipt = CodexCliCaptureReceiptSchema.parse({
      schemaVersion: 1,
      evidenceType: "codex_cli_capture_attempt",
      attemptId: attempt.attemptId,
      scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
      transport: "codex_cli",
      requestSha256: bundle.authority.requestSha256,
      worldPackSha256: bundle.authority.worldPackSha256,
      modelInputSha256: bundle.authority.modelInputSha256,
      promptSha256: bundle.authority.promptSha256,
      outputSchemaSha256: bundle.authority.outputSchemaSha256,
      executionContractSha256: bundle.authority.executionContractSha256,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
      requestedModel: generation.outcome.trace.requestedModel,
      actualModel: null,
      responseId: null,
      actualModelObserved: false,
      responseIdObserved: false,
      cliVersion: generation.outcome.trace.cliVersion,
      dispatchedAt,
      finishedAt,
      outcome: "persisted",
      failureCode: null,
      retryable: null,
      usage: generation.outcome.trace.usage,
      threadIdSha256: createHash("sha256")
        .update(generation.outcome.trace.threadId)
        .digest("hex"),
      jsonlSha256: generation.outcome.trace.jsonlSha256,
      finalMessageSha256: generation.outcome.trace.finalMessageSha256,
      sanitizedEvidenceSha256: sha256Canonical(sanitized),
      rawPersisted: true,
      publicPersisted: true,
      ...(attempt.attemptId === getCodexCliCaptureAttempt("retry").attemptId
        ? { processDiagnostics: generation.processDiagnostics ?? null }
        : generation.processDiagnostics
          ? { processDiagnostics: generation.processDiagnostics }
          : {}),
    });
    await atomicWriteOnce(
      paths.receiptPath,
      pretty(receipt),
      "capture_receipt",
      attempt.attemptId,
    );
    terminalReceiptPersisted = true;
    return receipt;
  } finally {
    if (reservationWritten && (!dispatchStarted || terminalReceiptPersisted)) {
      await rm(paths.reservationPath, { force: true }).catch(() => undefined);
    }
    if (!dispatchStarted || terminalReceiptPersisted) {
      await rm(paths.lockPath, { force: true }).catch(() => undefined);
    }
  }
};

export const runCodexCliCaptureCli = async ({
  args = process.argv.slice(2),
  root = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  args?: readonly string[];
  root?: string;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
} = {}): Promise<number> => {
  try {
    const mode = parseCodexCliCaptureModeArgs(args);
    const command = await resolveCodexCliCommand();
    const receipt = await captureCodexCliEvidence({ root, mode, command });
    stdout.write(
      `${JSON.stringify({ evidenceType: receipt.evidenceType, outcome: receipt.outcome, requestSha256: receipt.requestSha256 })}\n`,
    );
    return 0;
  } catch (error) {
    const code = error instanceof CodexCliCaptureError
      ? error.code
      : error instanceof CodexCliCommandResolutionError
        ? error.code
      : "unexpected_failure";
    stderr.write(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_attempt", outcome: "failed", code })}\n`,
    );
    return 1;
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void runCodexCliCaptureCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

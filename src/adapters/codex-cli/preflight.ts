import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import {
  CodexCliCaptureApprovalSchema,
  type CodexCliCaptureApproval,
} from "@/src/adapters/codex-cli/approval";
import {
  CODEX_CLI_CAPTURE_ATTEMPTS,
  getCodexCliCaptureAttempt,
  type CodexCliCaptureAttemptId,
  type CodexCliCaptureMode,
} from "@/src/adapters/codex-cli/attempt";
import {
  buildCodexCliAuthorityBundle,
  isCodexCliReviewPacketBound,
  type CodexCliAuthorityBundle,
} from "@/src/adapters/codex-cli/authority";
import {
  CODEX_CLI_REQUESTED_MODEL,
  CodexCliReviewPacketSchema,
} from "@/src/adapters/codex-cli/contracts";
import { CodexCliCaptureReceiptSchema } from "@/src/adapters/codex-cli/capture-contracts";
import { buildCodexCliEnvironment } from "@/src/adapters/codex-cli/execution-contract";
import { CODEX_CLI_MIN_GPT56_VERSION } from "@/src/adapters/codex-cli/command";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import type { RunRequest } from "@/src/contracts/run";
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { WorldPackSchema, type WorldPack } from "@/src/domain/schemas";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  LIVE_RED_SAIL_WORLD_PACK_SHA256,
} from "@/src/evidence/live-scenario-contract";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

export const CODEX_CLI_RAW_CAPTURE_LOCATOR =
  CODEX_CLI_CAPTURE_ATTEMPTS.primary.rawLocator;
export const CODEX_CLI_PUBLIC_EVIDENCE_LOCATOR =
  CODEX_CLI_CAPTURE_ATTEMPTS.primary.publicLocator;
export const CODEX_CLI_CAPTURE_LOCK_LOCATOR =
  CODEX_CLI_CAPTURE_ATTEMPTS.primary.lockLocator;
export const CODEX_CLI_DISPATCH_RESERVATION_LOCATOR =
  CODEX_CLI_CAPTURE_ATTEMPTS.primary.reservationLocator;
export const CODEX_CLI_CAPTURE_RECEIPT_LOCATOR =
  CODEX_CLI_CAPTURE_ATTEMPTS.primary.receiptLocator;

export const getCodexCliCapturePaths = (
  root: string,
  mode: CodexCliCaptureMode = "primary",
) => {
  const attempt = getCodexCliCaptureAttempt(mode);
  return {
    approvalPath: path.resolve(root, attempt.approvalLocator),
    reviewPath: path.resolve(root, attempt.reviewLocator),
    rawPath: path.resolve(root, attempt.rawLocator),
    publicPath: path.resolve(root, attempt.publicLocator),
    lockPath: path.resolve(root, attempt.lockLocator),
    reservationPath: path.resolve(root, attempt.reservationLocator),
    receiptPath: path.resolve(root, attempt.receiptLocator),
  };
};

const REQUIRED_EXEC_HELP_FLAGS = [
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--sandbox",
  "--model",
  "--output-schema",
  "--output-last-message",
  "--json",
] as const;

export type CodexCliPreflightFailureCode =
  | "repository_root_invalid"
  | "approval_missing"
  | "approval_invalid"
  | "approval_authority_mismatch"
  | "approval_not_private"
  | "review_missing"
  | "review_invalid"
  | "review_not_private"
  | "registered_input_invalid"
  | "registered_hash_mismatch"
  | "previous_receipt_missing"
  | "previous_receipt_invalid"
  | "capture_path_unsafe"
  | "capture_target_exists"
  | "raw_path_not_ignored"
  | "public_path_ignored"
  | "codex_cli_unavailable"
  | "codex_cli_version_invalid"
  | "codex_cli_version_unsupported"
  | "codex_cli_flags_missing"
  | "codex_cli_auth_missing";

export class CodexCliPreflightError extends Error {
  constructor(readonly code: CodexCliPreflightFailureCode) {
    super(code);
    this.name = "CodexCliPreflightError";
  }
}

export type CodexCliInspection = {
  versionStatus: number | null;
  versionStdout: string;
  execHelpStatus: number | null;
  execHelpStdout: string;
  authStatus: number | null;
  authStdout: string;
  authStderr: string;
};

export type CodexCliInspector = (
  command: string,
  env: NodeJS.ProcessEnv,
) => CodexCliInspection;

export type CodexCliPreflightLoaders = {
  loadWorldPack: () => Promise<unknown>;
  loadOverlay: (id: string) => Promise<unknown>;
  loadSnapshot: (id: string) => Promise<unknown>;
};

export type RegisteredCodexCliInput = {
  worldPack: WorldPack;
  request: LiveRunRequest;
};

export type CodexCliPreflightReport = {
  schemaVersion: 1;
  evidenceType: "codex_cli_capture_preflight";
  ready: true;
  attemptId: CodexCliCaptureAttemptId;
  transport: "codex_cli";
  requestedModel: typeof CODEX_CLI_REQUESTED_MODEL;
  actualModelWillBeReportedAs: null;
  responseIdWillBeReportedAs: null;
  cliVersion: string;
  auth: "chatgpt";
  requestSha256: typeof LIVE_RED_SAIL_REQUEST_SHA256;
  worldPackSha256: typeof LIVE_RED_SAIL_WORLD_PACK_SHA256;
  outputSchemaSha256: string;
  modelInputSha256: string;
  promptSha256: string;
  executionContractSha256: string;
  approvalAuthoritySha256: string;
  requiredFlags: readonly string[];
};

const defaultLoaders: CodexCliPreflightLoaders = {
  loadWorldPack: loadDemoWorldPack,
  loadOverlay: loadOverlayFixture,
  loadSnapshot: loadSnapshotFixture,
};

const fail = (code: CodexCliPreflightFailureCode): never => {
  throw new CodexCliPreflightError(code);
};

export const inspectCodexCli: CodexCliInspector = (command, env) => {
  const run = (args: string[]) =>
    spawnSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
  const version = run(["--version"]);
  const execHelp = run(["exec", "--help"]);
  const auth = run(["login", "status"]);
  return {
    versionStatus: version.status,
    versionStdout: typeof version.stdout === "string" ? version.stdout : "",
    execHelpStatus: execHelp.status,
    execHelpStdout: typeof execHelp.stdout === "string" ? execHelp.stdout : "",
    authStatus: auth.status,
    authStdout: typeof auth.stdout === "string" ? auth.stdout : "",
    authStderr: typeof auth.stderr === "string" ? auth.stderr : "",
  };
};

const gitStatus = (root: string, args: string[]): number | null =>
  spawnSync("git", ["-C", root, ...args], {
    stdio: "ignore",
  }).status;

const assertSafeAncestors = (root: string, candidate: string): void => {
  const relative = path.relative(root, candidate);
  if (
    relative.length === 0 ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail("capture_path_unsafe");
  }
  let cursor = root;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    cursor = path.join(cursor, segment);
    try {
      const stat = lstatSync(cursor);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        fail("capture_path_unsafe");
      }
    } catch (error) {
      if (error instanceof CodexCliPreflightError) throw error;
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      fail("capture_path_unsafe");
    }
  }
};

const assertExactRepositoryRoot = (root: string): string => {
  try {
    const realRoot = realpathSync(root);
    const stat = lstatSync(root);
    const result = spawnSync(
      "git",
      ["-C", realRoot, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      result.status !== 0 ||
      typeof result.stdout !== "string" ||
      realpathSync(result.stdout.trim()) !== realRoot
    ) {
      return fail("repository_root_invalid");
    }
    return realRoot;
  } catch {
    return fail("repository_root_invalid");
  }
};

const assertIgnoredPrivateFile = ({
  root,
  locator,
  failureCode,
}: {
  root: string;
  locator: string;
  failureCode: "approval_not_private" | "review_not_private";
}): void => {
  if (
    gitStatus(root, ["check-ignore", "-q", "--", locator]) !== 0 ||
    gitStatus(root, ["ls-files", "--error-unmatch", "--", locator]) === 0
  ) {
    fail(failureCode);
  }
};

export const loadCodexCliPreviousReceiptBinding = ({
  root,
  mode,
  input,
}: {
  root: string;
  mode: CodexCliCaptureMode;
  input: RegisteredCodexCliInput;
}): string | undefined => {
  if (mode === "primary") return undefined;
  const attempt = getCodexCliCaptureAttempt(mode);
  if (!attempt.previousReceiptLocator) return fail("previous_receipt_invalid");
  const previousPath = path.resolve(root, attempt.previousReceiptLocator);
  assertSafeAncestors(root, previousPath);
  try {
    const stat = lstatSync(previousPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return fail("previous_receipt_invalid");
    }
    if (gitStatus(root, ["check-ignore", "-q", "--", attempt.previousReceiptLocator]) !== 0) {
      return fail("previous_receipt_invalid");
    }
    const source = readFileSync(previousPath, "utf8");
    const receipt = CodexCliCaptureReceiptSchema.parse(
      JSON.parse(source) as unknown,
    );
    const primaryBundle = buildCodexCliAuthorityBundle({
      ...input,
      // The consumed primary authority recorded the PATH command literally.
      // Retry may use a newer explicit binary without rewriting that history.
      command: "codex",
      mode: "primary",
    });
    if (
      receipt.attemptId !== CODEX_CLI_CAPTURE_ATTEMPTS.primary.attemptId ||
      receipt.outcome !== "typed_failure" ||
      receipt.failureCode !== "codex_cli_process_failed" ||
      receipt.retryable !== false ||
      receipt.rawPersisted ||
      receipt.publicPersisted ||
      receipt.actualModel !== null ||
      receipt.responseId !== null ||
      receipt.usage !== null ||
      receipt.threadIdSha256 !== null ||
      receipt.jsonlSha256 !== null ||
      receipt.finalMessageSha256 !== null ||
      receipt.sanitizedEvidenceSha256 !== null ||
      receipt.processDiagnostics !== undefined ||
      receipt.requestSha256 !== primaryBundle.authority.requestSha256 ||
      receipt.worldPackSha256 !== primaryBundle.authority.worldPackSha256 ||
      receipt.modelInputSha256 !== primaryBundle.authority.modelInputSha256 ||
      receipt.promptSha256 !== primaryBundle.authority.promptSha256 ||
      receipt.outputSchemaSha256 !== primaryBundle.authority.outputSchemaSha256 ||
      receipt.executionContractSha256 !==
        primaryBundle.authority.executionContractSha256 ||
      receipt.approvalAuthoritySha256 !==
        primaryBundle.approvalAuthoritySha256
    ) {
      return fail("previous_receipt_invalid");
    }
    for (const locator of [
      CODEX_CLI_CAPTURE_ATTEMPTS.primary.rawLocator,
      CODEX_CLI_CAPTURE_ATTEMPTS.primary.publicLocator,
      CODEX_CLI_CAPTURE_ATTEMPTS.primary.lockLocator,
      CODEX_CLI_CAPTURE_ATTEMPTS.primary.reservationLocator,
    ]) {
      try {
        lstatSync(path.resolve(root, locator));
        return fail("previous_receipt_invalid");
      } catch (error) {
        if (error instanceof CodexCliPreflightError) throw error;
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          return fail("previous_receipt_invalid");
        }
      }
    }
    return createHash("sha256").update(source).digest("hex");
  } catch (error) {
    if (error instanceof CodexCliPreflightError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return fail("previous_receipt_missing");
    }
    return fail("previous_receipt_invalid");
  }
};

const assertApproval = (
  root: string,
  bundle: CodexCliAuthorityBundle,
  mode: CodexCliCaptureMode,
): CodexCliCaptureApproval => {
  const attempt = getCodexCliCaptureAttempt(mode);
  const approvalPath = path.resolve(root, attempt.approvalLocator);
  assertSafeAncestors(root, approvalPath);
  let approval: CodexCliCaptureApproval;
  try {
    const stat = lstatSync(approvalPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return fail("approval_invalid");
    approval = CodexCliCaptureApprovalSchema.parse(
      JSON.parse(readFileSync(approvalPath, "utf8")) as unknown,
    );
  } catch (error) {
    if (error instanceof CodexCliPreflightError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return fail("approval_missing");
    }
    return fail("approval_invalid");
  }
  assertIgnoredPrivateFile({
    root,
    locator: attempt.approvalLocator,
    failureCode: "approval_not_private",
  });
  if (
    approval.approvalAuthoritySha256 !== bundle.approvalAuthoritySha256 ||
    sha256Canonical(approval.authority) !== bundle.approvalAuthoritySha256 ||
    sha256Canonical(approval.authority) !==
      sha256Canonical(bundle.authority)
  ) {
    fail("approval_authority_mismatch");
  }

  const reviewPath = path.resolve(root, attempt.reviewLocator);
  assertSafeAncestors(root, reviewPath);
  try {
    const stat = lstatSync(reviewPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return fail("review_invalid");
    const packet = CodexCliReviewPacketSchema.parse(
      JSON.parse(readFileSync(reviewPath, "utf8")) as unknown,
    );
    if (!isCodexCliReviewPacketBound({ packet, bundle })) {
      return fail("review_invalid");
    }
  } catch (error) {
    if (error instanceof CodexCliPreflightError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return fail("review_missing");
    }
    return fail("review_invalid");
  }
  assertIgnoredPrivateFile({
    root,
    locator: attempt.reviewLocator,
    failureCode: "review_not_private",
  });
  return approval;
};

const assertCapturePaths = (root: string, mode: CodexCliCaptureMode): void => {
  const attempt = getCodexCliCaptureAttempt(mode);
  for (const locator of [
    attempt.rawLocator,
    attempt.publicLocator,
    attempt.lockLocator,
    attempt.reservationLocator,
    attempt.receiptLocator,
  ]) {
    const absolute = path.resolve(root, locator);
    if (!absolute.startsWith(`${root}${path.sep}`)) fail("capture_path_unsafe");
    assertSafeAncestors(root, absolute);
    try {
      lstatSync(absolute);
      fail("capture_target_exists");
    } catch (error) {
      if (error instanceof CodexCliPreflightError) throw error;
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        fail("capture_path_unsafe");
      }
    }
  }
  if ([
    attempt.rawLocator,
    attempt.lockLocator,
    attempt.reservationLocator,
    attempt.receiptLocator,
  ].some((locator) =>
    gitStatus(root, ["check-ignore", "-q", "--", locator]) !== 0,
  )) {
    fail("raw_path_not_ignored");
  }
  if (
    gitStatus(root, [
      "check-ignore",
      "-q",
      "--",
      attempt.publicLocator,
    ]) === 0
  ) {
    fail("public_path_ignored");
  }
};

export const loadRegisteredCodexCliInput = async (
  loaders: CodexCliPreflightLoaders = defaultLoaders,
): Promise<RegisteredCodexCliInput> => {
  try {
    const [worldInput, overlay, snapshot] = await Promise.all([
      loaders.loadWorldPack(),
      loaders.loadOverlay(
        LIVE_RED_SAIL_SCENARIO_CONTRACT.sourceFixtures.overlayId,
      ),
      loaders.loadSnapshot(
        LIVE_RED_SAIL_SCENARIO_CONTRACT.sourceFixtures.snapshotId,
      ),
    ]);
    const worldPack = WorldPackSchema.parse(worldInput);
    const request = buildLiveEvidenceRunRequest({
      overlay: CanonOverlaySchema.parse(overlay),
      snapshot: SimulationSnapshotSchema.parse(snapshot),
      styleProfileId: LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.styleProfileId,
    });
    if (
      sha256Canonical(worldPack) !== LIVE_RED_SAIL_WORLD_PACK_SHA256 ||
      sha256Canonical(request) !== LIVE_RED_SAIL_REQUEST_SHA256
    ) {
      return fail("registered_hash_mismatch");
    }
    return { worldPack, request };
  } catch (error) {
    if (error instanceof CodexCliPreflightError) throw error;
    return fail("registered_input_invalid");
  }
};

const parseCliVersion = (source: string): string => {
  const match = source.match(
    /\bcodex-cli \d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?\b/u,
  );
  if (!match) return fail("codex_cli_version_invalid");
  return match[0];
};

type ParsedCliSemanticVersion = {
  core: [number, number, number];
  prerelease: string[] | null;
};

const parseCliSemanticVersion = (value: string): ParsedCliSemanticVersion => {
  const prefix = "codex-cli ";
  const version = value.startsWith(prefix)
    ? value.slice(prefix.length)
    : value;
  const buildParts = version.split("+");
  if (buildParts.length > 2) return fail("codex_cli_version_invalid");
  const [precedence, build] = buildParts;
  if (
    !precedence ||
    (build !== undefined &&
      (build.length === 0 ||
        build.split(".").some((part) => !/^[0-9A-Za-z-]+$/u.test(part))))
  ) {
    return fail("codex_cli_version_invalid");
  }
  const separator = precedence.indexOf("-");
  const coreSource = separator === -1
    ? precedence
    : precedence.slice(0, separator);
  const prereleaseSource = separator === -1
    ? null
    : precedence.slice(separator + 1);
  const coreParts = coreSource.split(".");
  if (
    coreParts.length !== 3 ||
    coreParts.some((part) => !/^(?:0|[1-9]\d*)$/u.test(part))
  ) {
    return fail("codex_cli_version_invalid");
  }
  const prerelease = prereleaseSource === null
    ? null
    : prereleaseSource.split(".");
  if (
    prerelease !== null &&
    (prerelease.some((part) => !/^[0-9A-Za-z-]+$/u.test(part)) ||
      prerelease.some(
        (part) => /^\d+$/u.test(part) && !/^(?:0|[1-9]\d*)$/u.test(part),
      ))
  ) {
    return fail("codex_cli_version_invalid");
  }
  return {
    core: coreParts.map(Number) as [number, number, number],
    prerelease,
  };
};

const comparePrereleaseIdentifier = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/u.test(left);
  const rightNumeric = /^\d+$/u.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left.localeCompare(right);
};

const versionAtLeast = (actual: string, minimum: string): boolean => {
  const left = parseCliSemanticVersion(actual);
  const right = parseCliSemanticVersion(minimum);
  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] > right.core[index];
    }
  }
  if (left.prerelease === null || right.prerelease === null) {
    if (left.prerelease === right.prerelease) return true;
    return left.prerelease === null;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) {
      return rightPart === undefined;
    }
    const compared = comparePrereleaseIdentifier(leftPart, rightPart);
    if (compared !== 0) return compared > 0;
  }
  return true;
};

const inspectAndValidateCodexCli = ({
  command,
  inspector,
  env,
}: {
  command: string;
  inspector: CodexCliInspector;
  env: NodeJS.ProcessEnv;
}): { cliVersion: string; auth: "chatgpt" } => {
  let inspection: CodexCliInspection;
  try {
    inspection = inspector(command, env);
  } catch {
    return fail("codex_cli_unavailable");
  }
  if (inspection.versionStatus !== 0 || inspection.execHelpStatus !== 0) {
    return fail("codex_cli_unavailable");
  }
  const cliVersion = parseCliVersion(inspection.versionStdout);
  if (!versionAtLeast(cliVersion, CODEX_CLI_MIN_GPT56_VERSION)) {
    return fail("codex_cli_version_unsupported");
  }
  if (
    REQUIRED_EXEC_HELP_FLAGS.some(
      (flag) => !inspection.execHelpStdout.includes(flag),
    )
  ) {
    return fail("codex_cli_flags_missing");
  }
  if (
    inspection.authStatus !== 0 ||
    !/Logged in using ChatGPT/u.test(
      `${inspection.authStdout}\n${inspection.authStderr}`,
    )
  ) {
    return fail("codex_cli_auth_missing");
  }
  return { cliVersion, auth: "chatgpt" };
};

export type CodexCliRuntimePreflightReport = {
  cliVersion: string;
  auth: "chatgpt";
  requiredFlags: readonly string[];
};

/**
 * Verifies only the local Codex CLI runtime. It deliberately does not reuse the
 * Red Sail evidence approval contract, so callers can bind the same validated
 * executable to a separate capture protocol such as W5.
 */
export const preflightCodexCliRuntime = ({
  command = "codex",
  inspector = inspectCodexCli,
  env = process.env,
}: {
  command?: string;
  inspector?: CodexCliInspector;
  env?: NodeJS.ProcessEnv;
} = {}): CodexCliRuntimePreflightReport => {
  const result = inspectAndValidateCodexCli({
    command,
    inspector,
    env: buildCodexCliEnvironment(env),
  });
  return {
    ...result,
    requiredFlags: REQUIRED_EXEC_HELP_FLAGS,
  };
};

export const preflightCodexCliEvidence = async ({
  root,
  command = "codex",
  inspector = inspectCodexCli,
  loaders = defaultLoaders,
  mode = "primary",
  env = process.env,
}: {
  root: string;
  command?: string;
  inspector?: CodexCliInspector;
  loaders?: CodexCliPreflightLoaders;
  mode?: CodexCliCaptureMode;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  report: CodexCliPreflightReport;
  input: RegisteredCodexCliInput;
  bundle: CodexCliAuthorityBundle;
  approval: CodexCliCaptureApproval;
}> => {
  const realRoot = assertExactRepositoryRoot(root);
  const input = await loadRegisteredCodexCliInput(loaders);
  const previousAttemptReceiptSha256 = loadCodexCliPreviousReceiptBinding({
    root: realRoot,
    mode,
    input,
  });
  const bundle = buildCodexCliAuthorityBundle({
    ...input,
    command,
    mode,
    previousAttemptReceiptSha256,
  });
  const approval = assertApproval(realRoot, bundle, mode);
  assertCapturePaths(realRoot, mode);
  const { cliVersion, auth } = preflightCodexCliRuntime({
    command,
    inspector,
    env,
  });
  return {
    report: {
      schemaVersion: 1,
      evidenceType: "codex_cli_capture_preflight",
      ready: true,
      attemptId: getCodexCliCaptureAttempt(mode).attemptId,
      transport: "codex_cli",
      requestedModel: CODEX_CLI_REQUESTED_MODEL,
      actualModelWillBeReportedAs: null,
      responseIdWillBeReportedAs: null,
      cliVersion,
      auth,
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      worldPackSha256: LIVE_RED_SAIL_WORLD_PACK_SHA256,
      outputSchemaSha256: bundle.authority.outputSchemaSha256,
      modelInputSha256: bundle.authority.modelInputSha256,
      promptSha256: bundle.authority.promptSha256,
      executionContractSha256: bundle.authority.executionContractSha256,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
      requiredFlags: REQUIRED_EXEC_HELP_FLAGS,
    },
    input,
    bundle,
    approval,
  };
};

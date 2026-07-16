import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, type Stats } from "node:fs";
import path from "node:path";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import {
  loadGpt56Config,
  type Environment,
} from "@/src/adapters/openai/gpt56-config";
import { DEFAULT_OPENAI_MAX_OUTPUT_TOKENS } from "@/src/adapters/openai/narrative-model";
import {
  CanonOverlaySchema,
  type CanonOverlay,
} from "@/src/contracts/canon-overlay";
import {
  SimulationSnapshotSchema,
  type SimulationSnapshot,
} from "@/src/contracts/simulation";
import { hasValidOverlayHash } from "@/src/domain/canon-overlay";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { WorldPackSchema, type WorldPack } from "@/src/domain/schemas";
import { hasValidSnapshotHash } from "@/src/domain/simulation";
import { LiveCaptureApprovalSchema } from "@/src/evidence/live-capture-approval";
import { LiveCaptureAttemptReceiptSchema } from "@/src/evidence/live-capture-contracts";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  LIVE_RED_SAIL_WORLD_PACK_SHA256,
} from "@/src/evidence/live-scenario-contract";
import { getLiveEvidenceCapturePaths } from "@/scripts/capture-live-evidence";

export const REGISTERED_LIVE_ATTEMPT_ID = LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID;
export const REGISTERED_LIVE_APPROVAL_LOCATOR =
  "artifacts/live/live-capture-approval.json";
export const REGISTERED_LIVE_RETRY_ATTEMPT_ID = LIVE_RED_SAIL_RETRY_ATTEMPT_ID;
export const REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR =
  "artifacts/live/live-retry-approval.json";
export const REGISTERED_LIVE_OVERLAY_FIXTURE_ID =
  LIVE_RED_SAIL_SCENARIO_CONTRACT.sourceFixtures.overlayId;
export const REGISTERED_LIVE_SNAPSHOT_FIXTURE_ID =
  LIVE_RED_SAIL_SCENARIO_CONTRACT.sourceFixtures.snapshotId;

const REGISTERED_WORLD_PACK_ID = LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.id;
const REGISTERED_WORLD_PACK_VERSION = LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.version;
const REGISTERED_STYLE_PROFILE_ID =
  LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.styleProfileId;

export const REGISTERED_LIVE_HASHES = {
  requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
  worldPackSha256: LIVE_RED_SAIL_WORLD_PACK_SHA256,
  overlaySha256: "486710b70b47f44a4bbb50b219608cf3fcc5cbf21d43e31c801c64b448fa9a1d",
  overlayHash: "15fe0c8edf47d0a78322b08d33a598036b7498b7a2fb6ee2f90c64da01327806",
  snapshotSha256: "4adf19108ff6fb8901ef5dad079105c5934cabfac3bb15fc3e7e779dd0539d47",
  snapshotStateHash: "ffc558f0c9bd9139cd18c7408cb393b405d75698cc412d35cf345b1c5094f50e",
  styleProfileSha256: "c6d299ff866c523b4abc33a0a6d10947c2c1245a44646c43ce6ec5f57fe075ec",
} as const;

export type LivePreflightFailureCode =
  | "configuration_invalid"
  | "approval_missing"
  | "approval_invalid"
  | "retry_approval_missing"
  | "retry_approval_invalid"
  | "retry_receipt_missing"
  | "retry_receipt_invalid"
  | "repository_root_invalid"
  | "registered_input_invalid"
  | "registered_hash_mismatch"
  | "authority_mismatch"
  | "capture_path_unsafe"
  | "private_path_not_ignored"
  | "public_path_ignored"
  | "capture_target_exists";

export type LiveCaptureMode = "primary" | "retry";

export class LivePreflightError extends Error {
  constructor(readonly code: LivePreflightFailureCode) {
    super(code);
    this.name = "LivePreflightError";
  }
}

export type LivePreflightReport = {
  schemaVersion: 1;
  evidenceType: "live_capture_preflight";
  ready: true;
  mode: LiveCaptureMode;
  attemptId:
    | typeof LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID
    | typeof LIVE_RED_SAIL_RETRY_ATTEMPT_ID;
  liveEnabled: true;
  apiKeyPresent: true;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  maxOutputTokens: number;
  hashes: typeof REGISTERED_LIVE_HASHES;
};

export type RegisteredLiveInput = {
  worldPack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  request: ReturnType<typeof buildLiveEvidenceRunRequest>;
};

export type LivePreflightLoaders = {
  loadWorldPack: () => Promise<WorldPack>;
  loadOverlay: (fixtureId: string) => Promise<CanonOverlay>;
  loadSnapshot: (fixtureId: string) => Promise<SimulationSnapshot>;
};

export type LivePreflightOptions = {
  root: string;
  env?: Environment;
  loaders?: LivePreflightLoaders;
  mode?: LiveCaptureMode;
};

const defaultLoaders: LivePreflightLoaders = {
  loadWorldPack: loadDemoWorldPack,
  loadOverlay: loadOverlayFixture,
  loadSnapshot: loadSnapshotFixture,
};

const fail = (code: LivePreflightFailureCode): never => {
  throw new LivePreflightError(code);
};

const lstatIfPresent = (candidate: string): Stats | null => {
  try {
    return lstatSync(candidate);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    return fail("capture_path_unsafe");
  }
};

const canonicalRelative = (root: string, candidate: string): string => {
  const relative = path.relative(root, candidate).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    fail("capture_path_unsafe");
  }
  return relative;
};

const assertSafeAncestors = (root: string, candidate: string): void => {
  const relative = canonicalRelative(root, candidate);
  let current = root;
  const parentParts = relative.split("/").slice(0, -1);
  for (const part of parentParts) {
    current = path.join(current, part);
    const stat = lstatIfPresent(current);
    if (!stat) continue;
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("capture_path_unsafe");
  }
};

const gitStatus = (root: string, args: string[]): number | null =>
  spawnSync("git", ["-C", root, ...args], { stdio: "ignore" }).status;

const isGitIgnored = (root: string, locator: string): boolean =>
  gitStatus(root, ["check-ignore", "-q", "--", locator]) === 0;

const isGitTracked = (root: string, locator: string): boolean =>
  gitStatus(root, ["ls-files", "--error-unmatch", "--", locator]) === 0;

const attemptIdFor = (mode: LiveCaptureMode) =>
  mode === "primary"
    ? LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID
    : LIVE_RED_SAIL_RETRY_ATTEMPT_ID;

const approvalLocatorFor = (mode: LiveCaptureMode) =>
  mode === "primary"
    ? REGISTERED_LIVE_APPROVAL_LOCATOR
    : REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR;

const assertCaptureApproval = (root: string, mode: LiveCaptureMode): void => {
  const locator = approvalLocatorFor(mode);
  const missingCode = mode === "primary" ? "approval_missing" : "retry_approval_missing";
  const invalidCode = mode === "primary" ? "approval_invalid" : "retry_approval_invalid";
  const approvalPath = path.resolve(root, locator);
  const stat = lstatIfPresent(approvalPath);
  const approvalStat: Stats = stat ?? fail(missingCode);
  assertSafeAncestors(root, approvalPath);
  try {
    const relative = path
      .relative(realpathSync(root), realpathSync(approvalPath))
      .split(path.sep)
      .join("/");
    const approval = LiveCaptureApprovalSchema.parse(
      JSON.parse(readFileSync(approvalPath, "utf8")) as unknown,
    );
    if (
      !approvalStat.isFile() ||
      approvalStat.isSymbolicLink() ||
      relative !== locator ||
      approval.attemptId !== attemptIdFor(mode) ||
      !isGitIgnored(root, locator) ||
      isGitTracked(root, locator)
    ) {
      fail(invalidCode);
    }
  } catch (error) {
    if (error instanceof LivePreflightError) throw error;
    fail(invalidCode);
  }
};

const assertRetryPrimaryReceipt = (root: string): void => {
  const primaryPaths = getLiveEvidenceCapturePaths(
    root,
    LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  );
  const receiptPath = primaryPaths.attemptReceiptPath;
  const receiptLocator = canonicalRelative(root, receiptPath);
  const stat = lstatIfPresent(receiptPath);
  const receiptStat: Stats = stat ?? fail("retry_receipt_missing");
  assertSafeAncestors(root, receiptPath);
  try {
    const relative = path
      .relative(realpathSync(root), realpathSync(receiptPath))
      .split(path.sep)
      .join("/");
    const receipt = LiveCaptureAttemptReceiptSchema.parse(
      JSON.parse(readFileSync(receiptPath, "utf8")) as unknown,
    );
    if (
      !receiptStat.isFile() ||
      receiptStat.isSymbolicLink() ||
      relative !== receiptLocator ||
      receipt.attemptId !== LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID ||
      receipt.requestSha256 !== LIVE_RED_SAIL_REQUEST_SHA256 ||
      receipt.retryable !== true ||
      receipt.captureOutcome !== "typed_failure" ||
      receipt.modelOutcome === "completed" ||
      receipt.modelOutcome === "not_returned" ||
      receipt.rawPersisted ||
      receipt.publicPersisted ||
      receipt.sanitizedEvidenceSha256 !== null ||
      !isGitIgnored(root, receiptLocator) ||
      isGitTracked(root, receiptLocator)
    ) {
      fail("retry_receipt_invalid");
    }
  } catch (error) {
    if (error instanceof LivePreflightError) throw error;
    fail("retry_receipt_invalid");
  }

  assertSafeAncestors(root, primaryPaths.attemptRecoveryPath);
  if (lstatIfPresent(primaryPaths.attemptRecoveryPath)) {
    fail("retry_receipt_invalid");
  }
};

const assertExactRepositoryRoot = (root: string): string => {
  try {
    const realRoot = realpathSync(root);
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return fail("repository_root_invalid");
    }
    const result = spawnSync("git", ["-C", realRoot, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status !== 0 || typeof result.stdout !== "string") {
      return fail("repository_root_invalid");
    }
    if (realpathSync(result.stdout.trim()) !== realRoot) {
      return fail("repository_root_invalid");
    }
    return realRoot;
  } catch {
    return fail("repository_root_invalid");
  }
};

const assertCaptureTargetsSafeAndAbsent = (
  root: string,
  mode: LiveCaptureMode,
): void => {
  const attemptId = attemptIdFor(mode);
  const paths = getLiveEvidenceCapturePaths(root, attemptId);
  const expected = {
    rawPath: path.join(root, "artifacts", "live", "live-run.json"),
    publicPath: path.join(root, "artifacts", "evidence", "live-sanitized.json"),
    lockPath: path.join(root, "artifacts", "live", "live-capture.lock.json"),
    attemptRecoveryPath: path.join(
      root,
      "artifacts",
      "live",
      "live-capture-attempts",
      `${attemptId}.pending.json`,
    ),
    attemptReceiptPath: path.join(
      root,
      "artifacts",
      "live",
      "live-capture-attempts",
      `${attemptId}.json`,
    ),
  } as const;

  for (const [key, expectedPath] of Object.entries(expected)) {
    if (paths[key as keyof typeof expected] !== expectedPath) fail("capture_path_unsafe");
    assertSafeAncestors(root, expectedPath);
    if (lstatIfPresent(expectedPath)) fail("capture_target_exists");
  }

  const privateLocators = [
    expected.rawPath,
    expected.lockPath,
    expected.attemptRecoveryPath,
    expected.attemptReceiptPath,
  ].map((candidate) => canonicalRelative(root, candidate));
  const publicLocator = canonicalRelative(root, expected.publicPath);

  if (privateLocators.some((locator) => !isGitIgnored(root, locator))) {
    fail("private_path_not_ignored");
  }
  if (isGitIgnored(root, publicLocator)) fail("public_path_ignored");
};

const sameHashes = (
  actual: Record<keyof typeof REGISTERED_LIVE_HASHES, string>,
): actual is typeof REGISTERED_LIVE_HASHES =>
  Object.entries(REGISTERED_LIVE_HASHES).every(
    ([key, value]) => actual[key as keyof typeof REGISTERED_LIVE_HASHES] === value,
  );

export const loadRegisteredLiveInput = async (
  loaders: LivePreflightLoaders = defaultLoaders,
): Promise<RegisteredLiveInput> => {
  let worldPack: WorldPack;
  let overlay: CanonOverlay;
  let snapshot: SimulationSnapshot;
  try {
    const [worldPackInput, overlayInput, snapshotInput] = await Promise.all([
      loaders.loadWorldPack(),
      loaders.loadOverlay(REGISTERED_LIVE_OVERLAY_FIXTURE_ID),
      loaders.loadSnapshot(REGISTERED_LIVE_SNAPSHOT_FIXTURE_ID),
    ]);
    worldPack = WorldPackSchema.parse(worldPackInput);
    overlay = CanonOverlaySchema.parse(overlayInput);
    snapshot = SimulationSnapshotSchema.parse(snapshotInput);
  } catch {
    return fail("registered_input_invalid");
  }

  const selectedStyles = worldPack.styleProfiles.filter(
    ({ id }) => id === REGISTERED_STYLE_PROFILE_ID,
  );
  if (
    worldPack.meta.id !== REGISTERED_WORLD_PACK_ID ||
    worldPack.meta.version !== REGISTERED_WORLD_PACK_VERSION ||
    worldPack.defaultStyleProfileId !== REGISTERED_STYLE_PROFILE_ID ||
    selectedStyles.length !== 1 ||
    !hasValidOverlayHash(overlay) ||
    !hasValidSnapshotHash(snapshot)
  ) {
    return fail("registered_input_invalid");
  }

  if (
    overlay.version !== 0 ||
    overlay.worldPackId !== worldPack.meta.id ||
    overlay.worldPackVersion !== worldPack.meta.version ||
    snapshot.turnIndex !== 0 ||
    snapshot.worldPackVersion !== worldPack.meta.version ||
    snapshot.overlayId !== overlay.id ||
    snapshot.overlayVersion !== overlay.version ||
    snapshot.canonHash !== overlay.hash ||
    snapshot.styleProfileId !== REGISTERED_STYLE_PROFILE_ID
  ) {
    return fail("authority_mismatch");
  }

  let request: ReturnType<typeof buildLiveEvidenceRunRequest>;
  try {
    request = buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: REGISTERED_STYLE_PROFILE_ID,
    });
  } catch {
    return fail("registered_input_invalid");
  }

  const actualHashes = {
    requestSha256: sha256Canonical(request),
    worldPackSha256: sha256Canonical(worldPack),
    overlaySha256: sha256Canonical(overlay),
    overlayHash: overlay.hash,
    snapshotSha256: sha256Canonical(snapshot),
    snapshotStateHash: snapshot.stateHash,
    styleProfileSha256: sha256Canonical(selectedStyles[0]),
  };
  if (!sameHashes(actualHashes)) fail("registered_hash_mismatch");

  return { worldPack, overlay, snapshot, request };
};

export const preflightLiveEvidence = async ({
  root,
  env = process.env,
  loaders = defaultLoaders,
  mode = "primary",
}: LivePreflightOptions): Promise<LivePreflightReport> => {
  let config: ReturnType<typeof loadGpt56Config>;
  try {
    config = loadGpt56Config(env);
  } catch {
    return fail("configuration_invalid");
  }
  if (
    !/^gpt-5\.6(?:$|-[A-Za-z0-9._-]+$)/u.test(config.model) ||
    config.reasoningEffort !== "medium"
  ) {
    fail("configuration_invalid");
  }

  const realRoot = assertExactRepositoryRoot(root);
  if (
    loaders === defaultLoaders &&
    realpathSync(process.cwd()) !== realRoot
  ) {
    fail("repository_root_invalid");
  }
  await loadRegisteredLiveInput(loaders);
  assertCaptureApproval(realRoot, mode);
  if (mode === "retry") assertRetryPrimaryReceipt(realRoot);
  assertCaptureTargetsSafeAndAbsent(realRoot, mode);

  return {
    schemaVersion: 1,
    evidenceType: "live_capture_preflight",
    ready: true,
    mode,
    attemptId: attemptIdFor(mode),
    liveEnabled: true,
    apiKeyPresent: true,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    maxOutputTokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    hashes: REGISTERED_LIVE_HASHES,
  };
};

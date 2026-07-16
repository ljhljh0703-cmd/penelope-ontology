import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import { RunResultSchema } from "@/src/contracts/run";
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { WorldPackSchema } from "@/src/domain/schemas";
import {
  assertCompletedLiveCaptureReceiptBinding,
  LiveCaptureAttemptReceiptSchema,
} from "@/src/evidence/live-capture-contracts";
import { LiveCaptureApprovalSchema } from "@/src/evidence/live-capture-approval";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  hasLiveReadinessShape,
  type LiveReadinessRecord,
} from "@/src/evidence/live-readiness";
import {
  buildLiveEvidenceAuthority,
  sanitizeLiveEvidence,
  SanitizedLiveEvidenceSchema,
  type SanitizedLiveEvidence,
} from "@/src/evidence/sanitize-live-evidence";
import {
  LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
  evaluateLiveRedSailRunResult,
} from "@/src/evidence/live-scenario-contract";

const SHA256 = /^[a-f0-9]{64}$/;
const sha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

type BundleInput = {
  readiness: unknown;
  sanitized: unknown;
  receipt: unknown;
  receiptSource: string;
  expectedAuthority: SanitizedLiveEvidence["authority"];
  expectedCurrentStateHash: string;
  now?: number;
};

export const isLiveEvidenceBundleVerified = ({
  readiness: readinessInput,
  sanitized: sanitizedInput,
  receipt: receiptInput,
  receiptSource,
  expectedAuthority,
  expectedCurrentStateHash,
  now = Date.now(),
}: BundleInput): boolean => {
  try {
    if (!hasLiveReadinessShape(readinessInput)) return false;
    const readiness: LiveReadinessRecord = readinessInput;
    const sanitized = SanitizedLiveEvidenceSchema.parse(sanitizedInput);
    const receipt = LiveCaptureAttemptReceiptSchema.parse(receiptInput);
    const capturedAt = Date.parse(sanitized.capturedAt);
    const dispatchedAt = Date.parse(receipt.dispatchedAt);
    if (
      readiness.requestedModel !== sanitized.requestedModel ||
      readiness.actualModel !== sanitized.actualModel ||
      readiness.worldPackSha256 !== sanitized.authority.worldPackSha256 ||
      readiness.requestSha256 !== sanitized.authority.requestSha256 ||
      readiness.captureReceiptSha256 !== sha256(receiptSource) ||
      sanitized.rawResponsePersistedPublicly !== false ||
      sha256Canonical(sanitized.authority) !== sha256Canonical(expectedAuthority) ||
      sanitized.currentStateHash !== expectedCurrentStateHash ||
      !/^run\.[a-f0-9]{20}$/.test(sanitized.runId) ||
      sanitized.inputTokens <= 0 ||
      sanitized.outputTokens <= 0 ||
      !Number.isFinite(capturedAt) ||
      !Number.isFinite(dispatchedAt) ||
      dispatchedAt > capturedAt ||
      capturedAt > now ||
      (sanitized.runStatus === "passed" && sanitized.hardViolationCodes.length > 0)
    ) {
      return false;
    }
    assertCompletedLiveCaptureReceiptBinding(receipt, sanitized);
    return true;
  } catch {
    return false;
  }
};

const readRegularSource = (root: string, locator: string): string => {
  const realRoot = realpathSync(root);
  const filePath = path.resolve(root, locator);
  const stat = lstatSync(filePath);
  const relative = path
    .relative(realRoot, realpathSync(filePath))
    .split(path.sep)
    .join("/");
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    relative !== locator
  ) {
    throw new Error("Evidence locator is not a regular repository file.");
  }
  return readFileSync(filePath, "utf8");
};

type ManifestEntry = { path?: unknown; bytes?: unknown; sha256?: unknown };

const manifestBinds = (
  manifestInput: unknown,
  sources: Readonly<Record<string, string>>,
): boolean => {
  if (
    !manifestInput ||
    typeof manifestInput !== "object" ||
    Array.isArray(manifestInput)
  ) {
    return false;
  }
  const manifest = manifestInput as { schemaVersion?: unknown; files?: ManifestEntry[] };
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) return false;
  return Object.entries(sources).every(([locator, source]) => {
    const matches = manifest.files?.filter((entry) => entry.path === locator) ?? [];
    return (
      matches.length === 1 &&
      matches[0]?.bytes === Buffer.byteLength(source) &&
      typeof matches[0]?.sha256 === "string" &&
      SHA256.test(matches[0].sha256) &&
      matches[0].sha256 === sha256(source)
    );
  });
};

export const verifyLiveEvidenceFiles = (root: string): boolean => {
  const locators = {
    readiness: "artifacts/evidence/live-readiness.json",
    sanitized: "artifacts/evidence/live-sanitized.json",
    receipt: "artifacts/evidence/live-capture-receipt.json",
    manifest: "artifacts/evidence/manifest.json",
    world: "data/world-packs/trojan-returns/world.json",
    overlay: "data/world-packs/trojan-returns/overlays/overlay.v0.json",
    snapshot: "data/world-packs/trojan-returns/snapshots/s0.json",
  } as const;
  try {
    const readinessSource = readRegularSource(root, locators.readiness);
    const readiness = JSON.parse(readinessSource) as unknown;
    if (!hasLiveReadinessShape(readiness)) return false;
    const sanitizedSource = readRegularSource(root, locators.sanitized);
    const receiptSource = readRegularSource(root, locators.receipt);
    const manifest = JSON.parse(readRegularSource(root, locators.manifest)) as unknown;
    if (
      !manifestBinds(manifest, {
        [locators.readiness]: readinessSource,
        [locators.sanitized]: sanitizedSource,
        [locators.receipt]: receiptSource,
      })
    ) {
      return false;
    }
    const worldPack = WorldPackSchema.parse(
      JSON.parse(readRegularSource(root, locators.world)) as unknown,
    );
    const overlay = CanonOverlaySchema.parse(
      JSON.parse(readRegularSource(root, locators.overlay)) as unknown,
    );
    const snapshot = SimulationSnapshotSchema.parse(
      JSON.parse(readRegularSource(root, locators.snapshot)) as unknown,
    );
    const request = buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    });
    return isLiveEvidenceBundleVerified({
      readiness,
      sanitized: JSON.parse(sanitizedSource) as unknown,
      receipt: JSON.parse(receiptSource) as unknown,
      receiptSource,
      expectedAuthority: buildLiveEvidenceAuthority({
        worldPackId: worldPack.meta.id,
        worldPackSha256: sha256Canonical(worldPack),
        request,
      }),
      expectedCurrentStateHash: request.snapshot.stateHash,
    });
  } catch {
    return false;
  }
};

const LOCAL_LIVE_LOCATORS = {
  raw: "artifacts/live/live-run.json",
  attempts: "artifacts/live/live-capture-attempts",
  primaryApproval: "artifacts/live/live-capture-approval.json",
  retryApproval: "artifacts/live/live-retry-approval.json",
  lock: "artifacts/live/live-capture.lock.json",
  sanitized: "artifacts/evidence/live-sanitized.json",
  publicReceipt: "artifacts/evidence/live-capture-receipt.json",
  world: "data/world-packs/trojan-returns/world.json",
  overlay: "data/world-packs/trojan-returns/overlays/overlay.v0.json",
  snapshot: "data/world-packs/trojan-returns/snapshots/s0.json",
} as const;

const isExactRepositoryRoot = (root: string): boolean => {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return false;
  try {
    return realpathSync(result.stdout.trim()) === realpathSync(root);
  } catch {
    return false;
  }
};

const isIgnoredAndUntracked = (root: string, locator: string): boolean => {
  const tracked = spawnSync(
    "git",
    ["-C", root, "ls-files", "--error-unmatch", "--", locator],
    { stdio: "ignore" },
  );
  if (tracked.status === 0 || tracked.status === null) return false;
  const ignored = spawnSync("git", ["-C", root, "check-ignore", "-q", "--", locator], {
    stdio: "ignore",
  });
  return ignored.status === 0;
};

const assertRegularRepositoryDirectory = (root: string, locator: string): void => {
  const realRoot = realpathSync(root);
  const directory = path.resolve(root, locator);
  const stat = lstatSync(directory);
  const relative = path
    .relative(realRoot, realpathSync(directory))
    .split(path.sep)
    .join("/");
  if (!stat.isDirectory() || stat.isSymbolicLink() || relative !== locator) {
    throw new Error("Live evidence directory is not a regular repository directory.");
  }
};

const isRetryablePrimaryFailureReceipt = (
  primary: ReturnType<typeof LiveCaptureAttemptReceiptSchema.parse>,
  completedRetry: ReturnType<typeof LiveCaptureAttemptReceiptSchema.parse>,
): boolean => {
  const primaryDispatchedAt = Date.parse(primary.dispatchedAt);
  const primaryFinishedAt = Date.parse(primary.finishedAt);
  const retryDispatchedAt = Date.parse(completedRetry.dispatchedAt);
  return (
    primary.attemptId === LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID &&
    primary.requestSha256 === completedRetry.requestSha256 &&
    primary.requestedModel === completedRetry.requestedModel &&
    primary.captureOutcome === "typed_failure" &&
    primary.modelOutcome !== "completed" &&
    primary.modelOutcome !== "not_returned" &&
    primary.errorCode !== null &&
    primary.retryable === true &&
    primary.sanitizedEvidenceSha256 === null &&
    primary.rawPersisted === false &&
    primary.publicPersisted === false &&
    Number.isFinite(primaryDispatchedAt) &&
    Number.isFinite(primaryFinishedAt) &&
    Number.isFinite(retryDispatchedAt) &&
    primaryDispatchedAt <= primaryFinishedAt &&
    primaryFinishedAt <= retryDispatchedAt
  );
};

const hasExactPrivateApproval = (
  root: string,
  locator: string,
  attemptId:
    | typeof LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID
    | typeof LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
): boolean => {
  try {
    const approval = LiveCaptureApprovalSchema.parse(
      JSON.parse(readRegularSource(root, locator)) as unknown,
    );
    return (
      approval.attemptId === attemptId &&
      isIgnoredAndUntracked(root, locator)
    );
  } catch {
    return false;
  }
};

/**
 * Verifies the private source behind an already verified public live bundle.
 *
 * This is intentionally a local release gate: raw prose and response identity
 * stay in gitignored files, while the public verifier above remains usable by
 * health checks and deployed builds that never receive the private source.
 */
export const verifyLocalLiveEvidenceProof = (root: string): boolean => {
  try {
    if (!verifyLiveEvidenceFiles(root) || !isExactRepositoryRoot(root)) return false;
    if (existsSync(path.resolve(root, LOCAL_LIVE_LOCATORS.lock))) return false;
    if (
      !hasExactPrivateApproval(
        root,
        LOCAL_LIVE_LOCATORS.primaryApproval,
        LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
      )
    ) {
      return false;
    }

    const rawSource = readRegularSource(root, LOCAL_LIVE_LOCATORS.raw);
    if (!isIgnoredAndUntracked(root, LOCAL_LIVE_LOCATORS.raw)) return false;

    const publicSanitized = SanitizedLiveEvidenceSchema.parse(
      JSON.parse(readRegularSource(root, LOCAL_LIVE_LOCATORS.sanitized)) as unknown,
    );
    const publicReceipt = LiveCaptureAttemptReceiptSchema.parse(
      JSON.parse(readRegularSource(root, LOCAL_LIVE_LOCATORS.publicReceipt)) as unknown,
    );
    const rawResult = RunResultSchema.parse(JSON.parse(rawSource) as unknown);
    if (!evaluateLiveRedSailRunResult(rawResult).ok) return false;
    const worldPack = WorldPackSchema.parse(
      JSON.parse(readRegularSource(root, LOCAL_LIVE_LOCATORS.world)) as unknown,
    );
    const overlay = CanonOverlaySchema.parse(
      JSON.parse(readRegularSource(root, LOCAL_LIVE_LOCATORS.overlay)) as unknown,
    );
    const snapshot = SimulationSnapshotSchema.parse(
      JSON.parse(readRegularSource(root, LOCAL_LIVE_LOCATORS.snapshot)) as unknown,
    );
    const request = buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    });
    const recomputed = sanitizeLiveEvidence(rawResult, publicSanitized.capturedAt, {
      worldPackId: worldPack.meta.id,
      worldPackSha256: sha256Canonical(worldPack),
      request,
    });
    if (sha256Canonical(recomputed) !== sha256Canonical(publicSanitized)) return false;

    assertRegularRepositoryDirectory(root, LOCAL_LIVE_LOCATORS.attempts);
    const attemptDirectory = path.resolve(root, LOCAL_LIVE_LOCATORS.attempts);
    const receipts = new Map<
      string,
      ReturnType<typeof LiveCaptureAttemptReceiptSchema.parse>
    >();
    for (const entry of readdirSync(attemptDirectory, { withFileTypes: true })) {
      if (entry.name.endsWith(".pending.json")) return false;
      if (!entry.name.endsWith(".json")) continue;
      if (!entry.isFile() || entry.isSymbolicLink()) return false;
      const locator = `${LOCAL_LIVE_LOCATORS.attempts}/${entry.name}`;
      const localReceipt = LiveCaptureAttemptReceiptSchema.parse(
        JSON.parse(readRegularSource(root, locator)) as unknown,
      );
      if (entry.name !== `${localReceipt.attemptId}.json`) return false;
      if (!isIgnoredAndUntracked(root, locator)) return false;
      if (
        localReceipt.attemptId !== LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID &&
        localReceipt.attemptId !== LIVE_RED_SAIL_RETRY_ATTEMPT_ID
      ) {
        return false;
      }
      if (receipts.has(localReceipt.attemptId)) return false;
      receipts.set(localReceipt.attemptId, localReceipt);
    }

    if (
      publicReceipt.attemptId !== LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID &&
      publicReceipt.attemptId !== LIVE_RED_SAIL_RETRY_ATTEMPT_ID
    ) {
      return false;
    }
    const completedLocal = receipts.get(publicReceipt.attemptId);
    if (
      !completedLocal ||
      sha256Canonical(completedLocal) !== sha256Canonical(publicReceipt)
    ) {
      return false;
    }
    assertCompletedLiveCaptureReceiptBinding(completedLocal, publicSanitized);

    if (publicReceipt.attemptId === LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID) {
      return receipts.size === 1;
    }

    const primary = receipts.get(LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID);
    return (
      receipts.size === 2 &&
      primary !== undefined &&
      hasExactPrivateApproval(
        root,
        LOCAL_LIVE_LOCATORS.retryApproval,
        LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
      ) &&
      isRetryablePrimaryFailureReceipt(primary, completedLocal)
    );
  } catch {
    return false;
  }
};

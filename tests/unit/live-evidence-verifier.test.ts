import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { RunResultSchema } from "@/src/contracts/run";
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { WorldPackSchema } from "@/src/domain/schemas";
import { buildLiveCaptureApproval } from "@/src/evidence/live-capture-approval";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  verifyLiveEvidenceFiles,
  verifyLocalLiveEvidenceProof,
} from "@/src/evidence/live-evidence-verifier";
import {
  LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
} from "@/src/evidence/live-scenario-contract";
import {
  buildLiveEvidenceAuthority,
  sanitizeLiveEvidence,
} from "@/src/evidence/sanitize-live-evidence";

const roots: string[] = [];
const sha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const locators = {
  readiness: "artifacts/evidence/live-readiness.json",
  sanitized: "artifacts/evidence/live-sanitized.json",
  receipt: "artifacts/evidence/live-capture-receipt.json",
  manifest: "artifacts/evidence/manifest.json",
  world: "data/world-packs/trojan-returns/world.json",
  overlay: "data/world-packs/trojan-returns/overlays/overlay.v0.json",
  snapshot: "data/world-packs/trojan-returns/snapshots/s0.json",
} as const;

const writeJson = (root: string, locator: string, value: unknown): string => {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(resolve(root, locator), source, "utf8");
  return source;
};

const writeManifest = (
  root: string,
  sources: Record<string, string>,
): void => {
  writeJson(root, locators.manifest, {
    schemaVersion: 1,
    files: Object.entries(sources).map(([path, source]) => ({
      path,
      bytes: Buffer.byteLength(source),
      sha256: sha256(source),
    })),
  });
};

const makeVerifiedTree = (): { root: string; sanitized: Record<string, unknown> } => {
  const root = mkdtempSync(resolve(tmpdir(), "live-evidence-tree-"));
  roots.push(root);
  for (const locator of Object.values(locators)) {
    mkdirSync(resolve(root, locator, ".."), { recursive: true });
  }
  for (const locator of [locators.world, locators.overlay, locators.snapshot]) {
    copyFileSync(resolve(process.cwd(), locator), resolve(root, locator));
  }
  const worldPack = WorldPackSchema.parse(
    JSON.parse(readFileSync(resolve(root, locators.world), "utf8")) as unknown,
  );
  const overlay = CanonOverlaySchema.parse(
    JSON.parse(readFileSync(resolve(root, locators.overlay), "utf8")) as unknown,
  );
  const snapshot = SimulationSnapshotSchema.parse(
    JSON.parse(readFileSync(resolve(root, locators.snapshot), "utf8")) as unknown,
  );
  const request = buildLiveEvidenceRunRequest({
    overlay,
    snapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
  });
  const authority = buildLiveEvidenceAuthority({
    worldPackId: worldPack.meta.id,
    worldPackSha256: sha256Canonical(worldPack),
    request,
  });
  const hash = "a".repeat(64);
  const sanitized = {
    schemaVersion: 1,
    evidenceType: "live_sanitized",
    capturedAt: "2026-07-14T00:00:01.000Z",
    authority,
    requestedModel: "gpt-5.6",
    actualModel: "gpt-5.6-2026-07-01",
    inputTokens: 10,
    outputTokens: 8,
    responseIdSha256: hash,
    runId: `run.${"a".repeat(20)}`,
    runStatus: "passed",
    hardViolationCodes: [],
    draftDigest: hash,
    graphDigest: hash,
    currentStateHash: request.snapshot.stateHash,
    proposedStateHash: hash,
    rawResponsePersistedPublicly: false,
  };
  const receipt = {
    schemaVersion: 1,
    evidenceType: "live_capture_attempt",
    attemptId: "attempt.demo",
    requestSha256: authority.requestSha256,
    dispatchedAt: "2026-07-14T00:00:00.000Z",
    finishedAt: sanitized.capturedAt,
    requestedModel: sanitized.requestedModel,
    actualModel: sanitized.actualModel,
    modelOutcome: "completed",
    captureOutcome: "persisted",
    errorCode: null,
    retryable: null,
    responseIdSha256: sanitized.responseIdSha256,
    sanitizedEvidenceSha256: sha256Canonical(sanitized),
    inputTokens: sanitized.inputTokens,
    outputTokens: sanitized.outputTokens,
    rawPersisted: true,
    publicPersisted: true,
  };
  const receiptSource = writeJson(root, locators.receipt, receipt);
  const sanitizedSource = writeJson(root, locators.sanitized, sanitized);
  const readinessSource = writeJson(root, locators.readiness, {
    evidenceType: "live_readiness",
    status: "verified",
    sanitizedEvidencePath: locators.sanitized,
    requestedModel: sanitized.requestedModel,
    actualModel: sanitized.actualModel,
    authorityBindingVerified: true,
    captureReceiptPath: locators.receipt,
    captureReceiptSha256: sha256(receiptSource),
    captureBindingVerified: true,
    worldPackSha256: authority.worldPackSha256,
    requestSha256: authority.requestSha256,
    rawResponsePersistedPublicly: false,
  });
  writeManifest(root, {
    [locators.readiness]: readinessSource,
    [locators.sanitized]: sanitizedSource,
    [locators.receipt]: receiptSource,
  });
  return { root, sanitized };
};

const git = (root: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const makeVerifiedLocalTree = async (
  completedAttempt: "primary" | "retry" = "primary",
): Promise<{
  root: string;
  rawPath: string;
  localReceiptPath: string;
  primaryReceiptPath: string;
  retryReceiptPath: string;
  primaryApprovalPath: string;
  retryApprovalPath: string;
}> => {
  const { root } = makeVerifiedTree();
  const worldPack = WorldPackSchema.parse(
    JSON.parse(readFileSync(resolve(root, locators.world), "utf8")) as unknown,
  );
  const overlay = CanonOverlaySchema.parse(
    JSON.parse(readFileSync(resolve(root, locators.overlay), "utf8")) as unknown,
  );
  const snapshot = SimulationSnapshotSchema.parse(
    JSON.parse(readFileSync(resolve(root, locators.snapshot), "utf8")) as unknown,
  );
  const request = buildLiveEvidenceRunRequest({
    overlay,
    snapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
  });
  const run = createRunOrchestrator({
    worldPack,
    fixtureModel: fixtureNarrativeModel,
    liveModel: fixtureNarrativeModel,
  });
  const fixtureResult = await run({
    modelMode: "fixture",
    overlay: request.overlay,
    snapshot: request.snapshot,
    styleProfileId: request.styleProfileId,
    taskType: request.taskType,
    brief: request.brief,
    participantIntents: request.participantIntents,
    draftFixtureId: "draft.red_sail_proposal",
  });
  if (fixtureResult.modelOutcome.outcome !== "completed") {
    throw new Error("Expected the verifier fixture to complete.");
  }
  const modelOutcome = {
    ...fixtureResult.modelOutcome,
    trace: {
      mode: "live",
      outcome: "completed",
      requestedModel: "gpt-5.6",
      actualModel: "gpt-5.6-test",
      responseId: "resp_private_verifier_fixture",
      inputTokens: 100,
      outputTokens: 50,
    },
  } as const;
  const liveResult = RunResultSchema.parse({
    ...fixtureResult,
    runId: `run.${sha256Canonical({ request, modelOutcome }).slice(0, 20)}`,
    modelOutcome,
  });
  const capturedAt = "2026-07-14T00:00:01.000Z";
  const sanitized = sanitizeLiveEvidence(liveResult, capturedAt, {
    worldPackId: worldPack.meta.id,
    worldPackSha256: sha256Canonical(worldPack),
    request,
  });
  const completedAttemptId =
    completedAttempt === "primary"
      ? LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID
      : LIVE_RED_SAIL_RETRY_ATTEMPT_ID;
  const receipt = {
    schemaVersion: 1,
    evidenceType: "live_capture_attempt",
    attemptId: completedAttemptId,
    requestSha256: sanitized.authority.requestSha256,
    dispatchedAt: "2026-07-14T00:00:00.000Z",
    finishedAt: capturedAt,
    requestedModel: sanitized.requestedModel,
    actualModel: sanitized.actualModel,
    modelOutcome: "completed",
    captureOutcome: "persisted",
    errorCode: null,
    retryable: null,
    responseIdSha256: sanitized.responseIdSha256,
    sanitizedEvidenceSha256: sha256Canonical(sanitized),
    inputTokens: sanitized.inputTokens,
    outputTokens: sanitized.outputTokens,
    rawPersisted: true,
    publicPersisted: true,
  };

  const receiptSource = writeJson(root, locators.receipt, receipt);
  const sanitizedSource = writeJson(root, locators.sanitized, sanitized);
  const readinessSource = writeJson(root, locators.readiness, {
    evidenceType: "live_readiness",
    status: "verified",
    sanitizedEvidencePath: locators.sanitized,
    requestedModel: sanitized.requestedModel,
    actualModel: sanitized.actualModel,
    authorityBindingVerified: true,
    captureReceiptPath: locators.receipt,
    captureReceiptSha256: sha256(receiptSource),
    captureBindingVerified: true,
    worldPackSha256: sanitized.authority.worldPackSha256,
    requestSha256: sanitized.authority.requestSha256,
    rawResponsePersistedPublicly: false,
  });
  writeManifest(root, {
    [locators.readiness]: readinessSource,
    [locators.sanitized]: sanitizedSource,
    [locators.receipt]: receiptSource,
  });

  const rawPath = resolve(root, "artifacts/live/live-run.json");
  const primaryReceiptPath = resolve(
    root,
    `artifacts/live/live-capture-attempts/${LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID}.json`,
  );
  const retryReceiptPath = resolve(
    root,
    `artifacts/live/live-capture-attempts/${LIVE_RED_SAIL_RETRY_ATTEMPT_ID}.json`,
  );
  const localReceiptPath =
    completedAttempt === "primary" ? primaryReceiptPath : retryReceiptPath;
  const primaryApprovalPath = resolve(
    root,
    "artifacts/live/live-capture-approval.json",
  );
  const retryApprovalPath = resolve(
    root,
    "artifacts/live/live-retry-approval.json",
  );
  mkdirSync(resolve(localReceiptPath, ".."), { recursive: true });
  writeJson(root, "artifacts/live/live-run.json", liveResult);
  writeJson(
    root,
    "artifacts/live/live-capture-approval.json",
    buildLiveCaptureApproval(LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID),
  );
  writeJson(
    root,
    `artifacts/live/live-capture-attempts/${completedAttemptId}.json`,
    receipt,
  );
  if (completedAttempt === "retry") {
    writeJson(
      root,
      "artifacts/live/live-retry-approval.json",
      buildLiveCaptureApproval(LIVE_RED_SAIL_RETRY_ATTEMPT_ID),
    );
    writeJson(
      root,
      `artifacts/live/live-capture-attempts/${LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID}.json`,
      {
        schemaVersion: 1,
        evidenceType: "live_capture_attempt",
        attemptId: LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
        requestSha256: sanitized.authority.requestSha256,
        dispatchedAt: "2026-07-13T23:59:58.000Z",
        finishedAt: "2026-07-13T23:59:59.000Z",
        requestedModel: sanitized.requestedModel,
        actualModel: null,
        modelOutcome: "timeout",
        captureOutcome: "typed_failure",
        errorCode: "openai_timeout",
        retryable: true,
        responseIdSha256: null,
        sanitizedEvidenceSha256: null,
        inputTokens: null,
        outputTokens: null,
        rawPersisted: false,
        publicPersisted: false,
      },
    );
  }

  writeFileSync(resolve(root, ".gitignore"), "artifacts/live/\n", "utf8");
  git(root, ["init"]);
  git(root, ["config", "user.name", "Live Evidence Test"]);
  git(root, ["config", "user.email", "live-evidence@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["add", ".gitignore"]);
  git(root, ["commit", "-m", "private evidence boundary"]);
  return {
    root,
    rawPath,
    localReceiptPath,
    primaryReceiptPath,
    retryReceiptPath,
    primaryApprovalPath,
    retryApprovalPath,
  };
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("live evidence filesystem verifier", () => {
  it("binds readiness, receipt, sanitized evidence, manifest, and current authority", () => {
    const { root } = makeVerifiedTree();
    expect(verifyLiveEvidenceFiles(root)).toBe(true);
  });

  it("rejects a self-consistent manifest when the sanitized authority is stale", () => {
    const { root, sanitized } = makeVerifiedTree();
    const stale = {
      ...sanitized,
      authority: {
        ...(sanitized.authority as Record<string, unknown>),
        worldPackSha256: "b".repeat(64),
      },
    };
    const sanitizedSource = writeJson(root, locators.sanitized, stale);
    const readinessSource = readFileSync(resolve(root, locators.readiness), "utf8");
    const receiptSource = readFileSync(resolve(root, locators.receipt), "utf8");
    writeManifest(root, {
      [locators.readiness]: readinessSource,
      [locators.sanitized]: sanitizedSource,
      [locators.receipt]: receiptSource,
    });
    expect(verifyLiveEvidenceFiles(root)).toBe(false);
  });

  it("rejects contradictory sanitized run outcomes under the same capture receipt", () => {
    const { root, sanitized } = makeVerifiedTree();
    const contradictory = {
      ...sanitized,
      runId: `run.${"b".repeat(20)}`,
      runStatus: "blocked",
      hardViolationCodes: ["entity_unknown"],
      draftDigest: "b".repeat(64),
      graphDigest: "c".repeat(64),
      proposedStateHash: "d".repeat(64),
    };
    const sanitizedSource = writeJson(root, locators.sanitized, contradictory);
    const readinessSource = readFileSync(resolve(root, locators.readiness), "utf8");
    const receiptSource = readFileSync(resolve(root, locators.receipt), "utf8");
    writeManifest(root, {
      [locators.readiness]: readinessSource,
      [locators.sanitized]: sanitizedSource,
      [locators.receipt]: receiptSource,
    });
    expect(verifyLiveEvidenceFiles(root)).toBe(false);
  });
});

describe("local live evidence source proof", () => {
  it("recomputes the public bundle from one ignored raw run and matching receipt", async () => {
    const { root } = await makeVerifiedLocalTree();
    expect(verifyLocalLiveEvidenceProof(root)).toBe(true);
  });

  it("accepts retry-1 only behind the same request's immutable retryable primary failure", async () => {
    const { root } = await makeVerifiedLocalTree("retry");
    expect(verifyLocalLiveEvidenceProof(root)).toBe(true);
  });

  it("requires the exact ignored primary approval for every completed capture", async () => {
    const missing = await makeVerifiedLocalTree();
    rmSync(missing.primaryApprovalPath);
    expect(verifyLocalLiveEvidenceProof(missing.root)).toBe(false);

    const tampered = await makeVerifiedLocalTree();
    const approval = JSON.parse(
      readFileSync(tampered.primaryApprovalPath, "utf8"),
    ) as Record<string, unknown>;
    writeFileSync(
      tampered.primaryApprovalPath,
      `${JSON.stringify({ ...approval, approved: false }, null, 2)}\n`,
      "utf8",
    );
    expect(verifyLocalLiveEvidenceProof(tampered.root)).toBe(false);
  });

  it("requires a separate exact ignored retry approval for retry-1", async () => {
    const missing = await makeVerifiedLocalTree("retry");
    rmSync(missing.retryApprovalPath);
    expect(verifyLocalLiveEvidenceProof(missing.root)).toBe(false);

    const linked = await makeVerifiedLocalTree("retry");
    const source = readFileSync(linked.retryApprovalPath, "utf8");
    const external = resolve(linked.root, "external-retry-approval.json");
    writeFileSync(external, source, "utf8");
    rmSync(linked.retryApprovalPath);
    symlinkSync(external, linked.retryApprovalPath);
    expect(verifyLocalLiveEvidenceProof(linked.root)).toBe(false);
  });

  it("rejects retry-1 when its primary failure receipt is missing", async () => {
    const { root, primaryReceiptPath } = await makeVerifiedLocalTree("retry");
    rmSync(primaryReceiptPath);
    expect(verifyLocalLiveEvidenceProof(root)).toBe(false);
  });

  it.each([
    ["another request", { requestSha256: "b".repeat(64) }],
    ["a nonretryable outcome", { retryable: false }],
    ["an unknown retryability", { retryable: null }],
    ["an untyped capture failure", { captureOutcome: "run_threw" }],
    ["a completed model outcome", { modelOutcome: "completed" }],
    ["a missing typed error code", { errorCode: null }],
    ["raw persistence", { rawPersisted: true }],
    ["public persistence", { publicPersisted: true }],
    ["sanitized persistence", { sanitizedEvidenceSha256: "c".repeat(64) }],
    ["a different requested model", { requestedModel: "gpt-5.6-other" }],
    ["an out-of-order finish", { finishedAt: "2026-07-14T00:00:02.000Z" }],
  ] as const)("rejects retry-1 after a primary receipt with %s", async (_label, override) => {
    const { root, primaryReceiptPath } = await makeVerifiedLocalTree("retry");
    const primary = JSON.parse(readFileSync(primaryReceiptPath, "utf8")) as Record<
      string,
      unknown
    >;
    writeFileSync(
      primaryReceiptPath,
      `${JSON.stringify({ ...primary, ...override }, null, 2)}\n`,
      "utf8",
    );
    expect(verifyLocalLiveEvidenceProof(root)).toBe(false);
  });

  it("rejects a third or otherwise unknown attempt receipt", async () => {
    const { root, localReceiptPath } = await makeVerifiedLocalTree("retry");
    const unknown = {
      ...(JSON.parse(readFileSync(localReceiptPath, "utf8")) as Record<string, unknown>),
      attemptId: "live-gpt56-retry-2",
    };
    writeJson(
      root,
      "artifacts/live/live-capture-attempts/live-gpt56-retry-2.json",
      unknown,
    );
    expect(verifyLocalLiveEvidenceProof(root)).toBe(false);
  });

  it("rejects a second completed receipt even when both registered attempt IDs are used", async () => {
    const { root, localReceiptPath } = await makeVerifiedLocalTree();
    const duplicate = {
      ...(JSON.parse(readFileSync(localReceiptPath, "utf8")) as Record<string, unknown>),
      attemptId: LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
    };
    writeJson(
      root,
      `artifacts/live/live-capture-attempts/${LIVE_RED_SAIL_RETRY_ATTEMPT_ID}.json`,
      duplicate,
    );
    expect(verifyLocalLiveEvidenceProof(root)).toBe(false);
  });

  it("rejects retry proof with an unresolved recovery sentinel or capture lock", async () => {
    const pending = await makeVerifiedLocalTree("retry");
    writeJson(
      pending.root,
      `artifacts/live/live-capture-attempts/${LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID}.pending.json`,
      { recovery: true },
    );
    expect(verifyLocalLiveEvidenceProof(pending.root)).toBe(false);

    const locked = await makeVerifiedLocalTree("retry");
    writeJson(locked.root, "artifacts/live/live-capture.lock.json", { locked: true });
    expect(verifyLocalLiveEvidenceProof(locked.root)).toBe(false);
  });

  it("rejects a missing private raw run", async () => {
    const { root, rawPath } = await makeVerifiedLocalTree();
    rmSync(rawPath);
    expect(verifyLocalLiveEvidenceProof(root)).toBe(false);
  });

  it("rejects raw result bytes that no longer reproduce the public evidence", async () => {
    const { root, rawPath } = await makeVerifiedLocalTree();
    const raw = JSON.parse(readFileSync(rawPath, "utf8")) as {
      modelOutcome: { draft: { narrative: string } };
    };
    raw.modelOutcome.draft.narrative += " Tampered after capture.";
    writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
    expect(verifyLocalLiveEvidenceProof(root)).toBe(false);
  });

  it("rejects tracked private proof and symlinked attempt receipts", async () => {
    const tracked = await makeVerifiedLocalTree();
    git(tracked.root, ["add", "-f", "artifacts/live/live-run.json"]);
    git(tracked.root, ["commit", "-m", "incorrectly track raw evidence"]);
    expect(verifyLocalLiveEvidenceProof(tracked.root)).toBe(false);

    const linked = await makeVerifiedLocalTree();
    const receiptSource = readFileSync(linked.localReceiptPath, "utf8");
    const external = resolve(linked.root, "external-receipt.json");
    writeFileSync(external, receiptSource, "utf8");
    rmSync(linked.localReceiptPath);
    symlinkSync(external, linked.localReceiptPath);
    expect(verifyLocalLiveEvidenceProof(linked.root)).toBe(false);
  });

  it("rejects a symlinked or unignored primary receipt in a retry chain", async () => {
    const linked = await makeVerifiedLocalTree("retry");
    const primarySource = readFileSync(linked.primaryReceiptPath, "utf8");
    const external = resolve(linked.root, "external-primary-receipt.json");
    writeFileSync(external, primarySource, "utf8");
    rmSync(linked.primaryReceiptPath);
    symlinkSync(external, linked.primaryReceiptPath);
    expect(verifyLocalLiveEvidenceProof(linked.root)).toBe(false);

    const unignored = await makeVerifiedLocalTree("retry");
    writeFileSync(
      resolve(unignored.root, ".gitignore"),
      [
        "artifacts/live/*",
        "!artifacts/live/live-capture-attempts/",
        "artifacts/live/live-capture-attempts/*",
        `!artifacts/live/live-capture-attempts/${LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID}.json`,
        "",
      ].join("\n"),
      "utf8",
    );
    expect(verifyLocalLiveEvidenceProof(unignored.root)).toBe(false);
  });
});

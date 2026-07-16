import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import {
  LivePreflightError,
  REGISTERED_LIVE_APPROVAL_LOCATOR,
  REGISTERED_LIVE_ATTEMPT_ID,
  REGISTERED_LIVE_HASHES,
  REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR,
  REGISTERED_LIVE_RETRY_ATTEMPT_ID,
  preflightLiveEvidence,
} from "@/src/evidence/live-preflight";
import { buildLiveCaptureApproval } from "@/src/evidence/live-capture-approval";
import { LiveCaptureAttemptReceiptSchema } from "@/src/evidence/live-capture-contracts";
import { LIVE_RED_SAIL_REQUEST_SHA256 } from "@/src/evidence/live-scenario-contract";
import { getLiveEvidenceCapturePaths } from "@/scripts/capture-live-evidence";
import {
  formatLivePreflightFailure,
  isDirectExecution,
  parseLivePreflightArgs,
  runLivePreflightCli,
} from "@/scripts/preflight-live-evidence";

const roots: string[] = [];
const apiKeyName = ["OPENAI", "API", "KEY"].join("_");
const secret = ["sk", "live", "preflight", "never", "print", "this"].join("-");
const liveEnv = {
  ENABLE_OPENAI_LIVE: "true",
  [apiKeyName]: secret,
  OPENAI_MODEL: "gpt-5.6",
  OPENAI_REASONING_EFFORT: "medium",
} as const;
const registeredLoaders = {
  loadWorldPack: loadDemoWorldPack,
  loadOverlay: loadOverlayFixture,
  loadSnapshot: loadSnapshotFixture,
};

const git = (root: string, args: string[]): void => {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git failed: ${result.stderr}`);
  }
};

const makeRoot = async (ignoreSource = "artifacts/live/\n"): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "live-preflight-"));
  roots.push(root);
  git(root, ["init", "--quiet"]);
  await writeFile(path.join(root, ".gitignore"), ignoreSource, "utf8");
  await mkdir(path.join(root, "artifacts", "live"), { recursive: true });
  await writeFile(
    path.join(root, REGISTERED_LIVE_APPROVAL_LOCATOR),
    `${JSON.stringify(buildLiveCaptureApproval(REGISTERED_LIVE_ATTEMPT_ID))}\n`,
    "utf8",
  );
  return root;
};

const retryablePrimaryReceipt = () =>
  LiveCaptureAttemptReceiptSchema.parse({
    schemaVersion: 1,
    evidenceType: "live_capture_attempt",
    attemptId: REGISTERED_LIVE_ATTEMPT_ID,
    requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
    dispatchedAt: "2026-07-15T00:00:00.000Z",
    finishedAt: "2026-07-15T00:00:01.000Z",
    requestedModel: "gpt-5.6",
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
  });

const writeRetryPrerequisites = async (
  root: string,
  receipt: unknown = retryablePrimaryReceipt(),
): Promise<void> => {
  await writeFile(
    path.join(root, REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR),
    `${JSON.stringify(buildLiveCaptureApproval(REGISTERED_LIVE_RETRY_ATTEMPT_ID))}\n`,
    "utf8",
  );
  const primaryPaths = getLiveEvidenceCapturePaths(root, REGISTERED_LIVE_ATTEMPT_ID);
  await mkdir(primaryPaths.attemptDirectory, { recursive: true });
  await writeFile(
    primaryPaths.attemptReceiptPath,
    `${JSON.stringify(receipt)}\n`,
    "utf8",
  );
};

const makeRetryRoot = async (): Promise<string> => {
  const root = await makeRoot();
  await writeRetryPrerequisites(root);
  return root;
};

const expectCode = async (
  promise: Promise<unknown>,
  code: LivePreflightError["code"],
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({ code });
};

const preflightAt = (root: string, env = liveEnv) =>
  preflightLiveEvidence({ root, env, loaders: registeredLoaders });

const retryPreflightAt = (root: string, env = liveEnv) =>
  preflightLiveEvidence({
    root,
    env,
    loaders: registeredLoaders,
    mode: "retry",
  });

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("live evidence preflight", () => {
  it("requires one exact ignored creator approval before dispatch", async () => {
    const missingRoot = await makeRoot();
    await rm(path.join(missingRoot, REGISTERED_LIVE_APPROVAL_LOCATOR));
    await expectCode(preflightAt(missingRoot), "approval_missing");

    const invalidRoot = await makeRoot();
    await writeFile(
      path.join(invalidRoot, REGISTERED_LIVE_APPROVAL_LOCATOR),
      `${JSON.stringify({
        ...buildLiveCaptureApproval(REGISTERED_LIVE_ATTEMPT_ID),
        approved: false,
      })}\n`,
      "utf8",
    );
    await expectCode(preflightAt(invalidRoot), "approval_invalid");
  });

  it("returns only public-safe readiness metadata for the exact registered input", async () => {
    const root = await makeRoot();
    const report = await preflightAt(root);

    expect(report).toEqual({
      schemaVersion: 1,
      evidenceType: "live_capture_preflight",
      ready: true,
      mode: "primary",
      attemptId: REGISTERED_LIVE_ATTEMPT_ID,
      liveEnabled: true,
      apiKeyPresent: true,
      model: "gpt-5.6",
      reasoningEffort: "medium",
      maxOutputTokens: 4096,
      hashes: REGISTERED_LIVE_HASHES,
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toMatch(/brief|participantIntents|controlledEntityIds/i);
  });

  it.each([
    { ENABLE_OPENAI_LIVE: "false", [apiKeyName]: secret },
    { ENABLE_OPENAI_LIVE: "true" },
    { ...liveEnv, OPENAI_MODEL: "gpt-5.5" },
    { ...liveEnv, OPENAI_MODEL: "gpt-5.6-/private/path" },
    { ...liveEnv, OPENAI_REASONING_EFFORT: "high" },
    { ...liveEnv, OPENAI_REASONING_EFFORT: "extreme" },
  ])("fails closed for invalid configuration", async (env) => {
    const root = await makeRoot();
    await expectCode(
      preflightLiveEvidence({ root, env, loaders: registeredLoaders }),
      "configuration_invalid",
    );
  });

  it("rejects schema-valid drift from the registered World Pack hash", async () => {
    const root = await makeRoot();
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const changedWorld = {
      ...worldPack,
      meta: { ...worldPack.meta, title: `${worldPack.meta.title} drift` },
    };

    await expectCode(
      preflightLiveEvidence({
        root,
        env: liveEnv,
        loaders: {
          loadWorldPack: async () => changedWorld,
          loadOverlay: async () => overlay,
          loadSnapshot: async () => snapshot,
        },
      }),
      "registered_hash_mismatch",
    );
  });

  it.each([
    "rawPath",
    "publicPath",
    "lockPath",
    "attemptRecoveryPath",
    "attemptReceiptPath",
  ] as const)("rejects an existing %s before dispatch", async (targetName) => {
    const root = await makeRoot();
    const target = getLiveEvidenceCapturePaths(root, REGISTERED_LIVE_ATTEMPT_ID)[targetName];
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "reserved\n", "utf8");

    await expectCode(
      preflightAt(root),
      "capture_target_exists",
    );
  });

  it("requires every private target to be ignored and the public target not to be ignored", async () => {
    const privateUnsafeRoot = await makeRoot(
      "artifacts/live/live-capture-approval.json\nartifacts/live/live-run.json\n",
    );
    await expectCode(
      preflightAt(privateUnsafeRoot),
      "private_path_not_ignored",
    );

    const publicIgnoredRoot = await makeRoot(
      "artifacts/live/\nartifacts/evidence/live-sanitized.json\n",
    );
    await expectCode(
      preflightAt(publicIgnoredRoot),
      "public_path_ignored",
    );
  });

  it("rejects symlinked capture ancestors and non-root repository paths", async () => {
    const root = await makeRoot();
    const external = await mkdtemp(resolve(tmpdir(), "live-preflight-external-"));
    roots.push(external);
    await symlink(external, path.join(root, "artifacts", "evidence"));
    await expectCode(
      preflightAt(root),
      "capture_path_unsafe",
    );

    const nested = path.join(root, "nested");
    await mkdir(nested);
    await expectCode(
      preflightAt(nested),
      "repository_root_invalid",
    );
  });

  it("treats a dangling canonical target symlink as an existing target", async () => {
    const root = await makeRoot();
    const paths = getLiveEvidenceCapturePaths(root, REGISTERED_LIVE_ATTEMPT_ID);
    await mkdir(path.dirname(paths.rawPath), { recursive: true });
    await symlink(path.join(root, "missing-target"), paths.rawPath);
    await expectCode(preflightAt(root), "capture_target_exists");
  });
});

describe("live evidence retry preflight", () => {
  it("opens exactly retry-1 for the same registered request after a retryable primary failure", async () => {
    const root = await makeRetryRoot();
    const report = await retryPreflightAt(root);

    expect(report).toMatchObject({
      ready: true,
      mode: "retry",
      attemptId: REGISTERED_LIVE_RETRY_ATTEMPT_ID,
      hashes: { requestSha256: LIVE_RED_SAIL_REQUEST_SHA256 },
    });
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain(root);
  });

  it("requires a separate exact ignored retry approval", async () => {
    const missingRoot = await makeRetryRoot();
    await rm(path.join(missingRoot, REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR));
    await expectCode(retryPreflightAt(missingRoot), "retry_approval_missing");

    const invalidRoot = await makeRetryRoot();
    await writeFile(
      path.join(invalidRoot, REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR),
      `${JSON.stringify(buildLiveCaptureApproval(REGISTERED_LIVE_ATTEMPT_ID))}\n`,
      "utf8",
    );
    await expectCode(retryPreflightAt(invalidRoot), "retry_approval_invalid");

    const publicRoot = await makeRoot(
      [
        REGISTERED_LIVE_APPROVAL_LOCATOR,
        "artifacts/live/live-capture-attempts/",
      ]
        .map((locator) => `${locator}\n`)
        .join(""),
    );
    await writeRetryPrerequisites(publicRoot);
    await expectCode(retryPreflightAt(publicRoot), "retry_approval_invalid");
  });

  it("requires one ignored regular primary receipt", async () => {
    const missingRoot = await makeRoot();
    await writeFile(
      path.join(missingRoot, REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR),
      `${JSON.stringify(buildLiveCaptureApproval(REGISTERED_LIVE_RETRY_ATTEMPT_ID))}\n`,
      "utf8",
    );
    await expectCode(retryPreflightAt(missingRoot), "retry_receipt_missing");

    const publicReceiptRoot = await makeRoot(
      `${REGISTERED_LIVE_APPROVAL_LOCATOR}\n${REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR}\n`,
    );
    await writeRetryPrerequisites(publicReceiptRoot);
    await expectCode(
      retryPreflightAt(publicReceiptRoot),
      "retry_receipt_invalid",
    );
  });

  it.each([
    ["wrong request hash", { requestSha256: "f".repeat(64) }],
    ["wrong attempt", { attemptId: REGISTERED_LIVE_RETRY_ATTEMPT_ID }],
    ["nonretryable failure", { retryable: false }],
    ["unknown retryability", { retryable: null }],
    ["untyped failure outcome", { captureOutcome: "run_threw" }],
    ["completed model outcome", { modelOutcome: "completed" }],
    ["partial raw persistence", { rawPersisted: true }],
    ["partial public persistence", { publicPersisted: true }],
    ["derived sanitized material", { sanitizedEvidenceSha256: "e".repeat(64) }],
    [
      "successful persistence",
      {
        modelOutcome: "completed",
        captureOutcome: "persisted",
        retryable: true,
        rawPersisted: true,
        publicPersisted: true,
      },
    ],
  ])("rejects a primary receipt with %s", async (_label, override) => {
    const root = await makeRoot();
    await writeRetryPrerequisites(root, {
      ...retryablePrimaryReceipt(),
      ...override,
    });
    await expectCode(retryPreflightAt(root), "retry_receipt_invalid");
  });

  it("rejects symlinked retry approval and receipt files", async () => {
    const approvalRoot = await makeRoot();
    const externalApproval = await mkdtemp(
      resolve(tmpdir(), "live-retry-approval-external-"),
    );
    roots.push(externalApproval);
    const externalApprovalPath = path.join(externalApproval, "approval.json");
    await writeFile(
      externalApprovalPath,
      `${JSON.stringify(buildLiveCaptureApproval(REGISTERED_LIVE_RETRY_ATTEMPT_ID))}\n`,
      "utf8",
    );
    await symlink(
      externalApprovalPath,
      path.join(approvalRoot, REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR),
    );
    await expectCode(retryPreflightAt(approvalRoot), "retry_approval_invalid");

    const receiptRoot = await makeRoot();
    await writeFile(
      path.join(receiptRoot, REGISTERED_LIVE_RETRY_APPROVAL_LOCATOR),
      `${JSON.stringify(buildLiveCaptureApproval(REGISTERED_LIVE_RETRY_ATTEMPT_ID))}\n`,
      "utf8",
    );
    const primaryPaths = getLiveEvidenceCapturePaths(
      receiptRoot,
      REGISTERED_LIVE_ATTEMPT_ID,
    );
    await mkdir(primaryPaths.attemptDirectory, { recursive: true });
    const externalReceipt = path.join(externalApproval, "receipt.json");
    await writeFile(
      externalReceipt,
      `${JSON.stringify(retryablePrimaryReceipt())}\n`,
      "utf8",
    );
    await symlink(externalReceipt, primaryPaths.attemptReceiptPath);
    await expectCode(retryPreflightAt(receiptRoot), "retry_receipt_invalid");
  });

  it.each(["rawPath", "publicPath", "lockPath", "attemptRecoveryPath", "attemptReceiptPath"] as const)(
    "rejects retry when %s already exists",
    async (targetName) => {
      const root = await makeRetryRoot();
      const target = getLiveEvidenceCapturePaths(
        root,
        REGISTERED_LIVE_RETRY_ATTEMPT_ID,
      )[targetName];
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "reserved\n", "utf8");
      await expectCode(retryPreflightAt(root), "capture_target_exists");
    },
  );

  it("rejects retry while the primary recovery sentinel still exists", async () => {
    const root = await makeRetryRoot();
    const primaryPaths = getLiveEvidenceCapturePaths(
      root,
      REGISTERED_LIVE_ATTEMPT_ID,
    );
    await writeFile(primaryPaths.attemptRecoveryPath, "reserved\n", "utf8");
    await expectCode(retryPreflightAt(root), "retry_receipt_invalid");
  });

  it("leaves the primary receipt immutable while checking retry eligibility", async () => {
    const root = await makeRetryRoot();
    const receiptPath = getLiveEvidenceCapturePaths(
      root,
      REGISTERED_LIVE_ATTEMPT_ID,
    ).attemptReceiptPath;
    const before = await readFile(receiptPath, "utf8");
    await retryPreflightAt(root);
    expect(await readFile(receiptPath, "utf8")).toBe(before);
  });
});

describe("live preflight CLI", () => {
  it("accepts only no flag for primary or one explicit --retry flag", () => {
    expect(parseLivePreflightArgs([])).toBe("primary");
    expect(parseLivePreflightArgs(["--retry"])).toBe("retry");
    for (const args of [["--primary"], ["--retry", "--retry"], ["retry"]]) {
      expect(() => parseLivePreflightArgs(args)).toThrow("arguments_invalid");
    }
  });

  it("is import-safe and emits exactly one prose-free JSON line", async () => {
    const modulePath = resolve("scripts/preflight-live-evidence.ts");
    expect(isDirectExecution(pathToFileURL(modulePath).href, modulePath)).toBe(true);
    expect(
      isDirectExecution(pathToFileURL(modulePath).href, resolve("tests/fake-entry.ts")),
    ).toBe(false);

    const root = await makeRoot();
    let stdout = "";
    let stderr = "";
    const exitCode = await runLivePreflightCli({
      root,
      env: liveEnv,
      loaders: registeredLoaders,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout.split("\n")).toHaveLength(2);
    expect(JSON.parse(stdout)).toMatchObject({
      ready: true,
      mode: "primary",
      attemptId: REGISTERED_LIVE_ATTEMPT_ID,
      model: "gpt-5.6",
    });
    expect(stdout).not.toContain(secret);
    expect(stdout).not.toContain(root);
  });

  it("emits the fixed retry attempt only after retry prerequisites pass", async () => {
    const root = await makeRetryRoot();
    let stdout = "";
    let stderr = "";
    const exitCode = await runLivePreflightCli({
      args: ["--retry"],
      root,
      env: liveEnv,
      loaders: registeredLoaders,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      ready: true,
      mode: "retry",
      attemptId: REGISTERED_LIVE_RETRY_ATTEMPT_ID,
      hashes: { requestSha256: LIVE_RED_SAIL_REQUEST_SHA256 },
    });
    expect(stdout).not.toContain(secret);
    expect(stdout).not.toContain(root);
  });

  it("redacts failure details to one stable JSON code", async () => {
    const root = await makeRoot();
    let stdout = "";
    let stderr = "";
    const exitCode = await runLivePreflightCli({
      root,
      env: { ENABLE_OPENAI_LIVE: "true", OPENAI_API_KEY: "" },
      loaders: registeredLoaders,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(formatLivePreflightFailure("configuration_invalid"));
    expect(stderr).not.toContain(root);
    expect(stderr).not.toContain(secret);
  });

  it("redacts invalid retry CLI arguments without touching the repository", async () => {
    const root = await makeRoot();
    let stdout = "";
    let stderr = "";
    const exitCode = await runLivePreflightCli({
      args: ["--retry", secret, root],
      root,
      env: liveEnv,
      loaders: registeredLoaders,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(formatLivePreflightFailure("arguments_invalid"));
    expect(stderr).not.toContain(secret);
    expect(stderr).not.toContain(root);
  });
});

import { createHash } from "node:crypto";
import {
  access,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LiveCaptureCliError,
  LiveEvidenceCaptureError,
  LiveEvidenceTypedRunError,
  captureLiveEvidence,
  captureRegisteredLiveEvidence,
  executeRegisteredLiveCapture,
  getLiveEvidenceCapturePaths,
  isDirectExecution,
  parseLiveCaptureArgs,
  runLiveCaptureCli,
} from "@/scripts/capture-live-evidence";
import { loadRegisteredLiveInput } from "@/src/evidence/live-preflight";
import {
  LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  LIVE_RED_SAIL_WORLD_PACK_SHA256,
} from "@/src/evidence/live-scenario-contract";

type CaptureOptions = Parameters<typeof captureLiveEvidence>[0];
type RunResult = Awaited<ReturnType<CaptureOptions["run"]>>;

const roots: string[] = [];
const apiKeyName = ["OPENAI", "API", "KEY"].join("_");
const privateCliSecret = ["private", "cli", "secret"].join("-");
const liveEnv = {
  ENABLE_OPENAI_LIVE: "true",
  OPENAI_API_KEY: "test-key",
  OPENAI_MODEL: "gpt-5.6",
} as const;
const now = () => "2026-07-15T00:00:00.000Z";
const request = {
  modelMode: "live",
  brief: "private request prose",
} as unknown as CaptureOptions["request"];
const sanitized = {
  schemaVersion: 1,
  evidenceType: "live_sanitized",
  marker: "public hashes only",
} as unknown as ReturnType<NonNullable<CaptureOptions["sanitize"]>>;
const sanitizeMock = vi.fn(() => sanitized);
const sanitize = sanitizeMock as unknown as NonNullable<CaptureOptions["sanitize"]>;

const completedResult = {
  status: "passed",
  modelOutcome: {
    outcome: "completed",
    draft: { narrative: "private generated prose" },
    trace: {
      mode: "live",
      outcome: "completed",
      requestedModel: "gpt-5.6",
      actualModel: "gpt-5.6-test",
      responseId: "resp_private_identity",
      inputTokens: 42,
      outputTokens: 17,
    },
  },
} as unknown as RunResult;

const typedFailureResult = {
  status: "error",
  modelOutcome: {
    outcome: "timeout",
    error: {
      code: "openai_timeout",
      message: "private upstream prose must not enter the receipt",
      retryable: true,
    },
    trace: {
      mode: "live",
      outcome: "timeout",
      requestedModel: "gpt-5.6",
      actualModel: null,
      responseId: null,
      inputTokens: null,
      outputTokens: null,
    },
  },
} as unknown as RunResult;

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(resolve(tmpdir(), "live-evidence-capture-"));
  roots.push(root);
  return root;
};

const options = (
  root: string,
  attemptId: string,
  run: CaptureOptions["run"],
): CaptureOptions => ({
  root,
  env: liveEnv,
  request,
  worldPackId: "world.test",
  worldPackSha256: "a".repeat(64),
  run,
  attemptId,
  now,
  sanitize,
});

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

afterEach(async () => {
  sanitizeMock.mockClear();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("live evidence capture", () => {
  it("rejects an unregistered paid-capture authority before dispatch", async () => {
    const root = await makeRoot();
    const run = vi.fn(async () => completedResult);

    await expect(
      captureRegisteredLiveEvidence({
        root,
        env: liveEnv,
        request,
        worldPackId: "world.test",
        worldPackSha256: "a".repeat(64),
        run,
        now,
      }),
    ).rejects.toMatchObject({ code: "live_registered_authority_mismatch" });
    expect(run).not.toHaveBeenCalled();
  });

  it("is import-safe and only recognizes the actual module entrypoint", () => {
    const modulePath = resolve("scripts/capture-live-evidence.ts");
    expect(isDirectExecution(pathToFileURL(modulePath).href, modulePath)).toBe(true);
    expect(
      isDirectExecution(pathToFileURL(modulePath).href, resolve("tests/fake-entry.ts")),
    ).toBe(false);
  });

  it.each([
    ["primary", LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID],
    ["retry", LIVE_RED_SAIL_RETRY_ATTEMPT_ID],
  ] as const)(
    "binds registered %s capture to its fixed attempt and identical request hash",
    async (mode, attemptId) => {
      const root = await makeRoot();
      const registered = await loadRegisteredLiveInput();
      await expect(
        captureRegisteredLiveEvidence({
          root,
          env: liveEnv,
          request: registered.request,
          worldPackId: LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.id,
          worldPackSha256: LIVE_RED_SAIL_WORLD_PACK_SHA256,
          run: vi.fn(async () => typedFailureResult),
          now,
          mode,
        }),
      ).rejects.toBeInstanceOf(LiveEvidenceTypedRunError);

      const selectedPaths = getLiveEvidenceCapturePaths(root, attemptId);
      const receipt = JSON.parse(
        await readFile(selectedPaths.attemptReceiptPath, "utf8"),
      ) as Record<string, unknown>;
      expect(receipt).toMatchObject({
        attemptId,
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
        captureOutcome: "typed_failure",
        retryable: true,
        rawPersisted: false,
        publicPersisted: false,
      });
      const otherAttemptId =
        mode === "primary"
          ? LIVE_RED_SAIL_RETRY_ATTEMPT_ID
          : LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID;
      expect(
        await exists(
          getLiveEvidenceCapturePaths(root, otherAttemptId).attemptReceiptPath,
        ),
      ).toBe(false);
    },
  );

  it("keeps the preregistered semantic sanitizer on retry capture", async () => {
    const root = await makeRoot();
    const registered = await loadRegisteredLiveInput();
    await expect(
      captureRegisteredLiveEvidence({
        root,
        env: liveEnv,
        request: registered.request,
        worldPackId: LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.id,
        worldPackSha256: LIVE_RED_SAIL_WORLD_PACK_SHA256,
        run: vi.fn(async () => completedResult),
        now,
        mode: "retry",
      }),
    ).rejects.toMatchObject({ code: "live_evidence_sanitization_failed" });

    const retryPaths = getLiveEvidenceCapturePaths(
      root,
      LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
    );
    expect(await exists(retryPaths.rawPath)).toBe(false);
    expect(await exists(retryPaths.publicPath)).toBe(false);
    expect(
      JSON.parse(await readFile(retryPaths.attemptReceiptPath, "utf8")),
    ).toMatchObject({
      attemptId: LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      captureOutcome: "sanitization_failed",
      retryable: null,
    });
  });

  it("prevalidates configuration and completed outputs before lock or dispatch", async () => {
    const root = await makeRoot();
    const run = vi.fn(async () => completedResult);
    const paths = getLiveEvidenceCapturePaths(root, "attempt-existing");

    await expect(
      captureLiveEvidence({
        ...options(root, "attempt-invalid-config", run),
        env: { ENABLE_OPENAI_LIVE: "true" },
      }),
    ).rejects.toThrow("OPENAI_API_KEY");
    expect(run).not.toHaveBeenCalled();
    expect(await exists(paths.lockPath)).toBe(false);

    await mkdir(paths.rawDirectory, { recursive: true });
    await writeFile(paths.rawPath, "completed-raw", "utf8");
    await expect(captureLiveEvidence(options(root, "attempt-existing", run))).rejects.toMatchObject({
      code: "live_evidence_already_exists",
    });
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(paths.rawPath, "utf8")).toBe("completed-raw");
    expect(await exists(paths.lockPath)).toBe(false);
  });

  it("records a prose-free typed failure, releases the lock, and permits an explicit retry", async () => {
    const root = await makeRoot();
    const firstPaths = getLiveEvidenceCapturePaths(root, "attempt-one");
    const firstRun = vi.fn(async () => {
      expect(await exists(firstPaths.lockPath)).toBe(true);
      return typedFailureResult;
    });

    await expect(
      captureLiveEvidence(options(root, "attempt-one", firstRun)),
    ).rejects.toBeInstanceOf(LiveEvidenceTypedRunError);
    expect(await exists(firstPaths.lockPath)).toBe(false);
    expect(await exists(firstPaths.attemptRecoveryPath)).toBe(false);
    expect(await exists(firstPaths.rawPath)).toBe(false);
    expect(await exists(firstPaths.publicPath)).toBe(false);

    const failedReceiptSource = await readFile(firstPaths.attemptReceiptPath, "utf8");
    const failedReceipt = JSON.parse(failedReceiptSource) as Record<string, unknown>;
    expect(failedReceipt).toMatchObject({
      modelOutcome: "timeout",
      captureOutcome: "typed_failure",
      errorCode: "openai_timeout",
      retryable: true,
      rawPersisted: false,
      publicPersisted: false,
    });
    expect(failedReceiptSource).not.toContain("private upstream prose");
    expect(failedReceiptSource).not.toContain("private request prose");
    expect(firstPaths.attemptReceiptPath.startsWith(firstPaths.rawDirectory)).toBe(true);

    const retry = await captureLiveEvidence(
      options(root, "attempt-two", vi.fn(async () => completedResult)),
    );
    expect(retry.receipt).toMatchObject({
      modelOutcome: "completed",
      captureOutcome: "persisted",
      retryable: null,
      rawPersisted: true,
      publicPersisted: true,
    });
    expect(await exists(firstPaths.attemptReceiptPath)).toBe(true);
    expect(
      (await readdir(firstPaths.attemptDirectory)).filter((name) => name.endsWith(".json")),
    ).toEqual(["attempt-one.json", "attempt-two.json"]);
    const successReceiptSource = await readFile(retry.attemptReceiptPath, "utf8");
    expect(successReceiptSource).not.toContain("private generated prose");
    expect(successReceiptSource).not.toContain("resp_private_identity");
    expect(successReceiptSource).toContain(
      createHash("sha256").update("resp_private_identity").digest("hex"),
    );
  });

  it("publishes raw then sanitized evidence atomically and never replaces completion", async () => {
    const root = await makeRoot();
    const capture = await captureLiveEvidence(
      options(root, "attempt-success", vi.fn(async () => completedResult)),
    );
    const rawSource = await readFile(capture.rawPath, "utf8");
    const publicSource = await readFile(capture.publicPath, "utf8");
    expect(rawSource).toContain("private generated prose");
    expect(JSON.parse(publicSource)).toEqual(sanitized);

    const secondRun = vi.fn(async () => completedResult);
    await expect(
      captureLiveEvidence(options(root, "attempt-replace", secondRun)),
    ).rejects.toMatchObject({ code: "live_evidence_already_exists" });
    expect(secondRun).not.toHaveBeenCalled();
    expect(await readFile(capture.rawPath, "utf8")).toBe(rawSource);
    expect(await readFile(capture.publicPath, "utf8")).toBe(publicSource);
  });

  it("reports an active concurrent capture without leaking its lock path", async () => {
    const root = await makeRoot();
    let signalStarted: (() => void) | undefined;
    let releaseRun: (() => void) | undefined;
    const started = new Promise<void>((resolveStarted) => {
      signalStarted = resolveStarted;
    });
    const release = new Promise<void>((resolveRelease) => {
      releaseRun = resolveRelease;
    });
    const firstCapture = captureLiveEvidence(
      options(root, "attempt-active", async () => {
        signalStarted?.();
        await release;
        return typedFailureResult;
      }),
    ).catch((error: unknown) => error);
    await started;

    const secondError = await captureLiveEvidence(
      options(root, "attempt-concurrent", vi.fn(async () => completedResult)),
    ).catch((error: unknown) => error);
    expect(secondError).toMatchObject({ code: "live_capture_in_progress" });
    expect((secondError as Error).message).not.toContain(root);

    releaseRun?.();
    expect(await firstCapture).toBeInstanceOf(LiveEvidenceTypedRunError);
    expect(
      await exists(getLiveEvidenceCapturePaths(root, "attempt-active").lockPath),
    ).toBe(false);
  });

  it("rolls back a failed canonical pair, retains the ignored local receipt, and permits retry", async () => {
    const root = await makeRoot();
    const paths = getLiveEvidenceCapturePaths(root, "attempt-public-failure");
    const failingLink: typeof link = async (source, target) => {
      if (target.toString() === paths.publicPath) {
        throw Object.assign(new Error("simulated ordinary link failure"), {
          code: "EIO",
        });
      }
      await link(source, target);
    };
    const fileSystem = {
      access,
      link: failingLink,
      mkdir,
      rm,
      writeFile,
    };

    await expect(
      captureLiveEvidence({
        ...options(root, "attempt-public-failure", vi.fn(async () => completedResult)),
        fileSystem,
      }),
    ).rejects.toMatchObject({ code: "public_live_evidence_write_failed" });

    expect(await exists(paths.rawPath)).toBe(false);
    expect(await exists(paths.publicPath)).toBe(false);
    expect(await exists(paths.lockPath)).toBe(false);
    expect(await exists(paths.attemptRecoveryPath)).toBe(false);
    expect(
      (await readdir(paths.publicDirectory)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    const receiptSource = await readFile(paths.attemptReceiptPath, "utf8");
    expect(JSON.parse(receiptSource)).toMatchObject({
      modelOutcome: "completed",
      captureOutcome: "public_write_failed",
      errorCode: "public_live_evidence_write_failed",
      rawPersisted: false,
      publicPersisted: false,
    });
    expect(receiptSource).not.toContain("simulated ordinary link failure");

    const retryRun = vi.fn(async () => completedResult);
    await expect(
      captureLiveEvidence(options(root, "attempt-after-write-failure", retryRun)),
    ).resolves.toMatchObject({
      receipt: { captureOutcome: "persisted" },
    });
    expect(retryRun).toHaveBeenCalledTimes(1);
    expect(await exists(paths.rawPath)).toBe(true);
    expect(await exists(paths.publicPath)).toBe(true);
  });

  it("never clobbers a public target created in the preflight-to-publish race", async () => {
    const root = await makeRoot();
    const paths = getLiveEvidenceCapturePaths(root, "attempt-race");
    const raceWinner = "independent canonical evidence\n";
    const racingLink: typeof link = async (source, target) => {
      if (target.toString() === paths.publicPath) {
        await writeFile(target, raceWinner, { encoding: "utf8", flag: "wx" });
      }
      await link(source, target);
    };

    await expect(
      captureLiveEvidence({
        ...options(root, "attempt-race", vi.fn(async () => completedResult)),
        fileSystem: {
          access,
          link: racingLink,
          mkdir,
          rm,
          writeFile,
        },
      }),
    ).rejects.toMatchObject({ code: "public_live_evidence_target_exists" });

    expect(await readFile(paths.publicPath, "utf8")).toBe(raceWinner);
    expect(await exists(paths.rawPath)).toBe(false);
    expect(await exists(paths.lockPath)).toBe(false);
    expect(
      (await readdir(paths.publicDirectory)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    const receiptSource = await readFile(paths.attemptReceiptPath, "utf8");
    expect(JSON.parse(receiptSource)).toMatchObject({
      modelOutcome: "completed",
      captureOutcome: "public_target_conflict",
      errorCode: "public_live_evidence_target_exists",
      rawPersisted: false,
      publicPersisted: false,
    });
    expect(await readFile(paths.publicPath, "utf8")).not.toContain(
      "private generated prose",
    );
    expect(receiptSource).not.toContain("private generated prose");
    expect(receiptSource).not.toContain("private request prose");
  });

  it.each([
    ["completed success", completedResult, true],
    ["typed failure", typedFailureResult, false],
  ])(
    "keeps a prose-free recovery sentinel and lock when the %s receipt cannot be written",
    async (_label, runResult, expectCanonicalPair) => {
      const root = await makeRoot();
      const attemptId = expectCanonicalPair
        ? "attempt-receipt-failed-success"
        : "attempt-receipt-failed-typed";
      const paths = getLiveEvidenceCapturePaths(root, attemptId);
      const receiptFailingLink: typeof link = async (source, target) => {
        if (target.toString() === paths.attemptReceiptPath) {
          throw Object.assign(new Error("simulated receipt persistence failure"), {
            code: "EIO",
          });
        }
        await link(source, target);
      };

      await expect(
        captureLiveEvidence({
          ...options(root, attemptId, vi.fn(async () => runResult)),
          fileSystem: {
            access,
            link: receiptFailingLink,
            mkdir,
            rm,
            writeFile,
          },
        }),
      ).rejects.toMatchObject({ code: "live_attempt_receipt_write_failed" });

      expect(await exists(paths.attemptReceiptPath)).toBe(false);
      expect(await exists(paths.attemptRecoveryPath)).toBe(true);
      expect(await exists(paths.lockPath)).toBe(true);
      expect(await exists(paths.rawPath)).toBe(expectCanonicalPair);
      expect(await exists(paths.publicPath)).toBe(expectCanonicalPair);
      const recoverySource = await readFile(paths.attemptRecoveryPath, "utf8");
      expect(JSON.parse(recoverySource)).toMatchObject({
        evidenceType: "live_capture_recovery",
        attemptId,
        state: "dispatch_reserved",
      });
      expect(recoverySource).not.toContain("private request prose");
      expect(recoverySource).not.toContain("private generated prose");
      expect(recoverySource).not.toContain("private upstream prose");
      expect(recoverySource).not.toContain("simulated receipt persistence failure");
    },
  );
});

describe("registered live capture CLI", () => {
  it("accepts only no flag for primary or one explicit --retry flag", () => {
    expect(parseLiveCaptureArgs([])).toBe("primary");
    expect(parseLiveCaptureArgs(["--retry"])).toBe("retry");
    for (const args of [["--primary"], ["--retry", "--retry"], ["retry"]]) {
      expect(() => parseLiveCaptureArgs(args)).toThrow(LiveCaptureCliError);
    }
  });

  it.each([
    [[], "primary", LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID],
    [["--retry"], "retry", LIVE_RED_SAIL_RETRY_ATTEMPT_ID],
  ] as const)(
    "dispatches %j once and emits one stable path-free line",
    async (args, mode, attemptId) => {
      const root = await makeRoot();
      const execute = vi.fn(async () => undefined);
      const cliEnv = { ...liveEnv, [apiKeyName]: privateCliSecret };
      let stdout = "";
      let stderr = "";
      const exitCode = await runLiveCaptureCli({
        args,
        root,
        env: cliEnv,
        execute,
        stdout: { write: (value) => ((stdout += String(value)), true) },
        stderr: { write: (value) => ((stderr += String(value)), true) },
      });

      expect(exitCode).toBe(0);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith({
        root,
        env: cliEnv,
        mode,
      });
      expect(stderr).toBe("");
      expect(stdout).toBe(
        `${JSON.stringify({ schemaVersion: 1, evidenceType: "live_capture", captured: true, mode, attemptId })}\n`,
      );
      expect(stdout).not.toContain(root);
      expect(stdout).not.toContain(privateCliSecret);
    },
  );

  it("passes the same explicit retry mode through preflight and dispatch", async () => {
    const root = await makeRoot();
    const order: string[] = [];
    const preflight = vi.fn(async (input) => {
      order.push(`preflight:${input.mode}`);
    });
    const dispatch = vi.fn(async (input) => {
      order.push(`dispatch:${input.mode}`);
    });

    await executeRegisteredLiveCapture({
      root,
      env: liveEnv,
      mode: "retry",
      preflight,
      dispatch,
    });
    expect(order).toEqual(["preflight:retry", "dispatch:retry"]);
    expect(preflight).toHaveBeenCalledWith({ root, env: liveEnv, mode: "retry" });
    expect(dispatch).toHaveBeenCalledWith({ root, env: liveEnv, mode: "retry" });
  });

  it("does not dispatch or auto-retry after a failed preflight or capture", async () => {
    const root = await makeRoot();
    const dispatch = vi.fn(async () => undefined);
    await expect(
      executeRegisteredLiveCapture({
        root,
        env: liveEnv,
        mode: "retry",
        preflight: vi.fn(async () => {
          throw new LiveEvidenceCaptureError(
            "retry_receipt_invalid",
            "private receipt detail",
          );
        }),
        dispatch,
      }),
    ).rejects.toMatchObject({ code: "retry_receipt_invalid" });
    expect(dispatch).not.toHaveBeenCalled();

    const execute = vi.fn(async () => {
      throw new LiveEvidenceCaptureError(
        "live_model_typed_failure",
        "private upstream detail",
      );
    });
    let stdout = "";
    let stderr = "";
    const exitCode = await runLiveCaptureCli({
      args: ["--retry"],
      root,
      env: liveEnv,
      execute,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });
    expect(exitCode).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      `${JSON.stringify({ schemaVersion: 1, evidenceType: "live_capture", captured: false, code: "live_model_typed_failure" })}\n`,
    );
    expect(stderr).not.toContain(root);
    expect(stderr).not.toContain("private upstream detail");
  });

  it("rejects invalid arguments before execution and redacts their values", async () => {
    const root = await makeRoot();
    const execute = vi.fn(async () => undefined);
    let stdout = "";
    let stderr = "";
    const privateArgument = `sk-proj-${"x".repeat(32)}`;
    const exitCode = await runLiveCaptureCli({
      args: ["--retry", privateArgument, root],
      root,
      env: liveEnv,
      execute,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });
    expect(exitCode).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(stdout).toBe("");
    expect(stderr).toBe(
      `${JSON.stringify({ schemaVersion: 1, evidenceType: "live_capture", captured: false, code: "arguments_invalid" })}\n`,
    );
    expect(stderr).not.toContain(privateArgument);
    expect(stderr).not.toContain(root);
  });

  it("maps an unregistered internal error code to one stable fallback", async () => {
    const root = await makeRoot();
    const privateCode = ["private", "implementation", "detail"].join("_");
    let stdout = "";
    let stderr = "";
    const exitCode = await runLiveCaptureCli({
      root,
      env: liveEnv,
      execute: vi.fn(async () => {
        throw new LiveEvidenceCaptureError(privateCode, "private message");
      }),
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      `${JSON.stringify({ schemaVersion: 1, evidenceType: "live_capture", captured: false, code: "unexpected_failure" })}\n`,
    );
    expect(stderr).not.toContain(privateCode);
    expect(stderr).not.toContain("private message");
    expect(stderr).not.toContain(root);
  });
});

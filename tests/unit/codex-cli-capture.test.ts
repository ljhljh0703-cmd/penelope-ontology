import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCodexCliAuthorityBundle,
  type CodexCliAuthorityBundle,
} from "@/src/adapters/codex-cli/authority";
import { CODEX_CLI_COMMAND_ENV } from "@/src/adapters/codex-cli/command";
import { CodexCliCaptureReceiptSchema } from "@/src/adapters/codex-cli/capture-contracts";
import {
  CODEX_CLI_PRIMARY_ATTEMPT_ID,
  CODEX_CLI_RETRY_ATTEMPT_ID,
  getCodexCliCaptureAttempt,
} from "@/src/adapters/codex-cli/attempt";
import type { CodexCliProcessRunner } from "@/src/adapters/codex-cli/process-runner";
import {
  CodexCliSanitizedEvidenceSchema,
} from "@/src/adapters/codex-cli/red-sail-evidence";
import {
  getCodexCliCapturePaths,
  loadRegisteredCodexCliInput,
  preflightCodexCliEvidence,
  type CodexCliInspection,
} from "@/src/adapters/codex-cli/preflight";
import { ModelDraftSchema } from "@/src/contracts/model-draft";
import {
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
} from "@/src/evidence/live-scenario-contract";
import { createCodexCliCaptureApproval } from "@/scripts/approve-codex-cli-capture";
import {
  CodexCliCaptureError,
  captureCodexCliEvidence,
  runCodexCliCaptureCli,
} from "@/scripts/capture-codex-cli-evidence";
import { prepareCodexCliReview } from "@/scripts/prepare-codex-cli-review";

const roots: string[] = [];
const draft = ModelDraftSchema.parse(
  JSON.parse(
    readFileSync(
      "data/world-packs/trojan-returns/drafts/red-sail-proposal.json",
      "utf8",
    ),
  ) as unknown,
);
const finalMessage = JSON.stringify(draft);
const semanticallyInvalidMessage = JSON.stringify({
  ...draft,
  proposals: [],
});
const threadId = ["0199a213", "81c0", "7800", "8aa1", "bbab2a035a53"].join(
  "-",
);

const inspection = (): CodexCliInspection => ({
  versionStatus: 0,
  versionStdout: "codex-cli 0.144.2\n",
  execHelpStatus: 0,
  execHelpStdout: [
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "--model",
    "--output-schema",
    "--output-last-message",
    "--json",
  ].join("\n"),
  authStatus: 0,
  authStdout: "Logged in using ChatGPT\n",
  authStderr: "",
});

const git = (root: string, args: string[]): void => {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
};

const makeRoot = async (): Promise<{
  root: string;
  bundle: CodexCliAuthorityBundle;
}> => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-cli-capture-"));
  roots.push(root);
  git(root, ["init", "--quiet"]);
  await writeFile(path.join(root, ".gitignore"), "artifacts/live/\n", "utf8");
  const input = await loadRegisteredCodexCliInput();
  const bundle = buildCodexCliAuthorityBundle(input);
  const review = await prepareCodexCliReview({ root });
  await createCodexCliCaptureApproval({
    root,
    authoritySha256: review.approvalAuthoritySha256,
  });
  return { root, bundle };
};

const makeRetryRoot = async (): Promise<{
  root: string;
  primaryReceiptSource: string;
  retryBundle: CodexCliAuthorityBundle;
}> => {
  const { root, bundle } = await makeRoot();
  const primaryReceipt = CodexCliCaptureReceiptSchema.parse({
    schemaVersion: 1,
    evidenceType: "codex_cli_capture_attempt",
    attemptId: CODEX_CLI_PRIMARY_ATTEMPT_ID,
    scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
    transport: "codex_cli",
    requestSha256: bundle.authority.requestSha256,
    worldPackSha256: bundle.authority.worldPackSha256,
    modelInputSha256: bundle.authority.modelInputSha256,
    promptSha256: bundle.authority.promptSha256,
    outputSchemaSha256: bundle.authority.outputSchemaSha256,
    executionContractSha256: bundle.authority.executionContractSha256,
    approvalAuthoritySha256: bundle.approvalAuthoritySha256,
    requestedModel: "gpt-5.6-sol",
    actualModel: null,
    responseId: null,
    actualModelObserved: false,
    responseIdObserved: false,
    cliVersion: "codex-cli 0.142.5",
    dispatchedAt: "2026-07-15T07:18:49.093Z",
    finishedAt: "2026-07-15T07:18:53.991Z",
    outcome: "typed_failure",
    failureCode: "codex_cli_process_failed",
    retryable: false,
    usage: null,
    threadIdSha256: null,
    jsonlSha256: null,
    finalMessageSha256: null,
    sanitizedEvidenceSha256: null,
    rawPersisted: false,
    publicPersisted: false,
  });
  const primaryReceiptSource = `${JSON.stringify(primaryReceipt, null, 2)}\n`;
  await writeFile(
    getCodexCliCapturePaths(root).receiptPath,
    primaryReceiptSource,
    "utf8",
  );
  const previousAttemptReceiptSha256 = createHash("sha256")
    .update(primaryReceiptSource)
    .digest("hex");
  const retryBundle = buildCodexCliAuthorityBundle({
    worldPack: bundle.worldPack,
    request: bundle.request,
    mode: "retry",
    previousAttemptReceiptSha256,
  });
  const review = await prepareCodexCliReview({ root, mode: "retry" });
  expect(review.approvalAuthoritySha256).toBe(
    retryBundle.approvalAuthoritySha256,
  );
  await createCodexCliCaptureApproval({
    root,
    mode: "retry",
    authoritySha256: review.approvalAuthoritySha256,
  });
  return { root, primaryReceiptSource, retryBundle };
};

const outputPathFrom = (args: readonly string[]): string => {
  const index = args.indexOf("--output-last-message");
  const value = args[index + 1];
  if (!value) throw new Error("missing output path");
  return value;
};

const eventStream = (
  message = finalMessage,
  extraEvents: unknown[] = [],
): string =>
  [
    { type: "thread.started", thread_id: threadId },
    { type: "turn.started" },
    ...extraEvents,
    {
      type: "item.completed",
      item: { id: "item.final", type: "agent_message", text: message },
    },
    {
      type: "turn.completed",
      usage: {
        input_tokens: 400,
        cached_input_tokens: 100,
        output_tokens: 220,
        reasoning_output_tokens: 20,
      },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n") + "\n";

const runnerWith = ({
  message = finalMessage,
  extraEvents = [],
}: {
  message?: string;
  extraEvents?: unknown[];
} = {}): CodexCliProcessRunner =>
  async (invocation) => {
    await writeFile(outputPathFrom(invocation.args), message, "utf8");
    return {
      exitCode: 0,
      signal: null,
      stdout: eventStream(message, extraEvents),
      stderr: "",
      timedOut: false,
    };
  };

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex CLI evidence capture", () => {
  it("surfaces an allowlisted command-resolution failure", async () => {
    vi.stubEnv(CODEX_CLI_COMMAND_ENV, "codex\n--danger");
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(await runCodexCliCaptureCli({ stdout, stderr })).toBe(1);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_attempt", outcome: "failed", code: "codex_cli_command_override_invalid" })}\n`,
    );
  });

  it("does not let the primary approval authorize retry", async () => {
    const { root } = await makeRetryRoot();
    const primary = getCodexCliCaptureAttempt("primary");
    const retry = getCodexCliCaptureAttempt("retry");
    await writeFile(
      path.join(root, retry.approvalLocator),
      await readFile(path.join(root, primary.approvalLocator), "utf8"),
      "utf8",
    );
    const inspector = vi.fn(() => inspection());

    await expect(
      preflightCodexCliEvidence({ root, mode: "retry", inspector }),
    ).rejects.toMatchObject({ code: "approval_authority_mismatch" });
    expect(inspector).not.toHaveBeenCalled();
  });

  it("invalidates retry authority when the bound primary receipt changes", async () => {
    const { root } = await makeRetryRoot();
    const primaryPaths = getCodexCliCapturePaths(root);
    const receipt = JSON.parse(await readFile(primaryPaths.receiptPath, "utf8")) as {
      finishedAt: string;
    };
    receipt.finishedAt = "2026-07-15T07:18:54.000Z";
    await writeFile(
      primaryPaths.receiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8",
    );
    const inspector = vi.fn(() => inspection());

    await expect(
      preflightCodexCliEvidence({ root, mode: "retry", inspector }),
    ).rejects.toMatchObject({ code: "approval_authority_mismatch" });
    expect(inspector).not.toHaveBeenCalled();
  });

  it("binds retry authority to the exact primary receipt bytes", async () => {
    const { root, primaryReceiptSource } = await makeRetryRoot();
    const primaryPaths = getCodexCliCapturePaths(root);
    await writeFile(
      primaryPaths.receiptPath,
      ` ${primaryReceiptSource}`,
      "utf8",
    );
    const inspector = vi.fn(() => inspection());

    await expect(
      preflightCodexCliEvidence({ root, mode: "retry", inspector }),
    ).rejects.toMatchObject({ code: "approval_authority_mismatch" });
    expect(inspector).not.toHaveBeenCalled();
  });

  it("uses a separately approved retry without modifying the primary receipt", async () => {
    const { root, primaryReceiptSource, retryBundle } = await makeRetryRoot();
    const primaryPaths = getCodexCliCapturePaths(root);
    const retryPaths = getCodexCliCapturePaths(root, "retry");
    const processRunner = vi.fn(runnerWith());

    const receipt = await captureCodexCliEvidence({
      root,
      mode: "retry",
      inspector: () => inspection(),
      processRunner,
    });

    expect(processRunner).toHaveBeenCalledTimes(1);
    expect(receipt).toMatchObject({
      attemptId: CODEX_CLI_RETRY_ATTEMPT_ID,
      outcome: "persisted",
      outputSchemaSha256: retryBundle.authority.outputSchemaSha256,
      approvalAuthoritySha256: retryBundle.approvalAuthoritySha256,
      processDiagnostics: { machineErrorCode: "exit_zero" },
      rawPersisted: true,
      publicPersisted: true,
    });
    expect(await readFile(primaryPaths.receiptPath, "utf8")).toBe(
      primaryReceiptSource,
    );
    expect(
      CodexCliCaptureReceiptSchema.parse(
        JSON.parse(await readFile(retryPaths.receiptPath, "utf8")) as unknown,
      ),
    ).toEqual(receipt);
  });

  it("persists bounded retry diagnostics and blocks a second retry dispatch", async () => {
    const { root, primaryReceiptSource } = await makeRetryRoot();
    const primaryPaths = getCodexCliCapturePaths(root);
    const retryPaths = getCodexCliCapturePaths(root, "retry");
    const secret = "upstream failure detail must remain transient";
    const processRunner = vi.fn<CodexCliProcessRunner>(async () => ({
      exitCode: 1,
      signal: null,
      stdout: `${JSON.stringify({ type: "error", message: secret })}\n`,
      stderr: secret,
      timedOut: false,
    }));

    await expect(
      captureCodexCliEvidence({
        root,
        mode: "retry",
        inspector: () => inspection(),
        processRunner,
      }),
    ).rejects.toEqual(new CodexCliCaptureError("codex_cli_process_failed"));

    const receiptSource = await readFile(retryPaths.receiptPath, "utf8");
    const receipt = CodexCliCaptureReceiptSchema.parse(
      JSON.parse(receiptSource) as unknown,
    );
    expect(receipt).toMatchObject({
      attemptId: CODEX_CLI_RETRY_ATTEMPT_ID,
      outcome: "typed_failure",
      processDiagnostics: {
        exitCode: 1,
        machineErrorCode: "exit_nonzero",
        events: { errorEventObserved: true },
      },
      rawPersisted: false,
      publicPersisted: false,
    });
    expect(receiptSource).not.toContain(secret);
    expect(await readFile(primaryPaths.receiptPath, "utf8")).toBe(
      primaryReceiptSource,
    );
    await expect(
      captureCodexCliEvidence({
        root,
        mode: "retry",
        inspector: () => inspection(),
        processRunner,
      }),
    ).rejects.toMatchObject({ code: "capture_target_exists" });
    expect(processRunner).toHaveBeenCalledTimes(1);
  });

  it("persists separate raw/private and sanitized/public evidence from an offline runner", async () => {
    const { root, bundle } = await makeRoot();
    const processRunner = vi.fn(runnerWith());
    const times = [
      "2026-07-15T12:00:00.000Z",
      "2026-07-15T12:00:01.000Z",
      "2026-07-15T12:00:02.000Z",
    ];

    const receipt = await captureCodexCliEvidence({
      root,
      inspector: () => inspection(),
      processRunner,
      now: () => times.shift() ?? "2026-07-15T12:00:03.000Z",
    });

    expect(processRunner).toHaveBeenCalledTimes(1);
    expect(receipt).toMatchObject({
      outcome: "persisted",
      transport: "codex_cli",
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      requestedModel: "gpt-5.6-sol",
      actualModel: null,
      responseId: null,
      actualModelObserved: false,
      responseIdObserved: false,
      worldPackSha256: bundle.authority.worldPackSha256,
      modelInputSha256: bundle.authority.modelInputSha256,
      promptSha256: bundle.authority.promptSha256,
      outputSchemaSha256: bundle.authority.outputSchemaSha256,
      executionContractSha256: bundle.authority.executionContractSha256,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
      rawPersisted: true,
      publicPersisted: true,
    });
    const paths = getCodexCliCapturePaths(root);
    const raw = JSON.parse(await readFile(paths.rawPath, "utf8")) as {
      evidenceType: string;
      privateCapture: { finalMessage: string };
    };
    const publicEvidence = CodexCliSanitizedEvidenceSchema.parse(
      JSON.parse(await readFile(paths.publicPath, "utf8")) as unknown,
    );
    const persistedReceipt = CodexCliCaptureReceiptSchema.parse(
      JSON.parse(await readFile(paths.receiptPath, "utf8")) as unknown,
    );
    expect(raw.evidenceType).toBe("codex_cli_raw_capture");
    expect(raw.privateCapture.finalMessage).toBe(finalMessage);
    expect(publicEvidence).toMatchObject({
      transport: "codex_cli",
      actualModel: null,
      responseId: null,
      modelInputSha256: bundle.authority.modelInputSha256,
      promptSha256: bundle.authority.promptSha256,
      outputSchemaSha256: bundle.authority.outputSchemaSha256,
      executionContractSha256: bundle.authority.executionContractSha256,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
      scenarioVerdict: "passed",
    });
    expect(persistedReceipt).toEqual(receipt);
    await expect(access(paths.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(paths.reservationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("writes a typed private receipt and no evidence when prohibited activity appears", async () => {
    const { root, bundle } = await makeRoot();
    const paths = getCodexCliCapturePaths(root);
    const processRunner = runnerWith({
      extraEvents: [
        {
          type: "item.completed",
          item: { id: "item.command", type: "command_execution" },
        },
      ],
    });

    await expect(
      captureCodexCliEvidence({
        root,
        inspector: () => inspection(),
        processRunner,
      }),
    ).rejects.toEqual(
      new CodexCliCaptureError("codex_cli_prohibited_activity"),
    );
    const receipt = CodexCliCaptureReceiptSchema.parse(
      JSON.parse(await readFile(paths.receiptPath, "utf8")) as unknown,
    );
    expect(receipt).toMatchObject({
      outcome: "typed_failure",
      failureCode: "codex_cli_prohibited_activity",
      worldPackSha256: bundle.authority.worldPackSha256,
      modelInputSha256: bundle.authority.modelInputSha256,
      promptSha256: bundle.authority.promptSha256,
      outputSchemaSha256: bundle.authority.outputSchemaSha256,
      executionContractSha256: bundle.authority.executionContractSha256,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
      rawPersisted: false,
      publicPersisted: false,
    });
    await expect(access(paths.rawPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(paths.publicPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(access(paths.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(paths.reservationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("writes a terminal receipt for a schema-valid semantic failure and blocks re-dispatch", async () => {
    const { root, bundle } = await makeRoot();
    const paths = getCodexCliCapturePaths(root);
    const processRunner = vi.fn(
      runnerWith({ message: semanticallyInvalidMessage }),
    );

    await expect(
      captureCodexCliEvidence({
        root,
        inspector: () => inspection(),
        processRunner,
      }),
    ).rejects.toEqual(
      new CodexCliCaptureError("codex_cli_semantic_validation_failed"),
    );
    const receipt = CodexCliCaptureReceiptSchema.parse(
      JSON.parse(await readFile(paths.receiptPath, "utf8")) as unknown,
    );
    expect(receipt).toMatchObject({
      outcome: "typed_failure",
      failureCode: "codex_cli_semantic_validation_failed",
      retryable: false,
      requestSha256: bundle.authority.requestSha256,
      worldPackSha256: bundle.authority.worldPackSha256,
      modelInputSha256: bundle.authority.modelInputSha256,
      promptSha256: bundle.authority.promptSha256,
      outputSchemaSha256: bundle.authority.outputSchemaSha256,
      executionContractSha256: bundle.authority.executionContractSha256,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
      rawPersisted: false,
      publicPersisted: false,
    });
    expect(processRunner).toHaveBeenCalledTimes(1);
    await expect(access(paths.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(paths.reservationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      captureCodexCliEvidence({
        root,
        inspector: () => inspection(),
        processRunner,
      }),
    ).rejects.toMatchObject({ code: "capture_target_exists" });
    expect(processRunner).toHaveBeenCalledTimes(1);
  });

  it("retains lock and reservation when a terminal receipt cannot be persisted", async () => {
    const { root } = await makeRoot();
    const paths = getCodexCliCapturePaths(root);
    const semanticFailureRunner = runnerWith({
      message: semanticallyInvalidMessage,
    });
    const processRunner = vi.fn(async (invocation) => {
      const result = await semanticFailureRunner(invocation);
      await writeFile(paths.receiptPath, "occupied\n", "utf8");
      return result;
    });

    await expect(
      captureCodexCliEvidence({
        root,
        inspector: () => inspection(),
        processRunner,
      }),
    ).rejects.toEqual(
      new CodexCliCaptureError("capture_receipt_target_exists"),
    );
    await expect(access(paths.lockPath)).resolves.toBeUndefined();
    await expect(access(paths.reservationPath)).resolves.toBeUndefined();
    expect(processRunner).toHaveBeenCalledTimes(1);
  });
});

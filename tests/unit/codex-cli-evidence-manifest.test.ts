import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CODEX_CLI_CAPTURE_ATTEMPT_ID } from "@/src/adapters/codex-cli/approval";
import {
  CODEX_CLI_CAPTURE_ATTEMPTS,
  CODEX_CLI_RETRY_ATTEMPT_ID,
  type CodexCliCaptureMode,
} from "@/src/adapters/codex-cli/attempt";
import {
  buildCodexCliAuthorityBundle,
  buildCodexCliReviewPacket,
  type CodexCliAuthorityBundle,
} from "@/src/adapters/codex-cli/authority";
import {
  CodexCliCaptureReceiptSchema,
  type CodexCliCaptureReceipt,
} from "@/src/adapters/codex-cli/capture-contracts";
import {
  CodexCliSanitizedEvidenceSchema,
  type CodexCliSanitizedEvidence,
} from "@/src/adapters/codex-cli/red-sail-evidence";
import { buildCodexCliProcessDiagnostics } from "@/src/adapters/codex-cli/process-diagnostics";
import { loadRegisteredCodexCliInput } from "@/src/adapters/codex-cli/preflight";
import { MODEL_DRAFT_JSON_SCHEMA } from "@/src/contracts/model-draft";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import {
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  LIVE_RED_SAIL_WORLD_PACK_SHA256,
} from "@/src/evidence/live-scenario-contract";
import {
  assertCodexCliEvidenceCaptureBinding,
  loadBoundCodexCliEvidenceGroup,
} from "@/scripts/generate-evidence";

const roots: string[] = [];
const verifier = path.resolve(process.cwd(), "scripts/verify-evidence.mjs");
const baselineNames = [
  "evidence-packet.json",
  "fixture-replay.json",
  "graph-descriptor.json",
  "live-readiness.json",
  "simulation-chain.json",
  "style-ablation-readiness.json",
  "style-harness.json",
] as const;
const capturedAt = "2026-07-15T12:00:02.000Z";
const reviewedCommand = "/Applications/ChatGPT.app/Contents/Resources/codex";
let authorityBundle: CodexCliAuthorityBundle;
const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const buildSanitized = (
  bundle: CodexCliAuthorityBundle = authorityBundle,
): CodexCliSanitizedEvidence =>
  CodexCliSanitizedEvidenceSchema.parse({
    schemaVersion: 1,
    evidenceType: "codex_cli_sanitized",
    scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
    capturedAt,
    transport: "codex_cli",
    authority: {
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      worldPackId: LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.id,
      worldPackVersion: LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.version,
      worldPackSha256: LIVE_RED_SAIL_WORLD_PACK_SHA256,
      styleProfileId: LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.styleProfileId,
      overlayHash: LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.overlayHash,
      stateHash: LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.snapshotStateHash,
    },
    requestedModel: "gpt-5.6-sol",
    actualModel: null,
    responseId: null,
    cliVersion: "codex-cli 0.142.5",
    usage: {
      inputTokens: 400,
      cachedInputTokens: 100,
      outputTokens: 220,
      reasoningOutputTokens: 20,
    },
    threadIdSha256: hash("thread"),
    modelInputSha256: bundle.authority.modelInputSha256,
    promptSha256: bundle.authority.promptSha256,
    outputSchemaSha256: bundle.authority.outputSchemaSha256,
    executionContractSha256:
      bundle.authority.executionContractSha256,
    approvalAuthoritySha256: bundle.approvalAuthoritySha256,
    jsonlSha256: hash("jsonl"),
    finalMessageSha256: hash("final"),
    draftSha256: hash("draft"),
    scenarioVerdict: "passed",
    rawJsonlPublic: false,
    rawFinalMessagePublic: false,
    actualModelObserved: false,
    responseIdObserved: false,
  });

const buildReceipt = (
  sanitized: CodexCliSanitizedEvidence,
  bundle: CodexCliAuthorityBundle = authorityBundle,
  attemptId: typeof CODEX_CLI_CAPTURE_ATTEMPT_ID | typeof CODEX_CLI_RETRY_ATTEMPT_ID =
    CODEX_CLI_CAPTURE_ATTEMPT_ID,
): CodexCliCaptureReceipt =>
  CodexCliCaptureReceiptSchema.parse({
    schemaVersion: 1,
    evidenceType: "codex_cli_capture_attempt",
    attemptId,
    scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
    transport: "codex_cli",
    requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
    worldPackSha256: bundle.authority.worldPackSha256,
    modelInputSha256: bundle.authority.modelInputSha256,
    promptSha256: bundle.authority.promptSha256,
    outputSchemaSha256: bundle.authority.outputSchemaSha256,
    executionContractSha256:
      bundle.authority.executionContractSha256,
    approvalAuthoritySha256: bundle.approvalAuthoritySha256,
    requestedModel: "gpt-5.6-sol",
    actualModel: null,
    responseId: null,
    actualModelObserved: false,
    responseIdObserved: false,
    cliVersion: sanitized.cliVersion,
    dispatchedAt: "2026-07-15T12:00:01.000Z",
    finishedAt: capturedAt,
    outcome: "persisted",
    failureCode: null,
    retryable: null,
    usage: sanitized.usage,
    threadIdSha256: sanitized.threadIdSha256,
    jsonlSha256: sanitized.jsonlSha256,
    finalMessageSha256: sanitized.finalMessageSha256,
    sanitizedEvidenceSha256: sha256Canonical(sanitized),
    rawPersisted: true,
    publicPersisted: true,
    ...(attemptId === CODEX_CLI_RETRY_ATTEMPT_ID
      ? {
          processDiagnostics: buildCodexCliProcessDiagnostics({
            exitCode: 0,
            signal: null,
            stdout: "",
            stderr: "",
            timedOut: false,
          }),
        }
      : {}),
  });

beforeAll(async () => {
  authorityBundle = buildCodexCliAuthorityBundle({
    ...(await loadRegisteredCodexCliInput()),
    command: reviewedCommand,
  });
  expect(authorityBundle.authority.outputSchemaSha256).toBe(
    sha256Canonical(MODEL_DRAFT_JSON_SCHEMA),
  );
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-cli-evidence-"));
  roots.push(root);
  await Promise.all([
    mkdir(path.join(root, "artifacts", "evidence"), { recursive: true }),
    mkdir(path.join(root, "artifacts", "live", "codex-cli"), {
      recursive: true,
    }),
  ]);
  return root;
};

const writeReview = async (
  root: string,
  bundle: CodexCliAuthorityBundle,
  mode: CodexCliCaptureMode = "primary",
): Promise<void> => {
  await writeFile(
    path.join(root, CODEX_CLI_CAPTURE_ATTEMPTS[mode].reviewLocator),
    `${JSON.stringify(buildCodexCliReviewPacket(bundle), null, 2)}\n`,
    "utf8",
  );
};

const manifestEntry = (fileName: string, source: string) => ({
  path: `artifacts/evidence/${fileName}`,
  bytes: Buffer.byteLength(source),
  sha256: hash(source),
});

const writeVerifierTree = async (
  root: string,
  optionalFiles: readonly string[],
  manifestOptionalFiles: readonly string[] = optionalFiles,
): Promise<void> => {
  const entries: Array<ReturnType<typeof manifestEntry>> = [];
  for (const fileName of [...baselineNames, ...optionalFiles]) {
    const source = `${JSON.stringify({ fileName })}\n`;
    await writeFile(
      path.join(root, "artifacts", "evidence", fileName),
      source,
      "utf8",
    );
    if (baselineNames.includes(fileName as (typeof baselineNames)[number]) ||
      manifestOptionalFiles.includes(fileName)) {
      entries.push(manifestEntry(fileName, source));
    }
  }
  await writeFile(
    path.join(root, "artifacts", "evidence", "manifest.json"),
    `${JSON.stringify({ schemaVersion: 1, files: entries })}\n`,
    "utf8",
  );
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex CLI public evidence group", () => {
  it("selects a retry receipt by its exact sanitized authority", async () => {
    const root = await makeRoot();
    const primaryFailure = CodexCliCaptureReceiptSchema.parse({
      ...buildReceipt(buildSanitized()),
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
    const primarySource = `${JSON.stringify(primaryFailure, null, 2)}\n`;
    const input = await loadRegisteredCodexCliInput();
    const retryBundle = buildCodexCliAuthorityBundle({
      ...input,
      command: reviewedCommand,
      mode: "retry",
      previousAttemptReceiptSha256: hash(primarySource),
    });
    const sanitized = buildSanitized(retryBundle);
    const retryReceipt = buildReceipt(
      sanitized,
      retryBundle,
      CODEX_CLI_RETRY_ATTEMPT_ID,
    );
    await Promise.all([
      writeFile(
        path.join(root, "artifacts", "evidence", "codex-cli-sanitized.json"),
        `${JSON.stringify(sanitized)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(root, "artifacts", "live", "codex-cli", "capture-receipt.json"),
        primarySource,
        "utf8",
      ),
      writeFile(
        path.join(
          root,
          "artifacts",
          "live",
          "codex-cli",
          "retry-1-capture-receipt.json",
        ),
        `${JSON.stringify(retryReceipt)}\n`,
        "utf8",
      ),
      writeReview(root, retryBundle, "retry"),
    ]);

    const group = await loadBoundCodexCliEvidenceGroup({
      root,
      evidenceDirectory: path.join(root, "artifacts", "evidence"),
    });

    expect(group?.receipt.attemptId).toBe(CODEX_CLI_RETRY_ATTEMPT_ID);
    expect(group?.receipt.approvalAuthoritySha256).toBe(
      retryBundle.approvalAuthoritySha256,
    );

    const driftedReviewBundle = buildCodexCliAuthorityBundle({
      ...input,
      mode: "retry",
      previousAttemptReceiptSha256: hash(primarySource),
    });
    await writeFile(
      path.join(root, CODEX_CLI_CAPTURE_ATTEMPTS.retry.reviewLocator),
      `${JSON.stringify(buildCodexCliReviewPacket(driftedReviewBundle), null, 2)}\n`,
      "utf8",
    );
    await expect(
      loadBoundCodexCliEvidenceGroup({
        root,
        evidenceDirectory: path.join(root, "artifacts", "evidence"),
      }),
    ).rejects.toThrow(/not bound/u);
  });

  it("derives only a canonical public receipt and preserves the sanitized source", async () => {
    const root = await makeRoot();
    const sanitized = buildSanitized();
    const receipt = buildReceipt(sanitized);
    const sanitizedSource = `${JSON.stringify(sanitized, null, 4)}\n`;
    await Promise.all([
      writeFile(
        path.join(root, "artifacts", "evidence", "codex-cli-sanitized.json"),
        sanitizedSource,
        "utf8",
      ),
      writeFile(
        path.join(root, "artifacts", "live", "codex-cli", "capture-receipt.json"),
        JSON.stringify(receipt),
        "utf8",
      ),
      writeReview(root, authorityBundle),
    ]);

    const group = await loadBoundCodexCliEvidenceGroup({
      root,
      evidenceDirectory: path.join(root, "artifacts", "evidence"),
    });

    expect(group).not.toBeNull();
    expect(group?.writeDerivedReceipt).toBe(true);
    expect(group?.sanitizedSource).toBe(sanitizedSource);
    expect(group?.receiptSource).toBe(
      `${JSON.stringify(JSON.parse(canonicalJson(receipt)), null, 2)}\n`,
    );
    expect(group?.receiptSource).not.toContain("thread_id");
    expect(group?.receiptSource).not.toContain("stderr");
    expect(group?.receiptSource).not.toContain("finalMessage\"");

    await writeFile(
      path.join(
        root,
        "artifacts",
        "evidence",
        "codex-cli-capture-receipt.json",
      ),
      group?.receiptSource ?? "",
      "utf8",
    );
    const reloaded = await loadBoundCodexCliEvidenceGroup({
      root,
      evidenceDirectory: path.join(root, "artifacts", "evidence"),
    });
    expect(reloaded?.writeDerivedReceipt).toBe(false);
  });

  it("rejects a hash-mismatched receipt and an unresolved dispatch", async () => {
    const sanitized = buildSanitized();
    const receipt = buildReceipt(sanitized);
    expect(() =>
      assertCodexCliEvidenceCaptureBinding(sanitized, {
        ...receipt,
        jsonlSha256: hash("other-jsonl"),
      }, authorityBundle),
    ).toThrow(/not bound/u);

    const authorityDriftedSanitized = CodexCliSanitizedEvidenceSchema.parse({
      ...sanitized,
      promptSha256: hash("different-prompt"),
    });
    const authorityDriftedReceipt = CodexCliCaptureReceiptSchema.parse({
      ...buildReceipt(authorityDriftedSanitized),
      promptSha256: authorityDriftedSanitized.promptSha256,
      sanitizedEvidenceSha256: sha256Canonical(authorityDriftedSanitized),
    });
    expect(() =>
      assertCodexCliEvidenceCaptureBinding(
        authorityDriftedSanitized,
        authorityDriftedReceipt,
        authorityBundle,
      ),
    ).toThrow(/not bound/u);

    const root = await makeRoot();
    await Promise.all([
      writeFile(
        path.join(root, "artifacts", "evidence", "codex-cli-sanitized.json"),
        `${JSON.stringify(sanitized)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(root, "artifacts", "live", "codex-cli", "capture-receipt.json"),
        `${JSON.stringify(receipt)}\n`,
        "utf8",
      ),
      writeReview(root, authorityBundle),
      writeFile(
        path.join(root, "artifacts", "live", "codex-cli", "dispatch.pending.json"),
        "{}\n",
        "utf8",
      ),
    ]);
    await expect(
      loadBoundCodexCliEvidenceGroup({
        root,
        evidenceDirectory: path.join(root, "artifacts", "evidence"),
      }),
    ).rejects.toThrow(/reservation is unresolved/u);
  });

  it("verifier accepts the complete allowlisted pair", async () => {
    const root = await makeRoot();
    await writeVerifierTree(root, [
      "codex-cli-sanitized.json",
      "codex-cli-capture-receipt.json",
    ]);
    const result = spawnSync(process.execPath, [verifier], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("EVIDENCE_VERIFY_OK files=9");
  });

  it("verifier rejects an incomplete or unmanifested pair", async () => {
    const incompleteRoot = await makeRoot();
    await writeVerifierTree(incompleteRoot, ["codex-cli-sanitized.json"]);
    const incomplete = spawnSync(process.execPath, [verifier], {
      cwd: incompleteRoot,
      encoding: "utf8",
    });
    expect(incomplete.status).not.toBe(0);

    const unmanifestedRoot = await makeRoot();
    await writeVerifierTree(
      unmanifestedRoot,
      ["codex-cli-sanitized.json", "codex-cli-capture-receipt.json"],
      [],
    );
    const unmanifested = spawnSync(process.execPath, [verifier], {
      cwd: unmanifestedRoot,
      encoding: "utf8",
    });
    expect(unmanifested.status).not.toBe(0);
    expect(unmanifested.stderr).toContain("missing manifest entry");
  });
});

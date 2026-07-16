import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_CLI_CAPTURE_APPROVAL_LOCATOR,
  CODEX_CLI_CAPTURE_REVIEW_LOCATOR,
} from "@/src/adapters/codex-cli/approval";
import { buildCodexCliAuthorityBundle } from "@/src/adapters/codex-cli/authority";
import { CODEX_CLI_COMMAND_ENV } from "@/src/adapters/codex-cli/command";
import {
  CODEX_CLI_PUBLIC_EVIDENCE_LOCATOR,
  CODEX_CLI_RAW_CAPTURE_LOCATOR,
  CodexCliPreflightError,
  loadRegisteredCodexCliInput,
  preflightCodexCliEvidence,
  type CodexCliInspection,
} from "@/src/adapters/codex-cli/preflight";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { LIVE_RED_SAIL_REQUEST_SHA256 } from "@/src/evidence/live-scenario-contract";
import { createCodexCliCaptureApproval } from "@/scripts/approve-codex-cli-capture";
import { runCodexCliPreflightCli } from "@/scripts/preflight-codex-cli-evidence";
import { prepareCodexCliReview } from "@/scripts/prepare-codex-cli-review";

const roots: string[] = [];

const inspection = (
  overrides: Partial<CodexCliInspection> = {},
): CodexCliInspection => ({
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
  ...overrides,
});

const git = (root: string, args: string[]): void => {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
};

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-cli-preflight-"));
  roots.push(root);
  git(root, ["init", "--quiet"]);
  await writeFile(path.join(root, ".gitignore"), "artifacts/live/\n", "utf8");
  const { approvalAuthoritySha256 } = await prepareCodexCliReview({ root });
  await createCodexCliCaptureApproval({
    root,
    authoritySha256: approvalAuthoritySha256,
  });
  return root;
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex CLI evidence preflight", () => {
  it("reports a public-safe ready state for the exact request and documented CLI", async () => {
    const root = await makeRoot();
    const inspector = vi.fn(() => inspection());
    const input = await loadRegisteredCodexCliInput();
    const bundle = buildCodexCliAuthorityBundle(input);
    const apiKeyName = ["OPENAI", "API", "KEY"].join("_");

    const { report } = await preflightCodexCliEvidence({
      root,
      inspector,
      env: {
        PATH: "/safe/bin",
        HOME: "/safe/home",
        NODE_ENV: "test",
        [apiKeyName]: "must-not-cross",
        UNREGISTERED_SECRET: "must-not-cross",
      },
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      evidenceType: "codex_cli_capture_preflight",
      ready: true,
      transport: "codex_cli",
      requestedModel: "gpt-5.6-sol",
      actualModelWillBeReportedAs: null,
      responseIdWillBeReportedAs: null,
      cliVersion: "codex-cli 0.144.2",
      auth: "chatgpt",
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      worldPackSha256: bundle.authority.worldPackSha256,
      modelInputSha256: bundle.authority.modelInputSha256,
      promptSha256: bundle.authority.promptSha256,
      outputSchemaSha256: bundle.authority.outputSchemaSha256,
      executionContractSha256: bundle.authority.executionContractSha256,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
    });
    expect(JSON.stringify(report)).not.toContain(root);
    expect(JSON.stringify(report)).not.toMatch(/brief|participantIntents/u);
    expect(inspector).toHaveBeenCalledTimes(1);
    expect(inspector).toHaveBeenCalledWith("codex", {
      PATH: "/safe/bin",
      HOME: "/safe/home",
      NODE_ENV: "test",
    });
  });

  it("accepts the ChatGPT login marker when the CLI writes it to stderr", async () => {
    const root = await makeRoot();

    const { report } = await preflightCodexCliEvidence({
      root,
      inspector: () =>
        inspection({
          authStdout: "",
          authStderr: "Logged in using ChatGPT\n",
        }),
    });

    expect(report).toMatchObject({ ready: true, auth: "chatgpt" });
  });

  it.each([
    "codex-cli 0.144.2\n",
    "codex-cli 0.144.2+build.1\n",
    "codex-cli 0.144.3-rc.1\n",
  ])("accepts SemVer-compatible version %s", async (versionStdout) => {
    const root = await makeRoot();
    const { report } = await preflightCodexCliEvidence({
      root,
      inspector: () => inspection({ versionStdout }),
    });

    expect(report.ready).toBe(true);
  });

  it("requires a separate ignored transport-bound approval before inspection", async () => {
    const root = await makeRoot();
    await rm(path.join(root, CODEX_CLI_CAPTURE_APPROVAL_LOCATOR));
    const inspector = vi.fn(() => inspection());

    await expect(
      preflightCodexCliEvidence({ root, inspector }),
    ).rejects.toMatchObject({ code: "approval_missing" });
    expect(inspector).not.toHaveBeenCalled();
  });

  it("requires the bound review packet after approval and before inspection", async () => {
    const root = await makeRoot();
    await rm(path.join(root, CODEX_CLI_CAPTURE_REVIEW_LOCATOR));
    const inspector = vi.fn(() => inspection());

    await expect(
      preflightCodexCliEvidence({ root, inspector }),
    ).rejects.toMatchObject({ code: "review_missing" });
    expect(inspector).not.toHaveBeenCalled();
  });

  it("rejects a tampered approval authority before inspection", async () => {
    const root = await makeRoot();
    const approvalPath = path.join(root, CODEX_CLI_CAPTURE_APPROVAL_LOCATOR);
    const approval = JSON.parse(await readFile(approvalPath, "utf8")) as {
      authority: { promptSha256: string };
    };
    approval.authority.promptSha256 = "0".repeat(64);
    await writeFile(approvalPath, `${JSON.stringify(approval)}\n`, "utf8");
    const inspector = vi.fn(() => inspection());

    await expect(
      preflightCodexCliEvidence({ root, inspector }),
    ).rejects.toMatchObject({ code: "approval_authority_mismatch" });
    expect(inspector).not.toHaveBeenCalled();
  });

  it.each([
    ["codex_cli_version_invalid", inspection({ versionStdout: "unknown\n" })],
    [
      "codex_cli_version_invalid",
      inspection({ versionStdout: "codex-cli 0.144.2-01\n" }),
    ],
    [
      "codex_cli_version_unsupported",
      inspection({ versionStdout: "codex-cli 0.142.5\n" }),
    ],
    [
      "codex_cli_version_unsupported",
      inspection({ versionStdout: "codex-cli 0.144.2-rc.1\n" }),
    ],
    ["codex_cli_flags_missing", inspection({ execHelpStdout: "--json\n" })],
    [
      "codex_cli_auth_missing",
      inspection({ authStatus: 1, authStdout: "", authStderr: "" }),
    ],
  ])("fails closed with %s", async (code, result) => {
    const root = await makeRoot();
    await expect(
      preflightCodexCliEvidence({ root, inspector: () => result }),
    ).rejects.toMatchObject({ code });
  });

  it("rejects registered World Pack drift", async () => {
    const root = await makeRoot();
    const world = await loadDemoWorldPack();
    await expect(
      preflightCodexCliEvidence({
        root,
        inspector: () => inspection(),
        loaders: {
          loadWorldPack: async () => ({
            ...world,
            meta: { ...world.meta, title: `${world.meta.title} drift` },
          }),
          loadOverlay: loadOverlayFixture,
          loadSnapshot: loadSnapshotFixture,
        },
      }),
    ).rejects.toMatchObject({ code: "registered_hash_mismatch" });
  });

  it.each([
    CODEX_CLI_RAW_CAPTURE_LOCATOR,
    CODEX_CLI_PUBLIC_EVIDENCE_LOCATOR,
  ])("rejects existing capture target %s", async (locator) => {
    const root = await makeRoot();
    const target = path.join(root, locator);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "reserved\n", "utf8");
    await expect(
      preflightCodexCliEvidence({ root, inspector: () => inspection() }),
    ).rejects.toMatchObject({ code: "capture_target_exists" });
  });

  it("formats CLI failures without paths or approval contents", async () => {
    const root = await makeRoot();
    await rm(path.join(root, CODEX_CLI_CAPTURE_APPROVAL_LOCATOR));
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(
      await runCodexCliPreflightCli({ root, stdout, stderr }),
    ).toBe(1);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith(
      `${JSON.stringify({ schemaVersion: 1, evidenceType: "codex_cli_capture_preflight", ready: false, code: "approval_missing" })}\n`,
    );
  });

  it("surfaces an allowlisted command-resolution failure", async () => {
    vi.stubEnv(CODEX_CLI_COMMAND_ENV, "codex\n--danger");
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(await runCodexCliPreflightCli({ stdout, stderr })).toBe(1);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith(
      `${JSON.stringify({ schemaVersion: 1, evidenceType: "codex_cli_capture_preflight", ready: false, code: "codex_cli_command_override_invalid" })}\n`,
    );
  });

  it("uses typed preflight failures", () => {
    expect(new CodexCliPreflightError("codex_cli_unavailable")).toMatchObject({
      code: "codex_cli_unavailable",
    });
  });
});

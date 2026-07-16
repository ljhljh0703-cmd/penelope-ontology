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
  CodexCliCaptureApprovalSchema,
} from "@/src/adapters/codex-cli/approval";
import { buildCodexCliAuthorityBundle } from "@/src/adapters/codex-cli/authority";
import { CODEX_CLI_COMMAND_ENV } from "@/src/adapters/codex-cli/command";
import { loadRegisteredCodexCliInput } from "@/src/adapters/codex-cli/preflight";
import {
  createCodexCliCaptureApproval,
  runCodexCliApprovalCli,
} from "@/scripts/approve-codex-cli-capture";
import { prepareCodexCliReview } from "@/scripts/prepare-codex-cli-review";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-cli-approval-"));
  roots.push(root);
  const git = spawnSync("git", ["-C", root, "init", "--quiet"], {
    encoding: "utf8",
  });
  if (git.status !== 0) throw new Error(git.stderr);
  await mkdir(path.join(root, "artifacts"));
  await writeFile(path.join(root, ".gitignore"), "artifacts/live/\n", "utf8");
  return root;
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex CLI capture approval", () => {
  it("requires the exact review authority before creating one ignored approval", async () => {
    const root = await makeRoot();
    const input = await loadRegisteredCodexCliInput();
    const bundle = buildCodexCliAuthorityBundle(input);

    await expect(
      createCodexCliCaptureApproval({
        root,
        authoritySha256: bundle.approvalAuthoritySha256,
      }),
    ).rejects.toMatchObject({ code: "review_missing" });

    const review = await prepareCodexCliReview({ root });
    expect(review.approvalAuthoritySha256).toBe(
      bundle.approvalAuthoritySha256,
    );
    await createCodexCliCaptureApproval({
      root,
      authoritySha256: bundle.approvalAuthoritySha256,
    });
    const approval = CodexCliCaptureApprovalSchema.parse(
      JSON.parse(
        await readFile(
          path.join(root, CODEX_CLI_CAPTURE_APPROVAL_LOCATOR),
          "utf8",
        ),
      ) as unknown,
    );
    expect(approval).toMatchObject({
      authority: bundle.authority,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
      approved: true,
    });
    await expect(
      createCodexCliCaptureApproval({
        root,
        authoritySha256: bundle.approvalAuthoritySha256,
      }),
    ).rejects.toMatchObject({ code: "approval_exists" });
  });

  it("rejects a different authority hash before writing", async () => {
    const root = await makeRoot();
    await expect(
      createCodexCliCaptureApproval({
        root,
        authoritySha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "approval_authority_hash_mismatch" });
  });

  it("provides a non-secret CLI receipt", async () => {
    const root = await makeRoot();
    const { approvalAuthoritySha256 } = await prepareCodexCliReview({ root });
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };
    expect(
      await runCodexCliApprovalCli({
        root,
        args: ["--authority-sha", approvalAuthoritySha256],
        stdout,
        stderr,
        command: "codex",
      }),
    ).toBe(0);
    expect(stderr.write).not.toHaveBeenCalled();
    expect(stdout.write).toHaveBeenCalledWith(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_approval", created: true, approvalAuthoritySha256 })}\n`,
    );
  });

  it("surfaces an allowlisted command-resolution failure", async () => {
    vi.stubEnv(CODEX_CLI_COMMAND_ENV, "codex\n--danger");
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(
      await runCodexCliApprovalCli({
        args: ["--authority-sha", "0".repeat(64)],
        stdout,
        stderr,
      }),
    ).toBe(1);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_approval", created: false, code: "codex_cli_command_override_invalid" })}\n`,
    );
  });
});

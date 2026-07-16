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
import { CODEX_CLI_CAPTURE_REVIEW_LOCATOR } from "@/src/adapters/codex-cli/approval";
import {
  buildCodexCliAuthorityBundle,
  buildCodexCliReviewPacket,
} from "@/src/adapters/codex-cli/authority";
import { CodexCliReviewPacketSchema } from "@/src/adapters/codex-cli/contracts";
import { CODEX_CLI_COMMAND_ENV } from "@/src/adapters/codex-cli/command";
import { loadRegisteredCodexCliInput } from "@/src/adapters/codex-cli/preflight";
import {
  prepareCodexCliReview,
  runCodexCliReviewCli,
} from "@/scripts/prepare-codex-cli-review";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-cli-review-"));
  roots.push(root);
  const git = spawnSync("git", ["-C", root, "init", "--quiet"], {
    encoding: "utf8",
  });
  if (git.status !== 0) throw new Error(git.stderr);
  await Promise.all([
    mkdir(path.join(root, "artifacts")),
    writeFile(path.join(root, ".gitignore"), "artifacts/live/\n", "utf8"),
  ]);
  return root;
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Codex CLI creator review packet", () => {
  it("materializes the exact registered model input and execution authority before approval", async () => {
    const root = await makeRoot();
    const input = await loadRegisteredCodexCliInput();
    const bundle = buildCodexCliAuthorityBundle(input);

    const result = await prepareCodexCliReview({ root });
    const packet = CodexCliReviewPacketSchema.parse(
      JSON.parse(
        await readFile(
          path.join(root, CODEX_CLI_CAPTURE_REVIEW_LOCATOR),
          "utf8",
        ),
      ) as unknown,
    );

    expect(result.approvalAuthoritySha256).toBe(
      bundle.approvalAuthoritySha256,
    );
    expect(packet).toEqual(buildCodexCliReviewPacket(bundle));
    expect(packet).toMatchObject({
      authority: bundle.authority,
      approvalAuthoritySha256: bundle.approvalAuthoritySha256,
      modelInput: bundle.modelInput,
      prompt: bundle.prompt,
      outputSchema: bundle.outputSchema,
      executionContract: bundle.executionContract,
    });
    await expect(prepareCodexCliReview({ root })).rejects.toMatchObject({
      code: "review_exists",
    });
  });

  it("prints only a bounded review receipt", async () => {
    const root = await makeRoot();
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(await runCodexCliReviewCli({ root, stdout, stderr })).toBe(0);
    expect(stderr.write).not.toHaveBeenCalled();
    const output = String(stdout.write.mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toMatchObject({
      evidenceType: "codex_cli_capture_review",
      created: true,
    });
    expect(output).not.toContain(root);
    expect(output).not.toMatch(/participantIntents|MODEL_INPUT_JSON/u);
  });

  it("surfaces an allowlisted command-resolution failure", async () => {
    vi.stubEnv(CODEX_CLI_COMMAND_ENV, "codex\n--danger");
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(await runCodexCliReviewCli({ stdout, stderr })).toBe(1);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_review", created: false, code: "codex_cli_command_override_invalid" })}\n`,
    );
  });
});

import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareW5CodexRuntime } from "@/scripts/w5/cli-runtime";
import { sha256Bytes } from "@/scripts/w5/recording-process-runner";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("W5 Codex CLI runtime preflight", () => {
  it("pins one executable after version, flags, and ChatGPT auth pass", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "w5-cli-runtime-"));
    roots.push(root);
    const command = path.join(root, "codex");
    const bytes = Buffer.from("test executable bytes\n", "utf8");
    await writeFile(command, bytes);
    await chmod(command, 0o755);
    const resolvedCommand = await realpath(command);
    const inspector = vi.fn(() => ({
      versionStatus: 0,
      versionStdout: "codex-cli 0.145.0-alpha.18\n",
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
    }));

    const runtime = await prepareW5CodexRuntime({
      env: {
        PENELOPE_CODEX_CLI_COMMAND: command,
        PATH: "/safe/bin",
        HOME: "/safe/home",
        NODE_ENV: "test",
        [["OPENAI", "API", "KEY"].join("_")]: "must-not-cross",
      },
      inspector,
    });

    expect(runtime.command).toBe(resolvedCommand);
    expect(runtime.receipt).toMatchObject({
      schemaVersion: "w5.codex_cli_runtime.v1",
      requestedModel: "gpt-5.6-sol",
      actualModelIdentity: "unreported",
      auth: "chatgpt",
      commandFileBytes: bytes.byteLength,
      commandFileSha256: sha256Bytes(bytes),
    });
    expect(inspector).toHaveBeenCalledWith(resolvedCommand, {
      PATH: "/safe/bin",
      HOME: "/safe/home",
      NODE_ENV: "test",
    });
  });

  it("fails closed before capture when the CLI is below the minimum version", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "w5-cli-runtime-"));
    roots.push(root);
    const command = path.join(root, "codex");
    await writeFile(command, "old cli\n", "utf8");
    await chmod(command, 0o755);

    await expect(
      prepareW5CodexRuntime({
        env: {
          PENELOPE_CODEX_CLI_COMMAND: command,
          NODE_ENV: "test",
        },
        inspector: () => ({
          versionStatus: 0,
          versionStdout: "codex-cli 0.142.5\n",
          execHelpStatus: 0,
          execHelpStdout: "--json\n",
          authStatus: 0,
          authStdout: "Logged in using ChatGPT\n",
          authStderr: "",
        }),
      }),
    ).rejects.toMatchObject({ code: "codex_cli_version_unsupported" });
  });
});

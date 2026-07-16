import { describe, expect, it } from "vitest";
import {
  CHATGPT_BUNDLED_CODEX_COMMAND,
  CODEX_CLI_COMMAND_ENV,
  CodexCliCommandResolutionError,
  resolveCodexCliCommand,
} from "@/src/adapters/codex-cli/command";

describe("Codex CLI command selection", () => {
  it("prefers the executable ChatGPT app bundle on macOS", async () => {
    expect(
      await resolveCodexCliCommand(
        { NODE_ENV: "test" },
        "darwin",
        async (candidate) => candidate === CHATGPT_BUNDLED_CODEX_COMMAND,
      ),
    ).toBe(
      CHATGPT_BUNDLED_CODEX_COMMAND,
    );
  });

  it("uses a safe explicit command override and otherwise falls back to PATH", async () => {
    expect(
      await resolveCodexCliCommand(
        { [CODEX_CLI_COMMAND_ENV]: "codex-preview", NODE_ENV: "test" },
        "linux",
        async () => false,
      ),
    ).toBe("codex-preview");
    expect(
      await resolveCodexCliCommand(
        { NODE_ENV: "test" },
        "linux",
        async () => false,
      ),
    ).toBe("codex");
  });

  it("rejects command injection and unavailable absolute overrides", async () => {
    const invalid = resolveCodexCliCommand(
      { [CODEX_CLI_COMMAND_ENV]: "codex\n--danger", NODE_ENV: "test" },
      "linux",
      async () => false,
    );
    await expect(invalid).rejects.toEqual(
      new CodexCliCommandResolutionError(
        "codex_cli_command_override_invalid",
      ),
    );
    const unavailable = resolveCodexCliCommand(
      {
        [CODEX_CLI_COMMAND_ENV]: "/definitely/missing/codex",
        NODE_ENV: "test",
      },
      "linux",
      async () => false,
    );
    await expect(unavailable).rejects.toEqual(
      new CodexCliCommandResolutionError(
        "codex_cli_command_override_unavailable",
      ),
    );
  });
});

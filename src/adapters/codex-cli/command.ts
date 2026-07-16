import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

export const CODEX_CLI_COMMAND_ENV = "PENELOPE_CODEX_CLI_COMMAND" as const;
export const CHATGPT_BUNDLED_CODEX_COMMAND =
  "/Applications/ChatGPT.app/Contents/Resources/codex" as const;
export const CODEX_CLI_MIN_GPT56_VERSION = "0.144.2" as const;

export type CodexCliCommandResolutionFailureCode =
  | "codex_cli_command_override_invalid"
  | "codex_cli_command_override_unavailable";

export class CodexCliCommandResolutionError extends Error {
  constructor(readonly code: CodexCliCommandResolutionFailureCode) {
    super(code);
    this.name = "CodexCliCommandResolutionError";
  }
}

const isSafeCommand = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 1024 &&
  !/[\0\r\n]/u.test(value) &&
  (path.isAbsolute(value) || /^[A-Za-z0-9._-]+$/u.test(value));

const isExecutable = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export const resolveCodexCliCommand = async (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  executable: (candidate: string) => Promise<boolean> = isExecutable,
): Promise<string> => {
  const override = env[CODEX_CLI_COMMAND_ENV]?.trim();
  if (override !== undefined) {
    if (!isSafeCommand(override)) {
      throw new CodexCliCommandResolutionError(
        "codex_cli_command_override_invalid",
      );
    }
    if (path.isAbsolute(override) && !(await executable(override))) {
      throw new CodexCliCommandResolutionError(
        "codex_cli_command_override_unavailable",
      );
    }
    return override;
  }
  if (
    platform === "darwin" &&
    await executable(CHATGPT_BUNDLED_CODEX_COMMAND)
  ) {
    return CHATGPT_BUNDLED_CODEX_COMMAND;
  }
  return "codex";
};

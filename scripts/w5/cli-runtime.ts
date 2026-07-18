import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { resolveCodexCliCommand } from "@/src/adapters/codex-cli/command";
import {
  preflightCodexCliRuntime,
  type CodexCliInspector,
} from "@/src/adapters/codex-cli/preflight";

const resolveExecutableFile = async ({
  command,
  env,
}: {
  command: string;
  env: NodeJS.ProcessEnv;
}): Promise<string> => {
  const candidates = path.isAbsolute(command)
    ? [command]
    : (env.PATH ?? "")
        .split(path.delimiter)
        .filter((directory) => directory.length > 0)
        .map((directory) => path.join(directory, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      const resolved = await realpath(candidate);
      const stat = await lstat(resolved);
      if (stat.isFile() && !stat.isSymbolicLink()) return resolved;
    } catch {
      // Continue until one exact executable file is found.
    }
  }
  throw new Error("w5_codex_cli_executable_unavailable");
};

const sha256File = async (filePath: string): Promise<string> => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
};

export type W5CodexRuntime = {
  command: string;
  receipt: {
    schemaVersion: "w5.codex_cli_runtime.v1";
    transport: "codex_cli";
    requestedModel: "gpt-5.6-sol";
    actualModelIdentity: "unreported";
    reasoningEffort: "unreported";
    commandPath: string;
    commandFileBytes: number;
    commandFileSha256: string;
    cliVersion: string;
    auth: "chatgpt";
    requiredFlags: readonly string[];
  };
};

export const prepareW5CodexRuntime = async ({
  env = process.env,
  inspector,
}: {
  env?: NodeJS.ProcessEnv;
  inspector?: CodexCliInspector;
} = {}): Promise<W5CodexRuntime> => {
  const resolved = await resolveCodexCliCommand(env);
  const command = await resolveExecutableFile({ command: resolved, env });
  const preflight = preflightCodexCliRuntime({ command, inspector, env });
  const stat = await lstat(command);
  const commandFileSha256 = await sha256File(command);
  const statAfterHash = await lstat(command);
  if (
    stat.size !== statAfterHash.size ||
    stat.mtimeMs !== statAfterHash.mtimeMs ||
    stat.ino !== statAfterHash.ino
  ) {
    throw new Error("w5_codex_cli_executable_changed");
  }
  return {
    command,
    receipt: {
      schemaVersion: "w5.codex_cli_runtime.v1",
      transport: "codex_cli",
      requestedModel: "gpt-5.6-sol",
      actualModelIdentity: "unreported",
      reasoningEffort: "unreported",
      commandPath: command,
      commandFileBytes: stat.size,
      commandFileSha256,
      cliVersion: preflight.cliVersion,
      auth: preflight.auth,
      requiredFlags: preflight.requiredFlags,
    },
  };
};

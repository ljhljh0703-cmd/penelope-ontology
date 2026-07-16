import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CodexCliPreflightError,
  preflightCodexCliEvidence,
} from "@/src/adapters/codex-cli/preflight";
import { parseCodexCliCaptureModeArgs } from "@/src/adapters/codex-cli/attempt";
import {
  CodexCliCommandResolutionError,
  resolveCodexCliCommand,
} from "@/src/adapters/codex-cli/command";

export const runCodexCliPreflightCli = async ({
  args = process.argv.slice(2),
  root = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  args?: readonly string[];
  root?: string;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
} = {}): Promise<number> => {
  try {
    const mode = parseCodexCliCaptureModeArgs(args);
    const command = await resolveCodexCliCommand();
    const { report } = await preflightCodexCliEvidence({ root, mode, command });
    stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof CodexCliPreflightError
      ? error.code
      : error instanceof CodexCliCommandResolutionError
        ? error.code
      : "unexpected_failure";
    stderr.write(
      `${JSON.stringify({ schemaVersion: 1, evidenceType: "codex_cli_capture_preflight", ready: false, code })}\n`,
    );
    return 1;
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void runCodexCliPreflightCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

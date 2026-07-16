import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Environment } from "@/src/adapters/openai/gpt56-config";
import {
  LivePreflightError,
  preflightLiveEvidence,
  type LiveCaptureMode,
  type LivePreflightFailureCode,
  type LivePreflightLoaders,
} from "@/src/evidence/live-preflight";

type CliFailureCode =
  | LivePreflightFailureCode
  | "arguments_invalid"
  | "unexpected_failure";

export class LivePreflightCliError extends Error {
  constructor(readonly code: "arguments_invalid") {
    super(code);
    this.name = "LivePreflightCliError";
  }
}

export const parseLivePreflightArgs = (
  args: readonly string[],
): LiveCaptureMode => {
  if (args.length === 0) return "primary";
  if (args.length === 1 && args[0] === "--retry") return "retry";
  throw new LivePreflightCliError("arguments_invalid");
};

export const formatLivePreflightFailure = (code: CliFailureCode): string =>
  `${JSON.stringify({
    schemaVersion: 1,
    evidenceType: "live_capture_preflight",
    ready: false,
    code,
  })}\n`;

export const runLivePreflightCli = async ({
  args = [],
  root = process.cwd(),
  env = process.env,
  loaders,
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  args?: readonly string[];
  root?: string;
  env?: Environment;
  loaders?: LivePreflightLoaders;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
} = {}): Promise<number> => {
  try {
    const mode = parseLivePreflightArgs(args);
    const report = await preflightLiveEvidence({ root, env, loaders, mode });
    stdout.write(`${JSON.stringify(report)}\n`);
    return 0;
  } catch (error) {
    const code =
      error instanceof LivePreflightError || error instanceof LivePreflightCliError
        ? error.code
        : "unexpected_failure";
    stderr.write(formatLivePreflightFailure(code));
    return 1;
  }
};

export const isDirectExecution = (
  moduleUrl: string,
  entryPath: string | undefined = process.argv[1],
): boolean =>
  entryPath !== undefined &&
  path.resolve(entryPath) === path.resolve(fileURLToPath(moduleUrl));

if (isDirectExecution(import.meta.url)) {
  void runLivePreflightCli({ args: process.argv.slice(2) }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

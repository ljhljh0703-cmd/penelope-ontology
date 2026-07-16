import { spawn } from "node:child_process";

export const DEFAULT_CODEX_CLI_TIMEOUT_MS = 120_000;
export const DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES = 4 * 1024 * 1024;

export type CodexCliProcessInvocation = {
  command: string;
  args: readonly string[];
  cwd: string;
  stdin: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  outputLimitBytes: number;
};

export type CodexCliProcessResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type CodexCliProcessRunner = (
  invocation: CodexCliProcessInvocation,
) => Promise<CodexCliProcessResult>;

export class CodexCliProcessRunnerError extends Error {
  constructor(
    readonly code: "spawn_failed" | "output_limit_exceeded",
  ) {
    super(code);
    this.name = "CodexCliProcessRunnerError";
  }
}

export const runCodexCliProcess: CodexCliProcessRunner =
  async (invocation) =>
    new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      let outputBytes = 0;

      const child = spawn(invocation.command, [...invocation.args], {
        cwd: invocation.cwd,
        env: invocation.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const finishWithError = (error: CodexCliProcessRunnerError): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.kill("SIGKILL");
        reject(error);
      };

      const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
        outputBytes += chunk.byteLength;
        if (outputBytes > invocation.outputLimitBytes) {
          finishWithError(new CodexCliProcessRunnerError("output_limit_exceeded"));
          return;
        }
        if (target === "stdout") stdout += chunk.toString("utf8");
        else stderr += chunk.toString("utf8");
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        child.kill("SIGKILL");
      }, invocation.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      child.once("error", () => {
        finishWithError(new CodexCliProcessRunnerError("spawn_failed"));
      });
      child.once("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ exitCode, signal, stdout, stderr, timedOut });
      });

      child.stdin.end(invocation.stdin, "utf8");
    });

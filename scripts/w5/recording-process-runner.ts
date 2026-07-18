import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type {
  CodexCliProcessInvocation,
  CodexCliProcessResult,
  CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";

const OUTPUT_SCHEMA_FLAG = "--output-schema";
const OUTPUT_MESSAGE_FLAG = "--output-last-message";
const MAX_RECORDED_INPUT_BYTES = 16 * 1024 * 1024;

export type W5ExactBytes = {
  bytes: Buffer;
  byteLength: number;
  sha256: string;
};

export type W5RecordedProcessCall = {
  invocation: {
    command: string;
    args: readonly string[];
    cwd: string;
    timeoutMs: number;
    outputLimitBytes: number;
  };
  processCompleted: boolean;
  processResult: CodexCliProcessResult | null;
  prompt: W5ExactBytes;
  outputSchema: W5ExactBytes;
  finalMessage: W5ExactBytes | null;
  stdout: W5ExactBytes | null;
  stderr: W5ExactBytes | null;
};

export type W5ProcessCallRecorder = (
  capture: W5RecordedProcessCall,
) => void | Promise<void>;

export const sha256Bytes = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export const describeExactBytes = (
  source: string | Uint8Array,
): W5ExactBytes => {
  const bytes =
    typeof source === "string"
      ? Buffer.from(source, "utf8")
      : Buffer.from(source);
  return {
    bytes,
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  };
};

const argumentPath = (
  invocation: CodexCliProcessInvocation,
  flag: typeof OUTPUT_SCHEMA_FLAG | typeof OUTPUT_MESSAGE_FLAG,
): string => {
  const indexes = invocation.args.flatMap((value, index) =>
    value === flag ? [index] : [],
  );
  if (indexes.length !== 1) {
    throw new Error(`w5_recording_${flag.slice(2).replaceAll("-", "_")}_invalid`);
  }
  const value = invocation.args[indexes[0]! + 1];
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`w5_recording_${flag.slice(2).replaceAll("-", "_")}_invalid`);
  }
  return value;
};

const assertSafeInvocationPath = async (
  invocation: CodexCliProcessInvocation,
  target: string,
): Promise<void> => {
  const cwdStat = await lstat(invocation.cwd);
  if (!cwdStat.isDirectory() || cwdStat.isSymbolicLink()) {
    throw new Error("w5_recording_workspace_unsafe");
  }
  const realCwd = await realpath(invocation.cwd);
  const temporaryRoot = path.dirname(path.resolve(invocation.cwd));
  const realTemporaryRoot = await realpath(temporaryRoot);
  if (realCwd !== path.join(realTemporaryRoot, path.basename(invocation.cwd))) {
    throw new Error("w5_recording_workspace_unsafe");
  }

  const relative = path.relative(temporaryRoot, target);
  if (
    !relative ||
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    path.dirname(relative) !== "io"
  ) {
    throw new Error("w5_recording_io_path_unsafe");
  }

  const ioDirectory = path.dirname(target);
  const ioStat = await lstat(ioDirectory);
  if (!ioStat.isDirectory() || ioStat.isSymbolicLink()) {
    throw new Error("w5_recording_io_path_unsafe");
  }
  if ((await realpath(ioDirectory)) !== path.join(realTemporaryRoot, "io")) {
    throw new Error("w5_recording_io_path_unsafe");
  }
};

const readBoundedRegularFile = async ({
  filePath,
  maximumBytes,
  allowMissing,
}: {
  filePath: string;
  maximumBytes: number;
  allowMissing: boolean;
}): Promise<Buffer | null> => {
  let stat;
  try {
    stat = await lstat(filePath);
  } catch (error) {
    if (
      allowMissing &&
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > maximumBytes
  ) {
    throw new Error("w5_recording_artifact_unsafe");
  }
  const source = await readFile(filePath);
  if (source.byteLength !== stat.size) {
    throw new Error("w5_recording_artifact_changed");
  }
  return source;
};

/**
 * Wraps the renderer's injected process runner. The callback is awaited while
 * the renderer's isolated workspace still exists, so exact prompt, schema and
 * final-message bytes are preserved before the adapter removes that workspace.
 */
export const createW5RecordingProcessRunner = ({
  delegate,
  record,
}: {
  delegate: CodexCliProcessRunner;
  record: W5ProcessCallRecorder;
}): CodexCliProcessRunner =>
  async (invocation) => {
    const schemaPath = argumentPath(invocation, OUTPUT_SCHEMA_FLAG);
    const outputPath = argumentPath(invocation, OUTPUT_MESSAGE_FLAG);
    await Promise.all([
      assertSafeInvocationPath(invocation, schemaPath),
      assertSafeInvocationPath(invocation, outputPath),
    ]);

    const prompt = describeExactBytes(invocation.stdin);
    if (prompt.byteLength > MAX_RECORDED_INPUT_BYTES) {
      throw new Error("w5_recording_prompt_too_large");
    }
    const schemaSource = await readBoundedRegularFile({
      filePath: schemaPath,
      maximumBytes: MAX_RECORDED_INPUT_BYTES,
      allowMissing: false,
    });
    if (!schemaSource) throw new Error("w5_recording_schema_missing");
    const outputSchema = describeExactBytes(schemaSource);

    let result: CodexCliProcessResult;
    try {
      result = await delegate(invocation);
    } catch (error) {
      await record({
        invocation: {
          command: invocation.command,
          args: [...invocation.args],
          cwd: invocation.cwd,
          timeoutMs: invocation.timeoutMs,
          outputLimitBytes: invocation.outputLimitBytes,
        },
        processCompleted: false,
        processResult: null,
        prompt,
        outputSchema,
        finalMessage: null,
        stdout: null,
        stderr: null,
      });
      throw error;
    }

    const outputSource = await readBoundedRegularFile({
      filePath: outputPath,
      maximumBytes: invocation.outputLimitBytes,
      allowMissing: true,
    });
    await record({
      invocation: {
        command: invocation.command,
        args: [...invocation.args],
        cwd: invocation.cwd,
        timeoutMs: invocation.timeoutMs,
        outputLimitBytes: invocation.outputLimitBytes,
      },
      processCompleted: true,
      processResult: { ...result },
      prompt,
      outputSchema,
      finalMessage: outputSource ? describeExactBytes(outputSource) : null,
      stdout: describeExactBytes(result.stdout),
      stderr: describeExactBytes(result.stderr),
    });
    return result;
  };

export const createRecordingProcessRunner = ({
  inner,
  onRecord,
}: {
  inner: CodexCliProcessRunner;
  onRecord?: W5ProcessCallRecorder;
}): {
  runner: CodexCliProcessRunner;
  records: W5RecordedProcessCall[];
} => {
  const records: W5RecordedProcessCall[] = [];
  return {
    records,
    runner: createW5RecordingProcessRunner({
      delegate: inner,
      record: async (capture) => {
        records.push(capture);
        await onRecord?.(capture);
      },
    }),
  };
};

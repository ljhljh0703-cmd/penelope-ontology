import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRecordingProcessRunner,
  createW5RecordingProcessRunner,
  sha256Bytes,
  type W5RecordedProcessCall,
} from "@/scripts/w5/recording-process-runner";
import type {
  CodexCliProcessInvocation,
  CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeInvocation = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "w5-recording-runner-"));
  roots.push(root);
  const workspace = path.join(root, "workspace");
  const io = path.join(root, "io");
  await Promise.all([mkdir(workspace), mkdir(io)]);
  const schemaPath = path.join(io, "schema.json");
  const outputPath = path.join(io, "final.json");
  await writeFile(schemaPath, Buffer.from('{"type":"object"}\n', "utf8"));
  const invocation: CodexCliProcessInvocation = {
    command: "codex",
    args: ["exec", "--output-schema", schemaPath, "--output-last-message", outputPath],
    cwd: workspace,
    stdin: "exact prompt\nsecond line\n",
    env: { NODE_ENV: "test", SECRET_VALUE: "must-not-be-recorded" },
    timeoutMs: 1_000,
    outputLimitBytes: 1024,
  };
  return { invocation, schemaPath, outputPath };
};

describe("W5 recording process runner", () => {
  it("captures exact prompt, pre-call schema, and final bytes before cleanup", async () => {
    const { invocation, schemaPath, outputPath } = await makeInvocation();
    const captures: W5RecordedProcessCall[] = [];
    const delegate = vi.fn<CodexCliProcessRunner>(async () => {
      await writeFile(schemaPath, '{"mutated":true}\n', "utf8");
      await writeFile(outputPath, Buffer.from('{"readerProse":"raw"}\n', "utf8"));
      return {
        exitCode: 0,
        signal: null,
        stdout: "jsonl\n",
        stderr: "warning\n",
        timedOut: false,
      };
    });
    const runner = createW5RecordingProcessRunner({
      delegate,
      record: async (capture) => {
        expect(await readFile(outputPath, "utf8")).toContain("readerProse");
        captures.push(capture);
      },
    });

    const result = await runner(invocation);

    expect(result.exitCode).toBe(0);
    expect(delegate).toHaveBeenCalledOnce();
    expect(captures).toHaveLength(1);
    const capture = captures[0]!;
    expect(capture.prompt.bytes.equals(Buffer.from(invocation.stdin))).toBe(true);
    expect(capture.prompt.sha256).toBe(sha256Bytes(Buffer.from(invocation.stdin)));
    expect(capture.outputSchema.bytes.toString("utf8")).toBe('{"type":"object"}\n');
    expect(capture.finalMessage?.bytes.toString("utf8")).toBe(
      '{"readerProse":"raw"}\n',
    );
    expect(capture.stdout?.bytes.toString("utf8")).toBe("jsonl\n");
    expect(capture.stderr?.bytes.toString("utf8")).toBe("warning\n");
    expect(capture.invocation).not.toHaveProperty("env");
    expect(JSON.stringify(capture)).not.toContain("must-not-be-recorded");
  });

  it("records a failed invocation and then rethrows the original error", async () => {
    const { invocation } = await makeInvocation();
    const failure = new Error("delegate failed");
    const captures: W5RecordedProcessCall[] = [];
    const runner = createW5RecordingProcessRunner({
      delegate: async () => {
        throw failure;
      },
      record: (capture) => {
        captures.push(capture);
      },
    });

    await expect(runner(invocation)).rejects.toBe(failure);
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      processCompleted: false,
      processResult: null,
      finalMessage: null,
      stdout: null,
      stderr: null,
    });
  });

  it("offers an orchestration helper with collected records", async () => {
    const { invocation, outputPath } = await makeInvocation();
    const recorded = createRecordingProcessRunner({
      inner: async () => {
        await writeFile(outputPath, "{}\n", "utf8");
        return {
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
          timedOut: false,
        };
      },
    });

    await recorded.runner(invocation);
    expect(recorded.records).toHaveLength(1);
    expect(recorded.records[0]?.finalMessage?.bytes.toString("utf8")).toBe("{}\n");
  });

  it("fails closed for a schema path outside the renderer temporary root", async () => {
    const { invocation } = await makeInvocation();
    const external = path.join(tmpdir(), `w5-external-${Date.now()}.json`);
    roots.push(external);
    await writeFile(external, "{}\n", "utf8");
    const unsafe = {
      ...invocation,
      args: invocation.args.map((value, index) =>
        invocation.args[index - 1] === "--output-schema" ? external : value,
      ),
    };
    const delegate = vi.fn<CodexCliProcessRunner>();

    await expect(
      createW5RecordingProcessRunner({ delegate, record: vi.fn() })(unsafe),
    ).rejects.toThrow("w5_recording_io_path_unsafe");
    expect(delegate).not.toHaveBeenCalled();
  });
});

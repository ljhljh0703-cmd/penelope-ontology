import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CodexCliProcessResult,
  CodexCliProcessRunnerError,
} from "@/src/adapters/codex-cli/process-runner";
import { CODEX_CLI_MIN_GPT56_VERSION } from "@/src/adapters/codex-cli/command";

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const CODEX_CLI_FAILURE_DIAGNOSTIC_POLICY = Object.freeze({
  schemaVersion: 1 as const,
  appliesTo: "post_dispatch_failure" as const,
  persistStdout: false as const,
  persistStderr: false as const,
  persistFinalMessage: false as const,
  persistGeneratedProse: false as const,
  hashAlgorithm: "sha256" as const,
  requiredCliVersionAtLeast: CODEX_CLI_MIN_GPT56_VERSION,
  retainedFields: [
    "exitCode",
    "signal",
    "timedOut",
    "machineErrorCode",
    "stdoutBytes",
    "stderrBytes",
    "stdoutSha256",
    "stderrSha256",
    "eventTypeObservations",
  ] as const,
});

export const CODEX_CLI_ALLOWED_SIGNALS = [
  "SIGABRT",
  "SIGALRM",
  "SIGBREAK",
  "SIGBUS",
  "SIGCHLD",
  "SIGCONT",
  "SIGFPE",
  "SIGHUP",
  "SIGILL",
  "SIGINT",
  "SIGIO",
  "SIGIOT",
  "SIGKILL",
  "SIGPIPE",
  "SIGPOLL",
  "SIGPROF",
  "SIGPWR",
  "SIGQUIT",
  "SIGSEGV",
  "SIGSTKFLT",
  "SIGSTOP",
  "SIGSYS",
  "SIGTERM",
  "SIGTRAP",
  "SIGTSTP",
  "SIGTTIN",
  "SIGTTOU",
  "SIGURG",
  "SIGUSR1",
  "SIGUSR2",
  "SIGVTALRM",
  "SIGWINCH",
  "SIGXCPU",
  "SIGXFSZ",
] as const;

const CodexCliSignalSchema = z.enum(CODEX_CLI_ALLOWED_SIGNALS);

export const CodexCliMachineErrorCodeSchema = z.enum([
  "exit_zero",
  "exit_nonzero",
  "terminated_by_signal",
  "timeout",
  "spawn_failed",
  "output_limit_exceeded",
  "unknown_process_state",
]);

const CodexCliFailureEventSummarySchema = z
  .object({
    jsonLineCount: z.number().int().nonnegative(),
    unparsableLineCount: z.number().int().nonnegative(),
    threadStartedObserved: z.boolean(),
    turnStartedObserved: z.boolean(),
    turnFailedObserved: z.boolean(),
    errorEventObserved: z.boolean(),
    eventTypeObservations: z
      .array(
        z
          .object({
            eventType: z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/u),
            itemType: z
              .string()
              .regex(/^[a-z][a-z0-9_.-]{0,79}$/u)
              .nullable(),
          })
          .strict(),
      )
      .max(16)
      // Retry-1 was written immediately before event-type observations were
      // added. Keep that immutable receipt readable while all new writers
      // still emit the fields explicitly.
      .default([]),
    eventTypeObservationOverflow: z.boolean().default(false),
  })
  .strict();

export const CodexCliProcessDiagnosticsSchema = z
  .object({
    exitCode: z.number().int().nullable(),
    signal: CodexCliSignalSchema.nullable(),
    unrecognizedSignalObserved: z.boolean(),
    timedOut: z.boolean(),
    machineErrorCode: CodexCliMachineErrorCodeSchema,
    stdoutBytes: z.number().int().nonnegative(),
    stderrBytes: z.number().int().nonnegative(),
    stdoutSha256: HashSchema,
    stderrSha256: HashSchema,
    events: CodexCliFailureEventSummarySchema,
  })
  .strict();

export type CodexCliProcessDiagnostics = z.infer<
  typeof CodexCliProcessDiagnosticsSchema
>;

type RunnerFailureCode = CodexCliProcessRunnerError["code"];

const sha256Text = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const summarizeEvents = (
  stdout: string,
): z.infer<typeof CodexCliFailureEventSummarySchema> => {
  let jsonLineCount = 0;
  let unparsableLineCount = 0;
  let threadStartedObserved = false;
  let turnStartedObserved = false;
  let turnFailedObserved = false;
  let errorEventObserved = false;
  const eventTypeObservations: Array<{ eventType: string; itemType: string | null }> = [];
  let eventTypeObservationOverflow = false;
  const observedEventTypes = new Set<string>();

  const observeEventType = (eventType: string, itemType: string | null): void => {
    const key = `${eventType}\u0000${itemType ?? ""}`;
    if (observedEventTypes.has(key)) return;
    observedEventTypes.add(key);
    if (
      !/^[a-z][a-z0-9_.-]{0,79}$/u.test(eventType) ||
      (itemType !== null && !/^[a-z][a-z0-9_.-]{0,79}$/u.test(itemType))
    ) {
      eventTypeObservationOverflow = true;
      return;
    }
    if (eventTypeObservations.length === 16) {
      eventTypeObservationOverflow = true;
      return;
    }
    eventTypeObservations.push({ eventType, itemType });
  };

  for (const line of stdout.split(/\r?\n/u)) {
    if (line.length === 0) continue;
    try {
      const event = JSON.parse(line) as unknown;
      if (
        typeof event !== "object" ||
        event === null ||
        !("type" in event) ||
        typeof event.type !== "string"
      ) {
        unparsableLineCount += 1;
        continue;
      }
      jsonLineCount += 1;
      const itemType =
        "item" in event &&
        typeof event.item === "object" &&
        event.item !== null &&
        "type" in event.item &&
        typeof event.item.type === "string"
          ? event.item.type
          : null;
      observeEventType(event.type, itemType);
      if (event.type === "thread.started") threadStartedObserved = true;
      if (event.type === "turn.started") turnStartedObserved = true;
      if (event.type === "turn.failed") turnFailedObserved = true;
      if (event.type === "error") errorEventObserved = true;
    } catch {
      unparsableLineCount += 1;
    }
  }

  return {
    jsonLineCount,
    unparsableLineCount,
    threadStartedObserved,
    turnStartedObserved,
    turnFailedObserved,
    errorEventObserved,
    eventTypeObservations,
    eventTypeObservationOverflow,
  };
};

const normalizeSignal = (
  signal: NodeJS.Signals | null,
): {
  signal: z.infer<typeof CodexCliSignalSchema> | null;
  unrecognizedSignalObserved: boolean;
} => {
  const parsed = CodexCliSignalSchema.safeParse(signal);
  return parsed.success
    ? { signal: parsed.data, unrecognizedSignalObserved: false }
    : { signal: null, unrecognizedSignalObserved: signal !== null };
};

const machineCodeForResult = (
  result: CodexCliProcessResult,
): z.infer<typeof CodexCliMachineErrorCodeSchema> => {
  if (result.timedOut) return "timeout";
  if (result.signal !== null) return "terminated_by_signal";
  if (result.exitCode === 0) return "exit_zero";
  if (result.exitCode !== null) return "exit_nonzero";
  return "unknown_process_state";
};

export const buildCodexCliProcessDiagnostics = (
  result: CodexCliProcessResult,
): CodexCliProcessDiagnostics => {
  const signal = normalizeSignal(result.signal);
  return CodexCliProcessDiagnosticsSchema.parse({
    exitCode: result.exitCode,
    ...signal,
    timedOut: result.timedOut,
    machineErrorCode: machineCodeForResult(result),
    stdoutBytes: Buffer.byteLength(result.stdout, "utf8"),
    stderrBytes: Buffer.byteLength(result.stderr, "utf8"),
    stdoutSha256: sha256Text(result.stdout),
    stderrSha256: sha256Text(result.stderr),
    events: summarizeEvents(result.stdout),
  });
};

export const buildCodexCliRunnerFailureDiagnostics = (
  code: RunnerFailureCode,
): CodexCliProcessDiagnostics =>
  CodexCliProcessDiagnosticsSchema.parse({
    exitCode: null,
    signal: null,
    unrecognizedSignalObserved: false,
    timedOut: false,
    machineErrorCode: code,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutSha256: sha256Text(""),
    stderrSha256: sha256Text(""),
    events: summarizeEvents(""),
  });

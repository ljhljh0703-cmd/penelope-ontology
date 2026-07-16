import { describe, expect, it } from "vitest";
import {
  buildCodexCliProcessDiagnostics,
  buildCodexCliRunnerFailureDiagnostics,
  CodexCliProcessDiagnosticsSchema,
} from "@/src/adapters/codex-cli/process-diagnostics";

describe("Codex CLI process diagnostics", () => {
  it("records only bounded process metadata and event-type observations", () => {
    const secret = "generated prose must not be persisted";
    const diagnostics = buildCodexCliProcessDiagnostics({
      exitCode: 1,
      signal: null,
      timedOut: false,
      stdout: [
        JSON.stringify({ type: "thread.started", thread_id: "private" }),
        JSON.stringify({ type: "turn.started" }),
        JSON.stringify({ type: "turn.failed", error: { message: secret } }),
        JSON.stringify({ type: "error", message: secret }),
      ].join("\n"),
      stderr: secret,
    });

    expect(diagnostics).toMatchObject({
      exitCode: 1,
      signal: null,
      timedOut: false,
      machineErrorCode: "exit_nonzero",
      events: {
        jsonLineCount: 4,
        unparsableLineCount: 0,
        threadStartedObserved: true,
        turnStartedObserved: true,
        turnFailedObserved: true,
        errorEventObserved: true,
        eventTypeObservations: [
          { eventType: "thread.started", itemType: null },
          { eventType: "turn.started", itemType: null },
          { eventType: "turn.failed", itemType: null },
          { eventType: "error", itemType: null },
        ],
        eventTypeObservationOverflow: false,
      },
    });
    expect(JSON.stringify(diagnostics)).not.toContain(secret);
  });

  it("retains at most sixteen safe envelope and item type observations", () => {
    const stdout = Array.from({ length: 18 }, (_, index) =>
      JSON.stringify({
        type: `item.updated.${index}`,
        item: { type: `future_item_${index}` },
      }),
    ).join("\n");

    const diagnostics = buildCodexCliProcessDiagnostics({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout,
      stderr: "",
    });

    expect(diagnostics.events.eventTypeObservations).toHaveLength(16);
    expect(diagnostics.events.eventTypeObservations[0]).toEqual({
      eventType: "item.updated.0",
      itemType: "future_item_0",
    });
    expect(diagnostics.events.eventTypeObservationOverflow).toBe(true);
  });

  it("keeps immutable pre-observation diagnostics readable with explicit safe defaults", () => {
    const legacy = CodexCliProcessDiagnosticsSchema.parse({
      exitCode: 0,
      signal: null,
      unrecognizedSignalObserved: false,
      timedOut: false,
      machineErrorCode: "exit_zero",
      stdoutBytes: 2350,
      stdoutSha256: "0".repeat(64),
      stderrBytes: 0,
      stderrSha256: "1".repeat(64),
      events: {
        jsonLineCount: 5,
        unparsableLineCount: 0,
        threadStartedObserved: true,
        turnStartedObserved: true,
        turnFailedObserved: false,
        errorEventObserved: false,
      },
    });

    expect(legacy.events.eventTypeObservations).toEqual([]);
    expect(legacy.events.eventTypeObservationOverflow).toBe(false);
  });

  it.each([
    [{ exitCode: null, signal: "SIGTERM", timedOut: false }, "terminated_by_signal"],
    [{ exitCode: null, signal: "SIGKILL", timedOut: true }, "timeout"],
    [{ exitCode: 0, signal: null, timedOut: false }, "exit_zero"],
    [{ exitCode: null, signal: null, timedOut: false }, "unknown_process_state"],
  ] as const)("classifies %o as %s", (state, expected) => {
    const diagnostics = buildCodexCliProcessDiagnostics({
      ...state,
      stdout: "",
      stderr: "",
    });
    expect(diagnostics.machineErrorCode).toBe(expected);
  });

  it.each(["spawn_failed", "output_limit_exceeded"] as const)(
    "classifies runner failure %s without inventing stream contents",
    (code) => {
      expect(buildCodexCliRunnerFailureDiagnostics(code)).toMatchObject({
        exitCode: null,
        signal: null,
        machineErrorCode: code,
        stdoutBytes: 0,
        stderrBytes: 0,
      });
    },
  );
});

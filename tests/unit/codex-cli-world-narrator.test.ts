import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHATGPT_BUNDLED_CODEX_COMMAND } from "@/src/adapters/codex-cli/command";
import type {
  CodexCliProcessInvocation,
  CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";
import {
  CODEX_CLI_WORLD_NARRATOR_ADAPTER_ID,
  CODEX_CLI_WORLD_NARRATOR_REQUESTED_MODEL,
  buildCodexCliWorldNarratorArgs,
  buildCodexCliWorldNarratorPrompt,
  createCodexCliWorldNarrator,
} from "@/src/adapters/codex-cli/world-narrator";
import {
  WorldNarrationRequestSchema,
  type WorldNarration,
  type WorldNarrationRequest,
} from "@/src/contracts/world-narrator";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

const makeTemporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(
    path.join(tmpdir(), "penelope-world-narrator-test-"),
  );
  temporaryRoots.push(root);
  return root;
};

const request: WorldNarrationRequest = WorldNarrationRequestSchema.parse({
  focalEntityId: "penelope",
  observableFacts: [
    {
      factId: "fact.basin_at_hearth",
      summary: "A washing basin stands beside the hearth where Penelope can see it.",
    },
  ],
  focalKnowledge: [
    {
      factId: "fact.stranger_claimed_guest_memory",
      summary: "The stranger supplied a precise memory of clothing once worn by Odysseus.",
    },
  ],
  resolvedEvents: [
    {
      eventId: "event.player.orders_washing",
      source: "player",
      summary: "Penelope asks Eurycleia to wash the stranger's feet.",
    },
    {
      eventId: "event.npc.recognizes_scar",
      source: "npc",
      summary: "Eurycleia recognizes the old scar and catches her breath.",
    },
    {
      eventId: "event.world.suspicion_rises",
      source: "world",
      summary: "The sudden silence increases the risk of notice in the hall.",
    },
  ],
  previousVisibleSceneSummary:
    "Penelope questioned the stranger and found that his account matched details she remembered.",
  styleConstraints: [
    {
      constraintId: "style.concrete_pressure",
      ownership: "creator_owned_original",
      instruction: "Use concrete action and restrained dialogue instead of explanatory riddles.",
    },
  ],
  nextActionCandidates: [
    {
      actionId: "action.dismiss_melantho",
      actorEntityId: "penelope",
      actionTypeId: "dismiss_present_npc",
      label: "Dismiss Melantho",
      intent: "Send Melantho out before asking Eurycleia what she recognized.",
    },
    {
      actionId: "action.watch_in_silence",
      actorEntityId: "penelope",
      actionTypeId: "observe_without_intervening",
      label: "Watch in silence",
      intent: "Say nothing and watch how the stranger and Eurycleia respond.",
    },
  ],
});

const segmentText = [
  "The basin waits beside the hearth as Penelope tells Eurycleia to wash the stranger's feet.",
  "The old nurse kneels, draws one ankle toward the firelight, and suddenly catches her breath.",
  "Her hands stop around the scar. Water taps from her fingers into the bronze bowl, loud enough to sharpen the silence across the hall.",
  "The stranger shifts closer and fixes her with a warning look, but Penelope sees only the arrested hands, the spilled water, and the tension that follows her order.",
  "His earlier account of Odysseus's clothing returns to her now as evidence, not proof.",
  "Beyond the hearth, a servant turns at the sound, and the risk of notice grows with every heartbeat.",
  "Penelope does not name what Eurycleia may have recognized.",
  "She lets the pause hold, measuring the nurse, the stranger, and the listening hall before choosing whether to clear the room or continue watching in silence.",
].join(" ");

const narration: WorldNarration = {
  title: "The Nurse Stops at the Scar",
  prose: segmentText,
  segments: [
    {
      segmentId: "segment.hearth_recognition",
      text: segmentText,
      grounding: {
        factIds: [
          "fact.basin_at_hearth",
          "fact.stranger_claimed_guest_memory",
        ],
        eventIds: [
          "event.player.orders_washing",
          "event.npc.recognizes_scar",
          "event.world.suspicion_rises",
        ],
      },
    },
  ],
  grounding: {
    factIds: [
      "fact.basin_at_hearth",
      "fact.stranger_claimed_guest_memory",
    ],
    eventIds: [
      "event.player.orders_washing",
      "event.npc.recognizes_scar",
      "event.world.suspicion_rises",
    ],
  },
  nextActions: request.nextActionCandidates,
};

const argumentPath = (
  invocation: CodexCliProcessInvocation,
  flag: "--output-schema" | "--output-last-message",
): string => {
  const index = invocation.args.indexOf(flag);
  const value = invocation.args[index + 1];
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
};

describe("Codex CLI world narrator", () => {
  it("sends only the scoped request through an isolated GPT-5.6 CLI invocation and completes validated output", async () => {
    const tempRoot = await makeTemporaryRoot();
    const resolver = vi.fn(async () => CHATGPT_BUNDLED_CODEX_COMMAND);
    const runner = vi.fn<CodexCliProcessRunner>(async (invocation) => {
      expect(invocation.command).toBe(CHATGPT_BUNDLED_CODEX_COMMAND);
      expect(invocation.args).toEqual(
        buildCodexCliWorldNarratorArgs({
          schemaPath: argumentPath(invocation, "--output-schema"),
          outputPath: argumentPath(invocation, "--output-last-message"),
        }),
      );
      expect(invocation.args).toContain("--ephemeral");
      expect(invocation.args).toContain("--ignore-user-config");
      expect(invocation.args).toContain("--ignore-rules");
      expect(invocation.args).toContain("--skip-git-repo-check");
      expect(invocation.args).toContain("read-only");
      expect(invocation.args).toContain(
        CODEX_CLI_WORLD_NARRATOR_REQUESTED_MODEL,
      );
      expect(invocation.args).not.toContain("--json");
      expect(invocation.args.at(-1)).toBe("-");
      expect(await readdir(invocation.cwd)).toEqual([]);

      const marker = "WORLD_NARRATION_REQUEST_JSON:\n";
      const encodedRequest = invocation.stdin.slice(
        invocation.stdin.indexOf(marker) + marker.length,
      );
      expect(JSON.parse(encodedRequest)).toEqual(request);
      expect(invocation.stdin).toContain("English using 120 through 180 words");
      expect(invocation.stdin).toContain("Copy nextActionCandidates exactly");
      expect(invocation.stdin).toContain("Do not invent or mutate world state");
      expect(invocation.stdin).toContain(
        "Do not run commands, inspect files, call tools, use MCP, or browse the web",
      );
      expect(invocation.stdin).not.toContain("withheldFacts");
      expect(invocation.stdin).not.toContain("true_state");
      expect(invocation.stdin).not.toContain("branchId");
      expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
      expect(invocation.env.CODEX_API_KEY).toBeUndefined();

      const schema = JSON.parse(
        await readFile(argumentPath(invocation, "--output-schema"), "utf8"),
      ) as Record<string, unknown>;
      expect(schema.type).toBe("object");
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        JSON.stringify(narration),
        "utf8",
      );
      return {
        exitCode: 0,
        signal: null,
        stdout: "untrusted progress text",
        stderr: "",
        timedOut: false,
      };
    });

    const outcome = await createCodexCliWorldNarrator({
      env: {
        NODE_ENV: "test",
        HOME: "/tmp/penelope-test-home",
        CODEX_HOME: "/tmp/penelope-test-codex-home",
        PATH: "/bin",
        OPENAI_API_KEY: "placeholder",
        CODEX_API_KEY: "test-key",
      },
      commandResolver: resolver,
      processRunner: runner,
      tempRoot,
    }).narrate(request);

    expect(resolver).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledOnce();
    expect(outcome).toEqual({
      outcome: "completed",
      narration,
      trace: {
        provenance: "model",
        adapterId: CODEX_CLI_WORLD_NARRATOR_ADAPTER_ID,
      },
    });
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("rejects invalid input before command resolution or process execution", async () => {
    const resolver = vi.fn(async () => "codex");
    const runner = vi.fn<CodexCliProcessRunner>();
    const invalidRequest = { ...request, hiddenState: { identity: "secret" } };

    expect(() =>
      buildCodexCliWorldNarratorPrompt(
        invalidRequest as WorldNarrationRequest,
      ),
    ).toThrow();

    const outcome = await createCodexCliWorldNarrator({
      commandResolver: resolver,
      processRunner: runner,
    }).narrate(invalidRequest as WorldNarrationRequest);

    expect(outcome).toMatchObject({
      outcome: "rejected",
      error: { code: "world_narrator_codex_cli_request_invalid" },
      trace: {
        provenance: "model",
        adapterId: CODEX_CLI_WORLD_NARRATOR_ADAPTER_ID,
      },
    });
    expect(resolver).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });

  it("rejects output that passes JSON parsing but violates the narration schema", async () => {
    const tempRoot = await makeTemporaryRoot();
    const runner: CodexCliProcessRunner = async (invocation) => {
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        JSON.stringify({ title: "Incomplete narration" }),
        "utf8",
      );
      return {
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
      };
    };

    const outcome = await createCodexCliWorldNarrator({
      commandResolver: async () => "codex",
      processRunner: runner,
      tempRoot,
    }).narrate(request);

    expect(outcome).toMatchObject({
      outcome: "rejected",
      error: { code: "world_narrator_codex_cli_narration_invalid" },
      trace: { provenance: "model" },
    });
    expect(JSON.stringify(outcome)).not.toContain("Incomplete narration");
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("rejects semantically invalid output after schema parsing", async () => {
    const tempRoot = await makeTemporaryRoot();
    const runner: CodexCliProcessRunner = async (invocation) => {
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        JSON.stringify({
          ...narration,
          nextActions: narration.nextActions.map((action, index) =>
            index === 0 ? { ...action, label: "Rewrite the action" } : action,
          ),
        }),
        "utf8",
      );
      return {
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
      };
    };

    const outcome = await createCodexCliWorldNarrator({
      commandResolver: async () => "codex",
      processRunner: runner,
      tempRoot,
    }).narrate(request);

    expect(outcome).toMatchObject({
      outcome: "rejected",
      error: { code: "world_narrator_codex_cli_next_actions_mutated" },
      trace: { provenance: "model" },
    });
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("fails closed on timeout and nonzero process exit without a fixture fallback", async () => {
    const tempRoot = await makeTemporaryRoot();
    const timedOut = await createCodexCliWorldNarrator({
      commandResolver: async () => "codex",
      processRunner: async () => ({
        exitCode: null,
        signal: "SIGKILL",
        stdout: "partial private prose",
        stderr: "private timeout detail",
        timedOut: true,
      }),
      tempRoot,
    }).narrate(request);

    expect(timedOut).toMatchObject({
      outcome: "rejected",
      error: { code: "world_narrator_codex_cli_timeout" },
      trace: {
        provenance: "model",
        adapterId: CODEX_CLI_WORLD_NARRATOR_ADAPTER_ID,
      },
    });
    expect(JSON.stringify(timedOut)).not.toContain("partial private prose");
    expect(JSON.stringify(timedOut)).not.toContain("private timeout detail");

    const secondTempRoot = await makeTemporaryRoot();
    const failed = await createCodexCliWorldNarrator({
      commandResolver: async () => "codex",
      processRunner: async () => ({
        exitCode: 1,
        signal: null,
        stdout: "more partial prose",
        stderr: "private process failure",
        timedOut: false,
      }),
      tempRoot: secondTempRoot,
    }).narrate(request);

    expect(failed).toMatchObject({
      outcome: "rejected",
      error: { code: "world_narrator_codex_cli_process_failed" },
      trace: {
        provenance: "model",
        adapterId: CODEX_CLI_WORLD_NARRATOR_ADAPTER_ID,
      },
    });
    expect(JSON.stringify(failed)).not.toContain("more partial prose");
    expect(JSON.stringify(failed)).not.toContain("private process failure");
    expect(timedOut.trace.provenance).not.toBe("fixture");
    expect(failed.trace.provenance).not.toBe("fixture");
    expect(await readdir(tempRoot)).toEqual([]);
    expect(await readdir(secondTempRoot)).toEqual([]);
  });
});

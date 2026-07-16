import { readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { buildCodexCliCaptureApproval } from "@/src/adapters/codex-cli/approval";
import { buildCodexCliAuthorityBundle } from "@/src/adapters/codex-cli/authority";
import {
  CODEX_CLI_ISOLATION,
  CODEX_CLI_REQUESTED_MODEL,
} from "@/src/adapters/codex-cli/contracts";
import {
  buildCodexCliArgs,
  buildCodexCliEnvironment,
  createCodexCliNarrativeModel,
} from "@/src/adapters/codex-cli/narrative-model";
import { loadRegisteredCodexCliInput } from "@/src/adapters/codex-cli/preflight";
import type {
  CodexCliProcessInvocation,
  CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";
import { ModelDraftSchema } from "@/src/contracts/model-draft";

const readJson = (locator: string): unknown =>
  JSON.parse(readFileSync(locator, "utf8")) as unknown;

const draft = ModelDraftSchema.parse(
  readJson("data/world-packs/trojan-returns/drafts/red-sail-proposal.json"),
);
const finalMessage = JSON.stringify(draft);
const threadId = ["0199a213", "81c0", "7800", "8aa1", "bbab2a035a53"].join(
  "-",
);
const apiKeyName = ["OPENAI", "API", "KEY"].join("_");

const loadAuthorityFixture = async () => {
  const input = await loadRegisteredCodexCliInput();
  const bundle = buildCodexCliAuthorityBundle(input);
  const dispatchApproval = buildCodexCliCaptureApproval({
    authority: bundle.authority,
    approvalAuthoritySha256: bundle.approvalAuthoritySha256,
  });
  return { bundle, dispatchApproval };
};

const jsonl = (
  message = finalMessage,
  extraEvents: unknown[] = [],
): string =>
  [
    { type: "thread.started", thread_id: threadId },
    { type: "turn.started" },
    ...extraEvents,
    {
      type: "item.completed",
      item: { id: "item_2", type: "agent_message", text: message },
    },
    {
      type: "turn.completed",
      usage: {
        input_tokens: 400,
        cached_input_tokens: 100,
        output_tokens: 220,
        reasoning_output_tokens: 20,
      },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n") + "\n";

const outputPathFrom = (invocation: CodexCliProcessInvocation): string => {
  const index = invocation.args.indexOf("--output-last-message");
  const outputPath = invocation.args[index + 1];
  if (!outputPath) throw new Error("missing output path");
  return outputPath;
};

const successfulRunner = (
  inspect?: (invocation: CodexCliProcessInvocation) => Promise<void> | void,
): CodexCliProcessRunner => async (invocation) => {
  await inspect?.(invocation);
  await writeFile(outputPathFrom(invocation), finalMessage, "utf8");
  return {
    exitCode: 0,
    signal: null,
    stdout: jsonl(),
    stderr: "",
    timedOut: false,
  };
};

describe("Codex CLI narrative adapter", () => {
  it("uses an empty read-only ephemeral workspace and reports only observed provenance", async () => {
    const { bundle, dispatchApproval } = await loadAuthorityFixture();
    const runner = vi.fn(
      successfulRunner(async (invocation) => {
        expect(await readdir(invocation.cwd)).toEqual([]);
        expect(invocation.args).toEqual(
          buildCodexCliArgs({
            schemaPath: invocation.args[
              invocation.args.indexOf("--output-schema") + 1
            ] as string,
            outputPath: outputPathFrom(invocation),
          }),
        );
        expect(invocation.args).toContain("--ephemeral");
        expect(invocation.args).toContain("--ignore-user-config");
        expect(invocation.args).toContain("--ignore-rules");
        expect(invocation.args).toContain("--skip-git-repo-check");
        expect(invocation.args).toContain("read-only");
        expect(invocation.args).toContain(CODEX_CLI_REQUESTED_MODEL);
        expect(invocation.args.at(-1)).toBe("-");
        expect(invocation.stdin).toContain("MODEL_INPUT_JSON");
        expect(invocation.stdin).not.toContain(bundle.request.overlay.hash);
        expect(invocation.stdin).not.toContain("worldPackVersion");
        const schemaPath = invocation.args[
          invocation.args.indexOf("--output-schema") + 1
        ];
        expect(schemaPath).toBeTruthy();
        expect(JSON.parse(await readFile(schemaPath as string, "utf8"))).toHaveProperty(
          "type",
          "object",
        );
        expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
        expect(invocation.env.CODEX_API_KEY).toBeUndefined();
      }),
    );
    const model = createCodexCliNarrativeModel({
      styleProfiles: bundle.worldPack.styleProfiles,
      cliVersion: "codex-cli 0.142.5",
      dispatchApproval,
      outputSchema: bundle.outputSchema,
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        [apiKeyName]: ["must", "not", "cross", "process", "boundary"].join(
          "-",
        ),
      },
      processRunner: runner,
    });

    const generation = await model.generate(bundle.request, bundle.evidence);

    expect(runner).toHaveBeenCalledTimes(1);
    expect(generation.outcome).toMatchObject({
      outcome: "completed",
      trace: {
        transport: "codex_cli",
        requestedModel: CODEX_CLI_REQUESTED_MODEL,
        actualModel: null,
        responseId: null,
        threadId,
        cliVersion: "codex-cli 0.142.5",
        usage: {
          inputTokens: 400,
          cachedInputTokens: 100,
          outputTokens: 220,
          reasoningOutputTokens: 20,
        },
        requestSha256: bundle.authority.requestSha256,
        worldPackSha256: bundle.authority.worldPackSha256,
        modelInputSha256: bundle.authority.modelInputSha256,
        promptSha256: bundle.authority.promptSha256,
        outputSchemaSha256: bundle.authority.outputSchemaSha256,
        executionContractSha256:
          bundle.authority.executionContractSha256,
        approvalAuthoritySha256: bundle.approvalAuthoritySha256,
        isolation: CODEX_CLI_ISOLATION,
      },
    });
    expect(generation.privateCapture?.jsonl).toBe(jsonl());
  });

  it("rejects command, file, MCP, web, or tool activity in the JSONL stream", async () => {
    const { bundle, dispatchApproval } = await loadAuthorityFixture();
    for (const itemType of [
      "command_execution",
      "file_change",
      "mcp_tool_call",
      "web_search",
      "computer_tool_call",
    ]) {
      const runner: CodexCliProcessRunner = async (invocation) => {
        await writeFile(outputPathFrom(invocation), finalMessage, "utf8");
        return {
          exitCode: 0,
          signal: null,
          stdout: jsonl(finalMessage, [
            {
              type: "item.completed",
              item: { id: "item_1", type: itemType },
            },
          ]),
          stderr: "",
          timedOut: false,
        };
      };
      const generation = await createCodexCliNarrativeModel({
        styleProfiles: bundle.worldPack.styleProfiles,
        cliVersion: "codex-cli 0.142.5",
        dispatchApproval,
        outputSchema: bundle.outputSchema,
        processRunner: runner,
      }).generate(bundle.request, bundle.evidence);
      expect(generation.outcome).toMatchObject({
        outcome: "failed",
        failure: {
          kind: "prohibited_activity",
          code: "codex_cli_prohibited_activity",
        },
      });
    }
  });

  it("fails closed when thread, usage, or final-message provenance is missing or mismatched", async () => {
    const { bundle, dispatchApproval } = await loadAuthorityFixture();
    const cases = [
      {
        stdout: `${JSON.stringify({ type: "turn.started" })}\n`,
        output: finalMessage,
      },
      {
        stdout: jsonl("different final message"),
        output: finalMessage,
      },
      {
        stdout: "not-json\n",
        output: finalMessage,
      },
    ];
    for (const testCase of cases) {
      const runner: CodexCliProcessRunner = async (invocation) => {
        await writeFile(outputPathFrom(invocation), testCase.output, "utf8");
        return {
          exitCode: 0,
          signal: null,
          stdout: testCase.stdout,
          stderr: "private upstream detail",
          timedOut: false,
        };
      };
      const generation = await createCodexCliNarrativeModel({
        styleProfiles: bundle.worldPack.styleProfiles,
        cliVersion: "codex-cli 0.142.5",
        dispatchApproval,
        outputSchema: bundle.outputSchema,
        processRunner: runner,
      }).generate(bundle.request, bundle.evidence);
      expect(generation.outcome.outcome).toBe("failed");
      expect(JSON.stringify(generation.outcome)).not.toContain(
        "private upstream detail",
      );
    }
  });

  it("maps timeout and spawn failures without inventing model or response provenance", async () => {
    const { bundle, dispatchApproval } = await loadAuthorityFixture();
    const timeout = await createCodexCliNarrativeModel({
      styleProfiles: bundle.worldPack.styleProfiles,
      cliVersion: "codex-cli 0.142.5",
      dispatchApproval,
      outputSchema: bundle.outputSchema,
      processRunner: async () => ({
        exitCode: null,
        signal: "SIGKILL",
        stdout: "",
        stderr: "private timeout",
        timedOut: true,
      }),
    }).generate(bundle.request, bundle.evidence);
    const spawnFailure = await createCodexCliNarrativeModel({
      styleProfiles: bundle.worldPack.styleProfiles,
      cliVersion: "codex-cli 0.142.5",
      dispatchApproval,
      outputSchema: bundle.outputSchema,
      processRunner: async () => {
        throw new Error("private spawn detail");
      },
    }).generate(bundle.request, bundle.evidence);

    expect(timeout.outcome).toMatchObject({
      outcome: "failed",
      failure: { kind: "timeout", retryable: true },
      transport: "codex_cli",
      requestedModel: CODEX_CLI_REQUESTED_MODEL,
    });
    expect(spawnFailure.outcome).toMatchObject({
      outcome: "failed",
      failure: { kind: "process_error", retryable: false },
    });
    expect(
      JSON.stringify({
        timeout: timeout.outcome,
        spawnFailure: spawnFailure.outcome,
      }),
    ).not.toMatch(
      /private timeout|private spawn detail/u,
    );
  });

  it("rejects missing or tampered dispatch approval before the process runner", async () => {
    const { bundle, dispatchApproval } = await loadAuthorityFixture();
    const runner = vi.fn(successfulRunner());
    const missing = await createCodexCliNarrativeModel({
      styleProfiles: bundle.worldPack.styleProfiles,
      cliVersion: "codex-cli 0.142.5",
      dispatchApproval: undefined,
      outputSchema: bundle.outputSchema,
      processRunner: runner,
    }).generate(bundle.request, bundle.evidence);
    const tamperedApproval = structuredClone(dispatchApproval);
    tamperedApproval.authority.promptSha256 = "0".repeat(64);
    const tampered = await createCodexCliNarrativeModel({
      styleProfiles: bundle.worldPack.styleProfiles,
      cliVersion: "codex-cli 0.142.5",
      dispatchApproval: tamperedApproval,
      outputSchema: bundle.outputSchema,
      processRunner: runner,
    }).generate(bundle.request, bundle.evidence);

    expect(missing.outcome).toMatchObject({
      outcome: "failed",
      failure: {
        kind: "configuration_error",
        code: "codex_cli_dispatch_approval_invalid",
      },
    });
    expect(tampered.outcome).toMatchObject({
      outcome: "failed",
      failure: {
        kind: "configuration_error",
        code: "codex_cli_dispatch_approval_invalid",
      },
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("whitelists auth/runtime environment only", () => {
    const homePath = ["", "home", "test"].join("/");
    const codexHomePath = `${homePath}/.codex`;
    expect(
      buildCodexCliEnvironment({
        NODE_ENV: "test",
        PATH: "/bin",
        HOME: homePath,
        CODEX_HOME: codexHomePath,
        [apiKeyName]: ["not", "forwarded"].join("-"),
        DATABASE_URL: ["also", "not", "forwarded"].join("-"),
      }),
    ).toEqual({
      NODE_ENV: "test",
      PATH: "/bin",
      HOME: homePath,
      CODEX_HOME: codexHomePath,
    });
  });
});

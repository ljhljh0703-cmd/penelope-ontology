import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHATGPT_BUNDLED_CODEX_COMMAND,
  CODEX_CLI_COMMAND_ENV,
} from "@/src/adapters/codex-cli/command";
import {
  CODEX_CLI_STORY_REQUESTED_MODEL,
  buildCodexCliStoryArgs,
  createCodexCliStoryModel,
} from "@/src/adapters/codex-cli/story-model";
import type {
  CodexCliProcessInvocation,
  CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";
import {
  StoryModelRequestSchema,
  StoryScenarioSchema,
} from "@/src/contracts/story";
import storyScenarioJson from "@/data/story-slices/ithaca-red-sail-v1/story-scenario.json";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

const makeTemporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "penelope-story-test-"));
  temporaryRoots.push(root);
  return root;
};

const hash = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const scenario = StoryScenarioSchema.parse(storyScenarioJson);
const fixtureTurn = scenario.fixtureTurns.find(
  ({ branchId }) => branchId === "branch.quiet.scene2",
);
const acceptedChoice = scenario.choices.find(
  ({ choiceId }) => choiceId === "choice.keep_quiet_watch",
);
if (!fixtureTurn || !acceptedChoice) {
  throw new Error("The registered quiet-watch story fixture is missing.");
}
const draft = fixtureTurn.draft;

const request = StoryModelRequestSchema.parse({
  scenarioId: scenario.id,
  sceneNumber: fixtureTurn.sceneNumber,
  outputLocale: "en",
  spine: scenario.spine,
  characterDrives: scenario.characterDrives,
  styleProfile: scenario.styleProfile,
  acceptedChoice,
  allowedNextChoices: draft.suggestedContinuations,
  choiceHistory: [],
  resolution: fixtureTurn.resolution,
  resolutionInterpretation: {
    attemptedIntent: acceptedChoice.intent,
    interpretation: fixtureTurn.resolution.summary,
    failedReason: null,
    progress: "The answering light becomes meaningful evidence.",
    cost: "Telemachus carries the private watch with fewer defenders.",
  },
  sceneContract: fixtureTurn.contract,
  knowledgeScope: {
    focalCharacterId: fixtureTurn.contract.focalCharacterId,
    presentSpeakerIds: fixtureTurn.contract.presentSpeakerIds,
    allowedClaimIds: ["claim.odyssey.penelope_uncertain_fate"],
    withheldClaimIds: ["claim.odyssey.odysseus_at_ogygia"],
    claims: [
      {
        claimId: "claim.odyssey.penelope_uncertain_fate",
        summary: "Penelope does not know Odysseus's exact fate or location.",
      },
    ],
    context: "Night has fallen over Ithaca and the public bell has not rung.",
    scopeHash: "a".repeat(64),
  },
  causalContext: "The quiet watch opens a personal-risk debt from Penelope to Telemachus.",
  previousScene: scenario.opening.draft,
});

const argumentPath = (
  invocation: CodexCliProcessInvocation,
  flag: "--output-schema" | "--output-last-message",
): string => {
  const index = invocation.args.indexOf(flag);
  const value = invocation.args[index + 1];
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
};

describe("Codex CLI story model", () => {
  it("uses the bundled ChatGPT CLI, safe scoped input, and output-last-message without JSONL parsing", async () => {
    const tempRoot = await makeTemporaryRoot();
    const finalMessage = JSON.stringify(draft);
    const resolver = vi.fn(async () => CHATGPT_BUNDLED_CODEX_COMMAND);
    const runner = vi.fn<CodexCliProcessRunner>(async (invocation) => {
      expect(invocation.command).toBe(CHATGPT_BUNDLED_CODEX_COMMAND);
      expect(invocation.args).toEqual(
        buildCodexCliStoryArgs({
          schemaPath: argumentPath(invocation, "--output-schema"),
          outputPath: argumentPath(invocation, "--output-last-message"),
        }),
      );
      expect(invocation.args).toContain("--ephemeral");
      expect(invocation.args).toContain("--ignore-user-config");
      expect(invocation.args).toContain("--ignore-rules");
      expect(invocation.args).toContain("read-only");
      expect(invocation.args).toContain(CODEX_CLI_STORY_REQUESTED_MODEL);
      expect(invocation.args).not.toContain("--json");
      expect(invocation.args.at(-1)).toBe("-");
      expect(await readdir(invocation.cwd)).toEqual([]);
      expect(invocation.stdin).toContain("claim.odyssey.penelope_uncertain_fate");
      expect(invocation.stdin).not.toContain("claim.odyssey.odysseus_at_ogygia");
      expect(invocation.stdin).not.toContain("Odysseus is on Ogygia");
      expect(invocation.stdin).not.toContain("Ogygia");
      expect(invocation.stdin).toContain("creator-owned styleProfile");
      expect(invocation.stdin).toContain(
        "only what sceneContract.focalCharacterId can perceive or reasonably infer",
      );
      expect(invocation.stdin).toContain("Preserve physical continuity");
      expect(invocation.stdin).toContain("Keep evidence causally legible");
      expect(invocation.stdin).toContain("dramatize it as a refusal to name");
      expect(invocation.stdin).toContain("exact ordered concatenation");
      expect(invocation.stdin).toContain("Reuse allowedNextChoices exactly");
      expect(invocation.stdin).toContain(
        "Never narrate an allowedNextChoice as completed or already underway",
      );
      expect(invocation.stdin).toContain(
        "never transfer that choice to another actor",
      );
      expect(invocation.stdin).toContain(
        "Copy sceneContract.actionBoundary exactly into actionBoundary",
      );
      expect(invocation.stdin).toContain(
        "cite at least one relevant allowed claim",
      );
      expect(invocation.stdin).toContain(acceptedChoice.intent);
      expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
      expect(invocation.env.CODEX_API_KEY).toBeUndefined();
      const schema = JSON.parse(
        await readFile(
          argumentPath(invocation, "--output-schema"),
          "utf8",
        ),
      ) as Record<string, unknown>;
      expect(schema.type).toBe("object");
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        finalMessage,
        "utf8",
      );
      return {
        exitCode: 0,
        signal: null,
        stdout: "plain human progress, not JSONL\n",
        stderr: "",
        timedOut: false,
      };
    });

    const outcome = await createCodexCliStoryModel({
      env: {
        NODE_ENV: "test",
        HOME: "/tmp/penelope-test-home",
        CODEX_HOME: "/tmp/penelope-test-codex-home",
        PATH: "/bin",
        OPENAI_API_KEY: "test-key",
      },
      commandResolver: resolver,
      processRunner: runner,
      tempRoot,
    }).generate(request);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      outcome: "completed",
      draft,
      trace: {
        mode: "codex_cli",
        requestedModel: CODEX_CLI_STORY_REQUESTED_MODEL,
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
        outputSha256: hash(finalMessage),
        processDiagnostics: {
          exitCode: 0,
          signal: null,
          timedOut: false,
          stdoutBytes: Buffer.byteLength("plain human progress, not JSONL\n"),
          stderrBytes: 0,
        },
      },
    });
    expect(outcome.trace).not.toHaveProperty("cliVersion");
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("honors the explicit command override through the shared resolver", async () => {
    const tempRoot = await makeTemporaryRoot();
    const runner = vi.fn<CodexCliProcessRunner>(async (invocation) => {
      expect(invocation.command).toBe("codex-preview");
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        JSON.stringify(draft),
        "utf8",
      );
      return {
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
      };
    });

    const outcome = await createCodexCliStoryModel({
      env: {
        NODE_ENV: "test",
        [CODEX_CLI_COMMAND_ENV]: "codex-preview",
        HOME: "/tmp/penelope-test-home",
      },
      processRunner: runner,
      tempRoot,
    }).generate(request);

    expect(outcome.outcome).toBe("completed");
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("keeps nonzero exit diagnostics version-independent and strips raw output", async () => {
    const tempRoot = await makeTemporaryRoot();
    const stdout = "legacy cli progress with generated prose";
    const stderr = "requested model requires a newer Codex; private detail";
    const outcome = await createCodexCliStoryModel({
      env: { NODE_ENV: "test", HOME: "/tmp/penelope-test-home" },
      commandResolver: async () => "codex",
      processRunner: async () => ({
        exitCode: 1,
        signal: null,
        stdout,
        stderr,
        timedOut: false,
      }),
      tempRoot,
    }).generate(request);

    expect(outcome).toMatchObject({
      outcome: "process_error",
      error: {
        code: "story_codex_cli_process_failed",
        retryable: false,
      },
      trace: {
        requestedModel: CODEX_CLI_STORY_REQUESTED_MODEL,
        actualModel: null,
        outputSha256: null,
        processDiagnostics: {
          exitCode: 1,
          signal: null,
          timedOut: false,
          stdoutBytes: Buffer.byteLength(stdout),
          stderrBytes: Buffer.byteLength(stderr),
          stdoutSha256: hash(stdout),
          stderrSha256: hash(stderr),
        },
      },
    });
    expect(JSON.stringify(outcome)).not.toContain(stdout);
    expect(JSON.stringify(outcome)).not.toContain(stderr);
    expect(outcome.trace).not.toHaveProperty("cliVersion");
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("rejects an invalid final scene while retaining only its hash", async () => {
    const tempRoot = await makeTemporaryRoot();
    const invalidOutput = JSON.stringify({ title: "private invalid prose" });
    const runner: CodexCliProcessRunner = async (invocation) => {
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        invalidOutput,
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

    const outcome = await createCodexCliStoryModel({
      commandResolver: async () => CHATGPT_BUNDLED_CODEX_COMMAND,
      processRunner: runner,
      tempRoot,
    }).generate(request);

    expect(outcome).toMatchObject({
      outcome: "schema_error",
      error: { code: "story_codex_cli_output_schema_invalid" },
      trace: { outputSha256: hash(invalidOutput) },
    });
    expect(JSON.stringify(outcome)).not.toContain("private invalid prose");
    expect(await readdir(tempRoot)).toEqual([]);
  });
});

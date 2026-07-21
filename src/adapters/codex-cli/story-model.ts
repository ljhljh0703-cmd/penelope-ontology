import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { resolveCodexCliCommand } from "@/src/adapters/codex-cli/command";
import { buildCodexCliEnvironment } from "@/src/adapters/codex-cli/execution-contract";
import {
  DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES,
  DEFAULT_CODEX_CLI_TIMEOUT_MS,
  CodexCliProcessRunnerError,
  runCodexCliProcess,
  type CodexCliProcessInvocation,
  type CodexCliProcessResult,
  type CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";
import {
  StoryModelOutcomeSchema,
  StoryModelRequestSchema,
  StorySceneDraftSchema,
  type StoryModelOutcome,
  type StoryModelRequest,
  type StoryProcessDiagnostics,
} from "@/src/contracts/story";
import { canonicalJson } from "@/src/domain/canonical-json";
import type { StoryModel } from "@/src/ports/story-model";

export const CODEX_CLI_STORY_REQUESTED_MODEL = "gpt-5.6-terra" as const;

type MutableJsonSchemaObject = {
  properties?: Record<string, unknown>;
  required?: string[];
};

const strictStoryOutputSchema = () => {
  const schema = structuredClone(
    z.toJSONSchema(StorySceneDraftSchema, {
      target: "draft-07",
      reused: "inline",
    }),
  );
  const root = schema as MutableJsonSchemaObject;
  const continuations = root.properties?.suggestedContinuations as
    | { items?: MutableJsonSchemaObject }
    | undefined;
  const choice = continuations?.items;
  if (!choice?.properties) {
    throw new Error("The story output schema is missing continuation authority.");
  }

  // The renderer returns prepared A/B routes only. Creator-authored C
  // adjudication happens before generation and is never delegated back to the
  // model. Narrowing this surface also keeps the Responses schema fully strict.
  delete choice.properties.proposalAssessment;
  choice.properties.source = { type: "string", const: "suggested" };
  choice.required = Object.keys(choice.properties);
  return schema;
};

export const CODEX_CLI_STORY_OUTPUT_SCHEMA = strictStoryOutputSchema();

export type CodexCliStoryCommandResolver = (
  env: NodeJS.ProcessEnv,
) => Promise<string>;

export type CodexCliStoryModelOptions = {
  env?: NodeJS.ProcessEnv;
  commandResolver?: CodexCliStoryCommandResolver;
  processRunner?: CodexCliProcessRunner;
  timeoutMs?: number;
  outputLimitBytes?: number;
  tempRoot?: string;
};

type SafeStoryKnowledgeScope = Omit<
  StoryModelRequest["knowledgeScope"],
  "withheldClaimIds"
>;

export type CodexCliStoryModelInput = Omit<
  StoryModelRequest,
  "knowledgeScope"
> & {
  knowledgeScope: SafeStoryKnowledgeScope;
};

const MODEL_INSTRUCTIONS = [
  "You are the live storyteller for Penelope Ontology.",
  "Return only the structured scene draft required by the supplied JSON schema.",
  "Write the scene in English using 110 through 220 words.",
  "Treat acceptedChoice and resolutionInterpretation as the human action that must visibly cause this scene; preserve both its benefit and its cost.",
  "Apply the supplied creator-owned styleProfile to viewpoint, tense, rhythm, dialogue subtext, recurring imagery, and forbidden habits; use micro-examples as constraints, not text to copy.",
  "In limited viewpoint, narrate only what sceneContract.focalCharacterId can perceive or reasonably infer; show every other character only through observable behavior, never through that character's private judgment.",
  "Begin under active pressure, put character desires into conflict, change the situation, and end with a concrete action, discovery, deadline, or obligation.",
  "Preserve physical continuity: do not teleport a character between places, and make every new clue reachable through an explicit action or observable transition.",
  "Keep evidence causally legible: distinguish every new clue from any prop the characters themselves brought into the scene.",
  "Do not explain uncertainty in abstract narrator language such as 'remains beyond what someone can conclude'; dramatize it as a refusal to name, an unanswered question, or a withheld action.",
  "End immediately before the user's next decision. Never narrate an allowedNextChoice as completed or already underway, and never transfer that choice to another actor.",
  "Copy sceneContract.actionBoundary exactly into actionBoundary: report the accepted current action as performedAction, keep underwayActions empty, and reserve every visible next action for the user.",
  "Pay back inherited consequences and echoed causal effects without inventing new causal effects, hashes, world facts, or character-private knowledge.",
  "Ground every prose segment only in the supplied allowed claims and report the grounding claim IDs and echoed effect IDs; when allowed claims exist, cite at least one relevant allowed claim somewhere in the scene.",
  "The prose field must be the exact ordered concatenation of segment text fields separated by two newline characters; every rendered word must therefore belong to an audited segment.",
  "Reuse allowedNextChoices exactly as suggestedContinuations, including IDs, actors, labels, intents, and sources; if allowedNextChoices is empty, return no continuation and close the central question.",
  "Do not run commands, inspect files, call tools, use MCP, or browse the web. The complete safe input is below.",
].join(" ");

const sha256Text = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

export const buildCodexCliStoryInput = (
  request: StoryModelRequest,
): CodexCliStoryModelInput => {
  const parsed = StoryModelRequestSchema.parse(request);
  const allowedClaimIds = new Set(parsed.knowledgeScope.allowedClaimIds);
  const safeClaims = parsed.knowledgeScope.claims.filter(({ claimId }) =>
    allowedClaimIds.has(claimId),
  );

  return {
    ...parsed,
    knowledgeScope: {
      focalCharacterId: parsed.knowledgeScope.focalCharacterId,
      presentSpeakerIds: parsed.knowledgeScope.presentSpeakerIds,
      allowedClaimIds: parsed.knowledgeScope.allowedClaimIds,
      claims: safeClaims,
      context: parsed.knowledgeScope.context,
      scopeHash: parsed.knowledgeScope.scopeHash,
    },
  };
};

export const buildCodexCliStoryPrompt = (
  input: CodexCliStoryModelInput,
): string =>
  `${MODEL_INSTRUCTIONS}\n\nSTORY_MODEL_INPUT_JSON:\n${canonicalJson(input)}\n`;

export const buildCodexCliStoryArgs = ({
  schemaPath,
  outputPath,
}: {
  schemaPath: string;
  outputPath: string;
}): string[] => [
  "exec",
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--model",
  CODEX_CLI_STORY_REQUESTED_MODEL,
  "--output-schema",
  schemaPath,
  "--output-last-message",
  outputPath,
  "--color",
  "never",
  "-",
];

const processDiagnostics = (
  result: CodexCliProcessResult,
): StoryProcessDiagnostics => ({
  exitCode: result.exitCode,
  signal: result.signal,
  timedOut: result.timedOut,
  stdoutBytes: Buffer.byteLength(result.stdout, "utf8"),
  stderrBytes: Buffer.byteLength(result.stderr, "utf8"),
  stdoutSha256: sha256Text(result.stdout),
  stderrSha256: sha256Text(result.stderr),
});

const runnerFailureDiagnostics = (): StoryProcessDiagnostics => ({
  exitCode: null,
  signal: null,
  timedOut: false,
  stdoutBytes: 0,
  stderrBytes: 0,
  stdoutSha256: sha256Text(""),
  stderrSha256: sha256Text(""),
});

const trace = ({
  diagnostics = null,
  outputSha256 = null,
}: {
  diagnostics?: StoryProcessDiagnostics | null;
  outputSha256?: string | null;
}) => ({
  mode: "codex_cli" as const,
  requestedModel: CODEX_CLI_STORY_REQUESTED_MODEL,
  actualModel: null,
  responseId: null,
  inputTokens: null,
  outputTokens: null,
  outputSha256,
  processDiagnostics: diagnostics,
});

const failure = ({
  outcome,
  code,
  message,
  retryable,
  diagnostics = null,
  outputSha256 = null,
}: {
  outcome: Exclude<StoryModelOutcome["outcome"], "completed">;
  code: string;
  message: string;
  retryable: boolean;
  diagnostics?: StoryProcessDiagnostics | null;
  outputSha256?: string | null;
}): StoryModelOutcome =>
  StoryModelOutcomeSchema.parse({
    outcome,
    error: { code, message, retryable },
    trace: trace({ diagnostics, outputSha256 }),
  });

const validPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

const executeInTemporaryWorkspace = async ({
  request,
  root,
  command,
  env,
  runner,
  timeoutMs,
  outputLimitBytes,
}: {
  request: StoryModelRequest;
  root: string;
  command: string;
  env: NodeJS.ProcessEnv;
  runner: CodexCliProcessRunner;
  timeoutMs: number;
  outputLimitBytes: number;
}): Promise<StoryModelOutcome> => {
  const workspace = path.join(root, "workspace");
  const ioDirectory = path.join(root, "io");
  await Promise.all([mkdir(workspace), mkdir(ioDirectory)]);

  const schemaPath = path.join(ioDirectory, "story-scene.schema.json");
  const outputPath = path.join(ioDirectory, "last-message.json");
  await writeFile(
    schemaPath,
    `${canonicalJson(CODEX_CLI_STORY_OUTPUT_SCHEMA)}\n`,
    { encoding: "utf8", flag: "wx" },
  );

  const modelInput = buildCodexCliStoryInput(request);
  const invocation: CodexCliProcessInvocation = {
    command,
    args: buildCodexCliStoryArgs({ schemaPath, outputPath }),
    cwd: workspace,
    stdin: buildCodexCliStoryPrompt(modelInput),
    env: buildCodexCliEnvironment(env),
    timeoutMs,
    outputLimitBytes,
  };

  let result: CodexCliProcessResult;
  try {
    result = await runner(invocation);
  } catch (error) {
    const code = error instanceof CodexCliProcessRunnerError
      ? error.code
      : "spawn_failed";
    return failure({
      outcome: "process_error",
      code: `story_codex_cli_${code}`,
      message: "The Codex CLI process could not be completed.",
      retryable: false,
      diagnostics: runnerFailureDiagnostics(),
    });
  }

  const diagnostics = processDiagnostics(result);
  if (result.timedOut) {
    return failure({
      outcome: "timeout",
      code: "story_codex_cli_timeout",
      message: "The Codex CLI story generation timed out.",
      retryable: true,
      diagnostics,
    });
  }
  if (result.exitCode !== 0 || result.signal !== null) {
    return failure({
      outcome: "process_error",
      code: "story_codex_cli_process_failed",
      message: "The Codex CLI process exited without a usable story draft.",
      retryable: false,
      diagnostics,
    });
  }

  let finalMessage: string;
  try {
    const outputStat = await lstat(outputPath);
    if (
      !outputStat.isFile() ||
      outputStat.isSymbolicLink() ||
      outputStat.size === 0 ||
      outputStat.size > outputLimitBytes
    ) {
      throw new Error("invalid output file");
    }
    finalMessage = await readFile(outputPath, "utf8");
  } catch {
    return failure({
      outcome: "schema_error",
      code: "story_codex_cli_output_missing",
      message: "The Codex CLI did not produce a readable structured scene.",
      retryable: false,
      diagnostics,
    });
  }

  const outputSha256 = sha256Text(finalMessage);
  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(finalMessage.trim()) as unknown;
  } catch {
    return failure({
      outcome: "schema_error",
      code: "story_codex_cli_output_json_invalid",
      message: "The Codex CLI output was not valid structured JSON.",
      retryable: false,
      diagnostics,
      outputSha256,
    });
  }

  const draft = StorySceneDraftSchema.safeParse(parsedOutput);
  if (!draft.success) {
    return failure({
      outcome: "schema_error",
      code: "story_codex_cli_output_schema_invalid",
      message: "The Codex CLI output did not satisfy the story scene contract.",
      retryable: false,
      diagnostics,
      outputSha256,
    });
  }

  return StoryModelOutcomeSchema.parse({
    outcome: "completed",
    draft: draft.data,
    trace: trace({ diagnostics, outputSha256 }),
  });
};

export const createCodexCliStoryModel = (
  options: CodexCliStoryModelOptions = {},
): StoryModel => ({
  async generate(requestInput) {
    const parsedRequest = StoryModelRequestSchema.safeParse(requestInput);
    if (!parsedRequest.success) {
      return failure({
        outcome: "schema_error",
        code: "story_codex_cli_request_invalid",
        message: "The story model request did not satisfy the input contract.",
        retryable: false,
      });
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_CLI_TIMEOUT_MS;
    const outputLimitBytes =
      options.outputLimitBytes ?? DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES;
    if (
      !validPositiveInteger(timeoutMs) ||
      !validPositiveInteger(outputLimitBytes)
    ) {
      return failure({
        outcome: "configuration_error",
        code: "story_codex_cli_configuration_invalid",
        message: "The Codex CLI story transport configuration is invalid.",
        retryable: false,
      });
    }

    const sourceEnv = options.env ?? process.env;
    let command: string;
    try {
      command = await (options.commandResolver ?? resolveCodexCliCommand)(
        sourceEnv,
      );
    } catch {
      return failure({
        outcome: "configuration_error",
        code: "story_codex_cli_command_unavailable",
        message: "A usable ChatGPT-authenticated Codex CLI was not found.",
        retryable: false,
      });
    }

    let root: string;
    try {
      root = await mkdtemp(
        path.join(options.tempRoot ?? tmpdir(), "penelope-story-codex-"),
      );
    } catch {
      return failure({
        outcome: "process_error",
        code: "story_codex_cli_temp_unavailable",
        message: "The isolated Codex CLI workspace could not be created.",
        retryable: false,
      });
    }

    let outcome: StoryModelOutcome;
    try {
      outcome = await executeInTemporaryWorkspace({
        request: parsedRequest.data,
        root,
        command,
        env: sourceEnv,
        runner: options.processRunner ?? runCodexCliProcess,
        timeoutMs,
        outputLimitBytes,
      });
    } catch {
      outcome = failure({
        outcome: "process_error",
        code: "story_codex_cli_io_failed",
        message: "The isolated Codex CLI workspace failed safely.",
        retryable: false,
      });
    }

    try {
      await rm(root, { recursive: true, force: true });
    } catch {
      return failure({
        outcome: "process_error",
        code: "story_codex_cli_cleanup_failed",
        message: "The isolated Codex CLI workspace could not be cleaned.",
        retryable: false,
      });
    }
    return outcome;
  },
});

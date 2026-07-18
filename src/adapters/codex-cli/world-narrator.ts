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
  type CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";
import {
  ModelNarrationOutputSchema,
  NarrationCriticRequestSchema,
  NarrationRendererOutcomeSchema,
  NarrationRendererRequestSchema,
  type NarrationCriticRequest,
  type NarrationRendererOutcome,
  type NarrationRendererRequest,
} from "@/src/contracts/world-narrator";
import { canonicalJson } from "@/src/domain/canonical-json";
import type {
  NarrationCritic,
  NarrationRenderer,
} from "@/src/ports/world-narrator";

export const CODEX_CLI_NARRATION_RENDERER_REQUESTED_MODEL =
  "gpt-5.6-sol" as const;
export const CODEX_CLI_NARRATION_RENDERER_ADAPTER_ID =
  "narration_renderer_codex_cli_v2" as const;

export const CODEX_CLI_NARRATION_RENDERER_OUTPUT_SCHEMA = z.toJSONSchema(
  ModelNarrationOutputSchema,
  {
    target: "draft-07",
    reused: "inline",
  },
);

export type CodexCliNarrationRendererCommandResolver = (
  env: NodeJS.ProcessEnv,
) => Promise<string>;

export type CodexCliNarrationRendererOptions = {
  env?: NodeJS.ProcessEnv;
  commandResolver?: CodexCliNarrationRendererCommandResolver;
  processRunner?: CodexCliProcessRunner;
  timeoutMs?: number;
  outputLimitBytes?: number;
  tempRoot?: string;
};

const SCENE_MODE_COMPLETION: Record<
  NarrationRendererRequest["modelFacingRequest"]["sceneMode"],
  string
> = {
  setup: "Place the authorized actors and pressure without claiming a change.",
  turn: "Render the authorized action, reaction, and resolved consequence in order.",
  aftermath: "Render the already-resolved change without adding a new action.",
  transition: "Move between registered situations without inventing a change.",
  ending: "Render the computed in-world closure without naming an ending type.",
};

const FORBIDDEN_CONSTRUCTION_CRITERIA: Readonly<Record<string, string>> = {
  "FC-01": "No dialogue that teaches a theme or explains an inner state.",
  "FC-02": "No detached general-truth assertion written to sound quotable.",
  "FC-03": "No riddle, maxim, slogan, or cryptic aphorism.",
  "FC-04": "No abstract noun or place acting with a will of its own.",
  "FC-05": "No body part, object, or abstraction speaking or deciding for a character.",
  "FC-06": "No ornamental inversion used only to elevate the register.",
  "FC-07": "No verbless or subjectless fragment appended for lingering effect.",
  "FC-08": "No fake archaism, epic epithet, or period syntax.",
  "FC-09": "No chain of nominal abstractions or agentless report-register passives.",
  "FC-10": "No mirrored wrap-up or explicit explanation of the scene's meaning.",
};

const effectiveStyleLeverValues = (
  request: NarrationRendererRequest,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const [key, lever] of Object.entries(request.styleProfile.levers)) {
    values[key] = lever.value;
  }
  const state = request.styleProfile.styleStates.find(
    ({ stateId }) => stateId === request.modelFacingRequest.styleStateId,
  );
  for (const [key, value] of Object.entries(state?.leverOverrides ?? {})) {
    if (value !== undefined) values[key] = value;
  }
  return values;
};

const rendererPromptLayers = (request: NarrationRendererRequest): string => {
  const { modelFacingRequest, scenePlan, preflightReceipt } = request;
  const invariantRecords = {
    focalActorId: modelFacingRequest.focalActorId,
    presentActors: modelFacingRequest.presentActors,
    visibleFacts: modelFacingRequest.visibleFacts,
    resolvedEvents: modelFacingRequest.resolvedEvents,
    authorizedAnchors: modelFacingRequest.authorizedAnchors,
    licensedRenderingDetails: modelFacingRequest.licensedRenderingDetails,
    reservedParticipantActionsExist:
      modelFacingRequest.reservedActionIds.length > 0,
  };
  const resolvedScene = {
    sceneMode: modelFacingRequest.sceneMode,
    completionCondition:
      SCENE_MODE_COMPLETION[modelFacingRequest.sceneMode],
    authorizedActionEventIds:
      modelFacingRequest.authorizedActionEventIds,
    authorizedReactionEventIds:
      modelFacingRequest.authorizedReactionEventIds,
    authorizedChangeEventIds:
      modelFacingRequest.authorizedChangeEventIds,
    plainDramaticPlan: preflightReceipt.plainDramaticPlan,
    dialogueAuthority: preflightReceipt.dialogueAuthority,
    sentencePlans: scenePlan.sentencePlans,
  };
  const forbiddenConstructionIds =
    request.styleProfile.levers.forbiddenConstructionIds.value;
  const rendering = {
    languageProfileId: modelFacingRequest.languageProfileId,
    styleStateId: modelFacingRequest.styleStateId,
    effectiveLeverValues: effectiveStyleLeverValues(request),
    forbiddenConstructions: forbiddenConstructionIds.map((id) => ({
      id,
      criterion:
        FORBIDDEN_CONSTRUCTION_CRITERIA[id] ??
        "Follow the registered structural prohibition for this identifier.",
    })),
    endingMode:
      request.styleProfile.levers.endingMode.value[
        modelFacingRequest.sceneMode
      ],
  };

  return [
    "=== LAYER 1 : INVARIANT AUTHORITY ===",
    "Render one scene from an already-resolved world. Treat every record as a constraint, never as prose to copy. Do not invent or alter an event, motive, emotion, relationship, identity, prop, spatial relation, knowledge, or speech act. Reserved participant actions may not be performed, previewed, or referenced. Record IDs are for planReceipt only and must never appear in reader prose.",
    `INVARIANT_RECORDS_JSON:\n${canonicalJson(invariantRecords)}`,
    "=== LAYER 2 : RESOLVED SCENE AND PLAN ===",
    "Realize every sentence plan once, within its exact bindings. An empty authority list means that beat is not authorized. Dialogue is correct only when the supplied dialogue authority is licensed; otherwise silence is correct.",
    `RESOLVED_SCENE_JSON:\n${canonicalJson(resolvedScene)}`,
    "=== LAYER 3 : RENDERING STYLE AND OUTPUT ===",
    "Use the effective English levers only for expression; they never change facts. Distribution targets are advisory and ceilings are limits. Return exactly ModelNarrationOutput: planReceipt plus readerProse. Do not add an envelope, audit, validation finding, evidence receipt, or state mutation. No schema field name, record ID, or system vocabulary may appear in reader prose.",
    `RENDERING_STYLE_JSON:\n${canonicalJson(rendering)}`,
    "Do not run commands, inspect files, call tools, use MCP, or browse the web. Return only the object required by the supplied JSON schema.",
  ].join("\n\n");
};

export const buildCodexCliNarrationRendererPrompt = (
  requestInput: NarrationRendererRequest,
): string => {
  const request = NarrationRendererRequestSchema.parse(requestInput);
  return `${rendererPromptLayers(request)}\n`;
};

export const buildCodexCliNarrationCriticPrompt = (
  requestInput: NarrationCriticRequest,
): string => {
  const request = NarrationCriticRequestSchema.parse(requestInput);
  return [
    rendererPromptLayers(request.rendererRequest),
    "=== WARNING-ONLY REVISION ===",
    "Revise the prior output only to address the listed warning rules. Preserve the same scene plan, bindings, facts, events, licenses, and sentence-plan coverage. Do not add authority or content. Return one complete replacement ModelNarrationOutput; no explanation and no third pass.",
    `WARNING_RULE_IDS_JSON:\n${canonicalJson(request.warningRuleIds)}`,
    `PRIOR_MODEL_OUTPUT_JSON:\n${canonicalJson(request.priorOutput)}`,
  ].join("\n\n");
};

export const buildCodexCliNarrationRendererArgs = ({
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
  CODEX_CLI_NARRATION_RENDERER_REQUESTED_MODEL,
  "--output-schema",
  schemaPath,
  "--output-last-message",
  outputPath,
  "--color",
  "never",
  "-",
];

const positiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

const rendererTrace = () => ({
  provenance: "model" as const,
  adapterId: CODEX_CLI_NARRATION_RENDERER_ADAPTER_ID,
});

const rendererRejected = (
  code: string,
  message: string,
): NarrationRendererOutcome =>
  NarrationRendererOutcomeSchema.parse({
    outcome: "rejected",
    error: { code, message },
    trace: rendererTrace(),
  });

const executeRendererInTemporaryWorkspace = async ({
  prompt,
  root,
  command,
  env,
  runner,
  timeoutMs,
  outputLimitBytes,
}: {
  prompt: string;
  root: string;
  command: string;
  env: NodeJS.ProcessEnv;
  runner: CodexCliProcessRunner;
  timeoutMs: number;
  outputLimitBytes: number;
}): Promise<NarrationRendererOutcome> => {
  const workspace = path.join(root, "workspace");
  const ioDirectory = path.join(root, "io");
  await Promise.all([mkdir(workspace), mkdir(ioDirectory)]);

  const schemaPath = path.join(ioDirectory, "model-narration-output.schema.json");
  const outputPath = path.join(ioDirectory, "last-message.json");
  await writeFile(
    schemaPath,
    `${canonicalJson(CODEX_CLI_NARRATION_RENDERER_OUTPUT_SCHEMA)}\n`,
    { encoding: "utf8", flag: "wx" },
  );

  const invocation: CodexCliProcessInvocation = {
    command,
    args: buildCodexCliNarrationRendererArgs({ schemaPath, outputPath }),
    cwd: workspace,
    stdin: prompt,
    env: buildCodexCliEnvironment(env),
    timeoutMs,
    outputLimitBytes,
  };

  let result;
  try {
    result = await runner(invocation);
  } catch (error) {
    const suffix =
      error instanceof CodexCliProcessRunnerError
        ? error.code
        : "spawn_failed";
    return rendererRejected(
      `narration_renderer_codex_cli_${suffix}`,
      "The Codex CLI renderer process could not be completed.",
    );
  }

  if (result.timedOut) {
    return rendererRejected(
      "narration_renderer_codex_cli_timeout",
      "The Codex CLI narration render timed out.",
    );
  }
  if (result.exitCode !== 0 || result.signal !== null) {
    return rendererRejected(
      "narration_renderer_codex_cli_process_failed",
      "The Codex CLI process exited without a usable narration render.",
    );
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
    return rendererRejected(
      "narration_renderer_codex_cli_output_missing",
      "The Codex CLI did not produce a readable structured narration render.",
    );
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(finalMessage.trim()) as unknown;
  } catch {
    return rendererRejected(
      "narration_renderer_codex_cli_output_json_invalid",
      "The Codex CLI narration render was not valid structured JSON.",
    );
  }

  const modelOutput = ModelNarrationOutputSchema.safeParse(parsedOutput);
  if (!modelOutput.success) {
    return rendererRejected(
      "narration_renderer_codex_cli_output_invalid",
      modelOutput.error.issues[0]?.message ??
        "The Codex CLI narration render violated the output contract.",
    );
  }

  return NarrationRendererOutcomeSchema.parse({
    outcome: "completed",
    modelOutput: modelOutput.data,
    trace: rendererTrace(),
  });
};

export const createCodexCliNarrationRenderer = (
  options: CodexCliNarrationRendererOptions = {},
): NarrationRenderer & NarrationCritic => {
  const execute = async (prompt: string): Promise<NarrationRendererOutcome> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_CLI_TIMEOUT_MS;
    const outputLimitBytes =
      options.outputLimitBytes ?? DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES;
    if (!positiveInteger(timeoutMs) || !positiveInteger(outputLimitBytes)) {
      return rendererRejected(
        "narration_renderer_codex_cli_configuration_invalid",
        "The Codex CLI narration renderer transport configuration is invalid.",
      );
    }

    const sourceEnv = options.env ?? process.env;
    let command: string;
    try {
      command = await (options.commandResolver ?? resolveCodexCliCommand)(
        sourceEnv,
      );
    } catch {
      return rendererRejected(
        "narration_renderer_codex_cli_command_unavailable",
        "A usable ChatGPT-authenticated Codex CLI was not found.",
      );
    }

    let root: string;
    try {
      root = await mkdtemp(
        path.join(
          options.tempRoot ?? tmpdir(),
          "penelope-narration-renderer-codex-",
        ),
      );
    } catch {
      return rendererRejected(
        "narration_renderer_codex_cli_temp_unavailable",
        "The isolated Codex CLI renderer workspace could not be created.",
      );
    }

    let outcome: NarrationRendererOutcome;
    try {
      outcome = await executeRendererInTemporaryWorkspace({
        prompt,
        root,
        command,
        env: sourceEnv,
        runner: options.processRunner ?? runCodexCliProcess,
        timeoutMs,
        outputLimitBytes,
      });
    } catch {
      outcome = rendererRejected(
        "narration_renderer_codex_cli_io_failed",
        "The isolated Codex CLI renderer workspace failed safely.",
      );
    }

    try {
      await rm(root, { recursive: true, force: true });
    } catch {
      return rendererRejected(
        "narration_renderer_codex_cli_cleanup_failed",
        "The isolated Codex CLI renderer workspace could not be cleaned.",
      );
    }
    return outcome;
  };

  return {
    async render(requestInput) {
      const request = NarrationRendererRequestSchema.safeParse(requestInput);
      if (!request.success) {
        return rendererRejected(
          "narration_renderer_codex_cli_request_invalid",
          request.error.issues[0]?.message ??
            "The narration renderer request is invalid.",
        );
      }
      return execute(buildCodexCliNarrationRendererPrompt(request.data));
    },

    async revise(requestInput) {
      const request = NarrationCriticRequestSchema.safeParse(requestInput);
      if (!request.success) {
        return rendererRejected(
          "narration_renderer_codex_cli_critic_request_invalid",
          request.error.issues[0]?.message ??
            "The narration critic request is invalid.",
        );
      }
      return execute(buildCodexCliNarrationCriticPrompt(request.data));
    },
  };
};

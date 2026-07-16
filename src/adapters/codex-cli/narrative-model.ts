import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  lstat,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZodError } from "zod";
import {
  CodexCliCaptureApprovalSchema,
} from "@/src/adapters/codex-cli/approval";
import {
  CODEX_CLI_ISOLATION,
  CODEX_CLI_REQUESTED_MODEL,
  CodexCliNarrativeOutcomeSchema,
  type CodexCliNarrativeOutcome,
} from "@/src/adapters/codex-cli/contracts";
import {
  buildCodexCliArgs,
  buildCodexCliEnvironment,
  buildCodexCliExecutionContract,
} from "@/src/adapters/codex-cli/execution-contract";
import {
  CodexCliEventStreamError,
  parseCodexCliEventStream,
} from "@/src/adapters/codex-cli/event-stream";
import {
  DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES,
  DEFAULT_CODEX_CLI_TIMEOUT_MS,
  CodexCliProcessRunnerError,
  runCodexCliProcess,
  type CodexCliProcessInvocation,
  type CodexCliProcessRunner,
  type CodexCliProcessResult,
} from "@/src/adapters/codex-cli/process-runner";
import {
  buildCodexCliProcessDiagnostics,
  buildCodexCliRunnerFailureDiagnostics,
  type CodexCliProcessDiagnostics,
} from "@/src/adapters/codex-cli/process-diagnostics";
import {
  ModelDraftSchema,
} from "@/src/contracts/model-draft";
import type { CodexCliOutputSchema } from "@/src/adapters/codex-cli/output-schema";
import {
  ParticipantIntentSetSchema,
  type ParticipantIntent,
} from "@/src/contracts/participant-intent";
import {
  EvidenceBundleSchema,
  LiveRunRequestSchema,
  type CharacterAgentView,
  type EvidenceBundle,
  type RunRequest,
} from "@/src/contracts/run";
import {
  StyleProfileSetSchema,
  type StyleProfile,
} from "@/src/contracts/style-profile";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

export type CodexCliNarrativeModelInput = {
  taskType: LiveRunRequest["taskType"];
  outputLocale: LiveRunRequest["outputLocale"];
  brief: string;
  participantIntents: ParticipantIntent[];
  styleProfile: Pick<StyleProfile, "id" | "constraints">;
  evidence: {
    characterViews: CharacterAgentView[];
    context: string;
  };
};

export type CodexCliPrivateCapture = {
  jsonl: string;
  finalMessage: string;
  stderr: string;
};

export type CodexCliNarrativeGeneration = {
  outcome: CodexCliNarrativeOutcome;
  privateCapture: CodexCliPrivateCapture | null;
  processDiagnostics?: CodexCliProcessDiagnostics;
  invocation: Omit<CodexCliProcessInvocation, "env" | "stdin"> & {
    promptViaStdin: true;
  } | null;
};

export type CodexCliNarrativeModelOptions = {
  styleProfiles: ReadonlyArray<StyleProfile>;
  cliVersion: string;
  dispatchApproval: unknown;
  outputSchema: CodexCliOutputSchema;
  command?: string;
  env?: NodeJS.ProcessEnv;
  processRunner?: CodexCliProcessRunner;
  timeoutMs?: number;
  outputLimitBytes?: number;
  tempRoot?: string;
};

export type CodexCliNarrativeModel = {
  generate(
    request: unknown,
    evidence: EvidenceBundle,
  ): Promise<CodexCliNarrativeGeneration>;
};

const MODEL_INSTRUCTIONS = [
  "Return only the structured narrative draft required by the supplied schema.",
  "Use only the supplied character-scoped views and context as world evidence.",
  "Bind every utterance and action to one authorizing participant intent.",
  "Apply the selected creator-owned style constraints and report their IDs.",
  "Put unsupported additions in proposals or unknowns; do not invent hidden world facts.",
  "When the brief fixes machine IDs, counts, actions, or semantic descriptions, copy those requirements exactly rather than paraphrasing them.",
  "Write every human-readable generated text field in the requested outputLocale; preserve machine IDs and exact semantic descriptions verbatim.",
  "Do not run commands, inspect files, call tools, use MCP, or use web search. The complete input is below.",
].join(" ");

const compareIds = (left: string, right: string): number =>
  left.localeCompare(right);
const sortedIds = (ids: ReadonlyArray<string>): string[] =>
  [...ids].sort(compareIds);

const normalizeParticipantIntents = (
  intents: ReadonlyArray<ParticipantIntent>,
): ParticipantIntent[] =>
  ParticipantIntentSetSchema.parse(
    intents
      .map((intent) => ({
        ...intent,
        controlledEntityIds: sortedIds(intent.controlledEntityIds),
      }))
      .sort(({ intentId: left }, { intentId: right }) =>
        compareIds(left, right),
      ),
  );

const normalizeCharacterViews = (
  views: ReadonlyArray<CharacterAgentView>,
): CharacterAgentView[] =>
  views
    .map((view) => ({
      ...view,
      entityIds: sortedIds(view.entityIds),
      knownClaimIds: sortedIds(view.knownClaimIds),
      uncertainClaimIds: sortedIds(view.uncertainClaimIds),
      eventIds: sortedIds(view.eventIds),
      ruleIds: sortedIds(view.ruleIds),
    }))
    .sort(({ characterId: left }, { characterId: right }) =>
      compareIds(left, right),
    );

export const buildCodexCliModelInput = ({
  request,
  evidence,
  styleProfile,
}: {
  request: LiveRunRequest;
  evidence: EvidenceBundle;
  styleProfile: StyleProfile;
}): CodexCliNarrativeModelInput => {
  const parsedRequest = LiveRunRequestSchema.parse(request);
  const parsedEvidence = EvidenceBundleSchema.parse(evidence);
  return {
    taskType: parsedRequest.taskType,
    outputLocale: parsedRequest.outputLocale,
    brief: parsedRequest.brief,
    participantIntents: normalizeParticipantIntents(
      parsedRequest.participantIntents,
    ),
    styleProfile: {
      ...styleProfile,
      constraints: [...styleProfile.constraints].sort(
        ({ id: left }, { id: right }) => compareIds(left, right),
      ),
    },
    evidence: {
      characterViews: normalizeCharacterViews(parsedEvidence.characterViews),
      context: parsedEvidence.context,
    },
  };
};

export const buildCodexCliPrompt = (
  input: CodexCliNarrativeModelInput,
): string =>
  `${MODEL_INSTRUCTIONS}\n\nMODEL_INPUT_JSON:\n${canonicalJson(input)}\n`;

export { buildCodexCliArgs, buildCodexCliEnvironment };

const sha256Text = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const failure = (
  kind: "configuration_error" | "input_schema_error" | "timeout" | "process_error" | "event_stream_error" | "prohibited_activity" | "output_schema_error" | "provenance_error",
  code: string,
  retryable: boolean,
): CodexCliNarrativeOutcome =>
  CodexCliNarrativeOutcomeSchema.parse({
    outcome: "failed",
    failure: { kind, code, retryable },
    transport: "codex_cli",
    requestedModel: CODEX_CLI_REQUESTED_MODEL,
  });

const eventFailure = (
  error: CodexCliEventStreamError,
): CodexCliNarrativeOutcome => {
  if (error.code === "prohibited_activity") {
    return failure(
      "prohibited_activity",
      "codex_cli_prohibited_activity",
      false,
    );
  }
  if (
    error.code === "provenance_missing" ||
    error.code === "final_message_mismatch"
  ) {
    return failure(
      "provenance_error",
      `codex_cli_${error.code}`,
      false,
    );
  }
  return failure(
    "event_stream_error",
    `codex_cli_${error.code}`,
    false,
  );
};

const invocationReceipt = (
  invocation: CodexCliProcessInvocation,
): NonNullable<CodexCliNarrativeGeneration["invocation"]> => ({
  command: invocation.command,
  args: invocation.args,
  cwd: invocation.cwd,
  timeoutMs: invocation.timeoutMs,
  outputLimitBytes: invocation.outputLimitBytes,
  promptViaStdin: true,
});

const processFailure = (
  result: CodexCliProcessResult,
): CodexCliNarrativeOutcome => {
  if (result.timedOut) {
    return failure("timeout", "codex_cli_timeout", true);
  }
  return failure("process_error", "codex_cli_process_failed", false);
};

export const createCodexCliNarrativeModel = (
  options: CodexCliNarrativeModelOptions,
): CodexCliNarrativeModel => ({
  async generate(requestInput, evidence) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_CLI_TIMEOUT_MS;
    const outputLimitBytes =
      options.outputLimitBytes ?? DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      !Number.isInteger(outputLimitBytes) ||
      outputLimitBytes <= 0 ||
      !/^codex-cli \d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(
        options.cliVersion,
      )
    ) {
      return {
        outcome: failure(
          "configuration_error",
          "codex_cli_configuration_invalid",
          false,
        ),
        privateCapture: null,
        invocation: null,
      };
    }

    const request = LiveRunRequestSchema.safeParse(requestInput);
    const parsedProfiles = StyleProfileSetSchema.safeParse(options.styleProfiles);
    const styleProfile = request.success && parsedProfiles.success
      ? parsedProfiles.data.find(({ id }) => id === request.data.styleProfileId)
      : undefined;
    if (!request.success || !styleProfile) {
      return {
        outcome: failure(
          "input_schema_error",
          "codex_cli_input_invalid",
          false,
        ),
        privateCapture: null,
        invocation: null,
      };
    }

    let modelInput: CodexCliNarrativeModelInput;
    try {
      modelInput = buildCodexCliModelInput({
        request: request.data,
        evidence,
        styleProfile,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          outcome: failure(
            "input_schema_error",
            "codex_cli_input_invalid",
            false,
          ),
          privateCapture: null,
          invocation: null,
        };
      }
      throw error;
    }

    const prompt = buildCodexCliPrompt(modelInput);
    const executionContract = buildCodexCliExecutionContract({
      command: options.command ?? "codex",
      timeoutMs,
      outputLimitBytes,
    });
    const parsedApproval = CodexCliCaptureApprovalSchema.safeParse(
      options.dispatchApproval,
    );
    if (!parsedApproval.success) {
      return {
        outcome: failure(
          "configuration_error",
          "codex_cli_dispatch_approval_invalid",
          false,
        ),
        privateCapture: null,
        invocation: null,
      };
    }
    const authority = parsedApproval.data.authority;
    if (
      sha256Canonical(authority) !==
        parsedApproval.data.approvalAuthoritySha256 ||
      authority.requestSha256 !== sha256Canonical(request.data) ||
      authority.modelInputSha256 !== sha256Canonical(modelInput) ||
      authority.promptSha256 !== sha256Canonical(prompt) ||
      authority.outputSchemaSha256 !==
        sha256Canonical(options.outputSchema) ||
      authority.executionContractSha256 !==
        sha256Canonical(executionContract)
    ) {
      return {
        outcome: failure(
          "configuration_error",
          "codex_cli_dispatch_approval_invalid",
          false,
        ),
        privateCapture: null,
        invocation: null,
      };
    }

    const root = await mkdtemp(
      path.join(options.tempRoot ?? tmpdir(), "penelope-codex-cli-"),
    );
    const workingDirectory = path.join(root, "workspace");
    const ioDirectory = path.join(root, "io");
    await Promise.all([
      mkdir(workingDirectory),
      mkdir(ioDirectory),
    ]);
    const schemaPath = path.join(ioDirectory, "model-draft.schema.json");
    const outputPath = path.join(ioDirectory, "last-message.json");
    const schemaSource = `${canonicalJson(options.outputSchema)}\n`;
    await writeFile(schemaPath, schemaSource, {
      encoding: "utf8",
      flag: "wx",
    });
    if ((await readdir(workingDirectory)).length !== 0) {
      await rm(root, { recursive: true, force: true });
      return {
        outcome: failure(
          "configuration_error",
          "codex_cli_working_directory_not_empty",
          false,
        ),
        privateCapture: null,
        invocation: null,
      };
    }

    const invocation: CodexCliProcessInvocation = {
      command: options.command ?? "codex",
      args: buildCodexCliArgs({ schemaPath, outputPath }),
      cwd: workingDirectory,
      stdin: prompt,
      env: buildCodexCliEnvironment(options.env ?? process.env),
      timeoutMs,
      outputLimitBytes,
    };
    const receipt = invocationReceipt(invocation);

    try {
      let processResult: CodexCliProcessResult;
      try {
        processResult = await (options.processRunner ?? runCodexCliProcess)(
          invocation,
        );
      } catch (error) {
        const code = error instanceof CodexCliProcessRunnerError
          ? error.code
          : "spawn_failed";
        return {
          outcome: failure(
            "process_error",
            `codex_cli_${code}`,
            false,
          ),
          privateCapture: null,
          processDiagnostics: buildCodexCliRunnerFailureDiagnostics(code),
          invocation: receipt,
        };
      }

      if (processResult.timedOut || processResult.exitCode !== 0) {
        return {
          outcome: processFailure(processResult),
          privateCapture: {
            jsonl: processResult.stdout,
            finalMessage: "",
            stderr: processResult.stderr,
          },
          processDiagnostics: buildCodexCliProcessDiagnostics(processResult),
          invocation: receipt,
        };
      }

      let finalMessage: string;
      try {
        const outputStat = await lstat(outputPath);
        if (
          !outputStat.isFile() ||
          outputStat.isSymbolicLink() ||
          outputStat.size > outputLimitBytes
        ) {
          throw new Error("invalid final message file");
        }
        finalMessage = await readFile(outputPath, "utf8");
      } catch {
        return {
          outcome: failure(
            "output_schema_error",
            "codex_cli_final_message_missing",
            false,
          ),
          privateCapture: {
            jsonl: processResult.stdout,
            finalMessage: "",
            stderr: processResult.stderr,
          },
          processDiagnostics: buildCodexCliProcessDiagnostics(processResult),
          invocation: receipt,
        };
      }

      let parsedEvents: ReturnType<typeof parseCodexCliEventStream>;
      try {
        parsedEvents = parseCodexCliEventStream(
          processResult.stdout,
          finalMessage,
        );
      } catch (error) {
        const outcome = error instanceof CodexCliEventStreamError
          ? eventFailure(error)
          : failure(
              "event_stream_error",
              "codex_cli_event_stream_invalid",
              false,
            );
        return {
          outcome,
          privateCapture: {
            jsonl: processResult.stdout,
            finalMessage,
            stderr: processResult.stderr,
          },
          processDiagnostics: buildCodexCliProcessDiagnostics(processResult),
          invocation: receipt,
        };
      }

      let draft: ReturnType<typeof ModelDraftSchema.parse>;
      try {
        draft = ModelDraftSchema.parse(
          JSON.parse(finalMessage.trim()) as unknown,
        );
      } catch {
        return {
          outcome: failure(
            "output_schema_error",
            "codex_cli_output_schema_invalid",
            false,
          ),
          privateCapture: {
            jsonl: processResult.stdout,
            finalMessage,
            stderr: processResult.stderr,
          },
          processDiagnostics: buildCodexCliProcessDiagnostics(processResult),
          invocation: receipt,
        };
      }

      const outcome = CodexCliNarrativeOutcomeSchema.parse({
        outcome: "completed",
        draft,
        trace: {
          schemaVersion: 1,
          transport: "codex_cli",
          requestedModel: CODEX_CLI_REQUESTED_MODEL,
          actualModel: null,
          responseId: null,
          threadId: parsedEvents.threadId,
          cliVersion: options.cliVersion,
          usage: parsedEvents.usage,
          requestSha256: authority.requestSha256,
          worldPackSha256: authority.worldPackSha256,
          modelInputSha256: authority.modelInputSha256,
          promptSha256: authority.promptSha256,
          outputSchemaSha256: authority.outputSchemaSha256,
          executionContractSha256: authority.executionContractSha256,
          approvalAuthoritySha256:
            parsedApproval.data.approvalAuthoritySha256,
          jsonlSha256: sha256Text(processResult.stdout),
          finalMessageSha256: sha256Text(finalMessage),
          isolation: CODEX_CLI_ISOLATION,
        },
      });
      return {
        outcome,
        privateCapture: {
          jsonl: processResult.stdout,
          finalMessage,
          stderr: processResult.stderr,
        },
        processDiagnostics: buildCodexCliProcessDiagnostics(processResult),
        invocation: receipt,
      };
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

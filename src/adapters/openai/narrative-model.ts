import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";
import {
  ModelDraftSchema,
  type ModelDraft,
} from "@/src/contracts/model-draft";
import {
  NarrativeModelOutcomeSchema,
  type NarrativeModelOutcome,
} from "@/src/contracts/model-outcome";
import {
  ParticipantIntentSetSchema,
  type ParticipantIntent,
} from "@/src/contracts/participant-intent";
import {
  EvidenceBundleSchema,
  type CharacterAgentView,
  type EvidenceBundle,
  type RunRequest,
} from "@/src/contracts/run";
import {
  StyleProfileSetSchema,
  type StyleProfile,
} from "@/src/contracts/style-profile";
import type { NarrativeModel } from "@/src/ports/narrative-model";
import {
  DEFAULT_GPT56_MODEL,
  ModelConfigurationError,
  loadGpt56Config,
  type Environment,
  type Gpt56Config,
} from "@/src/adapters/openai/gpt56-config";

export const DEFAULT_OPENAI_TIMEOUT_MS = 90_000;
export const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 4_096;

const MODEL_INSTRUCTIONS = [
  "Return only the structured narrative draft required by the supplied schema.",
  "Use only the supplied character-scoped views and context as world evidence.",
  "Bind every utterance and action to one authorizing participant intent.",
  "Apply the selected creator-owned style constraints and report their IDs.",
  "Put unsupported additions in proposals or unknowns; do not invent hidden world facts.",
].join(" ");

type OpenAIClientLike = Pick<OpenAI, "responses">;
type FailureOutcome = Exclude<NarrativeModelOutcome["outcome"], "completed">;

export type OpenAiNarrativeModelOptions = {
  env?: Environment;
  client?: OpenAIClientLike;
  styleProfiles: ReadonlyArray<StyleProfile>;
  timeoutMs?: number;
};

export type OpenAINarrativeModelOptions = OpenAiNarrativeModelOptions;

const compareIds = (left: string, right: string) => left.localeCompare(right);
const sortedIds = (ids: ReadonlyArray<string>) => [...ids].sort(compareIds);

const normalizeParticipantIntents = (
  intents: ReadonlyArray<ParticipantIntent>,
): ParticipantIntent[] =>
  ParticipantIntentSetSchema.parse(
    intents
      .map((intent) => ({
        ...intent,
        controlledEntityIds: sortedIds(intent.controlledEntityIds),
      }))
      .sort(({ intentId: left }, { intentId: right }) => compareIds(left, right)),
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
    .sort(({ characterId: left }, { characterId: right }) => compareIds(left, right));

const requestedModelFromEnvironment = (env: Environment): string =>
  env.OPENAI_MODEL?.trim() || DEFAULT_GPT56_MODEL;

type ResponseMetadata = {
  id: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  } | null;
};

const failureOutcome = ({
  outcome,
  code,
  message,
  retryable,
  requestedModel,
  response,
}: {
  outcome: FailureOutcome;
  code: string;
  message: string;
  retryable: boolean;
  requestedModel: string;
  response?: ResponseMetadata;
}): NarrativeModelOutcome =>
  NarrativeModelOutcomeSchema.parse({
    outcome,
    error: { code, message, retryable },
    trace: {
      mode: "live",
      outcome,
      requestedModel,
      actualModel: response?.model ?? null,
      responseId: response?.id ?? null,
      inputTokens: response?.usage?.input_tokens ?? null,
      outputTokens: response?.usage?.output_tokens ?? null,
    },
  });

const completedOutcome = (
  draft: ModelDraft,
  config: Gpt56Config,
  response: ResponseMetadata & { usage: NonNullable<ResponseMetadata["usage"]> },
): NarrativeModelOutcome =>
  NarrativeModelOutcomeSchema.parse({
    outcome: "completed",
    draft,
    trace: {
      mode: "live",
      outcome: "completed",
      requestedModel: config.model,
      actualModel: response.model,
      responseId: response.id,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  });

const responseContainsRefusal = (response: {
  output: ReadonlyArray<{
    type: string;
    content?: ReadonlyArray<{ type: string }>;
  }>;
}): boolean =>
  response.output.some(
    (item) =>
      item.type === "message" &&
      item.content?.some((content) => content.type === "refusal"),
  );

const safeModelInput = ({
  request,
  evidence,
  styleProfile,
}: {
  request: RunRequest;
  evidence: EvidenceBundle;
  styleProfile: StyleProfile;
}) => {
  const parsedEvidence = EvidenceBundleSchema.parse(evidence);
  return {
    brief: request.brief,
    participantIntents: normalizeParticipantIntents(request.participantIntents),
    styleProfile: {
      id: styleProfile.id,
      constraints: [...styleProfile.constraints].sort(({ id: left }, { id: right }) =>
        compareIds(left, right),
      ),
    },
    evidence: {
      characterViews: normalizeCharacterViews(parsedEvidence.characterViews),
      context: parsedEvidence.context,
    },
  };
};

const isRetryableApiError = (error: unknown): boolean =>
  error instanceof APIError &&
  (error.status === undefined || error.status === 429 || error.status >= 500);

export const createOpenAiNarrativeModel = (
  options: OpenAiNarrativeModelOptions,
): NarrativeModel => {
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
  let client = options.client;

  return {
    async generate(request, evidence) {
      const requestedModel = requestedModelFromEnvironment(env);
      if (request.modelMode !== "live") {
        return failureOutcome({
          outcome: "configuration_error",
          code: "live_request_required",
          message: "The OpenAI adapter accepts live requests only.",
          retryable: false,
          requestedModel,
        });
      }

      let config: Gpt56Config;
      try {
        config = loadGpt56Config(env);
      } catch (error) {
        if (error instanceof ModelConfigurationError) {
          return failureOutcome({
            outcome: "configuration_error",
            code: "openai_live_configuration_invalid",
            message: "Live OpenAI access is disabled or incomplete.",
            retryable: false,
            requestedModel,
          });
        }
        throw error;
      }

      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        return failureOutcome({
          outcome: "configuration_error",
          code: "openai_timeout_invalid",
          message: "The OpenAI timeout must be a positive integer.",
          retryable: false,
          requestedModel: config.model,
        });
      }

      const parsedProfiles = StyleProfileSetSchema.safeParse(options.styleProfiles);
      const styleProfile = parsedProfiles.success
        ? parsedProfiles.data.find(({ id }) => id === request.styleProfileId)
        : undefined;
      if (!styleProfile) {
        return failureOutcome({
          outcome: "configuration_error",
          code: "style_profile_unavailable",
          message: "The selected style profile is unavailable or invalid.",
          retryable: false,
          requestedModel: config.model,
        });
      }

      let input: ReturnType<typeof safeModelInput>;
      try {
        input = safeModelInput({ request, evidence, styleProfile });
      } catch (error) {
        if (error instanceof ZodError) {
          return failureOutcome({
            outcome: "schema_error",
            code: "model_input_schema_invalid",
            message: "The bounded model input failed validation.",
            retryable: false,
            requestedModel: config.model,
          });
        }
        throw error;
      }

      try {
        client ??= new OpenAI({ apiKey: config.apiKey, maxRetries: 0 });
        const response = await client.responses.parse(
          {
            model: config.model,
            reasoning: { effort: config.reasoningEffort },
            instructions: MODEL_INSTRUCTIONS,
            input: JSON.stringify(input),
            max_output_tokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
            text: {
              format: zodTextFormat(ModelDraftSchema, "narrative_model_draft"),
            },
            store: false,
          },
          { timeout: timeoutMs },
        );

        if (responseContainsRefusal(response)) {
          return failureOutcome({
            outcome: "refused",
            code: "model_refused",
            message: "The model refused the bounded narrative request.",
            retryable: false,
            requestedModel: config.model,
            response,
          });
        }

        if (response.error || (response.status && response.status === "failed")) {
          return failureOutcome({
            outcome: "api_error",
            code: "openai_response_failed",
            message: "OpenAI returned a failed response.",
            retryable: false,
            requestedModel: config.model,
            response,
          });
        }

        if (response.status && response.status !== "completed") {
          return failureOutcome({
            outcome: "schema_error",
            code: "model_response_incomplete",
            message: "The model response did not complete with a structured draft.",
            retryable: false,
            requestedModel: config.model,
            response,
          });
        }

        const draft = ModelDraftSchema.safeParse(response.output_parsed);
        if (!draft.success || !response.usage) {
          return failureOutcome({
            outcome: "schema_error",
            code: "model_output_schema_invalid",
            message: "The model response did not contain a valid structured draft.",
            retryable: false,
            requestedModel: config.model,
            response,
          });
        }

        return completedOutcome(draft.data, config, {
          ...response,
          usage: response.usage,
        });
      } catch (error) {
        if (error instanceof APIConnectionTimeoutError) {
          return failureOutcome({
            outcome: "timeout",
            code: "openai_timeout",
            message: "The OpenAI request timed out.",
            retryable: true,
            requestedModel: config.model,
          });
        }
        if (error instanceof ZodError || error instanceof SyntaxError) {
          return failureOutcome({
            outcome: "schema_error",
            code: "model_output_parse_failed",
            message: "The model output could not be parsed against the strict schema.",
            retryable: false,
            requestedModel: config.model,
          });
        }
        return failureOutcome({
          outcome: "api_error",
          code: "openai_api_error",
          message: "The OpenAI request failed.",
          retryable: isRetryableApiError(error),
          requestedModel: config.model,
        });
      }
    },
  };
};

// Compatibility alias for the initial scaffold spelling. New composition code
// should use `createOpenAiNarrativeModel`.
export const createOpenAINarrativeModel = createOpenAiNarrativeModel;

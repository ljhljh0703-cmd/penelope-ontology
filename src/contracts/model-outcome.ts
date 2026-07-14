import { z } from "zod";
import { ModelDraftSchema } from "@/src/contracts/model-draft";

export const ModelOutcomeKindSchema = z.enum([
  "completed",
  "refused",
  "timeout",
  "api_error",
  "configuration_error",
  "schema_error",
]);

const FixtureCompletedTraceSchema = z
  .object({
    mode: z.literal("fixture"),
    outcome: z.literal("completed"),
    requestedModel: z.string().min(1),
    actualModel: z.null(),
    responseId: z.null(),
    inputTokens: z.null(),
    outputTokens: z.null(),
  })
  .strict();

const LiveCompletedTraceSchema = z
  .object({
    mode: z.literal("live"),
    outcome: z.literal("completed"),
    requestedModel: z.string().min(1),
    actualModel: z.string().min(1),
    responseId: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  })
  .strict();

export const CompletedModelTraceSchema = z.union([
  FixtureCompletedTraceSchema,
  LiveCompletedTraceSchema,
]);

const failureTrace = (outcome: Exclude<z.infer<typeof ModelOutcomeKindSchema>, "completed">) =>
  z
    .object({
      mode: z.enum(["fixture", "live"]),
      outcome: z.literal(outcome),
      requestedModel: z.string().min(1),
      actualModel: z.string().min(1).nullable(),
      responseId: z.string().min(1).nullable(),
      inputTokens: z.number().int().nonnegative().nullable(),
      outputTokens: z.number().int().nonnegative().nullable(),
    })
    .strict();

export const RefusedModelTraceSchema = failureTrace("refused");
export const TimeoutModelTraceSchema = failureTrace("timeout");
export const ApiErrorModelTraceSchema = failureTrace("api_error");
export const ConfigurationErrorModelTraceSchema = failureTrace("configuration_error");
export const SchemaErrorModelTraceSchema = failureTrace("schema_error");

export const ModelTraceSchema = z.union([
  CompletedModelTraceSchema,
  RefusedModelTraceSchema,
  TimeoutModelTraceSchema,
  ApiErrorModelTraceSchema,
  ConfigurationErrorModelTraceSchema,
  SchemaErrorModelTraceSchema,
]);

const ModelErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();

export const NarrativeModelOutcomeSchema = z.union([
  z
    .object({
      outcome: z.literal("completed"),
      draft: ModelDraftSchema,
      trace: CompletedModelTraceSchema,
    })
    .strict(),
  z
    .object({ outcome: z.literal("refused"), error: ModelErrorSchema, trace: RefusedModelTraceSchema })
    .strict(),
  z
    .object({ outcome: z.literal("timeout"), error: ModelErrorSchema, trace: TimeoutModelTraceSchema })
    .strict(),
  z
    .object({ outcome: z.literal("api_error"), error: ModelErrorSchema, trace: ApiErrorModelTraceSchema })
    .strict(),
  z
    .object({
      outcome: z.literal("configuration_error"),
      error: ModelErrorSchema,
      trace: ConfigurationErrorModelTraceSchema,
    })
    .strict(),
  z
    .object({ outcome: z.literal("schema_error"), error: ModelErrorSchema, trace: SchemaErrorModelTraceSchema })
    .strict(),
]);

export type ModelTrace = z.infer<typeof ModelTraceSchema>;
export type NarrativeModelOutcome = z.infer<typeof NarrativeModelOutcomeSchema>;

import { z } from "zod";
import { ModelDraftSchema } from "@/src/contracts/model-draft";

export const RunRequestSchema = z
  .object({
    worldPackId: z.string().min(1),
    canonVersion: z.string().min(1),
    intent: z.enum(["query", "scene", "action", "expand"]),
    prompt: z.string().min(1),
    scene: z
      .object({
        stateId: z.string().min(1),
        locationId: z.string().min(1),
        focalCharacterIds: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

const FixtureModelTraceSchema = z
  .object({
    mode: z.literal("fixture"),
    outcome: z.literal("fixture"),
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

const LiveNoResponseTraceSchema = z
  .object({
    mode: z.literal("live"),
    outcome: z.literal("no_response"),
    requestedModel: z.string().min(1),
    actualModel: z.null(),
    responseId: z.null(),
    inputTokens: z.null(),
    outputTokens: z.null(),
  })
  .strict();

export const ModelTraceSchema = z.union([
  FixtureModelTraceSchema,
  LiveCompletedTraceSchema,
  LiveNoResponseTraceSchema,
]);

export const HardViolationSchema = z
  .object({
    code: z.enum([
      "entity_unknown",
      "entity_state_invalid",
      "temporal_order_violation",
      "location_path_missing",
      "belief_scope_violation",
      "tradition_conflict_unresolved",
      "unsupported_claim",
      "unapproved_expansion",
      "stale_decision",
    ]),
    message: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
  })
  .strict();

export const RunResultSchema = z
  .object({
    status: z.enum(["passed", "blocked", "needs_creator_decision", "refused", "error"]),
    runId: z.string().min(1),
    evidence: z
      .object({
        entityIds: z.array(z.string().min(1)),
        claimIds: z.array(z.string().min(1)),
        eventIds: z.array(z.string().min(1)),
        ruleIds: z.array(z.string().min(1)),
      })
      .strict(),
    draft: ModelDraftSchema.nullable(),
    hardViolations: z.array(HardViolationSchema),
    modelTrace: ModelTraceSchema,
  })
  .strict();

export type RunRequest = z.infer<typeof RunRequestSchema>;
export type ModelTrace = z.infer<typeof ModelTraceSchema>;
export type RunResult = z.infer<typeof RunResultSchema>;
export type HardViolation = z.infer<typeof HardViolationSchema>;

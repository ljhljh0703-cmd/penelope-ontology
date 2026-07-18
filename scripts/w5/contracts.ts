import { z } from "zod";
import { HashSchema, IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";
import type { NarrationRendererRequest } from "@/src/contracts/world-narrator";
import type { WorldNarrationPipelineArtifacts } from "@/src/application/world-simulation-service";
import type {
  WorldSimulationSession,
  WorldTurnReceipt,
} from "@/src/contracts/world-runtime";

export const W5CaseIdSchema = z.enum([
  "case.normal_observation",
  "case.controlled_discovery",
  "case.absurd_no_render",
]);

export type W5CaseId = z.infer<typeof W5CaseIdSchema>;

export const W5TargetDispositionSchema = z.enum([
  "prose_ab",
  "structural_no_render",
]);

export const W5CaseDefinitionSchema = z
  .object({
    caseId: W5CaseIdSchema,
    publicLabel: z.string().trim().min(1).max(80),
    purpose: z.string().trim().min(12).max(400),
    inputSequence: z.array(z.string().trim().min(1).max(800)).length(2),
    targetTurn: z.number().int().min(1).max(2),
    targetDisposition: W5TargetDispositionSchema,
    expectedActionStatuses: z.array(z.enum(["accepted", "unsupported"])).length(2),
    expectedEndingId: IdentifierSchema,
  })
  .strict();

export type W5CaseDefinition = z.infer<typeof W5CaseDefinitionSchema>;

const W5RuntimeEventAuthoritySchema = z
  .object({
    eventId: IdentifierSchema,
    actionId: IdentifierSchema,
    summary: z.string().min(1),
    visibleToEntityIds: z.array(IdentifierSchema),
  })
  .strict();

const W5RendererAuthoritySchema = z
  .object({
    sceneMode: z.enum(["setup", "turn", "aftermath", "transition", "ending"]),
    focalActorId: IdentifierSchema,
    presentActors: z.array(
      z
        .object({
          entityId: IdentifierSchema,
          renderDescriptor: z.string().min(1),
          sourceFactIds: z.array(IdentifierSchema),
        })
        .strict(),
    ),
    visibleFacts: z.array(
      z
        .object({ factId: IdentifierSchema, renderText: z.string().min(1) })
        .strict(),
    ),
    resolvedEvents: z.array(
      z
        .object({
          eventId: IdentifierSchema,
          observableText: z.string().min(1),
          sourceAuthorityIds: z.array(IdentifierSchema),
        })
        .strict(),
    ),
    authorizedActionEventIds: z.array(IdentifierSchema),
    authorizedReactionEventIds: z.array(IdentifierSchema),
    authorizedChangeEventIds: z.array(IdentifierSchema),
    licensedRenderingDetails: z.array(
      z
        .object({
          licenseId: IdentifierSchema,
          category: z.string().min(1),
          contentBoundary: z.string().min(1),
          sourceAuthorityIds: z.array(IdentifierSchema),
        })
        .strict(),
    ),
    reservedActionIds: z.array(IdentifierSchema),
    reservedActionSourceBindings: z.array(
      z
        .object({
          actionId: IdentifierSchema,
          sourceIds: z.array(IdentifierSchema),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * The only A/B-shared content authority. It deliberately excludes prompt text,
 * style levers, output schemas, prose, model responses, and blind labels.
 */
export const W5CommonSceneAuthorityProjectionSchema = z
  .object({
    schemaVersion: z.literal("w5.common_scene_authority.v1"),
    caseId: W5CaseIdSchema,
    targetTurn: z.number().int().min(1).max(2),
    targetDisposition: W5TargetDispositionSchema,
    scenarioId: IdentifierSchema,
    participantInput: z.string().trim().min(1).max(800),
    beforeStateHash: HashSchema,
    afterStateHash: HashSchema,
    receiptHash: HashSchema,
    action: z
      .object({
        status: z.enum(["accepted", "unsupported"]),
        normalizedInput: z.string().min(1),
        actionId: IdentifierSchema.nullable(),
        actorEntityId: IdentifierSchema,
        targetEntityId: IdentifierSchema.nullable(),
        targetZoneId: IdentifierSchema.nullable(),
      })
      .strict(),
    runtimeEvents: z.array(W5RuntimeEventAuthoritySchema).min(1).max(3),
    endingId: IdentifierSchema.nullable(),
    rendererAuthority: W5RendererAuthoritySchema.nullable(),
  })
  .strict()
  .superRefine((authority, context) => {
    if (
      authority.targetDisposition === "prose_ab" &&
      authority.rendererAuthority === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["rendererAuthority"],
        message: "A prose A/B target requires renderer authority.",
      });
    }
    if (
      authority.targetDisposition === "structural_no_render" &&
      authority.rendererAuthority !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["rendererAuthority"],
        message: "A structural no-render target must not expose renderer authority.",
      });
    }
  });

export type W5CommonSceneAuthorityProjection = z.infer<
  typeof W5CommonSceneAuthorityProjectionSchema
>;

export const W5CommonSceneAuthoritySchema = z
  .object({
    projection: W5CommonSceneAuthorityProjectionSchema,
    commonAuthorityHash: HashSchema,
  })
  .strict();

export type W5CommonSceneAuthority = z.infer<
  typeof W5CommonSceneAuthoritySchema
>;

export type W5RenderableTurn = {
  disposition: "render";
  turn: 1 | 2;
  participantInput: string;
  beforeSession: WorldSimulationSession;
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt;
  artifacts: WorldNarrationPipelineArtifacts;
  rendererRequest: NarrationRendererRequest;
};

export type W5NoRenderTurn = {
  disposition: "no_render";
  turn: 1 | 2;
  participantInput: string;
  beforeSession: WorldSimulationSession;
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt;
  artifacts: null;
  rendererRequest: null;
  reason: "unsupported_action";
  expectedRendererCallCount: 0;
  expectedCriticCallCount: 0;
};

export type W5PreparedTurn = W5RenderableTurn | W5NoRenderTurn;

export type W5PreparedCaseRun = {
  definition: W5CaseDefinition;
  initialSession: WorldSimulationSession;
  setupArtifacts: WorldNarrationPipelineArtifacts;
  setupRendererRequest: NarrationRendererRequest;
  turns: readonly [W5PreparedTurn, W5PreparedTurn];
  finalSession: WorldSimulationSession;
  target: W5PreparedTurn;
};

export const W5HarnessIdSchema = z.enum([
  "baseline_a",
  "candidate_b_present",
  "candidate_b_past",
]);

export const W5PrivateCallPlanSchema = z
  .object({
    callId: IdentifierSchema,
    caseId: W5CaseIdSchema,
    targetTurn: z.number().int().min(1).max(2),
    harnessId: W5HarnessIdSchema,
    commonAuthorityHash: HashSchema,
    requestedModel: z.literal("gpt-5.6-sol"),
    actualModelIdentity: z.literal("unreported"),
    outputContract: z.enum(["legacy_baseline", "candidate_2_2"]),
    tense: z.enum(["unchanged", "present", "past"]),
    maximumCriticCalls: z.union([z.literal(0), z.literal(1)]),
    orderIndex: z.number().int().nonnegative(),
  })
  .strict();

export type W5PrivateCallPlan = z.infer<typeof W5PrivateCallPlanSchema>;

export const W5BlindAssignmentSchema = z
  .object({
    blindLabel: z.string().regex(/^sample-[a-z]$/u),
    callId: IdentifierSchema,
    finalOutputSha256: HashSchema,
  })
  .strict();

export const W5RatingCriterionIdSchema = z.enum([
  "clarity",
  "character_desire",
  "causal_legibility",
  "consequence_continuity",
  "no_report_register",
  "dialogue_turns_scene",
  "scene_continuity",
  "fair_consequence",
  "desire_to_continue",
]);

const FORBIDDEN_PUBLIC_CREATOR_TEXT =
  /(?:[\r\n`|<>\[\]]|file:\/\/|\/Users\/|private-submission|WORLD_NARRATION_REQUEST_JSON|INVARIANT_RECORDS_JSON|PRIOR_MODEL_OUTPUT_JSON)/iu;

export const W5PublicCreatorTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !FORBIDDEN_PUBLIC_CREATOR_TEXT.test(value), {
    message:
      "Public creator text must be one safe line without raw prose markers, Markdown control characters, or private paths.",
  });

export const W5CreatorRatingSheetSchema = z
  .object({
    blindLabel: z.string().regex(/^sample-[a-z]$/u),
    ratings: z
      .array(
        z
          .object({
            criterionId: W5RatingCriterionIdSchema,
            score: z.number().int().min(1).max(5),
            rationale: z.string().trim().min(1).max(400),
            publicRationale: W5PublicCreatorTextSchema,
          })
          .strict(),
      )
      .length(9),
    tensePreference: z.enum(["present", "past", "no_preference"]).nullable(),
    creatorDecision: z.enum(["accept", "revise_once", "reject"]),
  })
  .strict()
  .superRefine((sheet, context) => {
    addDuplicateIssues(
      sheet.ratings.map(({ criterionId }) => criterionId),
      "W5 rating criterion",
      context,
    );
  });

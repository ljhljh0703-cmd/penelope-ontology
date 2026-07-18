import { z } from "zod";
import { HashSchema, IdentifierSchema } from "@/src/contracts/common";
import {
  ModelNarrationOutputSchema,
  NarrationRendererTraceSchema,
  WorldNarratorResolvedEventSchema,
} from "@/src/contracts/world-narrator";
import { NarrationAuthorityIdentifierSchema } from "@/src/contracts/narration-license";
import {
  WorldActionCandidateSchema,
  WorldBranchCursorSchema,
  WorldSimulationEventSchema,
} from "@/src/contracts/world-runtime";

export const WorldPresentationTransportSchema = z.enum(["fixture", "codex_cli"]);
export const WORLD_CREATOR_ACCESS_TOKEN_HEADER =
  "x-penelope-creator-access" as const;

export const WorldCreatorReceiptApiRequestSchema = z
  .object({
    sessionId: z.uuid(),
    expectedStateHash: HashSchema,
  })
  .strict();

export const StartWorldSessionApiRequestSchema = z
  .object({ transport: WorldPresentationTransportSchema })
  .strict();

export const WorldTurnApiRequestSchema = z
  .object({
    sessionId: z.uuid(),
    expectedStateHash: HashSchema,
    action: z.string().trim().min(1).max(800),
    forkBeforeAction: z.boolean(),
    transport: WorldPresentationTransportSchema,
  })
  .strict();

export const WorldVisibleFactSchema = z
  .object({ id: IdentifierSchema, summary: z.string().min(1) })
  .strict();

export const WorldEndingViewSchema = z
  .object({ id: IdentifierSchema, kind: IdentifierSchema, summary: z.string().min(1) })
  .strict();

export const WorldActorStateViewSchema = z
  .object({
    entityId: IdentifierSchema,
    creatorName: z.string().min(1),
    participantLabel: z.string().min(1),
    zoneId: IdentifierSchema,
    agendaState: z.enum(["active", "blocked", "satisfied"]),
    knownPremiseIds: z.array(IdentifierSchema),
  })
  .strict();

/**
 * Public reader projection of ModelNarrationOutput. Sentence-plan bindings,
 * plan receipts, render audits, and validation evidence stay server-side.
 */
export const WorldNarrationProjectionSchema = z
  .object({
    format: z.literal("english_prose_paragraphs"),
    paragraphs: z
      .array(
        z
          .object({
            paragraphId: IdentifierSchema,
            text: z.string().min(1).max(2_400),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    prose: z.string().min(1).max(12_000),
  })
  .strict()
  .superRefine((projection, context) => {
    const composedProse = projection.paragraphs
      .map(({ text }) => text)
      .join("\n\n");
    if (projection.prose !== composedProse) {
      context.addIssue({
        code: "custom",
        path: ["prose"],
        message: "Projected prose must concatenate the ordered paragraphs.",
      });
    }
  });

export const WorldNarrationRendererViewSchema = z
  .object({
    narration: WorldNarrationProjectionSchema,
    narratorTrace: NarrationRendererTraceSchema,
  })
  .strict();

/** Parse the model root first, then deliberately drop every non-reader field. */
export const projectModelNarrationOutputForWorldApi = (
  input: unknown,
): WorldNarrationProjection => {
  const output = ModelNarrationOutputSchema.parse(input);
  return WorldNarrationProjectionSchema.parse({
    format: output.readerProse.format,
    paragraphs: output.readerProse.paragraphs.map(
      ({ paragraphId, text }) => ({ paragraphId, text }),
    ),
    prose: output.readerProse.paragraphs
      .map(({ text }) => text)
      .join("\n\n"),
  });
};

export const WorldNarrationDraftAuthoritySchema = z
  .object({
    draftId: IdentifierSchema,
    draftHash: HashSchema,
    baseCheckpointId: z.uuid(),
    baseStateHash: HashSchema,
    candidateStateHash: HashSchema,
    receiptHash: HashSchema,
    modelOutputHash: HashSchema,
    artifactsHash: HashSchema,
    traceHash: HashSchema,
    transport: WorldPresentationTransportSchema,
    forkBeforeAction: z.boolean(),
    creatorReviewRuleIds: z
      .array(NarrationAuthorityIdentifierSchema)
      .min(1)
      .superRefine((ruleIds, context) => {
        if (new Set(ruleIds).size !== ruleIds.length) {
          context.addIssue({
            code: "custom",
            message: "Creator-review rule identifiers must be unique.",
          });
        }
      }),
    expiresAtMs: z.number().int().nonnegative(),
  })
  .strict();

export const WorldNarrationPendingDraftReceiptSchema =
  WorldNarrationDraftAuthoritySchema.extend({
    createdAtMs: z.number().int().nonnegative(),
    consumed: z.literal(false),
  }).strict();

export const WorldNarrationDraftViewSchema = z
  .object({
    kind: z.literal("creator_review"),
    question: z.string().min(1).max(240),
    authority: WorldNarrationDraftAuthoritySchema,
    narration: WorldNarrationProjectionSchema,
    narratorTrace: NarrationRendererTraceSchema,
  })
  .strict();

export const WorldNarrationDraftDecisionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({ action: z.literal("approve") }).strict(),
    z
      .object({
        action: z.literal("edit"),
        paragraphs: z
          .array(
            z
              .object({
                paragraphId: IdentifierSchema,
                text: z.string().min(1).max(2_400),
              })
              .strict(),
          )
          .min(1)
          .max(8),
      })
      .strict()
      .superRefine(({ paragraphs }, context) => {
        if (
          new Set(paragraphs.map(({ paragraphId }) => paragraphId)).size !==
          paragraphs.length
        ) {
          context.addIssue({
            code: "custom",
            path: ["paragraphs"],
            message: "Edited paragraph identifiers must be unique.",
          });
        }
        if (
          paragraphs.reduce((total, { text }) => total + text.length, 0) >
          12_000
        ) {
          context.addIssue({
            code: "custom",
            path: ["paragraphs"],
            message: "Edited narration cannot exceed 12,000 characters.",
          });
        }
      }),
    z.object({ action: z.literal("reject") }).strict(),
  ],
);

export const WorldNarrationDraftDecisionApiRequestSchema = z
  .object({
    authority: WorldNarrationDraftAuthoritySchema,
    decision: WorldNarrationDraftDecisionSchema,
  })
  .strict();

export const WorldCreatorReceiptSchema = z
  .object({
    actors: z.array(WorldActorStateViewSchema),
    flags: z.array(z.object({ id: IdentifierSchema, value: z.boolean() }).strict()),
    clocks: z.array(
      z
        .object({ id: IdentifierSchema, label: z.string().min(1), value: z.number().int(), maxValue: z.number().int() })
        .strict(),
    ),
    ruleReview: z
      .object({
        sourceGroundedIds: z.array(IdentifierSchema),
        creatorApprovedNotSourceCanonIds: z.array(IdentifierSchema),
        creatorReviewRequiredIds: z.array(IdentifierSchema),
      })
      .strict(),
    events: z.array(WorldSimulationEventSchema),
    ledgerHeadHash: HashSchema.nullable(),
    receiptHash: HashSchema.nullable(),
    narrationDecisionProof: z
      .object({
        receiptHash: HashSchema,
        decision: z.enum(["approve", "edit"]),
        draftId: IdentifierSchema,
        draftHash: HashSchema,
        approvedModelOutputHash: HashSchema,
        originalCreatorReviewRuleIds: z.array(
          NarrationAuthorityIdentifierSchema,
        ),
        satisfiedCreatorReviewRuleIds: z.array(
          NarrationAuthorityIdentifierSchema,
        ),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const WorldParticipantSessionViewSchema = z
  .object({
    sessionId: z.uuid(),
    parentCheckpointId: z.uuid().nullable(),
    scenarioId: IdentifierSchema,
    title: z.string().min(1),
    participantSummary: z.string().min(1),
    transport: WorldPresentationTransportSchema,
    cursor: WorldBranchCursorSchema,
    forked: z.boolean(),
    turn: z.number().int().min(0).max(6),
    maxTurns: z.number().int().min(1).max(6),
    stateHash: HashSchema,
    status: z.enum(["active", "complete"]),
    ending: WorldEndingViewSchema.nullable(),
    focalActor: z
      .object({
        entityId: IdentifierSchema,
        label: z.string().min(1),
        description: z.string().min(1),
      })
      .strict(),
    visibleFacts: z.array(WorldVisibleFactSchema),
    visibleEvents: z.array(WorldNarratorResolvedEventSchema),
    hiddenEventCount: z.number().int().nonnegative(),
    nextActions: z.array(WorldActionCandidateSchema).max(3),
    narration: WorldNarrationProjectionSchema,
    narratorTrace: NarrationRendererTraceSchema,
  })
  .strict();

export const WorldNarrationDraftDecisionApiResponseSchema =
  z.discriminatedUnion("status", [
    z
      .object({
        status: z.literal("approved"),
        session: WorldParticipantSessionViewSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal("rejected"),
        draftId: IdentifierSchema,
        baseCheckpointId: z.uuid(),
        baseStateHash: HashSchema,
        stateChanged: z.literal(false),
      })
      .strict(),
  ]);

export type WorldPresentationTransport = z.infer<
  typeof WorldPresentationTransportSchema
>;
export type StartWorldSessionApiRequest = z.infer<
  typeof StartWorldSessionApiRequestSchema
>;
export type WorldTurnApiRequest = z.infer<typeof WorldTurnApiRequestSchema>;
export type WorldParticipantSessionView = z.infer<
  typeof WorldParticipantSessionViewSchema
>;
export type WorldCreatorReceipt = z.infer<typeof WorldCreatorReceiptSchema>;
export type WorldNarrationProjection = z.infer<
  typeof WorldNarrationProjectionSchema
>;
export type WorldNarrationRendererView = z.infer<
  typeof WorldNarrationRendererViewSchema
>;
export type WorldNarrationDraftAuthority = z.infer<
  typeof WorldNarrationDraftAuthoritySchema
>;
export type WorldNarrationPendingDraftReceipt = z.infer<
  typeof WorldNarrationPendingDraftReceiptSchema
>;
export type WorldNarrationDraftView = z.infer<
  typeof WorldNarrationDraftViewSchema
>;
export type WorldNarrationDraftDecision = z.infer<
  typeof WorldNarrationDraftDecisionSchema
>;
export type WorldNarrationDraftDecisionApiRequest = z.infer<
  typeof WorldNarrationDraftDecisionApiRequestSchema
>;
export type WorldNarrationDraftDecisionApiResponse = z.infer<
  typeof WorldNarrationDraftDecisionApiResponseSchema
>;

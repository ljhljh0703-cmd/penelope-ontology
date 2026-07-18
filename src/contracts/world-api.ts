import { z } from "zod";
import { HashSchema, IdentifierSchema } from "@/src/contracts/common";
import {
  WorldNarrationSchema,
  WorldNarratorResolvedEventSchema,
  WorldNarratorTraceSchema,
} from "@/src/contracts/world-narrator";
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
        creatorReviewRequiredIds: z.array(IdentifierSchema),
      })
      .strict(),
    events: z.array(WorldSimulationEventSchema),
    ledgerHeadHash: HashSchema.nullable(),
    receiptHash: HashSchema.nullable(),
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
    narration: WorldNarrationSchema,
    narratorTrace: WorldNarratorTraceSchema,
  })
  .strict();

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

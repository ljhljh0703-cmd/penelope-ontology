import { z } from "zod";
import { CampaignLedgerSchema } from "@/src/contracts/campaign";
import { HashSchema, IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";
import { ReactionEffectSchema } from "@/src/contracts/world-simulation";

export const WorldKnowledgeStateSchema = z
  .object({
    entityId: IdentifierSchema,
    premiseIds: z.array(IdentifierSchema),
  })
  .strict();

export const WorldActorRuntimeStateSchema = z
  .object({
    entityId: IdentifierSchema,
    zoneId: IdentifierSchema,
    agendaState: z.enum(["active", "blocked", "satisfied"]),
  })
  .strict();

export const WorldFlagRuntimeStateSchema = z
  .object({ id: IdentifierSchema, value: z.boolean() })
  .strict();

export const WorldClockRuntimeStateSchema = z
  .object({ id: IdentifierSchema, value: z.number().int().nonnegative() })
  .strict();

const WorldSimulationStateFields = {
  scenarioId: IdentifierSchema,
  turn: z.number().int().min(0).max(6),
  worldTick: z.number().int().nonnegative(),
  actors: z.array(WorldActorRuntimeStateSchema),
  knowledge: z.array(WorldKnowledgeStateSchema),
  flags: z.array(WorldFlagRuntimeStateSchema),
  clocks: z.array(WorldClockRuntimeStateSchema),
  firedReactionRuleIds: z.array(IdentifierSchema),
  status: z.enum(["active", "complete"]),
  endingId: IdentifierSchema.nullable(),
} as const;

const addStateIssues = (
  state: {
    actors: Array<{ entityId: string }>;
    knowledge: Array<{ entityId: string }>;
    flags: Array<{ id: string }>;
    clocks: Array<{ id: string }>;
    firedReactionRuleIds: string[];
  },
  context: z.RefinementCtx,
): void => {
  addDuplicateIssues(
    state.actors.map(({ entityId }) => entityId),
    "runtime actor entity id",
    context,
  );
  addDuplicateIssues(
    state.knowledge.map(({ entityId }) => entityId),
    "runtime knowledge entity id",
    context,
  );
  addDuplicateIssues(
    state.flags.map(({ id }) => id),
    "runtime flag id",
    context,
  );
  addDuplicateIssues(
    state.clocks.map(({ id }) => id),
    "runtime clock id",
    context,
  );
  addDuplicateIssues(state.firedReactionRuleIds, "fired reaction rule id", context);
};

export const WorldSimulationStatePayloadSchema = z
  .object(WorldSimulationStateFields)
  .strict()
  .superRefine(addStateIssues);

export const WorldSimulationStateSchema = z
  .object({ ...WorldSimulationStateFields, stateHash: HashSchema })
  .strict()
  .superRefine(addStateIssues);

export const ResolvedWorldActionSchema = z
  .object({
    status: z.enum(["accepted", "unsupported"]),
    rawInput: z.string().trim().min(1).max(800),
    normalizedInput: z.string().min(1).max(800),
    actionId: IdentifierSchema.nullable(),
    actorEntityId: IdentifierSchema,
    targetEntityId: IdentifierSchema.nullable(),
    targetZoneId: IdentifierSchema.nullable(),
    reason: z.string().min(1),
  })
  .strict();

export const WorldSimulationEventSchema = z
  .object({
    eventId: IdentifierSchema,
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("participant"), actorEntityId: IdentifierSchema }).strict(),
      z
        .object({
          kind: z.literal("npc"),
          actorEntityId: IdentifierSchema,
          reactionRuleId: IdentifierSchema,
        })
        .strict(),
      z.object({ kind: z.literal("world"), reactionRuleId: IdentifierSchema }).strict(),
    ]),
    actionId: IdentifierSchema,
    summary: z.string().min(1),
    effects: z.array(ReactionEffectSchema),
    visibleToEntityIds: z.array(IdentifierSchema),
  })
  .strict();

const WorldTurnReceiptFields = {
  turnId: IdentifierSchema,
  branchId: IdentifierSchema,
  turn: z.number().int().min(1).max(6),
  beforeStateHash: HashSchema,
  afterStateHash: HashSchema,
  action: ResolvedWorldActionSchema,
  events: z.array(WorldSimulationEventSchema).min(1).max(3),
  firedReactionRuleIds: z.array(IdentifierSchema).max(2),
  endingId: IdentifierSchema.nullable(),
} as const;

export const WorldTurnReceiptPayloadSchema = z
  .object(WorldTurnReceiptFields)
  .strict();

export const WorldTurnReceiptSchema = z
  .object({ ...WorldTurnReceiptFields, receiptHash: HashSchema })
  .strict();

export const WorldBranchCursorSchema = z
  .object({
    branchId: IdentifierSchema,
    parentBranchId: IdentifierSchema.nullable(),
    forkedFromReceiptHash: HashSchema.nullable(),
  })
  .strict();

export const WorldSimulationSessionSchema = z
  .object({
    scenarioId: IdentifierSchema,
    cursor: WorldBranchCursorSchema,
    state: WorldSimulationStateSchema,
    turns: z.array(WorldTurnReceiptSchema).max(6),
    ledger: CampaignLedgerSchema,
  })
  .strict();

export const WorldActionCandidateSchema = z
  .object({
    actionId: IdentifierSchema,
    label: z.string().min(1),
    suggestedInput: z.string().min(1),
    targetEntityId: IdentifierSchema.nullable(),
    targetZoneId: IdentifierSchema.nullable(),
  })
  .strict();

export type WorldSimulationStatePayload = z.infer<
  typeof WorldSimulationStatePayloadSchema
>;
export type WorldSimulationState = z.infer<typeof WorldSimulationStateSchema>;
export type ResolvedWorldAction = z.infer<typeof ResolvedWorldActionSchema>;
export type WorldSimulationEvent = z.infer<typeof WorldSimulationEventSchema>;
export type WorldTurnReceiptPayload = z.infer<typeof WorldTurnReceiptPayloadSchema>;
export type WorldTurnReceipt = z.infer<typeof WorldTurnReceiptSchema>;
export type WorldBranchCursor = z.infer<typeof WorldBranchCursorSchema>;
export type WorldSimulationSession = z.infer<typeof WorldSimulationSessionSchema>;
export type WorldActionCandidate = z.infer<typeof WorldActionCandidateSchema>;

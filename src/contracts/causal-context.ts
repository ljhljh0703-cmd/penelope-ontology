import { z } from "zod";
import { HashSchema } from "@/src/contracts/common";
import { CampaignIdentifierSchema as IdentifierSchema, CausalEffectSchema } from "@/src/contracts/campaign";

export const CausalVariableStateSchema = z
  .object({
    variableId: IdentifierSchema,
    value: IdentifierSchema,
    lastEntryHash: HashSchema,
  })
  .strict();

export const CausalRelationStateSchema = z
  .object({
    subjectEntityId: IdentifierSchema,
    objectEntityId: IdentifierSchema,
    axisId: IdentifierSchema,
    value: z.number().int(),
    lastEntryHash: HashSchema,
  })
  .strict();

export const CausalResourceStateSchema = z
  .object({
    entityId: IdentifierSchema,
    resourceId: IdentifierSchema,
    value: z.number().int(),
    lastEntryHash: HashSchema,
  })
  .strict();

export const CausalKnowledgeStateSchema = z
  .object({
    entityId: IdentifierSchema,
    claimId: IdentifierSchema,
    learnedByEntryHash: HashSchema,
  })
  .strict();

export const CausalFlagStateSchema = z
  .object({
    entityId: IdentifierSchema,
    flagId: IdentifierSchema,
    value: z.boolean(),
    lastEntryHash: HashSchema,
  })
  .strict();

export const CausalClockStateSchema = z
  .object({
    clockId: IdentifierSchema,
    value: z.number().int(),
    lastEntryHash: HashSchema,
  })
  .strict();

export const OpenCausalDebtSchema = z
  .object({
    debtEffectId: IdentifierSchema,
    debtorEntityId: IdentifierSchema,
    creditorEntityId: IdentifierSchema,
    debtKindId: IdentifierSchema,
    weight: z.number().int().min(1).max(100),
    openedByEntryHash: HashSchema,
  })
  .strict();

const CausalProjectionFields = {
  branchId: IdentifierSchema,
  cursorHash: HashSchema,
  currentStateHash: HashSchema,
  throughEntryCount: z.number().int().nonnegative(),
  variables: z.array(CausalVariableStateSchema),
  relations: z.array(CausalRelationStateSchema),
  resources: z.array(CausalResourceStateSchema),
  knowledge: z.array(CausalKnowledgeStateSchema),
  flags: z.array(CausalFlagStateSchema),
  clocks: z.array(CausalClockStateSchema),
  openDebts: z.array(OpenCausalDebtSchema),
} as const;

export const CausalProjectionPayloadSchema = z.object(CausalProjectionFields).strict();

export const CausalProjectionSchema = z
  .object({
    ...CausalProjectionFields,
    projectionHash: HashSchema,
  })
  .strict();

export const CausalEventRefSchema = z
  .object({
    id: IdentifierSchema,
    entryHash: HashSchema,
    sequence: z.number().int().nonnegative(),
    worldTick: z.number().int().nonnegative(),
    sourceKind: z.enum(["player", "npc", "world"]),
    actorEntityId: IdentifierSchema.nullable(),
    actionTypeId: IdentifierSchema,
    targetEntityIds: z.array(IdentifierSchema),
    causeEventIds: z.array(IdentifierSchema),
    evidenceClaimIds: z.array(IdentifierSchema),
    evidenceRuleIds: z.array(IdentifierSchema),
    traceIds: z.array(IdentifierSchema),
    effectKinds: z.array(
      z.enum([
        "state_transition",
        "relation_delta",
        "resource_delta",
        "knowledge_grant",
        "flag_set",
        "clock_delta",
        "debt_open",
        "debt_resolve",
      ]),
    ),
    effects: z.array(CausalEffectSchema),
    reversibility: z.enum(["reversible", "irreversible"]),
  })
  .strict();

const CausalWorkingSetFields = {
  branchId: IdentifierSchema,
  cursorHash: HashSchema,
  currentStateHash: HashSchema,
  projectionHash: HashSchema,
  focalEntityIds: z.array(IdentifierSchema).min(1),
  viewerEntityIds: z.array(IdentifierSchema),
  audience: z.enum(["facilitator", "characters"]),
  events: z.array(CausalEventRefSchema),
  variables: z.array(CausalVariableStateSchema),
  relations: z.array(CausalRelationStateSchema),
  resources: z.array(CausalResourceStateSchema),
  knowledge: z.array(CausalKnowledgeStateSchema),
  flags: z.array(CausalFlagStateSchema),
  clocks: z.array(CausalClockStateSchema),
  openDebts: z.array(OpenCausalDebtSchema),
  truncated: z.boolean(),
} as const;

export const CausalWorkingSetPayloadSchema = z.object(CausalWorkingSetFields).strict();

export const CausalWorkingSetSchema = z
  .object({
    ...CausalWorkingSetFields,
    workingSetHash: HashSchema,
  })
  .strict();

export type CausalProjectionPayload = z.infer<typeof CausalProjectionPayloadSchema>;
export type CausalProjection = z.infer<typeof CausalProjectionSchema>;
export type CausalEventRef = z.infer<typeof CausalEventRefSchema>;
export type CausalWorkingSetPayload = z.infer<typeof CausalWorkingSetPayloadSchema>;
export type CausalWorkingSet = z.infer<typeof CausalWorkingSetSchema>;

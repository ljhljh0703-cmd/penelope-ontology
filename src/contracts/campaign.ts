import { z } from "zod";
import {
  HashSchema,
  IdentifierSchema as BaseIdentifierSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";

export const CampaignIdentifierSchema = BaseIdentifierSchema.max(128);
const IdentifierSchema = CampaignIdentifierSchema;

export const MAX_CAUSAL_EFFECTS_PER_ENTRY = 16;
export const MAX_CAMPAIGN_LEDGER_ENTRIES = 10_000;

const NonZeroDeltaSchema = z
  .number()
  .int()
  .min(-100)
  .max(100)
  .refine((value) => value !== 0, "A causal delta cannot be zero.");

const EffectIdField = { effectId: IdentifierSchema } as const;

export const CausalEffectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...EffectIdField,
      kind: z.literal("state_transition"),
      variableId: IdentifierSchema,
      from: IdentifierSchema,
      to: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      ...EffectIdField,
      kind: z.literal("relation_delta"),
      subjectEntityId: IdentifierSchema,
      objectEntityId: IdentifierSchema,
      axisId: IdentifierSchema,
      delta: NonZeroDeltaSchema,
    })
    .strict(),
  z
    .object({
      ...EffectIdField,
      kind: z.literal("resource_delta"),
      entityId: IdentifierSchema,
      resourceId: IdentifierSchema,
      delta: NonZeroDeltaSchema,
    })
    .strict(),
  z
    .object({
      ...EffectIdField,
      kind: z.literal("knowledge_grant"),
      entityId: IdentifierSchema,
      claimId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      ...EffectIdField,
      kind: z.literal("flag_set"),
      entityId: IdentifierSchema,
      flagId: IdentifierSchema,
      value: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...EffectIdField,
      kind: z.literal("clock_delta"),
      clockId: IdentifierSchema,
      delta: NonZeroDeltaSchema,
    })
    .strict(),
  z
    .object({
      ...EffectIdField,
      kind: z.literal("debt_open"),
      debtorEntityId: IdentifierSchema,
      creditorEntityId: IdentifierSchema,
      debtKindId: IdentifierSchema,
      weight: z.number().int().min(1).max(100),
    })
    .strict(),
  z
    .object({
      ...EffectIdField,
      kind: z.literal("debt_resolve"),
      debtEffectId: IdentifierSchema,
    })
    .strict(),
]);

export const CampaignEventSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("player"),
      actorEntityId: IdentifierSchema,
      authorizingIntentId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("npc"),
      actorEntityId: IdentifierSchema,
      triggerId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("world"),
      triggerId: IdentifierSchema,
    })
    .strict(),
]);

export const CampaignEventVisibilitySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("public"), entityIds: z.tuple([]) }).strict(),
  z.object({ scope: z.literal("facilitator"), entityIds: z.tuple([]) }).strict(),
  z
    .object({
      scope: z.literal("entities"),
      entityIds: z.array(IdentifierSchema).min(1),
    })
    .strict()
    .superRefine((visibility, context) => {
      addDuplicateIssues(visibility.entityIds, "visibility entity id", context);
    }),
]);

export const CampaignIrreversibleRulingSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("rule"),
      ruleId: IdentifierSchema,
      receiptId: IdentifierSchema,
    })
    .strict(),
  z.object({ kind: z.literal("gm_approval"), approvalId: IdentifierSchema }).strict(),
]);

const CampaignEventFields = {
  id: IdentifierSchema,
  baseCursorHash: HashSchema,
  worldTick: z.number().int().nonnegative(),
  source: CampaignEventSourceSchema,
  actionTypeId: IdentifierSchema,
  targetEntityIds: z.array(IdentifierSchema),
  scope: z.enum(["scene", "location", "faction", "world"]),
  visibility: CampaignEventVisibilitySchema,
  causeEntryHashes: z.array(HashSchema),
  evidenceClaimIds: z.array(IdentifierSchema),
  evidenceRuleIds: z.array(IdentifierSchema),
  traceIds: z.array(IdentifierSchema),
  reversibility: z.enum(["reversible", "irreversible"]),
  irreversibleRuling: CampaignIrreversibleRulingSchema.nullable(),
  effects: z.array(CausalEffectSchema).min(1).max(MAX_CAUSAL_EFFECTS_PER_ENTRY),
  beforeStateHash: HashSchema,
  afterStateHash: HashSchema,
  transitionReceiptHash: HashSchema.nullable(),
} as const;

const addCampaignEventIssues = (
  event: {
    targetEntityIds: string[];
    causeEntryHashes: string[];
    evidenceClaimIds: string[];
    evidenceRuleIds: string[];
    traceIds: string[];
    effects: Array<{ effectId: string }>;
  },
  context: z.RefinementCtx,
): void => {
  addDuplicateIssues(event.targetEntityIds, "target entity id", context);
  addDuplicateIssues(event.causeEntryHashes, "cause entry hash", context);
  addDuplicateIssues(event.evidenceClaimIds, "evidence claim id", context);
  addDuplicateIssues(event.evidenceRuleIds, "evidence rule id", context);
  addDuplicateIssues(event.traceIds, "trace id", context);
  addDuplicateIssues(
    event.effects.map(({ effectId }) => effectId),
    "causal effect id",
    context,
  );
};

export const CampaignEventInputSchema = z
  .object(CampaignEventFields)
  .strict()
  .superRefine(addCampaignEventIssues);

export const CausalLedgerEntrySchema = z
  .object({
    ...CampaignEventFields,
    sequence: z.number().int().nonnegative(),
    previousEntryHash: HashSchema.nullable(),
    entryHash: HashSchema,
  })
  .strict()
  .superRefine(addCampaignEventIssues);

const CampaignCursorFields = {
  campaignId: IdentifierSchema,
  branchId: IdentifierSchema,
  parentBranchId: IdentifierSchema.nullable(),
  forkedFromEntryHash: HashSchema.nullable(),
  worldPackId: IdentifierSchema,
  worldPackVersion: z.string().min(1),
  baseCanonHash: HashSchema,
  baseStateHash: HashSchema,
  currentStateHash: HashSchema,
  headEntryHash: HashSchema.nullable(),
  entryCount: z.number().int().nonnegative(),
} as const;

export const CampaignCursorPayloadSchema = z.object(CampaignCursorFields).strict();

export const CampaignCursorSchema = z
  .object({
    ...CampaignCursorFields,
    cursorHash: HashSchema,
  })
  .strict();

export const CampaignLedgerSchema = z
  .object({
    cursor: CampaignCursorSchema,
    entries: z.array(CausalLedgerEntrySchema).max(MAX_CAMPAIGN_LEDGER_ENTRIES),
  })
  .strict()
  .superRefine((ledger, context) => {
    if (ledger.cursor.entryCount !== ledger.entries.length) {
      context.addIssue({
        code: "custom",
        message: "Campaign cursor entryCount must match the ledger length.",
      });
    }
    const expectedHead = ledger.entries.at(-1)?.entryHash ?? null;
    if (ledger.cursor.headEntryHash !== expectedHead) {
      context.addIssue({
        code: "custom",
        message: "Campaign cursor headEntryHash must match the ledger head.",
      });
    }
    addDuplicateIssues(
      ledger.entries.map(({ id }) => id),
      "causal ledger entry id",
      context,
    );
  });

export const CampaignLedgerViolationSchema = z
  .object({
    code: z.enum([
      "ledger_hash_invalid",
      "stale_cursor",
      "state_hash_mismatch",
      "state_transition_invalid",
      "transition_receipt_invalid",
      "event_duplicate",
      "effect_duplicate",
      "cause_unknown",
      "world_tick_regression",
      "source_authority_invalid",
      "ruling_invalid",
      "ontology_inactive",
      "viewer_authority_invalid",
      "event_input_invalid",
      "context_budget_exceeded",
      "entity_unknown",
      "evidence_inactive",
      "debt_unknown",
      "entry_limit_exceeded",
    ]),
    message: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
  })
  .strict();

export type CausalEffect = z.infer<typeof CausalEffectSchema>;
export type CampaignEventInput = z.infer<typeof CampaignEventInputSchema>;
export type CausalLedgerEntry = z.infer<typeof CausalLedgerEntrySchema>;
export type CampaignCursorPayload = z.infer<typeof CampaignCursorPayloadSchema>;
export type CampaignCursor = z.infer<typeof CampaignCursorSchema>;
export type CampaignLedger = z.infer<typeof CampaignLedgerSchema>;
export type CampaignLedgerViolation = z.infer<typeof CampaignLedgerViolationSchema>;

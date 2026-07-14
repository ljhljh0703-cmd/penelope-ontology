import { z } from "zod";

const NullableIdentifierSchema = z.string().min(1).nullable();

export const ProposedClaimSchema = z
  .object({
    subjectId: NullableIdentifierSchema,
    predicate: z.string().min(1),
    objectEntityId: NullableIdentifierSchema,
    objectValue: z.string().min(1).nullable(),
    evidenceClaimIds: z.array(z.string().min(1)),
  })
  .strict();

export const ModelDraftSchema = z
  .object({
    narrative: z.string(),
    usedClaimIds: z.array(z.string().min(1)),
    assertedClaims: z.array(ProposedClaimSchema),
    characterActions: z.array(
      z
        .object({
          actorId: z.string().min(1),
          action: z.string().min(1),
          knowledgeClaimIds: z.array(z.string().min(1)),
        })
        .strict(),
    ),
    stateChanges: z.array(
      z
        .object({
          op: z.enum(["move", "mark_deceased", "set_phase", "none"]),
          entityId: NullableIdentifierSchema,
          phaseId: NullableIdentifierSchema,
          locationId: NullableIdentifierSchema,
        })
        .strict(),
    ),
    unknowns: z.array(z.string().min(1)),
    expansionCandidates: z.array(
      z
        .object({
          id: z.string().min(1),
          summary: z.string().min(1),
          proposedClaims: z.array(ProposedClaimSchema),
        })
        .strict(),
    ),
  })
  .strict();

export type ModelDraft = z.infer<typeof ModelDraftSchema>;

const proposedClaimJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subjectId: { type: ["string", "null"], minLength: 1 },
    predicate: { type: "string", minLength: 1 },
    objectEntityId: { type: ["string", "null"], minLength: 1 },
    objectValue: { type: ["string", "null"], minLength: 1 },
    evidenceClaimIds: { type: "array", items: { type: "string", minLength: 1 } },
  },
  required: [
    "subjectId",
    "predicate",
    "objectEntityId",
    "objectValue",
    "evidenceClaimIds",
  ],
} as const;

export const MODEL_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    narrative: { type: "string" },
    usedClaimIds: { type: "array", items: { type: "string", minLength: 1 } },
    assertedClaims: { type: "array", items: proposedClaimJsonSchema },
    characterActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          actorId: { type: "string", minLength: 1 },
          action: { type: "string", minLength: 1 },
          knowledgeClaimIds: { type: "array", items: { type: "string", minLength: 1 } },
        },
        required: ["actorId", "action", "knowledgeClaimIds"],
      },
    },
    stateChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", enum: ["move", "mark_deceased", "set_phase", "none"] },
          entityId: { type: ["string", "null"], minLength: 1 },
          phaseId: { type: ["string", "null"], minLength: 1 },
          locationId: { type: ["string", "null"], minLength: 1 },
        },
        required: ["op", "entityId", "phaseId", "locationId"],
      },
    },
    unknowns: { type: "array", items: { type: "string", minLength: 1 } },
    expansionCandidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          proposedClaims: { type: "array", items: proposedClaimJsonSchema },
        },
        required: ["id", "summary", "proposedClaims"],
      },
    },
  },
  required: [
    "narrative",
    "usedClaimIds",
    "assertedClaims",
    "characterActions",
    "stateChanges",
    "unknowns",
    "expansionCandidates",
  ],
} as const;

import { z } from "zod";
import { HashSchema, IdentifierSchema } from "@/src/contracts/common";
import { PenelopeWorldPackDefinitionSchema } from "@/src/contracts/penelope-world-pack";

export const WORLD_FORGE_FORMAT = "penelope_world_forge_draft" as const;
export const WORLD_FORGE_SCHEMA_VERSION = 2 as const;

export const WORLD_FORGE_FACT_FIELD_IDS = [
  "seedText",
  "title",
  "focalCharacterName",
  "counterpartName",
  "locationName",
  "immutableFact",
  "focalDesire",
  "counterpartDesire",
  "stakes",
  "knowledgeAsymmetry",
  "forbiddenDevelopment",
  "endingCondition",
  "acceptedCost",
  "recommendedAction",
  "recommendedConsequence",
  "alternativeAction",
  "alternativeConsequence",
  "relationshipLabel",
  "relationshipAxis",
  "relationshipPressure",
  "sceneTwo",
  "sceneThree",
  "sceneFour",
  "sceneFive",
] as const;

export const WorldForgeFactFieldIdSchema = z.enum(WORLD_FORGE_FACT_FIELD_IDS);
export type WorldForgeFactFieldId = z.infer<typeof WorldForgeFactFieldIdSchema>;

export const WorldForgeFactOriginSchema = z.enum([
  "creator_stated",
  "model_proposed",
  "creator_edited",
]);
export const WorldForgeFactApprovalSchema = z.enum([
  "pending",
  "creator_approved",
  "rejected",
]);

const fact = (valueSchema: z.ZodString) =>
  z
    .object({
      value: valueSchema,
      origin: WorldForgeFactOriginSchema,
      approval: WorldForgeFactApprovalSchema,
    })
    .strict();

const sentenceCount = (value: string): number =>
  value.match(/[.!?](?=\s|$)/gu)?.length ?? 0;

const SeedTextSchema = z
  .string()
  .trim()
  .min(40)
  .max(500)
  .refine((value) => {
    const count = sentenceCount(value);
    return count >= 2 && count <= 3;
  }, "World Forge intake must contain two or three sentences.");

const NameSchema = z.string().trim().min(1).max(60);
const TitleSchema = z.string().trim().min(3).max(80);
const ActionSchema = z.string().trim().min(3).max(80);
const NarrativeFactSchema = z.string().trim().min(12).max(420);

export const WorldForgeDraftSchema = z
  .object({
    format: z.literal(WORLD_FORGE_FORMAT),
    schemaVersion: z.literal(WORLD_FORGE_SCHEMA_VERSION),
    draftId: IdentifierSchema,
    approvedOn: z.iso.date(),
    seedText: fact(SeedTextSchema),
    title: fact(TitleSchema),
    focalCharacterName: fact(NameSchema),
    counterpartName: fact(NameSchema),
    locationName: fact(TitleSchema),
    immutableFact: fact(NarrativeFactSchema),
    focalDesire: fact(NarrativeFactSchema),
    counterpartDesire: fact(NarrativeFactSchema),
    stakes: fact(NarrativeFactSchema),
    knowledgeAsymmetry: fact(NarrativeFactSchema),
    forbiddenDevelopment: fact(NarrativeFactSchema),
    endingCondition: fact(NarrativeFactSchema),
    acceptedCost: fact(NarrativeFactSchema),
    recommendedAction: fact(ActionSchema),
    recommendedConsequence: fact(NarrativeFactSchema),
    alternativeAction: fact(ActionSchema),
    alternativeConsequence: fact(NarrativeFactSchema),
    relationshipLabel: fact(z.string().trim().min(2).max(64)),
    relationshipAxis: fact(z.string().trim().min(2).max(48)),
    relationshipPressure: fact(NarrativeFactSchema),
    sceneTwo: fact(NarrativeFactSchema),
    sceneThree: fact(NarrativeFactSchema),
    sceneFour: fact(NarrativeFactSchema),
    sceneFive: fact(NarrativeFactSchema),
  })
  .strict()
  .superRefine((draft, context) => {
    if (
      draft.focalCharacterName.value.toLocaleLowerCase("en-US") ===
      draft.counterpartName.value.toLocaleLowerCase("en-US")
    ) {
      context.addIssue({
        code: "custom",
        path: ["counterpartName", "value"],
        message: "The focal character and counterpart need distinct names.",
      });
    }
    if (
      draft.recommendedAction.value.toLocaleLowerCase("en-US") ===
      draft.alternativeAction.value.toLocaleLowerCase("en-US")
    ) {
      context.addIssue({
        code: "custom",
        path: ["alternativeAction", "value"],
        message: "A and B must describe distinct creator-authored actions.",
      });
    }
  });

export const WorldForgeCompileRequestSchema = z
  .object({ draft: WorldForgeDraftSchema })
  .strict()
  .superRefine(({ draft }, context) => {
    for (const fieldId of WORLD_FORGE_FACT_FIELD_IDS) {
      if (draft[fieldId].approval === "creator_approved") continue;
      context.addIssue({
        code: "custom",
        path: ["draft", fieldId, "approval"],
        message: `${fieldId} must be creator-approved before compilation.`,
      });
    }
  });

export const WorldForgeApprovedFactSchema = z
  .object({
    fieldId: WorldForgeFactFieldIdSchema,
    value: z.string().min(1),
    origin: WorldForgeFactOriginSchema,
    approval: z.literal("creator_approved"),
  })
  .strict();

export const WorldForgeCompileResponseSchema = z
  .object({
    definition: PenelopeWorldPackDefinitionSchema,
    definitionDigest: HashSchema,
    approvedFacts: z.array(WorldForgeApprovedFactSchema).length(
      WORLD_FORGE_FACT_FIELD_IDS.length,
    ),
  })
  .strict();

export type WorldForgeDraft = z.infer<typeof WorldForgeDraftSchema>;
export type WorldForgeCompileRequest = z.infer<
  typeof WorldForgeCompileRequestSchema
>;
export type WorldForgeCompileResponse = z.infer<
  typeof WorldForgeCompileResponseSchema
>;

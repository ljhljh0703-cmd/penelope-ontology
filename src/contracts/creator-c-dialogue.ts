import { z } from "zod";
import { HashSchema, IdentifierSchema } from "@/src/contracts/common";

export const CreatorTacitKnowledgeQuestionIdSchema = z.enum([
  "desired_outcome",
  "character_motive",
  "accepted_cost",
]);

export const CreatorTacitKnowledgeAnswerSchema = z
  .object({
    questionId: CreatorTacitKnowledgeQuestionIdSchema,
    answer: z.string().trim().min(2).max(600),
  })
  .strict();

export const CreatorCDialogueRequestSchema = z
  .object({
    answers: z.array(CreatorTacitKnowledgeAnswerSchema).max(3),
    confirmedProposalHash: HashSchema.optional(),
  })
  .strict()
  .superRefine(({ answers, confirmedProposalHash }, context) => {
    if (new Set(answers.map(({ questionId }) => questionId)).size !== answers.length) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "Creator tacit-knowledge answers must have unique question identifiers.",
      });
    }
    if (confirmedProposalHash && answers.length !== 3) {
      context.addIssue({
        code: "custom",
        path: ["confirmedProposalHash"],
        message: "A creator proposal can be confirmed only after all three questions are answered.",
      });
    }
  });

const CreatorCDialogueBaseFields = {
  baseSessionId: z.uuid(),
  baseStateHash: HashSchema,
  originalAction: z.string().trim().min(1).max(800),
  answers: z.array(CreatorTacitKnowledgeAnswerSchema).max(3),
  stateChanged: z.literal(false),
} as const;

export const CreatorCClarificationSchema = z
  .object({
    kind: z.literal("creator_clarification"),
    ...CreatorCDialogueBaseFields,
    progress: z
      .object({ answered: z.number().int().min(0).max(2), total: z.literal(3) })
      .strict(),
    question: z
      .object({
        questionId: CreatorTacitKnowledgeQuestionIdSchema,
        prompt: z.string().trim().min(12).max(360),
        whyItMatters: z.string().trim().min(12).max(360),
      })
      .strict(),
  })
  .strict();

export const CreatorCWorldAlternativeSchema = z
  .object({
    registeredActionId: IdentifierSchema,
    label: z.string().trim().min(1).max(120),
    why: z.string().trim().min(12).max(600),
  })
  .strict();

export const CreatorCCanonicalExecutionSchema = z
  .object({
    verb: z
      .string()
      .trim()
      .regex(/^[a-z]+(?: [a-z]+){0,3}$/u, "Use a registered lowercase English verb."),
    targetEntityId: IdentifierSchema.nullable(),
    targetZoneId: IdentifierSchema.nullable(),
  })
  .strict()
  .superRefine((execution, context) => {
    if (execution.targetEntityId && execution.targetZoneId) {
      context.addIssue({
        code: "custom",
        path: ["targetEntityId"],
        message: "A canonical creator execution may name one entity or one zone, not both.",
      });
    }
  });

export const CreatorCProposalSchema = z
  .object({
    proposalHash: HashSchema,
    registeredActionId: IdentifierSchema,
    canonicalExecution: CreatorCCanonicalExecutionSchema,
    label: z.string().trim().min(1).max(120),
    preservedIntent: z.string().trim().min(2).max(600),
    desiredOutcome: z.string().trim().min(2).max(600),
    characterMotive: z.string().trim().min(2).max(600),
    acceptedCost: z.string().trim().min(2).max(600),
    worldCompatibleExecution: z.string().trim().min(12).max(900),
    worldMeaning: z.string().trim().min(12).max(600),
    mappingBasis: z.array(z.string().trim().min(2).max(160)).min(1).max(6),
    forkBeforeAction: z.boolean(),
    turnCost: z.literal(1),
  })
  .strict();

export const CreatorCConfirmationSchema = z
  .object({
    kind: z.literal("creator_confirmation"),
    ...CreatorCDialogueBaseFields,
    praise: z.string().trim().min(12).max(600),
    proposal: CreatorCProposalSchema,
  })
  .strict();

export const CreatorCBlockedSchema = z
  .object({
    kind: z.literal("creator_blocked"),
    ...CreatorCDialogueBaseFields,
    preservedIntent: z.string().trim().min(2).max(600),
    boundary: z.string().trim().min(12).max(900),
    nextQuestion: z.string().trim().min(12).max(500),
    alternatives: z.array(CreatorCWorldAlternativeSchema).max(3),
  })
  .strict();

export const CreatorCExpansionRequiredSchema = z
  .object({
    kind: z.literal("creator_expansion_required"),
    ...CreatorCDialogueBaseFields,
    preservedIntent: z.string().trim().min(2).max(600),
    missingWorldSupport: z.string().trim().min(12).max(900),
    nextQuestion: z.string().trim().min(12).max(500),
    alternatives: z.array(CreatorCWorldAlternativeSchema).max(3),
  })
  .strict();

export const CreatorCDialogueResponseSchema = z.discriminatedUnion("kind", [
  CreatorCClarificationSchema,
  CreatorCConfirmationSchema,
  CreatorCBlockedSchema,
  CreatorCExpansionRequiredSchema,
]);

export type CreatorTacitKnowledgeQuestionId = z.infer<
  typeof CreatorTacitKnowledgeQuestionIdSchema
>;
export type CreatorTacitKnowledgeAnswer = z.infer<
  typeof CreatorTacitKnowledgeAnswerSchema
>;
export type CreatorCDialogueRequest = z.infer<
  typeof CreatorCDialogueRequestSchema
>;
export type CreatorCDialogueResponse = z.infer<
  typeof CreatorCDialogueResponseSchema
>;
export type CreatorCConfirmation = z.infer<typeof CreatorCConfirmationSchema>;
export type CreatorCCanonicalExecution = z.infer<
  typeof CreatorCCanonicalExecutionSchema
>;

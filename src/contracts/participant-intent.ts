import { z } from "zod";
import { IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";

export const ParticipantIntentSchema = z
  .object({
    intentId: IdentifierSchema,
    participantId: IdentifierSchema,
    controlledEntityIds: z.array(IdentifierSchema).min(1),
    intent: z.string().min(1).max(800),
  })
  .strict()
  .superRefine((participantIntent, context) => {
    addDuplicateIssues(
      participantIntent.controlledEntityIds,
      "controlled entity id",
      context,
    );
  });

export const ParticipantIntentSetSchema = z
  .array(ParticipantIntentSchema)
  .min(1)
  .max(3)
  .superRefine((intents, context) => {
    addDuplicateIssues(
      intents.map(({ intentId }) => intentId),
      "intent id",
      context,
    );
    addDuplicateIssues(
      intents.map(({ participantId }) => participantId),
      "participant id",
      context,
    );
    addDuplicateIssues(
      intents.flatMap(({ controlledEntityIds }) => controlledEntityIds),
      "controlled entity assignment",
      context,
    );
  });

export type ParticipantIntent = z.infer<typeof ParticipantIntentSchema>;

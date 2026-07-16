import { z } from "zod";
import { HashSchema, IdentifierSchema } from "@/src/contracts/common";
import { StorySessionSchema } from "@/src/contracts/story";

/**
 * Public presentation transports are intentionally narrower than internal
 * model modes. Responses API capture stays in the server-side evidence lane
 * until authenticated public execution exists.
 */
export const StoryPresentationTransportSchema = z.enum([
  "fixture",
  "codex_cli",
]);

export const StartStorySessionApiRequestSchema = z
  .object({
    scenarioId: IdentifierSchema.optional(),
    transport: StoryPresentationTransportSchema,
  })
  .strict();

export const StoryTurnApiRequestSchema = z
  .object({
    authority: StorySessionSchema,
    transport: StoryPresentationTransportSchema,
    action: z.string().trim().min(3).max(800),
    choiceId: IdentifierSchema.optional(),
  })
  .strict();

export const StoryScopeReceiptSchema = z
  .object({
    allowedClaimIds: z.array(IdentifierSchema),
    scopeHash: HashSchema,
  })
  .strict();

export type StoryPresentationTransport = z.infer<
  typeof StoryPresentationTransportSchema
>;
export type StartStorySessionApiRequest = z.infer<
  typeof StartStorySessionApiRequestSchema
>;
export type StoryTurnApiRequest = z.infer<typeof StoryTurnApiRequestSchema>;
export type StoryScopeReceipt = z.infer<typeof StoryScopeReceiptSchema>;

import { z } from "zod";
import { HashSchema, IdentifierSchema, VersionSchema } from "@/src/contracts/common";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import { ProposalPatchSchema } from "@/src/contracts/proposal";
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";

const CreatorDecisionBaseFields = {
  proposalId: IdentifierSchema,
  proposalHash: HashSchema,
  baseOverlayId: z.literal("creator_canon"),
  baseOverlayVersion: VersionSchema,
  baseOverlayHash: HashSchema,
} as const;

export const CreatorDecisionSchema = z.discriminatedUnion("action", [
  z.object({ ...CreatorDecisionBaseFields, action: z.literal("accept") }).strict(),
  z
    .object({
      ...CreatorDecisionBaseFields,
      action: z.literal("edit"),
      patches: z.array(ProposalPatchSchema).min(1),
    })
    .strict(),
  z.object({ ...CreatorDecisionBaseFields, action: z.literal("reject") }).strict(),
]);

export const CreatorDecisionResultSchema = z
  .object({
    status: z.enum(["applied", "rejected", "stale", "invalid"]),
    overlay: CanonOverlaySchema,
    snapshot: SimulationSnapshotSchema,
  })
  .strict();

export type CreatorDecision = z.infer<typeof CreatorDecisionSchema>;
export type CreatorDecisionResult = z.infer<typeof CreatorDecisionResultSchema>;

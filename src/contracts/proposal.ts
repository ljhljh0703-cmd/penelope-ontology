import { z } from "zod";
import {
  HashSchema,
  IdentifierSchema,
  VersionSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";
import { ClaimObjectSchema } from "@/src/domain/schemas";

export const ProposedClaimInputSchema = z
  .object({
    id: IdentifierSchema,
    subjectId: IdentifierSchema,
    predicate: IdentifierSchema,
    object: ClaimObjectSchema,
    temporalScope: IdentifierSchema,
    spatialScope: IdentifierSchema.nullable(),
    epistemicVisibility: z.array(IdentifierSchema).min(1),
    conflictSetId: IdentifierSchema.nullable(),
    summary: z.string().min(1),
    sourceIds: z.array(IdentifierSchema).min(1),
  })
  .strict();

export const ProposedRuleInputSchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum(["world", "timeline", "knowledge", "expansion"]),
    description: z.string().min(1),
  })
  .strict();

export const ProposalPatchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_claim"), claim: ProposedClaimInputSchema }).strict(),
  z.object({ op: z.literal("add_rule"), rule: ProposedRuleInputSchema }).strict(),
]);

export const ModelProposalSchema = z
  .object({
    id: IdentifierSchema,
    summary: z.string().min(1),
    patches: z.array(ProposalPatchSchema).min(1),
  })
  .strict()
  .superRefine((proposal, context) => {
    addDuplicateIssues(
      proposal.patches.map((patch) =>
        patch.op === "add_claim" ? patch.claim.id : patch.rule.id,
      ),
      "proposal patch target id",
      context,
    );
  });

export const CanonProposalSchema = z
  .object({
    id: IdentifierSchema,
    summary: z.string().min(1),
    patches: z.array(ProposalPatchSchema).min(1),
    baseOverlayId: z.literal("creator_canon"),
    baseOverlayVersion: VersionSchema,
    baseOverlayHash: HashSchema,
    proposalHash: HashSchema,
  })
  .strict();

export type ProposalPatch = z.infer<typeof ProposalPatchSchema>;
export type ModelProposal = z.infer<typeof ModelProposalSchema>;
export type CanonProposal = z.infer<typeof CanonProposalSchema>;

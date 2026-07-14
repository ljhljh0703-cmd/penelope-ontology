import { z } from "zod";
import { IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";
import {
  ModelProposalSchema,
  ProposedClaimInputSchema,
} from "@/src/contracts/proposal";
import { CandidateActionSchema } from "@/src/contracts/simulation";

export const CandidateUtteranceSchema = z
  .object({
    speakerId: IdentifierSchema,
    authorizingIntentId: IdentifierSchema,
    contributingIntentIds: z.array(IdentifierSchema),
    text: z.string().min(1),
    assertedClaimIds: z.array(IdentifierSchema),
    certainty: z.enum(["certain", "uncertain"]),
  })
  .strict()
  .superRefine((utterance, context) => {
    addDuplicateIssues(utterance.contributingIntentIds, "contributing intent id", context);
    if (utterance.contributingIntentIds.includes(utterance.authorizingIntentId)) {
      context.addIssue({
        code: "custom",
        path: ["contributingIntentIds"],
        message: "The authorizing intent cannot also be a contributing intent.",
      });
    }
  });

export const ModelDraftSchema = z
  .object({
    styleProfileId: IdentifierSchema,
    narrative: z.string().min(1),
    mentionedEntityIds: z.array(IdentifierSchema),
    appliedStyleConstraintIds: z.array(IdentifierSchema).min(1),
    usedClaimIds: z.array(IdentifierSchema),
    utterances: z.array(CandidateUtteranceSchema),
    actions: z.array(CandidateActionSchema),
    assertedClaims: z.array(ProposedClaimInputSchema),
    unknowns: z.array(z.string().min(1)),
    proposals: z.array(ModelProposalSchema),
  })
  .strict()
  .superRefine((draft, context) => {
    addDuplicateIssues(draft.mentionedEntityIds, "mentioned entity id", context);
    addDuplicateIssues(draft.appliedStyleConstraintIds, "applied style constraint id", context);
    addDuplicateIssues(draft.usedClaimIds, "used claim id", context);
    addDuplicateIssues(
      draft.assertedClaims.map(({ id }) => id),
      "asserted claim id",
      context,
    );
    addDuplicateIssues(
      draft.proposals.map(({ id }) => id),
      "model proposal id",
      context,
    );
  });

export type CandidateUtterance = z.infer<typeof CandidateUtteranceSchema>;
export type ModelDraft = z.infer<typeof ModelDraftSchema>;

// Zod is the runtime and JSON-Schema source of truth. The live adapter should use
// `zodTextFormat(ModelDraftSchema, "narrative_model_draft")` rather than maintain
// a second handwritten schema.
export const MODEL_DRAFT_JSON_SCHEMA = z.toJSONSchema(ModelDraftSchema, {
  target: "draft-07",
  reused: "inline",
});

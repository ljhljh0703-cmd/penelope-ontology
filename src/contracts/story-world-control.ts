import { z } from "zod";
import { IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";

export const StoryRiskLevelSchema = z.enum([
  "low",
  "moderate",
  "high",
  "critical",
  "unassessed",
]);

export const StoryRouteRiskProfileSchema = z
  .object({
    level: StoryRiskLevelSchema,
    summary: z.string().min(1).max(320),
    possibleCosts: z.array(z.string().min(1).max(200)).max(3),
  })
  .strict();

export const CreatorProposalAssessmentSchema = z
  .object({
    decision: z.literal("approved"),
    basis: z.literal("registered_story_fit"),
    matchedChoiceId: IdentifierSchema,
    rationale: z.string().min(1).max(500),
    riskProfile: StoryRouteRiskProfileSchema,
  })
  .strict();

export const DisclosureVolumeSchema = z.enum([
  "whisper",
  "low",
  "normal",
  "raised",
]);

export const DisclosureDistanceSchema = z.enum([
  "touching",
  "near",
  "room",
  "distant",
]);

export const DisclosureGeometrySchema = z
  .object({
    speakerId: IdentifierSchema,
    addresseeIds: z.array(IdentifierSchema).min(1).max(4),
    volume: DisclosureVolumeSchema,
    distance: DisclosureDistanceSchema,
    lineOfSightIds: z.array(IdentifierSchema).max(12),
    confirmedHearerIds: z.array(IdentifierSchema).min(1).max(12),
    potentialHearerIds: z.array(IdentifierSchema).max(12),
  })
  .strict()
  .superRefine((geometry, context) => {
    addDuplicateIssues(geometry.addresseeIds, "speech addressee", context);
    addDuplicateIssues(geometry.lineOfSightIds, "line-of-sight entity", context);
    addDuplicateIssues(geometry.confirmedHearerIds, "confirmed hearer", context);
    addDuplicateIssues(geometry.potentialHearerIds, "potential hearer", context);

    const confirmed = new Set(geometry.confirmedHearerIds);
    const potential = new Set(geometry.potentialHearerIds);
    for (const addresseeId of geometry.addresseeIds) {
      if (!confirmed.has(addresseeId)) {
        context.addIssue({
          code: "custom",
          path: ["confirmedHearerIds"],
          message: `Speech addressee ${addresseeId} must be a confirmed hearer.`,
        });
      }
    }
    if (confirmed.has(geometry.speakerId) || potential.has(geometry.speakerId)) {
      context.addIssue({
        code: "custom",
        path: ["speakerId"],
        message: "The speaker is not recorded as an audience member.",
      });
    }
    for (const entityId of potential) {
      if (confirmed.has(entityId)) {
        context.addIssue({
          code: "custom",
          path: ["potentialHearerIds"],
          message: `Potential hearer ${entityId} cannot also be confirmed.`,
        });
      }
    }
  });

export const CreatorStateChannelSchema = z.enum([
  "mise_en_scene",
  "psychology_line",
  "behind_curtain",
  "dramatic_clock",
]);

export type StoryRiskLevel = z.infer<typeof StoryRiskLevelSchema>;
export type StoryRouteRiskProfile = z.infer<typeof StoryRouteRiskProfileSchema>;
export type CreatorProposalAssessment = z.infer<
  typeof CreatorProposalAssessmentSchema
>;
export type DisclosureGeometry = z.infer<typeof DisclosureGeometrySchema>;
export type CreatorStateChannel = z.infer<typeof CreatorStateChannelSchema>;

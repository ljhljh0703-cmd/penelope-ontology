import {
  CreatorProposalAssessmentSchema,
  DisclosureGeometrySchema,
  type CreatorProposalAssessment,
  type DisclosureGeometry,
  type StoryRouteRiskProfile,
} from "@/src/contracts/story-world-control";

export type DisclosureAssessment = {
  geometry: DisclosureGeometry;
  confirmedHearerIds: string[];
  latentHearerIds: string[];
  exposureStatus: "contained" | "latent";
};

/** Potential hearers remain latent; this function never promotes them to fact. */
export const assessDisclosure = (
  input: DisclosureGeometry,
): DisclosureAssessment => {
  const geometry = DisclosureGeometrySchema.parse(input);
  return {
    geometry,
    confirmedHearerIds: [...geometry.confirmedHearerIds],
    latentHearerIds: [...geometry.potentialHearerIds],
    exposureStatus:
      geometry.potentialHearerIds.length > 0 ? "latent" : "contained",
  };
};

export const approveCreatorProposal = ({
  matchedChoiceId,
  riskProfile,
}: {
  matchedChoiceId: string;
  riskProfile: StoryRouteRiskProfile;
}): CreatorProposalAssessment =>
  CreatorProposalAssessmentSchema.parse({
    decision: "approved",
    basis: "registered_story_fit",
    matchedChoiceId,
    rationale:
      "Penelope found the creator's direction plausible within the current world state and causal branch.",
    riskProfile,
  });

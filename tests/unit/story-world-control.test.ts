import { describe, expect, it } from "vitest";
import { DisclosureGeometrySchema } from "@/src/contracts/story-world-control";
import {
  approveCreatorProposal,
  assessDisclosure,
} from "@/src/domain/story-world-control";

describe("story world-control contracts", () => {
  it("approves a plausible creator direction through system adjudication", () => {
    expect(
      approveCreatorProposal({
        matchedChoiceId: "choice.quiet_watch",
        riskProfile: {
          level: "moderate",
          summary: "The quiet watch preserves secrecy but delays certainty.",
          possibleCosts: ["lost time"],
        },
      }),
    ).toMatchObject({
      decision: "approved",
      basis: "registered_story_fit",
      matchedChoiceId: "choice.quiet_watch",
    });
  });

  it("keeps a nearby unresolved audience latent while preserving confirmed hearers", () => {
    const assessment = assessDisclosure({
      speakerId: "eurycleia",
      addresseeIds: ["penelope"],
      volume: "low",
      distance: "near",
      lineOfSightIds: ["penelope", "stranger"],
      confirmedHearerIds: ["penelope", "stranger"],
      potentialHearerIds: ["household"],
    });

    expect(assessment.confirmedHearerIds).toEqual(["penelope", "stranger"]);
    expect(assessment.latentHearerIds).toEqual(["household"]);
    expect(assessment.exposureStatus).toBe("latent");
  });

  it("requires every addressee to be a confirmed hearer", () => {
    expect(
      DisclosureGeometrySchema.safeParse({
        speakerId: "eurycleia",
        addresseeIds: ["penelope"],
        volume: "low",
        distance: "near",
        lineOfSightIds: ["penelope"],
        confirmedHearerIds: ["stranger"],
        potentialHearerIds: ["penelope"],
      }).success,
    ).toBe(false);
  });
});

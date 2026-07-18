import { describe, expect, it } from "vitest";
import penelopeEnglishStyleProfile from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  fixtureNarrationCritic,
  fixtureNarrationRenderer,
} from "@/src/adapters/fixtures/world-narrator";
import {
  NarrationRendererRequestSchema,
  PenelopeEnglishStyleProfileSchema,
  type ModelNarrationOutput,
} from "@/src/contracts/world-narrator";

const styleProfile = PenelopeEnglishStyleProfileSchema.parse(
  penelopeEnglishStyleProfile,
);

const rendererRequest = NarrationRendererRequestSchema.parse({
  modelFacingRequest: {
    sceneMode: "setup",
    languageProfileId: styleProfile.profileId,
    referenceReceiptId: "creator-craft-reference-2026-07-17-01",
    focalActorId: "entity.penelope",
    presentActors: [
      {
        entityId: "entity.penelope",
        renderDescriptor: "Penelope stands beside the hearth.",
        sourceFactIds: ["fact.lamp"],
      },
    ],
    visibleFacts: [
      { factId: "fact.lamp", renderText: "A lamp burns beside the hearth." },
      { factId: "fact.door", renderText: "The door remains closed." },
    ],
    resolvedEvents: [],
    authorizedActionEventIds: [],
    authorizedReactionEventIds: [],
    authorizedChangeEventIds: [],
    authorizedAnchors: [],
    licensedRenderingDetails: [],
    styleStateId: styleProfile.styleStates[0]!.stateId,
    reservedActionIds: [],
  },
  scenePlan: {
    scenePlanId: "scene.fixture.setup",
    sceneMode: "setup",
    sentencePlans: [
      {
        sentencePlanId: "sp.fixture.orientation",
        role: "orientation",
        actorId: "entity.penelope",
        speakerId: null,
        sourceFactIds: ["fact.lamp"],
        sourceEventIds: [],
        speechEventIds: [],
        licensedRenderingDetailIds: [],
        plainFunction: "Show only the registered lamp at the hearth.",
        plainFunctionSourceAuthorityIds: ["fact.lamp"],
        plainIntent: null,
        plainIntentSourceAuthorityIds: [],
        changesState: false,
      },
      {
        sentencePlanId: "sp.fixture.stop",
        role: "in_world_stop",
        actorId: "entity.penelope",
        speakerId: null,
        sourceFactIds: ["fact.door"],
        sourceEventIds: [],
        speechEventIds: [],
        licensedRenderingDetailIds: [],
        plainFunction: "Stop before anyone opens the door.",
        plainFunctionSourceAuthorityIds: ["fact.door"],
        plainIntent: null,
        plainIntentSourceAuthorityIds: [],
        changesState: false,
      },
    ],
  },
  preflightReceipt: {
    preflightId: "preflight.fixture.setup",
    sceneMode: "setup",
    sceneAuthority: {
      factIds: ["fact.lamp", "fact.door"],
      eventIds: [],
      actorEntityIds: ["entity.penelope"],
      licensedRenderingDetailIds: [],
      licensedRenderingDetails: [],
    },
    referenceReceipt: {
      status: "available",
      referenceId: "creator-craft-reference-2026-07-17-01",
      transferableTechniqueIds: ["TT-01"],
      sceneApplicability: [
        {
          techniqueId: "TT-01",
          plainReason: "Use the resolved physical situation as the scene beat.",
        },
      ],
      forbiddenImitation: true,
      excludedGimmicks: ["FC-04"],
    },
    plainDramaticPlan: {
      focalActorId: "entity.penelope",
      actionSourceEventIds: [],
      reactionSourceEventIds: [],
      changeSourceEventIds: [],
    },
    dialogueAuthority: {
      mode: "none",
      speakerId: null,
      speechAct: null,
      speechEventIds: [],
      speechActLicenseIds: [],
      authorizedContentIds: [],
      plainIntent: null,
      plainIntentSourceAuthorityIds: [],
    },
    creatorReviewRequired: true,
  },
  styleProfile,
});

const completedOutput = async (): Promise<ModelNarrationOutput> => {
  const outcome = await fixtureNarrationRenderer.render(rendererRequest);
  if (outcome.outcome !== "completed") {
    throw new Error(outcome.error.message);
  }
  return outcome.modelOutput;
};

describe("fixture narration renderer", () => {
  it("returns only prepared prose and exact scene-plan authority receipts", async () => {
    const outcome = await fixtureNarrationRenderer.render(rendererRequest);

    expect(outcome).toEqual({
      outcome: "completed",
      modelOutput: {
        planReceipt: rendererRequest.scenePlan.sentencePlans.map((plan) => ({
          sentencePlanId: plan.sentencePlanId,
          role: plan.role,
          sourceFactIds: plan.sourceFactIds,
          sourceEventIds: plan.sourceEventIds,
          speechEventIds: plan.speechEventIds,
          licensedRenderingDetailIds: plan.licensedRenderingDetailIds,
        })),
        readerProse: {
          format: "english_prose_paragraphs",
          paragraphs: [
            {
              paragraphId: "fixture.paragraph.1",
              sentencePlanIds: ["sp.fixture.orientation"],
              text: "A lamp burns beside the hearth.",
            },
            {
              paragraphId: "fixture.paragraph.2",
              sentencePlanIds: ["sp.fixture.stop"],
              text: "The door remains closed.",
            },
          ],
        },
      },
      trace: {
        provenance: "fixture",
        adapterId: "world_narration_renderer_fixture_v2",
      },
    });
    expect(JSON.stringify(outcome)).not.toMatch(
      /renderAudit|privateValidation|trustedReceipts/u,
    );
    expect(JSON.stringify(outcome)).not.toContain("Silence has become an action");
  });

  it("rejects a sentence-plan source outside deterministic authority", async () => {
    const unauthorized = structuredClone(rendererRequest);
    unauthorized.preflightReceipt.sceneAuthority.factIds = ["fact.lamp"];

    await expect(
      fixtureNarrationRenderer.render(unauthorized),
    ).resolves.toMatchObject({
      outcome: "rejected",
      error: { code: "fixture_renderer_source_unauthorized" },
    });
  });

  it("allows one warning revision only when the prior authority is unchanged", async () => {
    const priorOutput = await completedOutput();
    const revised = await fixtureNarrationCritic.revise({
      rendererRequest,
      priorOutput,
      warningRuleIds: ["FC-04"],
    });

    expect(revised).toMatchObject({
      outcome: "completed",
      modelOutput: priorOutput,
      trace: { adapterId: "world_narration_critic_fixture_v1" },
    });

    const changedAuthority = structuredClone(priorOutput);
    changedAuthority.planReceipt[0]!.sourceFactIds = ["fact.door"];
    await expect(
      fixtureNarrationCritic.revise({
        rendererRequest,
        priorOutput: changedAuthority,
        warningRuleIds: ["AC-SAMPLE-01"],
      }),
    ).resolves.toMatchObject({
      outcome: "rejected",
      error: { code: "fixture_critic_authority_changed" },
    });
  });
});

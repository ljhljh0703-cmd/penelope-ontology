import { describe, expect, it } from "vitest";
import penelopeEnglishStyleProfile from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  ModelNarrationOutputSchema,
  NarrationCriticRequestSchema,
  NarrationRendererOutcomeSchema,
  NarrationRendererRequestSchema,
  PenelopeEnglishStyleProfileSchema,
  PenelopeNarrationPreflightReceiptSchema,
  PenelopeScenePlanSchema,
} from "@/src/contracts/world-narrator";
import {
  WorldNarrationProjectionSchema,
  projectModelNarrationOutputForWorldApi,
} from "@/src/contracts/world-api";
import type {
  NarrationCritic,
  NarrationRenderer,
} from "@/src/ports/world-narrator";

const rendererModelFacingRequest = {
  sceneMode: "setup",
  languageProfileId: "en-penelope-v1",
  referenceReceiptId: "creator-craft-reference-2026-07-17-01",
  focalActorId: "entity.a",
  presentActors: [
    {
      entityId: "entity.a",
      renderDescriptor: "A woman stands beside the hearth.",
      sourceFactIds: ["fact.a"],
    },
  ],
  visibleFacts: [{ factId: "fact.a", renderText: "A lamp burns." }],
  resolvedEvents: [],
  authorizedActionEventIds: [],
  authorizedReactionEventIds: [],
  authorizedChangeEventIds: [],
  authorizedAnchors: [],
  licensedRenderingDetails: [],
  styleStateId: "en-penelope-state-baseline",
  reservedActionIds: [],
} as const;

const rendererScenePlan = PenelopeScenePlanSchema.parse({
  scenePlanId: "scene.setup",
  sceneMode: "setup",
  sentencePlans: [
    {
      sentencePlanId: "sp.orientation",
      role: "orientation",
      actorId: "entity.a",
      speakerId: null,
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
      plainFunction: "Place the focal actor beside the registered lamp.",
      plainFunctionSourceAuthorityIds: ["fact.a"],
      plainIntent: null,
      plainIntentSourceAuthorityIds: [],
      changesState: false,
    },
    {
      sentencePlanId: "sp.stop",
      role: "in_world_stop",
      actorId: "entity.a",
      speakerId: null,
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
      plainFunction: "Stop on the focal actor waiting by the door.",
      plainFunctionSourceAuthorityIds: ["fact.a"],
      plainIntent: null,
      plainIntentSourceAuthorityIds: [],
      changesState: false,
    },
  ],
});
const rendererPreflightReceipt =
  PenelopeNarrationPreflightReceiptSchema.parse({
    preflightId: "preflight.setup",
    sceneMode: "setup",
    sceneAuthority: {
      factIds: ["fact.a"],
      eventIds: [],
      actorEntityIds: ["entity.a"],
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
      focalActorId: "entity.a",
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
  });

const rendererStyleProfile = PenelopeEnglishStyleProfileSchema.parse(
  penelopeEnglishStyleProfile,
);

const rendererRequest = NarrationRendererRequestSchema.parse({
  modelFacingRequest: rendererModelFacingRequest,
  scenePlan: rendererScenePlan,
  preflightReceipt: rendererPreflightReceipt,
  styleProfile: rendererStyleProfile,
});

const rendererModelOutput = ModelNarrationOutputSchema.parse({
  planReceipt: [
    {
      sentencePlanId: "sp.orientation",
      role: "orientation",
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    },
    {
      sentencePlanId: "sp.stop",
      role: "in_world_stop",
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    },
  ],
  readerProse: {
    format: "english_prose_paragraphs",
    paragraphs: [
      {
        paragraphId: "paragraph.one",
        sentencePlanIds: ["sp.orientation"],
        text: "A lamp burns beside the hearth.",
      },
      {
        paragraphId: "paragraph.two",
        sentencePlanIds: ["sp.stop"],
        text: "The woman waits by the door.",
      },
    ],
  },
});

describe("Lane D renderer-only migration seam", () => {
  it("accepts only the four public renderer inputs", () => {
    expect(NarrationRendererRequestSchema.safeParse(rendererRequest).success).toBe(
      true,
    );

    for (const forbidden of [
      { privateValidation: { forbiddenKnowledgeIds: [] } },
      { renderAudit: { hardPass: true } },
      { evidenceAuthorityRegistry: { trustedReceipts: [] } },
    ]) {
      expect(
        NarrationRendererRequestSchema.safeParse({
          ...rendererRequest,
          ...forbidden,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects incoherent scene, reference, style, and focal-actor selections", () => {
    expect(
      NarrationRendererRequestSchema.safeParse({
        ...rendererRequest,
        scenePlan: { ...rendererScenePlan, sceneMode: "transition" },
      }).success,
    ).toBe(false);
    expect(
      NarrationRendererRequestSchema.safeParse({
        ...rendererRequest,
        modelFacingRequest: {
          ...rendererModelFacingRequest,
          referenceReceiptId: "receipt.other",
        },
      }).success,
    ).toBe(false);
    expect(
      NarrationRendererRequestSchema.safeParse({
        ...rendererRequest,
        modelFacingRequest: {
          ...rendererModelFacingRequest,
          styleStateId: "style.unregistered",
        },
      }).success,
    ).toBe(false);
    expect(
      NarrationRendererRequestSchema.safeParse({
        ...rendererRequest,
        modelFacingRequest: {
          ...rendererModelFacingRequest,
          focalActorId: "entity.other",
        },
      }).success,
    ).toBe(false);
  });

  it("returns model output plus adapter trace without a self-authored audit", async () => {
    const renderer: NarrationRenderer = {
      async render() {
        return NarrationRendererOutcomeSchema.parse({
          outcome: "completed",
          modelOutput: rendererModelOutput,
          trace: { provenance: "fixture", adapterId: "renderer.fixture.v1" },
        });
      },
    };

    const outcome = await renderer.render(rendererRequest);
    expect(outcome).toMatchObject({
      outcome: "completed",
      trace: { provenance: "fixture", adapterId: "renderer.fixture.v1" },
    });
    expect(
      NarrationRendererOutcomeSchema.safeParse({
        outcome: "completed",
        modelOutput: rendererModelOutput,
        renderAudit: { hardPass: true },
        trace: { provenance: "fixture", adapterId: "renderer.fixture.v1" },
      }).success,
    ).toBe(false);
  });

  it("keeps warning-only critic revision separate from the first render", async () => {
    const criticRequest = NarrationCriticRequestSchema.parse({
      rendererRequest,
      priorOutput: rendererModelOutput,
      warningRuleIds: ["FC-04"],
    });
    const critic: NarrationCritic = {
      async revise() {
        return {
          outcome: "rejected",
          error: {
            code: "critic.no_safe_revision",
            message: "The warning cannot be revised inside the licensed plan.",
          },
          trace: { provenance: "fixture", adapterId: "critic.fixture.v1" },
        };
      },
    };

    expect(await critic.revise(criticRequest)).toMatchObject({
      outcome: "rejected",
      error: { code: "critic.no_safe_revision" },
    });
    expect(
      NarrationCriticRequestSchema.safeParse({
        ...criticRequest,
        renderAudit: { warningCount: 1 },
      }).success,
    ).toBe(false);
  });

  it("projects only reader prose into the UI contract", () => {
    const projection = projectModelNarrationOutputForWorldApi(
      rendererModelOutput,
    );

    expect(projection).toEqual({
      format: "english_prose_paragraphs",
      paragraphs: [
        {
          paragraphId: "paragraph.one",
          text: "A lamp burns beside the hearth.",
        },
        {
          paragraphId: "paragraph.two",
          text: "The woman waits by the door.",
        },
      ],
      prose:
        "A lamp burns beside the hearth.\n\nThe woman waits by the door.",
    });
    expect("planReceipt" in projection).toBe(false);
    expect("sentencePlanIds" in projection.paragraphs[0]!).toBe(false);
    expect(
      WorldNarrationProjectionSchema.safeParse({
        ...projection,
        renderAudit: { hardPass: true },
      }).success,
    ).toBe(false);
  });
});

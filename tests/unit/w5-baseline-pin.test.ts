import { describe, expect, it } from "vitest";
import penelopeEnglishStyleProfile from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  NarrationRendererRequestSchema,
  PenelopeEnglishStyleProfileSchema,
  type NarrationRendererRequest,
} from "@/src/contracts/world-narrator";
import {
  LEGACY_BASELINE_ADAPTER_SHA256,
  LEGACY_BASELINE_COMMIT,
  LEGACY_BASELINE_CONTRACT_SHA256,
  LEGACY_BASELINE_REQUESTED_MODEL,
  buildLegacyBaselineArgs,
  buildLegacyBaselinePrompt,
  buildLegacyBaselineRequest,
  validateLegacyBaselineOutput,
  verifyLegacyBaselinePins,
  type LegacyBaselineOutput,
} from "@/scripts/w5/baseline-a";

const rendererRequest: NarrationRendererRequest =
  NarrationRendererRequestSchema.parse({
    modelFacingRequest: {
      sceneMode: "turn",
      languageProfileId: "en-penelope-v1",
      referenceReceiptId: "creator-craft-reference-2026-07-17-01",
      focalActorId: "entity.penelope",
      presentActors: [
        {
          entityId: "entity.penelope",
          renderDescriptor: "Penelope stands beside the hearth.",
          sourceFactIds: ["fact.room"],
        },
      ],
      visibleFacts: [
        {
          factId: "fact.room",
          renderText: "The late interview remains at the palace hearth.",
        },
      ],
      resolvedEvents: [
        {
          eventId: "event.action",
          observableText: "Penelope orders the basin brought forward.",
          sourceAuthorityIds: ["authority.runtime"],
        },
        {
          eventId: "event.reaction",
          observableText: "Eurycleia moves toward the stranger.",
          sourceAuthorityIds: ["authority.runtime"],
        },
        {
          eventId: "event.change",
          observableText: "The washing places the old nurse beside his leg.",
          sourceAuthorityIds: ["authority.runtime"],
        },
      ],
      authorizedActionEventIds: ["event.action"],
      authorizedReactionEventIds: ["event.reaction"],
      authorizedChangeEventIds: ["event.change"],
      authorizedAnchors: [],
      licensedRenderingDetails: [],
      styleStateId: "en-penelope-state-baseline",
      reservedActionIds: ["action.penelope.observe"],
    },
    scenePlan: {
      scenePlanId: "scene.turn",
      sceneMode: "turn",
      sentencePlans: [
        {
          sentencePlanId: "sentence.action",
          role: "authorized_action",
          actorId: "entity.penelope",
          speakerId: null,
          sourceFactIds: [],
          sourceEventIds: ["event.action"],
          speechEventIds: [],
          licensedRenderingDetailIds: [],
          plainFunction: "Render the resolved participant action.",
          plainFunctionSourceAuthorityIds: ["event.action"],
          plainIntent: null,
          plainIntentSourceAuthorityIds: [],
          changesState: true,
        },
        {
          sentencePlanId: "sentence.reaction",
          role: "observable_reaction",
          actorId: null,
          speakerId: null,
          sourceFactIds: [],
          sourceEventIds: ["event.reaction"],
          speechEventIds: [],
          licensedRenderingDetailIds: [],
          plainFunction: "Render the registered visible reaction.",
          plainFunctionSourceAuthorityIds: ["event.reaction"],
          plainIntent: null,
          plainIntentSourceAuthorityIds: [],
          changesState: true,
        },
        {
          sentencePlanId: "sentence.consequence",
          role: "resolved_consequence",
          actorId: null,
          speakerId: null,
          sourceFactIds: [],
          sourceEventIds: ["event.change"],
          speechEventIds: [],
          licensedRenderingDetailIds: [],
          plainFunction: "Render the already resolved consequence.",
          plainFunctionSourceAuthorityIds: ["event.change"],
          plainIntent: null,
          plainIntentSourceAuthorityIds: [],
          changesState: true,
        },
        {
          sentencePlanId: "sentence.stop",
          role: "in_world_stop",
          actorId: null,
          speakerId: null,
          sourceFactIds: ["fact.room"],
          sourceEventIds: [],
          speechEventIds: [],
          licensedRenderingDetailIds: [],
          plainFunction: "Stop inside the registered room.",
          plainFunctionSourceAuthorityIds: ["fact.room"],
          plainIntent: null,
          plainIntentSourceAuthorityIds: [],
          changesState: false,
        },
      ],
    },
    preflightReceipt: {
      preflightId: "preflight.turn",
      sceneMode: "turn",
      sceneAuthority: {
        factIds: ["fact.room"],
        eventIds: ["event.action", "event.reaction", "event.change"],
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
            plainReason: "Keep the causal turn legible.",
          },
        ],
        forbiddenImitation: true,
        excludedGimmicks: ["FC-04"],
      },
      plainDramaticPlan: {
        focalActorId: "entity.penelope",
        actionSourceEventIds: ["event.action"],
        reactionSourceEventIds: ["event.reaction"],
        changeSourceEventIds: ["event.change"],
        changeInPlainTerms: {
          text: "The washing brings Eurycleia within reach of the scar.",
          sourceAuthorityIds: ["event.change"],
        },
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
    styleProfile: PenelopeEnglishStyleProfileSchema.parse(
      penelopeEnglishStyleProfile,
    ),
  });

const legacyOutput = (): LegacyBaselineOutput => {
  const prose = Array.from({ length: 120 }, () => "Penelope").join(" ");
  return {
    title: "The Washing",
    prose,
    segments: [
      {
        segmentId: "segment.turn",
        text: prose,
        grounding: {
          factIds: ["fact.room"],
          eventIds: ["event.action", "event.reaction", "event.change"],
        },
      },
    ],
    grounding: {
      factIds: ["fact.room"],
      eventIds: ["event.action", "event.reaction", "event.change"],
    },
    nextActions: [],
  };
};

describe("W5 legacy baseline A pin", () => {
  it("reads the exact historical adapter and contract through git show", () => {
    expect(verifyLegacyBaselinePins({ repoRoot: process.cwd() })).toEqual({
      commit: LEGACY_BASELINE_COMMIT,
      adapterSha256: LEGACY_BASELINE_ADAPTER_SHA256,
      contractSha256: LEGACY_BASELINE_CONTRACT_SHA256,
    });
  });

  it("fails closed when the pinned history cannot be read", () => {
    expect(() =>
      verifyLegacyBaselinePins({
        repoRoot: "/w5-baseline-repository-does-not-exist",
      }),
    ).toThrow(/pin unavailable/u);
  });

  it("projects current B scene authority without importing private authority", () => {
    const request = buildLegacyBaselineRequest(rendererRequest);

    expect(request.focalEntityId).toBe("entity.penelope");
    expect(request.focalKnowledge).toEqual([]);
    expect(request.previousVisibleSceneSummary).toBeNull();
    expect(request.nextActionCandidates).toEqual([]);
    expect(request.resolvedEvents.map(({ source }) => source)).toEqual([
      "player",
      "npc",
      "world",
    ]);
    expect(request.styleConstraints.map(({ constraintId }) => constraintId)).toEqual([
      "style.limited_penelope_view",
      "style.concrete_pressure",
      "style.dialogue_subtext",
      "style.no_false_certainty",
    ]);
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("privateValidation");
    expect(serialized).not.toContain("scenePlan");
    expect(serialized).not.toContain("licensedRenderingDetails");
    expect(serialized).not.toContain("creatorOnlyReviewNoteIds");
  });

  it("reconstructs the pinned prompt and CLI arguments", () => {
    const request = buildLegacyBaselineRequest(rendererRequest);
    const prompt = buildLegacyBaselinePrompt(request);

    expect(
      prompt.startsWith(
        "You are the world narrator for Penelope Ontology. Return only the structured world narration required by the supplied JSON schema.",
      ),
    ).toBe(true);
    expect(prompt).toContain(
      "Write the prose in English using 120 through 180 words.",
    );
    expect(prompt).toContain("WORLD_NARRATION_REQUEST_JSON:\n{");
    expect(prompt.endsWith("\n")).toBe(true);
    expect(buildLegacyBaselineArgs({
      schemaPath: "/private/schema.json",
      outputPath: "/private/output.json",
    })).toEqual([
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--model",
      LEGACY_BASELINE_REQUESTED_MODEL,
      "--output-schema",
      "/private/schema.json",
      "--output-last-message",
      "/private/output.json",
      "--color",
      "never",
      "-",
    ]);
  });

  it("accepts only fully grounded legacy output with exact next actions", () => {
    const request = buildLegacyBaselineRequest(rendererRequest);
    expect(
      validateLegacyBaselineOutput({ request, output: legacyOutput() }),
    ).toMatchObject({ ok: true });

    const missingEvent = legacyOutput();
    missingEvent.segments[0]!.grounding.eventIds = ["event.action"];
    missingEvent.grounding.eventIds = ["event.action"];
    expect(
      validateLegacyBaselineOutput({ request, output: missingEvent }),
    ).toMatchObject({ ok: false, code: "resolved_event_omitted" });

    const unknownFact = legacyOutput();
    unknownFact.segments[0]!.grounding.factIds = ["fact.hidden"];
    unknownFact.grounding.factIds = ["fact.hidden"];
    expect(
      validateLegacyBaselineOutput({ request, output: unknownFact }),
    ).toMatchObject({ ok: false, code: "fact_not_visible" });

    const hiddenIdentity = legacyOutput();
    const hiddenWords = hiddenIdentity.prose.split(/\s+/u);
    hiddenWords.splice(0, 4, "The", "stranger", "is", "Odysseus");
    hiddenIdentity.prose = hiddenWords.join(" ");
    hiddenIdentity.segments[0]!.text = hiddenIdentity.prose;
    expect(
      validateLegacyBaselineOutput({
        request,
        output: hiddenIdentity,
        privateValidation: {
          forbiddenKnowledge: [
            {
              id: "private.stranger_identity",
              patterns: ["the stranger is Odysseus"],
            },
          ],
          forbiddenInferences: [],
        },
      }),
    ).toMatchObject({ ok: false, code: "hidden_fact_leak" });
  });
});

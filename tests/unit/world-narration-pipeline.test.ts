import { describe, expect, it, vi } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  NarrationInputEnvelopeSchema,
  PenelopeEnglishStyleProfileSchema,
  type ModelNarrationOutput,
  type NarrationRendererOutcome,
} from "@/src/contracts/world-narrator";
import {
  PenelopeNarrationPreflightReceiptSchema,
  PenelopeScenePlanSchema,
} from "@/src/contracts/narration-license";
import {
  runWorldNarrationPipeline,
  type ResolvedNarrationPipelineArtifacts,
} from "@/src/application/world-narration-pipeline";
import { extractPublicFidelityRecord } from "@/src/domain/narration-postvalidator";
import type { NarrationCritic, NarrationRenderer } from "@/src/ports/world-narrator";

const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);

const output = (text: string): ModelNarrationOutput => ({
  planReceipt: [
    {
      sentencePlanId: "sp.orientation",
      role: "orientation",
      sourceFactIds: ["fact.hearth"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    },
    {
      sentencePlanId: "sp.stop",
      role: "in_world_stop",
      sourceFactIds: ["fact.hearth"],
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
        sentencePlanIds: ["sp.orientation", "sp.stop"],
        text,
      },
    ],
  },
});

const artifacts = ({
  privatePattern,
}: {
  privatePattern?: string;
} = {}): ResolvedNarrationPipelineArtifacts => {
  const forbiddenKnowledgeIds = privatePattern ? ["private.king"] : [];
  const inputEnvelope = NarrationInputEnvelopeSchema.parse({
    modelFacing: {
      sceneMode: "setup",
      languageProfileId: styleProfile.profileId,
      referenceReceiptId: "creator-craft-reference-2026-07-17-01",
      focalActorId: "entity.penelope",
      presentActors: [
        {
          entityId: "entity.penelope",
          renderDescriptor: "A woman waits beside the hearth.",
          sourceFactIds: ["fact.penelope_present"],
        },
      ],
      visibleFacts: [
        {
          factId: "fact.hearth",
          renderText: "A lamp burns beside the doorway.",
        },
      ],
      resolvedEvents: [],
      authorizedActionEventIds: [],
      authorizedReactionEventIds: [],
      authorizedChangeEventIds: [],
      authorizedAnchors: [],
      licensedRenderingDetails: [],
      styleStateId: "en-penelope-state-baseline",
      reservedActionIds: ["action.open-door"],
    },
    privateValidation: {
      forbiddenKnowledgeIds,
      forbiddenInferenceRuleIds: [],
      creatorOnlyReviewNoteIds: [],
    },
  });
  const scenePlan = PenelopeScenePlanSchema.parse({
    scenePlanId: "scene.setup",
    sceneMode: "setup",
    sentencePlans: [
      {
        sentencePlanId: "sp.orientation",
        role: "orientation",
        actorId: null,
        speakerId: null,
        sourceFactIds: ["fact.hearth"],
        sourceEventIds: [],
        speechEventIds: [],
        licensedRenderingDetailIds: [],
        plainFunction: "Place the focal actor in the registered room.",
        plainFunctionSourceAuthorityIds: ["fact.hearth"],
        plainIntent: null,
        plainIntentSourceAuthorityIds: [],
        changesState: false,
      },
      {
        sentencePlanId: "sp.stop",
        role: "in_world_stop",
        actorId: null,
        speakerId: null,
        sourceFactIds: ["fact.hearth"],
        sourceEventIds: [],
        speechEventIds: [],
        licensedRenderingDetailIds: [],
        plainFunction: "Stop on a registered physical detail.",
        plainFunctionSourceAuthorityIds: ["fact.hearth"],
        plainIntent: null,
        plainIntentSourceAuthorityIds: [],
        changesState: false,
      },
    ],
  });
  const preflightReceipt = PenelopeNarrationPreflightReceiptSchema.parse({
    preflightId: "pf.setup.1",
    sceneMode: "setup",
    sceneAuthority: {
      factIds: ["fact.hearth", "fact.penelope_present"],
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
          plainReason: "The scene keeps one physical beat in view.",
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
  });
  const emptyFidelity = extractPublicFidelityRecord({});
  return {
    inputEnvelope,
    scenePlan,
    preflightReceipt,
    styleProfile,
    authorityRegistry: {
      typedSpeechEvents: [],
      creatorAuthorityIds: ["creator.scene-authority"],
      deterministicRuntimeAuthorityIds: ["runtime.scene-authority"],
      approvedReferenceReceiptIds: [
        "creator-craft-reference-2026-07-17-01",
      ],
    },
    cameraSafeProvenance: [
      {
        fieldKey: "present_actor:entity.penelope",
        text: "A woman waits beside the hearth.",
        authoredBy: "creator",
        authorityId: "creator.scene-authority",
        rawSourceTexts: [],
      },
      {
        fieldKey: "visible_fact:fact.hearth",
        text: "A lamp burns beside the doorway.",
        authoredBy: "deterministic_runtime",
        authorityId: "runtime.scene-authority",
        rawSourceTexts: [],
      },
    ],
    continuityProvenance: {
      source: "registered_events",
      authority: "deterministic_runtime",
      registeredEventIds: [],
      readerProseImported: false,
    },
    privateValidationMaterial: {
      forbiddenKnowledge: privatePattern
        ? [{ id: "private.king", patterns: [privatePattern] }]
        : [],
      forbiddenInferences: [],
    },
    reservedActionDescriptors: [
      {
        actionId: "action.open-door",
        text: "The woman opens the barred door.",
      },
    ],
    reservedActionSourceBindings: [
      { actionId: "action.open-door", sourceIds: [] },
    ],
    fidelityBefore: emptyFidelity,
  };
};

const rendererFor = (modelOutput: ModelNarrationOutput): NarrationRenderer => ({
  async render(): Promise<NarrationRendererOutcome> {
    return {
      outcome: "completed",
      modelOutput,
      trace: { provenance: "fixture", adapterId: "fixture.test" },
    };
  },
});

describe("world narration pipeline", () => {
  it("accepts only a fully preflighted and postvalidated scene", async () => {
    const result = await runWorldNarrationPipeline({
      artifacts: artifacts(),
      renderer: rendererFor(
        output(
          "A lamp burns beside the doorway. A lamp burns beside the doorway.",
        ),
      ),
    });

    expect(result).toMatchObject({
      disposition: "accepted",
      rendererCallCount: 1,
      criticCallCount: 0,
      publishReady: true,
      stateTransitionAllowed: true,
    });
  });

  it("refuses to certify reordered causal beats", async () => {
    const reordered = output(
      "A lamp burns beside the doorway. A lamp burns beside the doorway.",
    );
    reordered.readerProse.paragraphs[0]!.sentencePlanIds = [
      "sp.stop",
      "sp.orientation",
    ];

    const result = await runWorldNarrationPipeline({
      artifacts: artifacts(),
      renderer: rendererFor(reordered),
    });

    expect(result.disposition).toBe("creator_review");
    expect(result.stateTransitionAllowed).toBe(false);
    expect(result.validation?.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "AC-DATA-02",
        severity: "creator_review",
      }),
    );
  });

  it("refuses ambiguous source IDs with conflicting prepared text", async () => {
    const conflicted = artifacts();
    conflicted.inputEnvelope.modelFacing.presentActors[0]!.sourceFactIds = [
      "fact.hearth",
    ];
    conflicted.preflightReceipt.sceneAuthority.factIds = ["fact.hearth"];

    const result = await runWorldNarrationPipeline({
      artifacts: conflicted,
      renderer: rendererFor(
        output(
          "A lamp burns beside the doorway. A lamp burns beside the doorway.",
        ),
      ),
    });

    expect(result.disposition).toBe("creator_review");
    expect(result.stateTransitionAllowed).toBe(false);
  });

  it("hard-fails an exact source explicitly bound to a reserved action", async () => {
    const bound = artifacts();
    bound.reservedActionSourceBindings[0]!.sourceIds = ["fact.hearth"];

    const result = await runWorldNarrationPipeline({
      artifacts: bound,
      renderer: rendererFor(
        output(
          "A lamp burns beside the doorway. A lamp burns beside the doorway.",
        ),
      ),
    });

    expect(result.disposition).toBe("hard_fail");
    expect(result.validation?.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "AC-ACT-01",
        severity: "hard_fail",
      }),
    );
  });

  it("does not let a caller self-mint fidelity for free prose", async () => {
    const forgedArtifacts = {
      ...artifacts(),
      fidelityAfter: extractPublicFidelityRecord({}),
    };
    const result = await runWorldNarrationPipeline({
      artifacts: forgedArtifacts,
      renderer: rendererFor(
        output("She keeps her place. Light rests across the threshold."),
      ),
    });

    expect(result.disposition).toBe("creator_review");
    expect(result.publishReady).toBe(false);
    expect(result.stateTransitionAllowed).toBe(false);
    expect(
      result.validation?.findings.some(
        ({ ruleId, severity }) =>
          ruleId === "AC-FID-01" && severity === "creator_review",
      ),
    ).toBe(true);
    expect(
      result.validation?.findings.some(
        ({ ruleId, severity }) =>
          ruleId === "AC-DATA-02" && severity === "creator_review",
      ),
    ).toBe(true);
  });

  it("hard-fails process leakage and never invokes the critic", async () => {
    const revise = vi.fn<NarrationCritic["revise"]>();
    const result = await runWorldNarrationPipeline({
      artifacts: artifacts(),
      renderer: rendererFor(
        output("The pipeline validates the scene. Light rests by the door."),
      ),
      critic: { revise },
    });

    expect(result.disposition).toBe("hard_fail");
    expect(result.stateTransitionAllowed).toBe(false);
    expect(result.publishReady).toBe(false);
    expect(result.criticCallCount).toBe(0);
    expect(revise).not.toHaveBeenCalled();
  });

  it("routes uncertain private screening to creator review without acceptance", async () => {
    const result = await runWorldNarrationPipeline({
      artifacts: artifacts({ privatePattern: "king" }),
      renderer: rendererFor(
        output("She keeps her place. Light rests across the threshold."),
      ),
    });

    expect(result.disposition).toBe("creator_review");
    expect(result.stateTransitionAllowed).toBe(false);
    expect(result.publishReady).toBe(false);
    expect(result.validation?.hardPass).toBe(true);
  });

  it("hard-fails a model receipt whose source IDs do not match the scene plan", async () => {
    const mismatched = output(
      "A lamp burns beside the doorway. A lamp burns beside the doorway.",
    );
    mismatched.planReceipt[0]!.sourceFactIds = ["fact.unregistered"];

    const result = await runWorldNarrationPipeline({
      artifacts: artifacts(),
      renderer: rendererFor(mismatched),
    });

    expect(result.disposition).toBe("hard_fail");
    expect(result.stateTransitionAllowed).toBe(false);
    expect(result.validation?.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "AC-DATA-02",
        severity: "hard_fail",
      }),
    );
  });

  it("hard-fails an exact reserved action but reviews a paraphrase", async () => {
    const exact = await runWorldNarrationPipeline({
      artifacts: artifacts(),
      renderer: rendererFor(
        output(
          "The woman opens the barred door. A lamp burns beside the doorway.",
        ),
      ),
    });
    const paraphrase = await runWorldNarrationPipeline({
      artifacts: artifacts(),
      renderer: rendererFor(
        output("She pushes the door open. A lamp burns beside the doorway."),
      ),
    });

    expect(exact.disposition).toBe("hard_fail");
    expect(exact.validation?.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "AC-ACT-01",
        severity: "hard_fail",
      }),
    );
    expect(paraphrase.disposition).toBe("creator_review");
    expect(paraphrase.stateTransitionAllowed).toBe(false);
    expect(paraphrase.validation?.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "AC-ACT-01",
        severity: "creator_review",
      }),
    );
  });

  it("hard-fails an exact private phrase", async () => {
    const result = await runWorldNarrationPipeline({
      artifacts: artifacts({ privatePattern: "the hidden king waits" }),
      renderer: rendererFor(
        output(
          "The hidden king waits by the hearth. A lamp burns beside the doorway.",
        ),
      ),
    });

    expect(result.disposition).toBe("hard_fail");
    expect(result.validation?.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "AC-PRIV-02",
        severity: "hard_fail",
      }),
    );
  });

  it("keeps the eight-word verbatim guard active for exact prepared sources", async () => {
    const longSource =
      "A bronze lamp burns beside the doorway through the silent night.";
    const longArtifacts = artifacts();
    longArtifacts.inputEnvelope.modelFacing.visibleFacts[0]!.renderText =
      longSource;
    const visibleFactProvenance = longArtifacts.cameraSafeProvenance.find(
      ({ fieldKey }) => fieldKey === "visible_fact:fact.hearth",
    );
    if (!visibleFactProvenance) throw new Error("Missing visible-fact provenance.");
    visibleFactProvenance.text = longSource;

    const result = await runWorldNarrationPipeline({
      artifacts: longArtifacts,
      renderer: rendererFor(output(`${longSource} ${longSource}`)),
    });

    expect(result.disposition).toBe("hard_fail");
    expect(result.validation?.findings).toContainEqual(
      expect.objectContaining({
        ruleId: "AC-SEP-03",
        severity: "hard_fail",
      }),
    );
  });

  it("invokes the critic once but keeps revised free prose in creator review", async () => {
    const revise = vi.fn<NarrationCritic["revise"]>(async () => ({
      outcome: "completed",
      modelOutput: output(
        "She keeps her place. Light rests across the threshold.",
      ),
      trace: { provenance: "fixture", adapterId: "fixture.critic" },
    }));

    const result = await runWorldNarrationPipeline({
      artifacts: artifacts(),
      renderer: rendererFor(
        output("Silence waited by the hearth. Light rested by the doorway."),
      ),
      critic: { revise },
    });

    expect(revise).toHaveBeenCalledTimes(1);
    expect(result.criticCallCount).toBe(1);
    expect(result.disposition).toBe("creator_review");
    expect(result.stateTransitionAllowed).toBe(false);
  });

  it("can accept a one-shot critic revision only when it restores exact composition", async () => {
    const revise = vi.fn<NarrationCritic["revise"]>(async () => ({
      outcome: "completed",
      modelOutput: output(
        "A lamp burns beside the doorway. A lamp burns beside the doorway.",
      ),
      trace: { provenance: "fixture", adapterId: "fixture.critic" },
    }));

    const result = await runWorldNarrationPipeline({
      artifacts: artifacts(),
      renderer: rendererFor(
        output("Silence waited by the hearth. Light rested by the doorway."),
      ),
      critic: { revise },
    });

    expect(revise).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      disposition: "accepted",
      criticCallCount: 1,
      publishReady: true,
      stateTransitionAllowed: true,
    });
  });
});

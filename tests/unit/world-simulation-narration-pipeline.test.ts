import { describe, expect, it, vi } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { getOdysseyBook19WorldPack } from "@/src/adapters/world-packs/odyssey-book19";
import {
  fixtureNarrationCritic,
  fixtureNarrationRenderer,
} from "@/src/adapters/fixtures/world-narrator";
import {
  buildWorldNarrationPipelineArtifacts,
  runWorldSessionNarrationPipeline,
} from "@/src/application/world-simulation-service";
import { runWorldNarrationPipeline } from "@/src/application/world-narration-pipeline";
import {
  PenelopeEnglishStyleProfileSchema,
  type ModelNarrationOutput,
  type NarrationRendererOutcome,
} from "@/src/contracts/world-narrator";
import {
  createWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";
import type {
  NarrationCritic,
  NarrationRenderer,
} from "@/src/ports/world-narrator";

const worldPack = getOdysseyBook19WorldPack();
const scenario = worldPack.scenario;
const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);

const outputFor = (
  text: string,
  artifacts: ReturnType<typeof buildWorldNarrationPipelineArtifacts>,
): ModelNarrationOutput => ({
  planReceipt: artifacts.scenePlan.sentencePlans.map((plan) => ({
    sentencePlanId: plan.sentencePlanId,
    role: plan.role,
    sourceFactIds: [...plan.sourceFactIds],
    sourceEventIds: [...plan.sourceEventIds],
    speechEventIds: [...plan.speechEventIds],
    licensedRenderingDetailIds: [...plan.licensedRenderingDetailIds],
  })),
  readerProse: {
    format: "english_prose_paragraphs",
    paragraphs: [
      {
        paragraphId: "paragraph.test",
        sentencePlanIds: artifacts.scenePlan.sentencePlans.map(
          ({ sentencePlanId }) => sentencePlanId,
        ),
        text,
      },
    ],
  },
});

const rendererFor = (modelOutput: ModelNarrationOutput): NarrationRenderer => ({
  async render(): Promise<NarrationRendererOutcome> {
    return {
      outcome: "completed",
      modelOutput,
      trace: { provenance: "fixture", adapterId: "fixture.service-test" },
    };
  },
});

describe("world simulation narration pipeline service", () => {
  it("accepts prepared setup and turn narration and exposes only accepted state", async () => {
    const initial = createWorldSimulationSession({ scenario });
    const setup = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
      session: initial,
      receipt: null,
      styleProfile,
      renderer: fixtureNarrationRenderer,
      critic: fixtureNarrationCritic,
    });
    expect(setup.outcome).toBe("accepted");

    const turn = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const narrated = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
      renderer: fixtureNarrationRenderer,
      critic: fixtureNarrationCritic,
    });

    expect(narrated).toMatchObject({
      outcome: "accepted",
      committableSession: { state: { stateHash: turn.session.state.stateHash } },
      committableReceipt: { receiptHash: turn.receipt.receiptHash },
      pipeline: {
        disposition: "accepted",
        publishReady: true,
        stateTransitionAllowed: true,
      },
    });
  });

  it("keeps the prepared fixture concrete, branch-specific, and free of duplicate lines", async () => {
    const render = async (
      session: Parameters<typeof runWorldSessionNarrationPipeline>[0]["session"],
      receipt: Parameters<typeof runWorldSessionNarrationPipeline>[0]["receipt"],
    ): Promise<string[]> => {
      const result = await runWorldSessionNarrationPipeline({
        scenario,
        worldPack,
        session,
        receipt,
        styleProfile,
        renderer: fixtureNarrationRenderer,
        critic: fixtureNarrationCritic,
      });
      if (result.outcome !== "accepted") {
        throw new Error(`Expected accepted fixture prose, received ${result.outcome}.`);
      }
      return result.modelOutput.readerProse.paragraphs.map(({ text }) => text);
    };

    const initial = createWorldSimulationSession({ scenario });
    const opening = await render(initial, null);
    const clearRoom = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "dismiss melantho",
    });
    const clearRoomProse = await render(clearRoom.session, clearRoom.receipt);
    const compromised = runWorldSimulationTurn({
      scenario,
      session: clearRoom.session,
      input: "bring the basin",
    });
    const compromisedProse = await render(
      compromised.session,
      compromised.receipt,
    );
    const washing = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const washingProse = await render(washing.session, washing.receipt);
    const contained = runWorldSimulationTurn({
      scenario,
      session: washing.session,
      input: "observe",
    });
    const containedProse = await render(contained.session, contained.receipt);

    expect(opening).toEqual([
      "Penelope questions the stranger beside the hearth.",
      "Eurycleia waits nearby.",
    ]);
    expect(clearRoomProse).toContain(
      "Melantho leaves, but looks back at Penelope.",
    );
    expect(compromisedProse).toContain(
      "Melantho sees Eurycleia's shock and calls help.",
    );
    expect(washingProse).toContain(
      "The stranger stops Eurycleia before she speaks.",
    );
    expect(containedProse).toContain(
      "Eurycleia keeps silent while Penelope remains uncertain.",
    );
    for (const prose of [
      opening,
      clearRoomProse,
      compromisedProse,
      washingProse,
      containedProse,
    ]) {
      expect(new Set(prose).size).toBe(prose.length);
      expect(prose.join(" ")).not.toMatch(
        /holds the gathered household|watches the visible disturbance|orders Eurycleia to begin|disturbance escapes/iu,
      );
    }
  });

  it("binds stopping beats to actors instead of forcing a place to act", () => {
    const initial = createWorldSimulationSession({ scenario });
    const clearRoom = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "dismiss melantho",
    });
    const compromised = runWorldSimulationTurn({
      scenario,
      session: clearRoom.session,
      input: "bring the basin",
    });
    const turnArtifacts = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: clearRoom.session,
      receipt: clearRoom.receipt,
      styleProfile,
    });
    const artifacts = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: compromised.session,
      receipt: compromised.receipt,
      styleProfile,
    });
    const finalBeat = artifacts.scenePlan.sentencePlans.find(
      ({ sentencePlanId }) => sentencePlanId === "sentence.ending.stop",
    );
    const turnStop = turnArtifacts.scenePlan.sentencePlans.find(
      ({ sentencePlanId }) => sentencePlanId === "sentence.turn.stop",
    );

    expect(turnStop).toMatchObject({
      role: "in_world_stop",
      sourceFactIds: ["fact.narration_actor.entity_penelope"],
    });
    expect(finalBeat).toMatchObject({
      role: "in_world_stop",
      sourceFactIds: ["fact.narration_actor.entity_stranger"],
    });
    expect(finalBeat?.sourceFactIds).not.toContain(
      "fact.narration_zone.zone_great_hall_hearth",
    );
    expect(
      artifacts.inputEnvelope.modelFacing.visibleFacts.find(
        ({ factId }) => factId === finalBeat?.sourceFactIds[0],
      ),
    ).toMatchObject({ renderText: "The stranger sits before her." });
  });

  it("commits an unsupported turn without calling the renderer or critic", async () => {
    const initial = createWorldSimulationSession({ scenario });
    const turn = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "Command Zeus to erase every suitor from the palace now.",
    });
    const render = vi.fn(async () => {
      throw new Error("Unsupported actions must not reach the renderer.");
    });
    const revise = vi.fn(async () => {
      throw new Error("Unsupported actions must not reach the critic.");
    });
    const renderer: NarrationRenderer = { render };
    const critic: NarrationCritic = { revise };

    const narrated = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
      renderer,
      critic,
    });

    expect(turn.receipt.action.status).toBe("unsupported");
    expect(render).not.toHaveBeenCalled();
    expect(revise).not.toHaveBeenCalled();
    expect(narrated).toMatchObject({
      outcome: "no_render",
      reason: "unsupported_action",
      rendererCallCount: 0,
      criticCallCount: 0,
      committableSession: {
        state: { turn: 1, stateHash: turn.session.state.stateHash },
      },
      committableReceipt: { receiptHash: turn.receipt.receiptHash },
      trace: {
        provenance: "fixture",
        adapterId: "world.unsupported_no_render.v1",
      },
    });
    expect(turn.session.state.flags).toEqual(initial.state.flags);
    expect(turn.session.state.clocks).toEqual(initial.state.clocks);
    if (narrated.outcome !== "no_render") {
      throw new Error("Expected deterministic no-render narration.");
    }
    expect(narrated.narration.prose).toContain("nothing shifts in her favor");

    const recovered = runWorldSimulationTurn({
      scenario,
      session: narrated.committableSession,
      input: "bring the basin",
    });
    expect(recovered.session.state).toMatchObject({
      turn: 2,
      status: "complete",
      endingId: "ending.canon_contained",
    });
  });

  it("binds the approved Eurycleia answer to a typed speech event and license", async () => {
    const initial = createWorldSimulationSession({ scenario });
    const recognition = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const disclosure = runWorldSimulationTurn({
      scenario,
      session: recognition.session,
      input: "confront the stranger",
    });
    const artifacts = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: disclosure.session,
      receipt: disclosure.receipt,
      styleProfile,
    });
    const licenseId = "license.speech.eurycleia.controlled_disclosure";

    expect(artifacts.authorityRegistry.typedSpeechEvents).toEqual([
      { eventId: "event.visible_2", registeredKind: "speech" },
    ]);
    expect(artifacts.inputEnvelope.modelFacing.licensedRenderingDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          licenseId,
          issuer: "creator",
          issuerAuthorityId: "creator.penelope_ontology",
          category: "speech_act",
          sourceAuthorityIds: ["event.visible_2"],
        }),
        expect.objectContaining({
          licenseId: "license.cue.eurycleia.lean_toward_penelope",
          category: "movement",
        }),
        expect.objectContaining({
          licenseId: "license.cue.eurycleia.lower_voice",
          category: "sensory_detail",
        }),
        expect.objectContaining({
          licenseId: "license.cue.odysseus.confirmed_hearer",
          category: "spatial_relation",
        }),
      ]),
    );
    expect(artifacts.inputEnvelope.modelFacing.speechDisclosures).toEqual([
      {
        eventId: "event.visible_2",
        speakerId: "entity.eurycleia",
        addresseeIds: ["entity.penelope"],
        volume: "low",
        distance: "near",
        lineOfSightIds: ["entity.penelope", "entity.stranger"],
        confirmedHearerIds: ["entity.penelope", "entity.stranger"],
        deliveryCueLicenseIds: [
          "license.cue.eurycleia.lean_toward_penelope",
          "license.cue.eurycleia.lower_voice",
          "license.cue.odysseus.confirmed_hearer",
        ],
      },
    ]);
    expect(
      artifacts.inputEnvelope.privateValidation.latentDisclosureRisks,
    ).toEqual([
      {
        riskId:
          "risk.speech.eurycleia.controlled_disclosure.potential_audience",
        eventId: "event.visible_2",
        potentialHearerIds: ["entity.melantho"],
        channel: "behind_curtain",
        exposureStatus: "latent",
      },
    ]);
    expect(
      JSON.stringify(artifacts.inputEnvelope.modelFacing),
    ).not.toContain("potentialHearerIds");
    expect(artifacts.preflightReceipt.dialogueAuthority).toMatchObject({
      mode: "licensed",
      speakerId: "entity.eurycleia",
      speechAct: "answer",
      speechEventIds: ["event.visible_2"],
      speechActLicenseIds: [licenseId],
    });
    expect(
      artifacts.scenePlan.sentencePlans.find(
        ({ role }) => role === "licensed_dialogue",
      ),
    ).toMatchObject({
      speakerId: "entity.eurycleia",
      speechEventIds: ["event.visible_2"],
      licensedRenderingDetailIds: [licenseId],
      changesState: false,
    });
    expect(
      artifacts.scenePlan.sentencePlans
        .filter(({ role }) => role === "pressure")
        .map(({ licensedRenderingDetailIds }) => licensedRenderingDetailIds),
    ).toEqual([
      ["license.cue.eurycleia.lean_toward_penelope"],
      ["license.cue.eurycleia.lower_voice"],
      ["license.cue.odysseus.confirmed_hearer"],
    ]);
    expect(
      artifacts.scenePlan.sentencePlans.find(
        ({ role }) => role === "resolved_consequence",
      ),
    ).toMatchObject({
      sourceEventIds: ["event.ending_consequence"],
      licensedRenderingDetailIds: [],
      changesState: true,
    });

    const narrated = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
      session: disclosure.session,
      receipt: disclosure.receipt,
      styleProfile,
      renderer: fixtureNarrationRenderer,
      critic: fixtureNarrationCritic,
    });
    expect(narrated.outcome).toBe("accepted");
    if (narrated.outcome === "no_render") {
      throw new Error("Expected the licensed fixture narration to reach review.");
    }
    expect(narrated.pipeline.rendererCallCount).toBe(1);
    expect(
      narrated.pipeline.validation?.findings.filter(
        ({ severity }) => severity === "hard_fail",
      ),
    ).toEqual([]);
    expect(
      narrated.pipeline.validation?.renderAudit.usedSourceIds,
    ).toContain(licenseId);
  });

  it("keeps two separately authorized speakers distinct inside one scene", async () => {
    const initial = createWorldSimulationSession({ scenario });
    const recognition = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const disclosure = runWorldSimulationTurn({
      scenario,
      session: recognition.session,
      input: "confront the stranger",
    });
    const eurycleia = scenario.narrationSpeechDirectives[0]!;
    const syntheticScenario = {
      ...scenario,
      narrationSpeechDirectives: [
        ...scenario.narrationSpeechDirectives,
        {
          ...eurycleia,
          id: "speech.odysseus.bounded_reply",
          reactionRuleId: "reaction.odysseus.answer_testimony",
          speakerEntityId: "entity.odysseus",
          plainIntent:
            "Answer Penelope only with the already resolved remembered detail.",
          contentBoundary: "The stranger answers Penelope with care.",
          disclosureGeometry: {
            speakerId: "entity.odysseus",
            addresseeIds: ["entity.penelope"],
            volume: "low" as const,
            distance: "near" as const,
            lineOfSightIds: ["entity.penelope", "entity.eurycleia"],
            confirmedHearerIds: ["entity.penelope", "entity.eurycleia"],
            potentialHearerIds: [],
          },
          deliveryCues: [],
          creatorDecisionId: "decision.synthetic.multispeech",
        },
      ],
    };
    const syntheticReceipt = {
      ...disclosure.receipt,
      events: [
        ...disclosure.receipt.events,
        {
          eventId: "event.synthetic.odysseus_reply",
          source: {
            kind: "npc" as const,
            actorEntityId: "entity.odysseus",
            reactionRuleId: "reaction.odysseus.answer_testimony",
          },
          actionId: "action.odysseus.answer_carefully",
          summary: "The stranger answers Penelope with care.",
          effects: [],
          visibleToEntityIds: ["entity.penelope"],
        },
      ],
    };
    const artifacts = buildWorldNarrationPipelineArtifacts({
      scenario: syntheticScenario,
      worldPack,
      session: disclosure.session,
      receipt: syntheticReceipt,
      styleProfile,
    });

    expect(artifacts.inputEnvelope.modelFacing.speechDisclosures).toHaveLength(2);
    expect(
      artifacts.scenePlan.sentencePlans
        .filter(({ role }) => role === "licensed_dialogue")
        .map(({ speakerId }) => speakerId),
    ).toEqual(["entity.eurycleia", "entity.stranger"]);
    expect(artifacts.preflightReceipt.additionalDialogueAuthorities).toEqual([
      expect.objectContaining({
        speakerId: "entity.stranger",
        speechEventIds: ["event.visible_3"],
      }),
    ]);

    const pipeline = await runWorldNarrationPipeline({
      artifacts,
      renderer: fixtureNarrationRenderer,
      critic: fixtureNarrationCritic,
    });
    expect(pipeline.validation).toMatchObject({
      hardPass: true,
    });
    expect(
      pipeline.validation?.findings.filter(
        ({ severity }) => severity === "hard_fail",
      ),
    ).toEqual([]);
  });

  it("cannot accept caller-shaped fidelity or free prose as a committable turn", async () => {
    const initial = createWorldSimulationSession({ scenario });
    const turn = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const artifacts = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
    });
    expect(artifacts).not.toHaveProperty("fidelityAfter");
    expect(artifacts.reservedActionSourceBindings).toEqual(
      artifacts.inputEnvelope.modelFacing.reservedActionIds.map((actionId) => ({
        actionId,
        sourceIds: [],
      })),
    );
    const visibleFactText = new Map(
      artifacts.inputEnvelope.modelFacing.visibleFacts.map(
        ({ factId, renderText }) => [factId, renderText],
      ),
    );
    expect(
      artifacts.inputEnvelope.modelFacing.presentActors.every(
        ({ renderDescriptor, sourceFactIds }) =>
          sourceFactIds.every(
            (sourceFactId) => visibleFactText.get(sourceFactId) === renderDescriptor,
          ),
      ),
    ).toBe(true);
    const result = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
      renderer: rendererFor(
        outputFor(
          "She keeps her place. Light rests across the threshold. The nurse remains nearby. The room stays quiet.",
          artifacts,
        ),
      ),
    });
    if (result.outcome === "no_render") {
      throw new Error("Expected the supported turn to enter narration review.");
    }

    expect(
      result.pipeline.validation?.findings.filter(
        ({ severity }) => severity === "hard_fail",
      ),
    ).toEqual([]);
    expect(result).toMatchObject({
      outcome: "creator_review",
      candidateSession: { state: { stateHash: turn.session.state.stateHash } },
      candidateReceipt: { receiptHash: turn.receipt.receiptHash },
      modelOutput: { readerProse: { format: "english_prose_paragraphs" } },
      pipeline: {
        disposition: "creator_review",
        publishReady: false,
        stateTransitionAllowed: false,
      },
    });
    expect(result).not.toHaveProperty("committableSession");
    expect(result).not.toHaveProperty("committableReceipt");
  });

  it("keeps a hard-failed renderer result outside state authority", async () => {
    const initial = createWorldSimulationSession({ scenario });
    const turn = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const artifacts = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
    });
    const result = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
      renderer: rendererFor(
        outputFor(
          "The pipeline validates the scene. Light rests by the door.",
          artifacts,
        ),
      ),
    });
    if (result.outcome === "no_render") {
      throw new Error("Expected the supported turn to reach postvalidation.");
    }

    expect(result.pipeline.disposition).toBe("hard_fail");
    expect(result).toMatchObject({
      outcome: "blocked",
      committableSession: null,
      committableReceipt: null,
      modelOutput: null,
    });
  });
});

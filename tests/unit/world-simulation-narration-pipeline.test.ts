import { describe, expect, it, vi } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import {
  fixtureNarrationCritic,
  fixtureNarrationRenderer,
} from "@/src/adapters/fixtures/world-narrator";
import {
  buildWorldNarrationPipelineArtifacts,
  runWorldSessionNarrationPipeline,
} from "@/src/application/world-simulation-service";
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

const scenario = getOdysseyBook19WorldSimulation();
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
      session: disclosure.session,
      receipt: disclosure.receipt,
      styleProfile,
    });
    const licenseId = "license.speech.eurycleia.controlled_disclosure";

    expect(artifacts.authorityRegistry.typedSpeechEvents).toEqual([
      { eventId: "event.visible_2", registeredKind: "speech" },
    ]);
    expect(artifacts.inputEnvelope.modelFacing.licensedRenderingDetails).toEqual([
      expect.objectContaining({
        licenseId,
        issuer: "creator",
        issuerAuthorityId: "creator.penelope_ontology",
        category: "speech_act",
        sourceAuthorityIds: ["event.visible_2"],
      }),
    ]);
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
      speechEventIds: [],
      licensedRenderingDetailIds: [licenseId],
      changesState: false,
    });
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
      session: disclosure.session,
      receipt: disclosure.receipt,
      styleProfile,
      renderer: fixtureNarrationRenderer,
      critic: fixtureNarrationCritic,
    });
    expect(narrated.outcome).toBe("accepted");
    if (narrated.outcome !== "accepted") {
      throw new Error("Expected the licensed fixture narration to be accepted.");
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

  it("cannot accept caller-shaped fidelity or free prose as a committable turn", async () => {
    const initial = createWorldSimulationSession({ scenario });
    const turn = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const artifacts = buildWorldNarrationPipelineArtifacts({
      scenario,
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
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
    });
    const result = await runWorldSessionNarrationPipeline({
      scenario,
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

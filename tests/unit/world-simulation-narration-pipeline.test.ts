import { describe, expect, it } from "vitest";
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
import type { NarrationRenderer } from "@/src/ports/world-narrator";

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

    expect(result.pipeline.disposition).toBe("hard_fail");
    expect(result).toMatchObject({
      outcome: "blocked",
      committableSession: null,
      committableReceipt: null,
      modelOutput: null,
    });
  });
});

import { describe, expect, it } from "vitest";
import { fixtureWorldNarrator } from "@/src/adapters/fixtures/world-narrator";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import {
  buildWorldNarrationRequest,
  buildWorldNarrationRestrictedConcepts,
  buildWorldVisibleSceneMemory,
  buildWorldSessionProjections,
  narrateWorldSession,
  WorldNarrationError,
} from "@/src/application/world-simulation-service";
import { WorldParticipantSessionViewSchema } from "@/src/contracts/world-api";
import type { WorldNarrationRequest } from "@/src/contracts/world-narrator";
import {
  createWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";
import type { WorldNarrator } from "@/src/ports/world-narrator";

const scenario = getOdysseyBook19WorldSimulation();

const appendLeakNarrator = (): WorldNarrator => ({
  async narrate(request: WorldNarrationRequest) {
    const outcome = await fixtureWorldNarrator.narrate(request);
    if (outcome.outcome !== "completed") return outcome;
    const leak = "The stranger before her was really Ulysses.";
    const segments = outcome.narration.segments.map((segment, index) =>
      index === outcome.narration.segments.length - 1
        ? { ...segment, text: `${segment.text} ${leak}` }
        : segment,
    );
    return {
      outcome: "completed",
      narration: {
        ...outcome.narration,
        segments,
        prose: segments.map(({ text }) => text).join("\n\n"),
      },
      trace: outcome.trace,
    };
  },
});

describe("world simulation service privacy boundary", () => {
  it("derives continuation memory from registered visible events, not model prose", () => {
    const initial = createWorldSimulationSession({ scenario });
    const result = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const memory = buildWorldVisibleSceneMemory({
      scenario,
      receipt: result.receipt,
    });

    expect(memory).toContain("Penelope asks Eurycleia to wash the stranger's feet");
    expect(memory).toContain("Eurycleia's hands stop at the old scar");
    expect(memory).not.toMatch(/narration|model prose|invented fact/iu);
  });

  it("keeps identity-bearing premises and concrete aliases out of the model request before grant", () => {
    const session = createWorldSimulationSession({ scenario });
    const request = buildWorldNarrationRequest({
      scenario,
      session,
      receipt: null,
      previousVisibleSceneSummary:
        "The stranger before her was really Ulysses, though nobody had said so aloud.",
    });
    const serialized = JSON.stringify(request);

    expect(request.previousVisibleSceneSummary).toBeNull();
    expect(request.focalKnowledge.map(({ factId }) => factId)).not.toEqual(
      expect.arrayContaining([
        "premise.stranger_identity",
        "premise.scar_recognition",
        "premise.penelope_bounded_evidence",
        "premise.penelope_not_certain",
        "premise.eurycleia_loyalty",
      ]),
    );
    expect(serialized).not.toMatch(/odysseus|ulysses|laertiades/iu);
    expect(serialized).not.toMatch(/conceal(?:s|ing)? (?:his |the )?identity|hidden plan/iu);
    expect(serialized).not.toContain("restrictedConcepts");
    expect(
      request.styleConstraints.some(
        ({ constraintId }) => constraintId === "style.no_false_certainty",
      ),
    ).toBe(true);
    expect(buildWorldNarrationRestrictedConcepts({ scenario, session })).toHaveLength(1);
  });

  it("applies the creator-only concept gate after narration", async () => {
    const session = createWorldSimulationSession({ scenario });

    await expect(
      narrateWorldSession({
        scenario,
        session,
        receipt: null,
        previousVisibleSceneSummary: null,
        narrator: appendLeakNarrator(),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WorldNarrationError>>({
        code: "world_narration_restricted_concept_leak",
      }),
    );
  });

  it("releases the premise and disables the concept gate after a knowledge grant", () => {
    const initial = createWorldSimulationSession({ scenario });
    const recognition = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "order washing",
    });
    const discovery = runWorldSimulationTurn({
      scenario,
      session: recognition.session,
      input: "confront the stranger",
    });
    const request = buildWorldNarrationRequest({
      scenario,
      session: discovery.session,
      receipt: discovery.receipt,
      previousVisibleSceneSummary: null,
    });

    expect(request.focalKnowledge.map(({ factId }) => factId)).toContain(
      "premise.stranger_identity",
    );
    expect(JSON.stringify(request)).toMatch(/odysseus/iu);
    expect(
      buildWorldNarrationRestrictedConcepts({
        scenario,
        session: discovery.session,
      }),
    ).toEqual([]);
  });

  it("projects participant-visible data separately from the creator receipt", async () => {
    const session = createWorldSimulationSession({ scenario });
    const narrated = await narrateWorldSession({
      scenario,
      session,
      receipt: null,
      previousVisibleSceneSummary: null,
      narrator: fixtureWorldNarrator,
    });
    const projections = buildWorldSessionProjections({
      scenario,
      session,
      sessionId: crypto.randomUUID(),
      parentCheckpointId: null,
      forked: false,
      transport: "fixture",
      receipt: null,
      narration: narrated.narration,
      trace: narrated.trace,
    });
    const participantJson = JSON.stringify(projections.participantView);
    const creatorJson = JSON.stringify(projections.creatorReceipt);

    expect(projections.participantView).not.toHaveProperty("creatorReceipt");
    expect(
      WorldParticipantSessionViewSchema.safeParse({
        ...projections.participantView,
        creatorReceipt: projections.creatorReceipt,
      }).success,
    ).toBe(false);
    expect(projections.participantView.visibleEvents.every(
      (event) => !("effects" in event),
    )).toBe(true);
    expect(participantJson).not.toMatch(/disguised odysseus|premise\.stranger_identity/iu);
    expect(creatorJson).toContain("Disguised Odysseus");
    expect(creatorJson).toContain("premise.stranger_identity");
  });
});

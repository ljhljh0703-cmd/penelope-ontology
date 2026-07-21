import { describe, expect, it } from "vitest";
import { loadRedSailStoryBundle } from "@/src/adapters/filesystem/story-data";
import {
  StoryTurnError,
  createFixtureStorySession,
  deriveStoryStateFingerprint,
  runFixtureStoryTurn,
  runStoryTurn,
} from "@/src/application/run-story-turn";
import type {
  StoryActionBoundary,
  StoryChoice,
  StoryModelRequest,
} from "@/src/contracts/story";
import {
  registeredReservedStoryActionTypes,
  validateReservedStoryActionSemantics,
} from "@/src/domain/story-action-boundary";
import type { StoryModel } from "@/src/ports/story-model";

const choiceById = (choices: StoryChoice[], choiceId: string): StoryChoice => {
  const choice = choices.find((candidate) => candidate.choiceId === choiceId);
  if (!choice) throw new Error(`Missing test choice ${choiceId}.`);
  return choice;
};

const boundaryFor = ({
  choiceId,
  actionTypeId,
  actorEntityId,
}: {
  choiceId: string;
  actionTypeId: string;
  actorEntityId: string;
}): StoryActionBoundary => ({
  performedAction: {
    choiceId: "choice.test.performed",
    actionTypeId: "action.test.performed",
    actorEntityId: "penelope",
  },
  underwayActions: [],
  reservedNextActions: [{ choiceId, actionTypeId, actorEntityId }],
});

describe("story turn runtime", () => {
  it("registers a bounded semantic guard for every reserved action reachable in Red Sail", () => {
    expect(registeredReservedStoryActionTypes()).toEqual([
      "action.keep_quiet_watch",
      "action.move_decoy_lamp",
      "action.ring_public_bell",
      "action.sweep_harbor",
    ]);
  });

  it.each([
    [
      "action.move_decoy_lamp",
      "choice.move_decoy_lamp",
      "penelope",
      "Penelope carries the covered lamp to the east gate.",
    ],
    [
      "action.move_decoy_lamp",
      "choice.move_decoy_lamp",
      "penelope",
      "The covered lamp has been moved to the east gate.",
    ],
    [
      "action.sweep_harbor",
      "choice.sweep_harbor",
      "telemachus",
      "Telemachus begins sweeping the harbor with the assembled guard.",
    ],
    [
      "action.sweep_harbor",
      "choice.sweep_harbor",
      "telemachus",
      "The harbor has been secured and searched.",
    ],
    [
      "action.keep_quiet_watch",
      "choice.keep_quiet_watch",
      "penelope",
      "Penelope keeps a quiet watch beneath the western wall.",
    ],
    [
      "action.ring_public_bell",
      "choice.ring_public_bell",
      "penelope",
      "Penelope pulls the bell rope and the public bell sounds.",
    ],
  ])(
    "rejects prose that starts or completes reserved %s",
    (actionTypeId, choiceId, actorEntityId, prose) => {
      expect(
        validateReservedStoryActionSemantics({
          prose,
          boundary: boundaryFor({ choiceId, actionTypeId, actorEntityId }),
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "reserved_action_started",
            actionTypeId,
          }),
        ]),
      );
    },
  );

  it.each([
    [
      "action.move_decoy_lamp",
      "choice.move_decoy_lamp",
      "penelope",
      "Telemachus will carry the covered lamp to the east gate.",
    ],
    [
      "action.sweep_harbor",
      "choice.sweep_harbor",
      "telemachus",
      "Penelope should sweep the harbor while he remains at the wall.",
    ],
    [
      "action.keep_quiet_watch",
      "choice.keep_quiet_watch",
      "penelope",
      "Telemachus will keep a quiet watch while Penelope stays inside.",
    ],
    [
      "action.ring_public_bell",
      "choice.ring_public_bell",
      "penelope",
      "Eurycleia must ring the public bell if the sail turns.",
    ],
  ])(
    "rejects explicit actor transfer for reserved %s even before execution",
    (actionTypeId, choiceId, actorEntityId, prose) => {
      expect(
        validateReservedStoryActionSemantics({
          prose,
          boundary: boundaryFor({ choiceId, actionTypeId, actorEntityId }),
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "reserved_action_actor_transfer",
            actionTypeId,
          }),
        ]),
      );
    },
  );

  it("allows the registered actor to remain a hypothetical option without beginning it", () => {
    expect(
      validateReservedStoryActionSemantics({
        prose:
          "Telemachus asks whether Penelope could move the covered lamp to the east gate, but she points to both and does not touch either.",
        boundary: boundaryFor({
          choiceId: "choice.move_decoy_lamp",
          actionTypeId: "action.move_decoy_lamp",
          actorEntityId: "penelope",
        }),
      }),
    ).toEqual([]);
    expect(
      validateReservedStoryActionSemantics({
        prose:
          "Telemachus asks for a full sweep before the crowd erases every footprint.",
        boundary: boundaryFor({
          choiceId: "choice.sweep_harbor",
          actionTypeId: "action.sweep_harbor",
          actorEntityId: "telemachus",
        }),
      }),
    ).toEqual([]);
  });

  it("fingerprints ordered typed effects without claiming a materialized snapshot", async () => {
    const bundle = await loadRedSailStoryBundle();
    const resolution = bundle.scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!.resolution;
    const forward = deriveStoryStateFingerprint({
      priorStoryStateHash: bundle.snapshot.stateHash,
      resolution,
    });
    const reversed = deriveStoryStateFingerprint({
      priorStoryStateHash: bundle.snapshot.stateHash,
      resolution: {
        ...resolution,
        effects: [...resolution.effects].reverse(),
      },
    });

    expect(forward).toBe(
      deriveStoryStateFingerprint({
        priorStoryStateHash: bundle.snapshot.stateHash,
        resolution,
      }),
    );
    expect(reversed).not.toBe(forward);
  });

  it("opens on visible Scene 1 with the real canon and state authorities", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);

    expect(bootstrap.opening.sceneNumber).toBe(1);
    expect(bootstrap.session.currentSceneNumber).toBe(1);
    expect(bootstrap.session.scenes).toHaveLength(1);
    expect(bootstrap.choices).toHaveLength(2);
    expect(bootstrap.session.ledger.cursor.baseCanonHash).toBe(
      bundle.overlay.hash,
    );
    expect(bootstrap.session.ledger.cursor.baseStateHash).toBe(
      bundle.snapshot.stateHash,
    );
    expect(bootstrap.session.ledger.entries).toHaveLength(1);
    expect(bootstrap.session.storyStateHash).not.toBe(bundle.snapshot.stateHash);
    expect(createFixtureStorySession(bundle).session.storyStateHash).toBe(
      bootstrap.session.storyStateHash,
    );
    expect(bootstrap.session.storyStateHash).toBe(
      deriveStoryStateFingerprint({
        priorStoryStateHash: bundle.snapshot.stateHash,
        resolution: bootstrap.opening.resolution,
      }),
    );
  });

  it("pays the quiet-watch choice through cost, evidence, and a complete ending", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);
    const quiet = choiceById(bootstrap.choices, "choice.keep_quiet_watch");
    const second = runFixtureStoryTurn({
      ...bundle,
      request: { session: bootstrap.session, choice: quiet },
    });

    expect(second.status).toBe("advanced");
    expect(second.session.storyStateHash).not.toBe(
      bootstrap.session.storyStateHash,
    );
    expect(second.session.ledger.entries.at(-1)?.beforeStateHash).toBe(
      second.session.ledger.entries.at(-1)?.afterStateHash,
    );
    expect(second.scene.sceneNumber).toBe(2);
    expect(second.scene.prose).toContain("answering light has intention");
    expect(second.scene.prose).toContain("hill path alone");
    expect(second.scene.echoedEffectIds).toContain("effect.red_sail.seen");
    expect(second.resolution.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          effectId: "effect.debt.penelope_to_telemachus",
          kind: "debt_open",
        }),
        expect.objectContaining({
          effectId: "effect.hidden_observer.confirmed",
        }),
      ]),
    );

    const moveLamp = choiceById(
      second.scene.suggestedContinuations,
      "choice.move_decoy_lamp",
    );
    const ending = runFixtureStoryTurn({
      ...bundle,
      request: { session: second.session, choice: moveLamp },
    });

    expect(ending.status).toBe("completed");
    expect(ending.session.storyStateHash).not.toBe(
      second.session.storyStateHash,
    );
    expect(ending.session.status).toBe("completed");
    expect(ending.scene.centralQuestionClosed).toBe(true);
    expect(ending.scene.suggestedContinuations).toEqual([]);
    expect(ending.scene.prose).toContain(
      "You were alone because I chose silence",
    );
    expect(ending.scene.prose).toContain("captured spy");
    expect(ending.scene.echoedEffectIds).toContain(
      "effect.debt.penelope_to_telemachus.resolved",
    );
    expect(
      ending.session.spine.mustPayOffObligations.some(
        ({ status }) => status === "open",
      ),
    ).toBe(false);
    expect(ending.scene.residualHook).toBe("Who hired the captured spy?");
  });

  it("makes the public-bell branch visibly safer and epistemically costlier", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);
    const bell = choiceById(bootstrap.choices, "choice.ring_public_bell");
    const second = runFixtureStoryTurn({
      ...bundle,
      request: { session: bootstrap.session, choice: bell },
    });

    expect(second.scene.prose).toContain("twenty guards instead of two");
    expect(second.scene.prose).toContain("bought bodies, not truth");
    expect(second.resolution.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectId: "effect.rumor.spread" }),
        expect.objectContaining({ effectId: "effect.signal.ambiguous" }),
      ]),
    );

    const sweep = choiceById(
      second.scene.suggestedContinuations,
      "choice.sweep_harbor",
    );
    const ending = runFixtureStoryTurn({
      ...bundle,
      request: { session: second.session, choice: sweep },
    });

    expect(ending.status).toBe("completed");
    expect(ending.scene.prose).toContain("The harbor is safe");
    expect(ending.scene.prose).toContain("hooded figure is gone");
    expect(ending.scene.residualHook).toContain("public rumor");
    expect(ending.resolution.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effectId: "effect.harbor.safe.bell" }),
        expect.objectContaining({ effectId: "effect.spy.escaped" }),
      ]),
    );
  });

  it("rejects a fabricated direct choice instead of executing the first fixture branch", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);
    const direct: StoryChoice = {
      choiceId: "choice.direct.board_red_ship",
      actionTypeId: "action.direct_attempt",
      actorEntityId: "penelope",
      label: "Board the ship",
      intent:
        "Leave the palace immediately cross the reef alone board the red sailed ship seize its captain search every cabin and return before the bell can ring while refusing any guard escort or safer intermediate test",
      proposalAssessment: {
        decision: "approved",
        basis: "registered_story_fit",
        matchedChoiceId: "choice.keep_quiet_watch",
        rationale:
          "Penelope approves the attempt without granting the desired result.",
        riskProfile: {
          level: "high",
          summary: "The attempt exceeds the prepared causal route.",
          possibleCosts: ["causal pressure"],
        },
      },
      source: "direct",
    };
    expect(() =>
      runFixtureStoryTurn({
        ...bundle,
        request: { session: bootstrap.session, choice: direct },
      }),
    ).toThrowError("The submitted choice has no exact registered story branch.");
  });

  it("rejects an internal direct choice even when its text and matched ID copy A", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);
    const prepared = choiceById(
      bootstrap.choices,
      "choice.keep_quiet_watch",
    );
    const disguisedDirect: StoryChoice = {
      ...prepared,
      source: "direct",
      proposalAssessment: {
        decision: "approved",
        basis: "registered_story_fit",
        matchedChoiceId: prepared.choiceId,
        rationale: "This payload tries to relabel A as a creator direction.",
        riskProfile: prepared.riskProfile ?? {
          level: "unassessed",
          summary: "No route risk was registered.",
          possibleCosts: [],
        },
      },
    };

    expect(() =>
      runFixtureStoryTurn({
        ...bundle,
        request: {
          session: bootstrap.session,
          choice: disguisedDirect,
        },
      }),
    ).toThrowError("The submitted choice has no exact registered story branch.");
  });

  it("rejects a fabricated suggested choice instead of inventing a branch", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);
    expect(() =>
      runFixtureStoryTurn({
        ...bundle,
        request: {
          session: bootstrap.session,
          choice: {
            choiceId: "choice.fake.divine_rescue",
            actionTypeId: "action.direct_attempt",
            actorEntityId: "penelope",
            label: "Summon a god",
            intent: "Ask a god to settle the signal without cost.",
            source: "suggested",
          },
        },
      }),
    ).toThrowError(StoryTurnError);
  });

  it("commits live prose only after transport, branch, and scope checks pass", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);
    const quiet = choiceById(bootstrap.choices, "choice.keep_quiet_watch");
    const quietFixture = bundle.scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!;
    let capturedRequest: StoryModelRequest | undefined;
    const model: StoryModel = {
      generate: async (request) => {
        capturedRequest = request;
        return {
          outcome: "completed",
          draft: quietFixture.draft,
          trace: {
            mode: "codex_cli",
            requestedModel: "gpt-5.6",
            actualModel: "gpt-5.6",
            responseId: "response.story.test",
            inputTokens: 800,
            outputTokens: 180,
            outputSha256: "c".repeat(64),
            processDiagnostics: null,
          },
        };
      },
    };
    const result = await runStoryTurn({
      ...bundle,
      request: { session: bootstrap.session, choice: quiet },
      model,
      transport: "codex_cli",
    });

    expect(capturedRequest?.acceptedChoice).toEqual(quiet);
    expect(capturedRequest?.styleProfile).toEqual(bundle.scenario.styleProfile);
    expect(capturedRequest?.allowedNextChoices).toEqual(
      quietFixture.draft.suggestedContinuations,
    );
    expect(result.trace.mode).toBe("codex_cli");
    expect(result.session.ledger.entries.at(-1)?.traceIds[0]).toContain(
      "trace.story.codex_cli",
    );
    expect(result.session.ledger.entries.at(-1)?.traceIds[0]).not.toContain(
      "fixture",
    );
  });

  it("does not commit a live model's invented continuation", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);
    const before = structuredClone(bootstrap.session);
    const quiet = choiceById(bootstrap.choices, "choice.keep_quiet_watch");
    const quietFixture = bundle.scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!;
    const model: StoryModel = {
      generate: async () => ({
        outcome: "completed",
        draft: {
          ...quietFixture.draft,
          suggestedContinuations: [
            {
              choiceId: "choice.model.invented",
              actionTypeId: "action.direct_attempt",
              actorEntityId: "telemachus",
              label: "Follow an invented branch",
              intent: "Leave the registered story for an unsupported branch.",
              source: "suggested",
            },
          ],
        },
        trace: {
          mode: "codex_cli",
          requestedModel: "gpt-5.6",
          actualModel: null,
          responseId: null,
          inputTokens: null,
          outputTokens: null,
          outputSha256: "d".repeat(64),
          processDiagnostics: null,
        },
      }),
    };

    await expect(
      runStoryTurn({
        ...bundle,
        request: { session: bootstrap.session, choice: quiet },
        model,
        transport: "codex_cli",
      }),
    ).rejects.toThrowError(StoryTurnError);
    expect(bootstrap.session).toEqual(before);
  });

  it("rejects live prose that performs the reserved decoy move with Telemachus", async () => {
    const bundle = await loadRedSailStoryBundle();
    const bootstrap = createFixtureStorySession(bundle);
    const before = structuredClone(bootstrap.session);
    const quiet = choiceById(bootstrap.choices, "choice.keep_quiet_watch");
    const quietFixture = bundle.scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!;
    const segments = quietFixture.draft.segments.map((segment, index) =>
      index === quietFixture.draft.segments.length - 1
        ? {
            ...segment,
            text: `${segment.text} Telemachus lifts the covered lamp and starts toward the east gate.`,
          }
        : segment,
    );
    const model: StoryModel = {
      generate: async () => ({
        outcome: "completed",
        draft: {
          ...quietFixture.draft,
          segments,
          prose: segments.map(({ text }) => text).join("\n\n"),
        },
        trace: {
          mode: "codex_cli",
          requestedModel: "gpt-5.6",
          actualModel: null,
          responseId: null,
          inputTokens: null,
          outputTokens: null,
          outputSha256: "e".repeat(64),
          processDiagnostics: null,
        },
      }),
    };

    await expect(
      runStoryTurn({
        ...bundle,
        request: { session: bootstrap.session, choice: quiet },
        model,
        transport: "codex_cli",
      }),
    ).rejects.toThrowError(
      expect.objectContaining<Partial<StoryTurnError>>({
        message:
          "The scene prose violates reserved next-action authority: reserved_action_started:action.move_decoy_lamp, reserved_action_actor_transfer:action.move_decoy_lamp.",
      }),
    );
    expect(bootstrap.session).toEqual(before);
  });
});

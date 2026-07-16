import { describe, expect, it } from "vitest";
import {
  StoryPresentationError,
  resolvePresentedStoryChoice,
  storyStyleProfileView,
} from "@/src/application/story-presentation";
import type { StoryChoice, StorySession } from "@/src/contracts/story";

const openingProse =
  "The loom stops before the messenger finishes. A red sail holds beyond the western reef, neither entering nor turning away, while the hall gives the color a king's name. Penelope keeps one hand on the shuttle and watches Telemachus count the guards nearest the door. He asks for the harbor bell. She asks what the bell would prove. Between them, Eurycleia sets an unlit covered lamp beside the rope. One answer would gather defenders and give every suitor a rumor to command. The other would preserve the signal's meaning while leaving fewer hands beside her son. Outside, the sail holds its distance. Inside, bronze and lamplight wait for Penelope to decide which danger Ithaca can afford.";

const makeSession = (suggestedContinuations?: StoryChoice[]) =>
  ({
    sessionId: "session.story.test",
    scenarioId: "scenario.story.test",
    worldPackId: "pack.story.test",
    worldPackVersion: "1.0.0",
    focalEntityId: "penelope",
    currentSceneNumber: 1,
    status: "active",
    spine: {
      premise: "A signal forces a bounded choice.",
      dramaticQuestion: "What will the signal cost?",
      targetEnding: "The threat is resolved without false proof.",
      maximumSceneCount: 3,
      currentBeat: 1,
      openThreads: [],
      mustPayOffObligations: [],
      forbiddenResolutions: [],
    },
    characterDrives: [
      {
        characterId: "penelope",
        desire: "Protect Ithaca.",
        fear: "False proof.",
        tactic: "Test signals.",
        redLine: "No false claim.",
        relationshipPressure: "Her caution costs Telemachus.",
      },
    ],
    styleProfile: {
      styleProfileId: "style.test",
      label: "Test style",
      pointOfView: "limited_third",
      tense: "present",
      rhythm: "Pressure shortens the sentence.",
      dialogueAndSubtext: "Disagreement stays playable.",
      recurringImages: ["thread"],
      forbiddenHabits: ["No omniscient leak."],
      microExamples: [
        { constraint: "Decision", example: "The loom stops." },
      ],
    },
    ledger: {
      cursor: {
        campaignId: "campaign.story.test",
        branchId: "branch.story.test",
        parentBranchId: null,
        forkedFromEntryHash: null,
        worldPackId: "pack.story.test",
        worldPackVersion: "1.0.0",
        baseCanonHash: "a".repeat(64),
        baseStateHash: "b".repeat(64),
        currentStateHash: "b".repeat(64),
        headEntryHash: null,
        entryCount: 0,
        cursorHash: "c".repeat(64),
      },
      entries: [],
    },
    scenes: [
      {
        sceneId: "scene.story.opening",
        sceneNumber: 1,
        resolution: {
          resolutionId: "resolution.story.opening",
          choiceId: "choice.world.signal",
          authority: { kind: "world_rule", evidenceRefs: [] },
          outcome: "success",
          actionTypeId: "action.signal",
          targetEntityIds: ["penelope"],
          effects: [
            {
              effectId: "effect.signal",
              kind: "flag_set",
              entityId: "penelope",
              flagId: "signal_seen",
              value: true,
            },
          ],
          openedDebtEffectIds: [],
          resolvedDebtEffectIds: [],
          evidenceClaimIds: [],
          evidenceRuleIds: [],
          summary: "The signal is visible.",
        },
        contract: {
          sceneNumber: 1,
          focalCharacterId: "penelope",
          presentSpeakerIds: ["penelope"],
          goal: "Interpret the signal.",
          opposition: "Rumor.",
          inheritedConsequenceIds: [],
          requiredDramaticTurn: "A choice is required.",
          stateDeltaEffectIds: ["effect.signal"],
          forwardPressure: "The ship waits.",
          closedThreadIds: [],
          openedThreadIds: [],
          openedObligationIds: [],
          paidObligationIds: [],
        },
        title: "The Signal",
        prose: openingProse,
        segments: [
          {
            segmentId: "segment.signal",
            kind: "narration",
            speakerId: null,
            text: openingProse,
            groundingClaimIds: [],
            echoedEffectIds: [],
          },
        ],
        suggestedContinuations: suggestedContinuations ?? [
          {
            choiceId: "choice.keep_watch",
            actionTypeId: "action.keep_watch",
            actorEntityId: "penelope",
            label: "Keep watch",
            intent: "Keep the bell silent.",
            source: "suggested",
          },
        ],
        centralQuestionClosed: false,
        residualHook: "The signal waits.",
        echoedEffectIds: [],
        sceneHash: "d".repeat(64),
      },
    ],
    selectedChoiceIds: [],
    choiceHistory: [],
    sessionHash: "e".repeat(64),
  }) as unknown as StorySession;

describe("story presentation choice authority", () => {
  it("returns the exact registered choice", () => {
    const session = makeSession();
    expect(
      resolvePresentedStoryChoice({
        session,
        action: "Keep the bell silent.",
        choiceId: "choice.keep_watch",
      }),
    ).toEqual(session.scenes[0]?.suggestedContinuations[0]);
  });

  it("rejects a registered ID whose text was edited", () => {
    expect(() =>
      resolvePresentedStoryChoice({
        session: makeSession(),
        action: "Actually ring the bell.",
        choiceId: "choice.keep_watch",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryPresentationError>>({
        code: "story_choice_text_changed",
      }),
    );
  });

  it("creates distinct bounded direct choices for distinct inputs", () => {
    const session = makeSession();
    const first = resolvePresentedStoryChoice({
      session,
      action: "Hide the lamp beneath the western wall.",
    });
    const second = resolvePresentedStoryChoice({
      session,
      action: "Send Eurycleia to question the lookout.",
    });
    expect(first.source).toBe("direct");
    expect(first.actorEntityId).toBe("penelope");
    expect(first.choiceId).not.toBe(second.choiceId);
    expect(first.intent).not.toBe(second.intent);
  });

  it.each([
    ["Keep watch", "choice.keep_watch"],
    ["Keep the bell silent.", "choice.keep_watch"],
  ])(
    "routes a manually typed exact candidate %s to its registered branch",
    (action, expectedChoiceId) => {
      const choice = resolvePresentedStoryChoice({
        session: makeSession(),
        action,
      });
      expect(choice).toMatchObject({
        choiceId: expectedChoiceId,
        intent: action,
        source: "direct",
      });
    },
  );

  const openingChoices = [
    {
      choiceId: "choice.keep_quiet_watch",
      actionTypeId: "action.keep_quiet_watch",
      actorEntityId: "penelope",
      label: "Keep a quiet watch",
      intent:
        "Do not ring the bell. Put one covered lamp beneath the western wall and watch before the ship learns it is watched.",
      source: "suggested" as const,
    },
    {
      choiceId: "choice.ring_public_bell",
      actionTypeId: "action.ring_public_bell",
      actorEntityId: "penelope",
      label: "Ring the public bell",
      intent:
        "Call the harbor guard in force, accepting that the whole island will own the rumor.",
      source: "suggested" as const,
    },
  ];

  const continuationChoices = [
    {
      choiceId: "choice.move_decoy_lamp",
      actionTypeId: "action.move_decoy_lamp",
      actorEntityId: "penelope",
      label: "Move the decoy lamp",
      intent:
        "Move the covered lamp to the east gate and use the watcher's response to expose the coordination.",
      source: "suggested" as const,
    },
    {
      choiceId: "choice.sweep_harbor",
      actionTypeId: "action.sweep_harbor",
      actorEntityId: "telemachus",
      label: "Sweep the public harbor",
      intent:
        "Use the assembled guard to force the ship away and search the crowd for whoever answered it.",
      source: "suggested" as const,
    },
  ];

  it.each([
    [openingChoices[0]!.label, "choice.keep_quiet_watch"],
    [openingChoices[1]!.intent, "choice.ring_public_bell"],
  ])(
    "routes real registered candidate text %s without requiring its button ID",
    (action, expectedChoiceId) => {
      const choice = resolvePresentedStoryChoice({
        session: makeSession(openingChoices),
        action,
      });
      expect(choice).toMatchObject({
        choiceId: expectedChoiceId,
        intent: action,
        source: "direct",
      });
    },
  );

  it.each([
    [
      "Keep this watch secret and leave the bell silent.",
      openingChoices,
      "choice.keep_quiet_watch",
      "choice.ring_public_bell",
    ],
    [
      "Don't ring the bell; hide a lamp by the western wall and observe.",
      openingChoices,
      "choice.keep_quiet_watch",
      "choice.ring_public_bell",
    ],
    [
      "Sound the harbor bell and assemble every guard.",
      openingChoices,
      "choice.ring_public_bell",
      "choice.keep_quiet_watch",
    ],
    [
      "Raise the public alarm so the whole island knows.",
      openingChoices,
      "choice.ring_public_bell",
      "choice.keep_quiet_watch",
    ],
    [
      "Shift the decoy lamp to the east gate and see who answers.",
      continuationChoices,
      "choice.move_decoy_lamp",
      "choice.sweep_harbor",
    ],
    [
      "Carry the covered lamp east to expose the watcher.",
      continuationChoices,
      "choice.move_decoy_lamp",
      "choice.sweep_harbor",
    ],
    [
      "Sweep the harbor with the assembled guard and search the crowd.",
      continuationChoices,
      "choice.sweep_harbor",
      "choice.move_decoy_lamp",
    ],
    [
      "Drive the ship away, then clear the waterfront for its contact.",
      continuationChoices,
      "choice.sweep_harbor",
      "choice.move_decoy_lamp",
    ],
  ])(
    "routes bounded paraphrase %s without inverting it",
    (action, choices, expectedChoiceId, forbiddenChoiceId) => {
      const choice = resolvePresentedStoryChoice({
        session: makeSession(choices),
        action,
      });
      expect(choice.choiceId).toBe(expectedChoiceId);
      expect(choice.choiceId).not.toBe(forbiddenChoiceId);
      expect(choice).toMatchObject({ intent: action, source: "direct" });
    },
  );

  it("keeps contradictory intent out of either registered branch", () => {
    const choice = resolvePresentedStoryChoice({
      session: makeSession(openingChoices),
      action: "Do not ring the bell, but sound the public alarm now.",
    });
    expect(choice.choiceId).toMatch(/^choice\.direct\./u);
  });

  it("marks prose viewpoint as creator-reviewed rather than deterministic", () => {
    const viewpoint = storyStyleProfileView(makeSession().styleProfile).constraints.find(
      ({ id }) => id === "viewpoint",
    );
    expect(viewpoint?.checkMode).toBe("creator_review");
  });
});

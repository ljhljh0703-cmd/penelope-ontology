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

  it("rejects an unregistered creator direction instead of mapping it to the first route", () => {
    expect(() =>
      resolvePresentedStoryChoice({
        session: makeSession(),
        action: "Send Eurycleia to question the lookout.",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryPresentationError>>({
        code: "story_creator_direction_requires_interview",
      }),
    );
  });

  it.each(["Keep watch", "Keep the bell silent."])(
    "requires an explicit A/B choice ID even when typed text matches %s",
    (action) => {
      expect(() =>
        resolvePresentedStoryChoice({
          session: makeSession(),
          action,
        }),
      ).toThrowError(
        expect.objectContaining<Partial<StoryPresentationError>>({
          code: "story_creator_direction_requires_interview",
        }),
      );
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
    openingChoices[0]!.label,
    openingChoices[1]!.intent,
  ])(
    "does not infer a prepared route from button text alone: %s",
    (action) => {
      expect(() =>
        resolvePresentedStoryChoice({
          session: makeSession(openingChoices),
          action,
        }),
      ).toThrowError(
        expect.objectContaining<Partial<StoryPresentationError>>({
          code: "story_creator_direction_requires_interview",
        }),
      );
    },
  );

  it.each([
    [
      "Keep this watch secret and leave the bell silent.",
      openingChoices,
    ],
    [
      "Don't ring the bell; hide a lamp by the western wall and observe.",
      openingChoices,
    ],
    [
      "Sound the harbor bell and assemble every guard.",
      openingChoices,
    ],
    [
      "Raise the public alarm so the whole island knows.",
      openingChoices,
    ],
    [
      "Shift the decoy lamp to the east gate and see who answers.",
      continuationChoices,
    ],
    [
      "Carry the covered lamp east to expose the watcher.",
      continuationChoices,
    ],
    [
      "Sweep the harbor with the assembled guard and search the crowd.",
      continuationChoices,
    ],
    [
      "Drive the ship away, then clear the waterfront for its contact.",
      continuationChoices,
    ],
  ])(
    "never infers A or B from a choice-less paraphrase: %s",
    (action, choices) => {
      expect(() =>
        resolvePresentedStoryChoice({
          session: makeSession(choices),
          action,
        }),
      ).toThrowError(
        expect.objectContaining<Partial<StoryPresentationError>>({
          code: "story_creator_direction_requires_interview",
        }),
      );
    },
  );

  it("keeps contradictory intent out of either registered branch", () => {
    expect(() =>
      resolvePresentedStoryChoice({
        session: makeSession(openingChoices),
        action: "Do not ring the bell, but sound the public alarm now.",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryPresentationError>>({
        code: "story_creator_direction_requires_interview",
      }),
    );
  });

  it("marks prose viewpoint as creator-reviewed rather than deterministic", () => {
    const viewpoint = storyStyleProfileView(makeSession().styleProfile).constraints.find(
      ({ id }) => id === "viewpoint",
    );
    expect(viewpoint?.checkMode).toBe("creator_review");
  });
});

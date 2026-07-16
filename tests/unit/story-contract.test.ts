import { describe, expect, it } from "vitest";
import { loadRedSailStoryScenario } from "@/src/adapters/filesystem/story-data";
import {
  StoryScenarioSchema,
  StorySceneDraftSchema,
} from "@/src/contracts/story";

describe("Red Sail story contract", () => {
  it("loads a formal three-scene story with two complete opening branches", async () => {
    const scenario = await loadRedSailStoryScenario();

    expect(scenario.opening.contract.sceneNumber).toBe(1);
    expect(scenario.opening.resolution.authority.kind).toBe("world_rule");
    expect(scenario.spine.maximumSceneCount).toBe(3);
    expect(scenario.opening.draft.suggestedContinuations).toHaveLength(2);

    for (const openingChoice of scenario.opening.draft.suggestedContinuations) {
      const sceneTwo = scenario.fixtureTurns.find(
        (turn) =>
          turn.sceneNumber === 2 &&
          turn.acceptedChoiceIds.includes(openingChoice.choiceId),
      );
      expect(sceneTwo, `${openingChoice.choiceId} needs a real Scene 2`).toBeDefined();
      const nextChoice = sceneTwo?.draft.suggestedContinuations[0];
      expect(nextChoice).toBeDefined();
      expect(
        scenario.fixtureTurns.some(
          (turn) =>
            turn.sceneNumber === 3 &&
            turn.priorChoiceIds[0] === openingChoice.choiceId &&
            turn.acceptedChoiceIds.includes(nextChoice!.choiceId) &&
            turn.draft.centralQuestionClosed &&
            turn.draft.suggestedContinuations.length === 0,
        ),
      ).toBe(true);
    }
  });

  it("carries an explicit creator-owned writing profile and ordered prose segments", async () => {
    const scenario = await loadRedSailStoryScenario();
    expect(scenario.styleProfile).toMatchObject({
      pointOfView: "limited_third",
      tense: "present",
    });
    expect(scenario.styleProfile.recurringImages).toContain("covered lamp");
    expect(scenario.styleProfile.forbiddenHabits.length).toBeGreaterThan(0);

    const drafts = [
      scenario.opening.draft,
      ...scenario.fixtureTurns.map(({ draft }) => draft),
    ];
    for (const draft of drafts) {
      expect(draft.segments.length).toBeGreaterThan(1);
      expect(draft.prose).toBe(
        draft.segments.map(({ text }) => text).join("\n\n"),
      );
      const words = draft.prose.trim().split(/\s+/u).length;
      expect(words).toBeGreaterThanOrEqual(110);
      expect(words).toBeLessThanOrEqual(220);
    }
  });

  it("rejects prose that diverges from its structured narration and dialogue", async () => {
    const scenario = await loadRedSailStoryScenario();
    expect(
      StorySceneDraftSchema.safeParse({
        ...scenario.opening.draft,
        prose: `${scenario.opening.draft.prose} A hidden extra sentence.`,
      }).success,
    ).toBe(false);
  });

  it("rejects a draft that promotes a reserved choice to performed or underway", async () => {
    const scenario = await loadRedSailStoryScenario();
    const quiet = scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!;
    const reserved = quiet.draft.actionBoundary.reservedNextActions[0]!;

    expect(
      StorySceneDraftSchema.safeParse({
        ...quiet.draft,
        actionBoundary: {
          ...quiet.draft.actionBoundary,
          performedAction: {
            ...reserved,
            actorEntityId: "telemachus",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      StorySceneDraftSchema.safeParse({
        ...quiet.draft,
        actionBoundary: {
          ...quiet.draft.actionBoundary,
          underwayActions: [reserved],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a visible continuation without an exact downstream branch", async () => {
    const scenario = await loadRedSailStoryScenario();
    const broken = structuredClone(scenario);
    broken.fixtureTurns[0]!.draft.suggestedContinuations[0] = {
      choiceId: "choice.unregistered_escape",
      actionTypeId: "action.direct_attempt",
      actorEntityId: "telemachus",
      label: "Leave the island",
      intent: "Abandon the bounded night and leave the island immediately.",
      source: "suggested",
    };

    expect(StoryScenarioSchema.safeParse(broken).success).toBe(false);
  });
});

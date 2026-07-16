import { describe, expect, it } from "vitest";
import { loadRedSailStoryScenario } from "@/src/adapters/filesystem/story-data";
import { ResolutionEnvelopeSchema } from "@/src/contracts/story";
import {
  advanceStorySpine,
  buildFailForwardResolution,
  validateStoryResolution,
} from "@/src/domain/story-resolution";

describe("story resolution adapters", () => {
  it("keeps choice, GM, dice, condition, item, and world rule as optional authorities over one envelope", async () => {
    const scenario = await loadRedSailStoryScenario();
    const quiet = scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!.resolution;

    for (const [kind, evidenceRef] of [
      ["user_choice", "choice.keep_quiet_watch"],
      ["gm_ruling", "ruling.keep_quiet_watch"],
      ["dice", "roll.01"],
      ["condition", "condition.hidden_watch"],
      ["item", "item.covered_lamp"],
      ["world_rule", "rule.world.red_sail_appears"],
    ] as const) {
      expect(
        ResolutionEnvelopeSchema.parse({
          ...quiet,
          authority: { kind, evidenceRefs: [evidenceRef] },
        }).authority.kind,
      ).toBe(kind);
    }
  });

  it("maps every registered scene outcome into the bounded story ontology", async () => {
    const scenario = await loadRedSailStoryScenario();
    const resolutions = [
      scenario.opening.resolution,
      ...scenario.fixtureTurns.map(({ resolution }) => resolution),
    ];

    for (const resolution of resolutions) {
      expect(validateStoryResolution({ scenario, resolution })).toEqual([]);
    }
  });

  it("fails an unsupported action forward with progress and a bounded pressure cost", async () => {
    const scenario = await loadRedSailStoryScenario();
    const safeResolution = scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!.resolution;
    const directChoice = {
      choiceId: "choice.direct.climb_ship",
      actionTypeId: "action.direct_attempt",
      actorEntityId: "penelope",
      label: "Climb aboard",
      intent: "Swim to the unknown ship and climb aboard before anyone can answer.",
      source: "direct" as const,
    };
    const resolution = buildFailForwardResolution({
      scenario,
      choice: directChoice,
      sceneNumber: 2,
      safeResolution,
    });

    expect(resolution.outcome).toBe("failure_with_progress");
    expect(resolution.choiceId).toBe(directChoice.choiceId);
    expect(resolution.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "clock_delta",
          effectId: "effect.fail_forward.pressure.2",
          delta: 1,
        }),
      ]),
    );
    expect(validateStoryResolution({ scenario, resolution })).toEqual([]);
  });

  it("opens and pays the selected branch obligations by Scene 3", async () => {
    const scenario = await loadRedSailStoryScenario();
    const quietTwo = scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!;
    const quietThree = scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene3",
    )!;
    const afterOpening = advanceStorySpine({
      spine: scenario.spine,
      contract: scenario.opening.contract,
    });
    const afterChoice = advanceStorySpine({
      spine: afterOpening,
      contract: quietTwo.contract,
    });
    const ending = advanceStorySpine({
      spine: afterChoice,
      contract: quietThree.contract,
    });

    expect(
      afterChoice.mustPayOffObligations
        .filter(({ status }) => status === "open")
        .map(({ obligationId }) => obligationId),
    ).toEqual([
      "obligation.quiet_watch_cost",
      "obligation.signal_not_proof",
    ]);
    expect(ending.currentBeat).toBe(3);
    expect(
      ending.openThreads.find(
        ({ threadId }) => threadId === "thread.red_sail_question",
      )?.status,
    ).toBe("closed");
    expect(
      ending.mustPayOffObligations.some(({ status }) => status === "open"),
    ).toBe(false);
  });
});

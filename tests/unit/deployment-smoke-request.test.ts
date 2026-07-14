import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type SmokeModule = {
  buildRegisteredFixtureRunRequest: (demo: unknown) => Record<string, unknown>;
};

const loadSmokeModule = async (): Promise<SmokeModule> =>
  await import(
    pathToFileURL(resolve(process.cwd(), "scripts/smoke-deployment.mjs")).href
  ) as SmokeModule;

describe("deployment smoke registered request", () => {
  it("copies the complete frozen rehearsal authority instead of reconstructing stale inputs", async () => {
    const { buildRegisteredFixtureRunRequest } = await loadSmokeModule();
    const participantIntents = [
      {
        intentId: "intent.penelope",
        participantId: "participant.one",
        controlledEntityIds: ["penelope"],
        intent: "Keep the household from confusing a signal with certainty.",
      },
      {
        intentId: "intent.telemachus",
        participantId: "participant.two",
        controlledEntityIds: ["telemachus"],
        intent: "Propose a red-sail harbor signal and organize a watch.",
      },
    ];
    const demo = {
      overlay: { id: "creator_canon", version: 0 },
      snapshot: { stateHash: "registered-s0" },
      selectedStyleProfileId: "stale-client-style-must-not-win",
      participantSlots: [],
      registeredRehearsal: {
        replayCaseId: "replay.red_sail_proposal",
        stageId: "stage.red_sail_proposal",
        draftFixtureId: "draft.red_sail_proposal",
        styleProfileId: "style.table_ready_mythic",
        taskType: "expand",
        brief: "Propose a red-sail signal, but do not treat it as canon before approval.",
        participantIntents,
        frozen: true,
      },
    };

    expect(buildRegisteredFixtureRunRequest(demo)).toEqual({
      modelMode: "fixture",
      draftFixtureId: demo.registeredRehearsal.draftFixtureId,
      overlay: demo.overlay,
      snapshot: demo.snapshot,
      styleProfileId: demo.registeredRehearsal.styleProfileId,
      taskType: demo.registeredRehearsal.taskType,
      brief: demo.registeredRehearsal.brief,
      participantIntents: demo.registeredRehearsal.participantIntents,
    });
  });

  it("refuses an incomplete or non-frozen rehearsal registration", async () => {
    const { buildRegisteredFixtureRunRequest } = await loadSmokeModule();

    expect(() =>
      buildRegisteredFixtureRunRequest({
        overlay: {},
        snapshot: {},
        registeredRehearsal: {
          draftFixtureId: "draft.red_sail_proposal",
          styleProfileId: "style.table_ready_mythic",
          taskType: "expand",
          brief: "Registered brief",
          participantIntents: [],
          frozen: false,
        },
      }),
    ).toThrow("missing the frozen registered rehearsal authority");
  });
});

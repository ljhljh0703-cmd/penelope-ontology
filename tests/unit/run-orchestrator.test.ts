import { describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import type { NarrativeModel } from "@/src/ports/narrative-model";

const unavailableLiveModel: NarrativeModel = {
  async generate() {
    return {
      outcome: "configuration_error" as const,
      error: {
        code: "live_disabled",
        message: "Live generation is disabled in this test.",
        retryable: false,
      },
      trace: {
        mode: "live" as const,
        outcome: "configuration_error" as const,
        requestedModel: "gpt-5.6",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      },
    };
  },
};

const participantIntents = [
  {
    intentId: "intent.penelope",
    participantId: "participant.one",
    controlledEntityIds: ["penelope"],
    intent: "Keep uncertain knowledge uncertain.",
  },
];

describe("run orchestrator", () => {
  it("produces a deterministic passing fixture run", async () => {
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: unavailableLiveModel,
    });
    const request = {
      modelMode: "fixture" as const,
      draftFixtureId: "draft.grounded_penelope",
      overlay,
      snapshot,
      styleProfileId: "style.table_ready_mythic",
      taskType: "scene" as const,
      brief: "Let Penelope name only what she can know.",
      participantIntents: [
        participantIntents[0],
        {
          intentId: "intent.eurycleia",
          participantId: "participant.two",
          controlledEntityIds: ["eurycleia"],
          intent: "Offer practical support without claiming secret knowledge.",
        },
      ],
    };

    const [first, second] = await Promise.all([run(request), run(request)]);
    expect(first.status).toBe("passed");
    expect(first.hardViolations).toEqual([]);
    expect(first.runId).toBe(second.runId);
    expect(first.modelOutcome.outcome).toBe("completed");
    expect(first.modelOutcome.trace.actualModel).toBeNull();
  });

  it("isolates a canon expansion until the creator decides", async () => {
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: unavailableLiveModel,
    });
    const result = await run({
      modelMode: "fixture",
      draftFixtureId: "draft.red_sail_proposal",
      overlay,
      snapshot,
      styleProfileId: "style.table_ready_mythic",
      taskType: "expand",
      brief: "Propose a red-sail signal without treating it as canon.",
      participantIntents: [
        participantIntents[0],
        {
          intentId: "intent.telemachus",
          participantId: "participant.two",
          controlledEntityIds: ["telemachus"],
          intent: "Propose a harbor watch signal.",
        },
      ],
    });

    expect(result.status).toBe("needs_creator_decision");
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].proposalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.graph.nodes.some(({ visualState }) => visualState === "ghost_proposal")).toBe(true);
  });

  it("previews an approved deterministic transition without mutating the current snapshot", async () => {
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v1.red-sail"),
      loadSnapshotFixture("snapshot.s0r"),
    ]);
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: unavailableLiveModel,
    });
    const result = await run({
      modelMode: "fixture",
      draftFixtureId: "draft.red_sail_step_1",
      overlay,
      snapshot,
      styleProfileId: "style.table_ready_mythic",
      taskType: "action",
      brief: "Raise the creator-approved harbor watch.",
      participantIntents: [
        participantIntents[0],
        {
          intentId: "intent.telemachus",
          participantId: "participant.two",
          controlledEntityIds: ["telemachus"],
          intent: "Raise the harbor watch.",
        },
      ],
    });

    expect(result.status).toBe("passed");
    expect(result.currentSnapshot.turnIndex).toBe(0);
    expect(result.proposedNextSnapshot.turnIndex).toBe(1);
    expect(result.proposedNextSnapshot.variables).toContainEqual({
      id: "harbor_watch",
      value: "watching",
    });
  });

  it("blocks an unauthorized action without changing the proposed snapshot", async () => {
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v1.red-sail"),
      loadSnapshotFixture("snapshot.s0r"),
    ]);
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: unavailableLiveModel,
    });
    const result = await run({
      modelMode: "fixture",
      draftFixtureId: "draft.red_sail_step_1",
      overlay,
      snapshot,
      styleProfileId: "style.table_ready_mythic",
      taskType: "action",
      brief: "Attempt the watch action with mismatched participant control.",
      participantIntents: [
        {
          intentId: "intent.telemachus",
          participantId: "participant.one",
          controlledEntityIds: ["penelope"],
          intent: "Keep Penelope cautious.",
        },
        {
          intentId: "intent.penelope",
          participantId: "participant.two",
          controlledEntityIds: ["eurycleia"],
          intent: "Let Eurycleia prepare the household.",
        },
      ],
    });

    expect(result.status).toBe("blocked");
    expect(result.hardViolations.map(({ code }) => code)).toContain("unauthorized_action");
    expect(result.currentSnapshot).toEqual(snapshot);
    expect(result.proposedNextSnapshot).toEqual(snapshot);
  });

  it("fails closed when live mode is unavailable", async () => {
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: unavailableLiveModel,
    });
    const result = await run({
      modelMode: "live",
      overlay,
      snapshot,
      styleProfileId: "style.table_ready_mythic",
      taskType: "scene",
      brief: "Generate a bounded scene.",
      participantIntents,
    });

    expect(result.status).toBe("error");
    expect(result.modelOutcome.outcome).toBe("configuration_error");
    expect(result.modelOutcome.trace.responseId).toBeNull();
  });
});

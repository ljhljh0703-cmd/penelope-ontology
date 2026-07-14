import { describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import { RunResultSchema } from "@/src/contracts/run";
import { sanitizeLiveEvidence } from "@/src/evidence/sanitize-live-evidence";

describe("live evidence sanitizer", () => {
  it("hashes response identity and excludes prose and the raw response ID", async () => {
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: fixtureNarrativeModel,
    });
    const fixtureResult = await run({
      modelMode: "fixture",
      draftFixtureId: "draft.grounded_penelope",
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
      taskType: "scene",
      brief: "Bounded fixture for sanitizer testing.",
      participantIntents: [
        {
          intentId: "intent.penelope",
          participantId: "participant.one",
          controlledEntityIds: ["penelope"],
          intent: "Stay cautious.",
        },
        {
          intentId: "intent.eurycleia",
          participantId: "participant.two",
          controlledEntityIds: ["eurycleia"],
          intent: "Offer practical support.",
        },
      ],
    });
    if (fixtureResult.modelOutcome.outcome !== "completed") throw new Error("Fixture failed.");
    const rawResponseId = "resp_private_test_identity";
    const liveResult = RunResultSchema.parse({
      ...fixtureResult,
      modelOutcome: {
        ...fixtureResult.modelOutcome,
        trace: {
          mode: "live",
          outcome: "completed",
          requestedModel: "gpt-5.6",
          actualModel: "gpt-5.6-test",
          responseId: rawResponseId,
          inputTokens: 100,
          outputTokens: 50,
        },
      },
    });

    const sanitized = sanitizeLiveEvidence(liveResult, "2026-07-15T00:00:00.000Z");
    const serialized = JSON.stringify(sanitized);
    expect(sanitized.responseIdSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain(rawResponseId);
    expect(serialized).not.toContain(fixtureResult.modelOutcome.draft.narrative);
    expect(sanitized.rawResponsePersistedPublicly).toBe(false);
  });

  it("rejects fixture-only evidence", async () => {
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: fixtureNarrativeModel,
    });
    const result = await run({
      modelMode: "fixture",
      draftFixtureId: "draft.grounded_penelope",
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
      taskType: "scene",
      brief: "Fixture only.",
      participantIntents: [
        {
          intentId: "intent.penelope",
          participantId: "participant.one",
          controlledEntityIds: ["penelope"],
          intent: "Stay cautious.",
        },
        {
          intentId: "intent.eurycleia",
          participantId: "participant.two",
          controlledEntityIds: ["eurycleia"],
          intent: "Offer practical support.",
        },
      ],
    });
    expect(() => sanitizeLiveEvidence(result, "2026-07-15T00:00:00.000Z")).toThrow(
      "Only a completed live run",
    );
  });
});

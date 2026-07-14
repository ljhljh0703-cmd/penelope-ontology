import { describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import { RunResultSchema } from "@/src/contracts/run";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
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
    const request = buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    });
    const modelOutcome = {
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
      } as const;
    const liveResult = RunResultSchema.parse({
      ...fixtureResult,
      runId: `run.${sha256Canonical({ request, modelOutcome }).slice(0, 20)}`,
      modelOutcome,
    });

    const sanitized = sanitizeLiveEvidence(liveResult, "2026-07-15T00:00:00.000Z", {
      worldPackId: worldPack.meta.id,
      worldPackSha256: sha256Canonical(worldPack),
      request,
    });
    const serialized = JSON.stringify(sanitized);
    expect(sanitized.responseIdSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain(rawResponseId);
    expect(serialized).not.toContain(fixtureResult.modelOutcome.draft.narrative);
    expect(sanitized.rawResponsePersistedPublicly).toBe(false);
    expect(sanitized.authority).toMatchObject({
      worldPackId: worldPack.meta.id,
      worldPackVersion: worldPack.meta.version,
      worldPackSha256: sha256Canonical(worldPack),
      styleProfileId: worldPack.defaultStyleProfileId,
      overlayHash: overlay.hash,
      requestSha256: sha256Canonical(request),
    });
    expect(() =>
      sanitizeLiveEvidence(liveResult, "2026-07-15T00:00:00.000Z", {
        worldPackId: worldPack.meta.id,
        worldPackSha256: sha256Canonical(worldPack),
        request: { ...request, brief: "A changed request must not inherit the old trace." },
      }),
    ).toThrow("request digest does not match");
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
    const request = buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    });
    expect(() =>
      sanitizeLiveEvidence(result, "2026-07-15T00:00:00.000Z", {
        worldPackId: worldPack.meta.id,
        worldPackSha256: sha256Canonical(worldPack),
        request,
      }),
    ).toThrow(
      "Only a completed live run",
    );
  });
});

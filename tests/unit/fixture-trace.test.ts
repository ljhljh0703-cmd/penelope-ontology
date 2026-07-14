import { describe, expect, it } from "vitest";
import {
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { ModelTraceSchema } from "@/src/contracts/run";

describe("fixture evidence boundary", () => {
  it("cannot masquerade as a live GPT-5.6 run", async () => {
    const [overlay, snapshot] = await Promise.all([
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const result = await fixtureNarrativeModel.generate(
      {
        overlay,
        snapshot,
        styleProfileId: "style.table_ready_mythic",
        taskType: "scene",
        brief: "Keep Penelope's uncertainty intact.",
        participantIntents: [
          {
            intentId: "intent.penelope",
            participantId: "participant.one",
            controlledEntityIds: ["penelope"],
            intent: "Do not turn uncertainty into narrator certainty.",
          },
        ],
        modelMode: "fixture",
        draftFixtureId: "draft.grounded_penelope",
      },
      {
        entityIds: ["penelope"],
        claimIds: ["claim.odyssey.penelope_uncertain_fate"],
        eventIds: [],
        ruleIds: [],
        characterViews: [
          {
            characterId: "penelope",
            entityIds: ["penelope"],
            knownClaimIds: [],
            uncertainClaimIds: ["claim.odyssey.penelope_uncertain_fate"],
            eventIds: [],
            ruleIds: [],
            context: "uncertain",
          },
        ],
        context: "fixture",
      },
    );

    expect(result.trace.mode).toBe("fixture");
    expect(result.trace.outcome).toBe("completed");
    expect(result.trace.actualModel).toBeNull();
    expect(result.trace.responseId).toBeNull();
  });

  it("rejects fixture traces carrying live response identity", () => {
    expect(
      ModelTraceSchema.safeParse({
        mode: "fixture",
        outcome: "completed",
        requestedModel: "fixture-v1",
        actualModel: "gpt-5.6-sol",
        responseId: "resp_not_allowed",
        inputTokens: 10,
        outputTokens: 10,
      }).success,
    ).toBe(false);
  });

  it("requires response identity for completed live traces", () => {
    expect(
      ModelTraceSchema.safeParse({
        mode: "live",
        outcome: "completed",
        requestedModel: "gpt-5.6",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      }).success,
    ).toBe(false);

    expect(
      ModelTraceSchema.safeParse({
        mode: "live",
        outcome: "configuration_error",
        requestedModel: "gpt-5.6",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      }).success,
    ).toBe(true);
  });
});

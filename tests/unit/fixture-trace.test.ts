import { describe, expect, it } from "vitest";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { ModelTraceSchema } from "@/src/contracts/run";

describe("fixture evidence boundary", () => {
  it("cannot masquerade as a live GPT-5.6 run", async () => {
    const result = await fixtureNarrativeModel.generate(
      {
        worldPackId: "trojan-returns-demo",
        canonVersion: "0.1.0",
        intent: "scene",
        prompt: "bounded scene",
        scene: {
          stateId: "state.ithaca.odyssey_book_1",
          locationId: "ithaca",
          focalCharacterIds: ["penelope"],
        },
      },
      {
        entityIds: ["penelope"],
        claimIds: ["claim.odyssey.penelope_uncertain_fate"],
        eventIds: [],
        ruleIds: ["rule.closed_world"],
        context: "fixture",
      },
    );

    expect(result.trace.mode).toBe("fixture");
    expect(result.trace.outcome).toBe("fixture");
    expect(result.trace.actualModel).toBeNull();
    expect(result.trace.responseId).toBeNull();
  });

  it("rejects fixture traces carrying live response identity", () => {
    expect(
      ModelTraceSchema.safeParse({
        mode: "fixture",
        outcome: "fixture",
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
        outcome: "no_response",
        requestedModel: "gpt-5.6",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      }).success,
    ).toBe(true);
  });
});

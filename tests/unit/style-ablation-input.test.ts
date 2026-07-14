import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { StyleAblationPlanSchema } from "@/src/evaluation/style-ablation-contracts";
import {
  buildStyleAblationSchedule,
  styleBundleOnlyDifference,
} from "@/src/evaluation/style-ablation-input";

const plan = StyleAblationPlanSchema.parse(
  JSON.parse(
    readFileSync(resolve("data/evals/style-ablation-plan.json"), "utf8"),
  ) as unknown,
);

describe("style ablation input builder", () => {
  it("creates exactly four preregistered calls in AB/BA order", () => {
    const schedule = buildStyleAblationSchedule(plan);
    expect(schedule).toHaveLength(4);
    expect(schedule.map(({ condition }) => condition)).toEqual([
      "default_instruction_control",
      "profiled",
      "profiled",
      "default_instruction_control",
    ]);
    expect(schedule.map(({ pairId }) => pairId)).toEqual([
      "pair.1",
      "pair.1",
      "pair.2",
      "pair.2",
    ]);
    expect(new Set(schedule.map(({ callId }) => callId)).size).toBe(4);
    expect(new Set(schedule.map(({ blindSampleId }) => blindSampleId)).size).toBe(4);
  });

  it("holds model, reasoning, instructions, schema, and common input constant", () => {
    const schedule = buildStyleAblationSchedule(plan);
    expect(new Set(schedule.map(({ model }) => model))).toEqual(new Set(["gpt-5.6"]));
    expect(new Set(schedule.map(({ reasoningEffort }) => reasoningEffort))).toEqual(
      new Set(["medium"]),
    );
    expect(new Set(schedule.map(({ maxOutputTokens }) => maxOutputTokens))).toEqual(
      new Set([4096]),
    );
    expect(new Set(schedule.map(({ instructions }) => instructions)).size).toBe(1);
    expect(new Set(schedule.map(({ outputSchemaSha256 }) => outputSchemaSha256)).size).toBe(1);
    expect(new Set(schedule.map(({ commonRequestSha256 }) => commonRequestSha256)).size).toBe(1);

    const commonInputs = schedule.map(({ modelInput }) => {
      const commonInput: Record<string, unknown> = { ...modelInput };
      delete commonInput.creatorStyleBundle;
      return commonInput;
    });
    expect(commonInputs).toEqual([commonInputs[0], commonInputs[0], commonInputs[0], commonInputs[0]]);
  });

  it("hashes the exact strict format and exact request body that will be sent", () => {
    const schedule = buildStyleAblationSchedule(plan);
    for (const scheduled of schedule) {
      expect(scheduled.outputSchemaSha256).toBe(
        sha256Canonical(scheduled.requestBody.text.format),
      );
      expect(scheduled.fullRequestSha256).toBe(sha256Canonical(scheduled.requestBody));
    }
  });

  it("changes only the creator style bundle between paired calls", () => {
    const schedule = buildStyleAblationSchedule(plan);
    expect(styleBundleOnlyDifference(schedule[0], schedule[1])).toBe(true);
    expect(styleBundleOnlyDifference(schedule[3], schedule[2])).toBe(true);
    expect(schedule[0].modelInput.creatorStyleBundle).toBeNull();
    expect(schedule[1].modelInput.creatorStyleBundle).toEqual(plan.styleBundle);

    const controlDigests = schedule
      .filter(({ condition }) => condition === "default_instruction_control")
      .map(({ fullRequestSha256 }) => fullRequestSha256);
    const profiledDigests = schedule
      .filter(({ condition }) => condition === "profiled")
      .map(({ fullRequestSha256 }) => fullRequestSha256);
    expect(new Set(controlDigests).size).toBe(1);
    expect(new Set(profiledDigests).size).toBe(1);
    expect(controlDigests[0]).not.toBe(profiledDigests[0]);
  });
});

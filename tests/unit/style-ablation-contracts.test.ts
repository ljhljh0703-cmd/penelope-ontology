import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  StyleAblationBlindRatingsSchema,
  StyleAblationNarrativeSchema,
  StyleAblationPlanSchema,
  StyleAblationStatusSchema,
} from "@/src/evaluation/style-ablation-contracts";

const rawPlan = JSON.parse(
  readFileSync(resolve("data/evals/style-ablation-plan.json"), "utf8"),
) as Record<string, unknown>;
const plan = StyleAblationPlanSchema.parse(rawPlan);
const world = JSON.parse(
  readFileSync(resolve("data/world-packs/trojan-returns/world.json"), "utf8"),
) as {
  styleProfiles: Array<{ id: string }>;
};
const productStyleProfile = world.styleProfiles.find(
  ({ id }) => id === "style.table_ready_mythic",
);

const validRatings = {
  schemaVersion: 1,
  evaluationId: plan.evaluationId,
  planSha256: "b".repeat(64),
  captureSha256: "a".repeat(64),
  blindPacketSha256: "c".repeat(64),
  evaluatorRole: "creator",
  ratings: [1, 2, 3, 4].map((index) => ({
    sampleId: `sample.${index}`,
    scores: plan.humanRubric.map(({ constraintId }) => ({
      constraintId,
      score: 1,
    })),
  })),
};

describe("style ablation contracts", () => {
  it("locks one AB pair, one BA pair, GPT-5.6, and a narrative-only schema", () => {
    expect(plan.targetModel).toBe("gpt-5.6");
    expect(plan.reasoningEffort).toBe("medium");
    expect(plan.maxOutputTokens).toBe(4096);
    expect(plan.pairs.map(({ order }) => order)).toEqual([
      ["default_instruction_control", "profiled"],
      ["profiled", "default_instruction_control"],
    ]);
    expect(plan.outputContract).toEqual({
      name: "style_ablation_narrative",
      strict: true,
      fields: ["narrative"],
    });
    expect(plan.styleBundle).toEqual(productStyleProfile);
    expect(plan.humanRubric.map(({ constraintId }) => constraintId)).toContain(
      "style.table_ready_mythic.cadence",
    );
  });

  it("rejects competitor fields and a non-AB/BA plan", () => {
    expect(
      StyleAblationPlanSchema.safeParse({
        ...rawPlan,
        competitorModel: "another-model",
      }).success,
    ).toBe(false);
    expect(
      StyleAblationPlanSchema.safeParse({
        ...rawPlan,
        pairs: [plan.pairs[0], plan.pairs[0]],
      }).success,
    ).toBe(false);
  });

  it("rejects self-reported style IDs from the model output", () => {
    expect(
      StyleAblationNarrativeSchema.safeParse({
        narrative: "A bounded scene.",
        appliedStyleConstraintIds: ["style.table_ready_mythic.tense"],
      }).success,
    ).toBe(false);
  });

  it("rejects condition labels and competitor fields in blind ratings", () => {
    expect(StyleAblationBlindRatingsSchema.safeParse(validRatings).success).toBe(true);
    const withConditionField = structuredClone(validRatings);
    Object.assign(withConditionField.ratings[0], { condition: "profiled" });
    expect(StyleAblationBlindRatingsSchema.safeParse(withConditionField).success).toBe(false);

    const withConditionValue = structuredClone(validRatings);
    withConditionValue.ratings[0].sampleId = "profiled";
    expect(StyleAblationBlindRatingsSchema.safeParse(withConditionValue).success).toBe(false);

    expect(
      StyleAblationBlindRatingsSchema.safeParse({
        ...validRatings,
        competitorScore: 2,
      }).success,
    ).toBe(false);
  });

  it("exposes exactly the five allowed public statuses", () => {
    expect(StyleAblationStatusSchema.options).toEqual([
      "incomplete",
      "objective_only",
      "supported_on_probe",
      "inconclusive",
      "not_supported_on_probe",
    ]);
  });
});

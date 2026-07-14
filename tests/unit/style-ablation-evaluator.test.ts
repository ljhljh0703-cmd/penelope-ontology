import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  StyleAblationBlindRatingsSchema,
  StyleAblationCaptureReceiptSchema,
  StyleAblationCaptureSchema,
  StyleAblationPlanSchema,
  StyleAblationPublicReportSchema,
  type StyleAblationBlindRatings,
  type StyleAblationCapture,
} from "@/src/evaluation/style-ablation-contracts";
import {
  assertStyleAblationCaptureReceiptBinding,
  buildStyleAblationBlindPacket,
  buildStyleAblationCaptureReceipt,
  countStyleAblationWords,
  evaluateStyleAblation,
} from "@/src/evaluation/style-ablation-evaluator";
import { buildStyleAblationSchedule } from "@/src/evaluation/style-ablation-input";

const plan = StyleAblationPlanSchema.parse(
  JSON.parse(
    readFileSync(resolve("data/evals/style-ablation-plan.json"), "utf8"),
  ) as unknown,
);

const words = (count: number): string => Array.from({ length: count }, () => "word").join(" ");

const makeCapture = ({
  narratives = ["Control one.", "Profile one.", "Profile two.", "Control two."],
  failedOrdinal,
  responsePrefix = "resp_private",
}: {
  narratives?: [string, string, string, string];
  failedOrdinal?: number;
  responsePrefix?: string;
} = {}): StyleAblationCapture => {
  const schedule = buildStyleAblationSchedule(plan);
  return StyleAblationCaptureSchema.parse({
    schemaVersion: 1,
    evaluationId: plan.evaluationId,
    planSha256: sha256Canonical(plan),
    capturedAt: "2026-07-15T00:00:00.000Z",
    requestedModel: plan.targetModel,
    reasoningEffort: plan.reasoningEffort,
    maxOutputTokens: plan.maxOutputTokens,
    expectedCallCount: 4,
    noAutomaticRetries: true,
    commonRequestSha256: schedule[0].commonRequestSha256,
    outputSchemaSha256: schedule[0].outputSchemaSha256,
    calls: schedule.map((scheduled, index) => {
      const base = {
        callId: scheduled.callId,
        pairId: scheduled.pairId,
        ordinal: scheduled.ordinal,
        condition: scheduled.condition,
        blindSampleId: scheduled.blindSampleId,
        commonRequestSha256: scheduled.commonRequestSha256,
        fullRequestSha256: scheduled.fullRequestSha256,
        outputSchemaSha256: scheduled.outputSchemaSha256,
      };
      return scheduled.ordinal === failedOrdinal
        ? {
            ...base,
            outcome: "api_error",
            actualModel: null,
            responseId: null,
            inputTokens: null,
            outputTokens: null,
            errorCode: "openai_api_error",
          }
        : {
            ...base,
            outcome: "completed",
            actualModel: "gpt-5.6-sol",
            responseId: `${responsePrefix}_${scheduled.ordinal}`,
            inputTokens: 100 + index,
            outputTokens: 20 + index,
            narrative: narratives[index],
          };
    }),
  });
};

const makeRatings = (
  capture: StyleAblationCapture,
  scoreByCallId: Record<string, 0 | 1 | 2> = {
    "call.1": 1,
    "call.2": 2,
    "call.3": 2,
    "call.4": 1,
  },
): StyleAblationBlindRatings =>
  StyleAblationBlindRatingsSchema.parse({
    schemaVersion: 1,
    evaluationId: plan.evaluationId,
    planSha256: sha256Canonical(plan),
    captureSha256: sha256Canonical(capture),
    blindPacketSha256: sha256Canonical(buildStyleAblationBlindPacket(plan, capture)),
    evaluatorRole: "creator",
    ratings: capture.calls.map(({ callId, blindSampleId }) => ({
      sampleId: blindSampleId,
      scores: plan.humanRubric.map(({ constraintId }) => ({
        constraintId,
        score: scoreByCallId[callId],
      })),
    })),
  });

const evaluate = (
  capture: StyleAblationCapture,
  ratings?: StyleAblationBlindRatings,
) =>
  evaluateStyleAblation({
    plan,
    capture,
    ratings,
    evaluatedAt: "2026-07-15T01:00:00.000Z",
  });

describe("style ablation evaluator", () => {
  it("reports objective_only until blind creator ratings are supplied", () => {
    const report = evaluate(makeCapture());
    expect(report.status).toBe("objective_only");
    expect(report.sourceDigests.planSha256).toBe(sha256Canonical(plan));
    expect(report.humanRubric.provided).toBe(false);
    expect(report.pairResults.every(({ humanScoreDelta }) => humanScoreDelta === null)).toBe(
      true,
    );
    expect(
      report.pairResults.every(({ humanCriterionDeltas }) =>
        humanCriterionDeltas.every(({ delta }) => delta === null),
      ),
    ).toBe(true);
  });

  it("supports the probe only when both pairs improve without objective regression", () => {
    const capture = makeCapture();
    const report = evaluate(capture, makeRatings(capture));
    expect(report.status).toBe("supported_on_probe");
    expect(report.pairResults.map(({ humanScoreDelta }) => humanScoreDelta)).toEqual([6, 6]);
    expect(report.pairResults.every(({ objectiveRegression }) => !objectiveRegression)).toBe(
      true,
    );
    expect(
      report.pairResults.every(({ humanCriterionRegression }) => !humanCriterionRegression),
    ).toBe(true);
  });

  it("does not hide a criterion regression behind a positive total score", () => {
    const capture = makeCapture();
    const ratings = makeRatings(capture);
    const profiledPairOne = ratings.ratings.find(
      ({ sampleId }) =>
        sampleId === capture.calls.find(({ callId }) => callId === "call.2")?.blindSampleId,
    );
    if (!profiledPairOne) throw new Error("Missing profiled pair-one rating.");
    const firstScore = profiledPairOne.scores[0];
    if (!firstScore) throw new Error("Missing profiled pair-one criterion score.");
    firstScore.score = 0;

    const report = evaluate(capture, ratings);
    expect(report.pairResults[0].humanScoreDelta).toBeGreaterThan(0);
    expect(report.pairResults[0].humanCriterionRegression).toBe(true);
    expect(report.status).toBe("not_supported_on_probe");
  });

  it("keeps incomplete, inconclusive, and not-supported outcomes distinct", () => {
    expect(evaluate(makeCapture({ failedOrdinal: 1 })).status).toBe("incomplete");

    const mixedCapture = makeCapture();
    const mixedRatings = makeRatings(mixedCapture, {
      "call.1": 1,
      "call.2": 2,
      "call.3": 1,
      "call.4": 2,
    });
    expect(evaluate(mixedCapture, mixedRatings).status).toBe("inconclusive");

    const lowerCapture = makeCapture();
    const lowerRatings = makeRatings(lowerCapture, {
      "call.1": 2,
      "call.2": 1,
      "call.3": 1,
      "call.4": 2,
    });
    expect(evaluate(lowerCapture, lowerRatings).status).toBe(
      "not_supported_on_probe",
    );
  });

  it("invalidates a pair when the API reports a different actual model", () => {
    const capture = makeCapture();
    const mismatched = StyleAblationCaptureSchema.parse({
      ...capture,
      calls: capture.calls.map((call, index) =>
        index === 1 && call.outcome === "completed"
          ? { ...call, actualModel: "gpt-5.6-unexpected" }
          : call,
      ),
    });
    const report = evaluate(mismatched);
    expect(report.status).toBe("incomplete");
    expect(report.integrity.actualModelConsistent).toBe(false);
    expect(report.pairResults[0].actualModelMatched).toBe(false);
  });

  it("rejects four consistent responses from outside the requested GPT-5.6 family", () => {
    const capture = makeCapture();
    const foreign = StyleAblationCaptureSchema.parse({
      ...capture,
      calls: capture.calls.map((call) =>
        call.outcome === "completed" ? { ...call, actualModel: "another-model" } : call,
      ),
    });
    const report = evaluate(foreign);
    expect(report.status).toBe("incomplete");
    expect(report.integrity.actualModelConsistent).toBe(false);
    expect(report.pairResults.every(({ actualModelMatched }) => !actualModelMatched)).toBe(
      true,
    );
  });

  it("treats 180 words as passing and 181 as an objective regression", () => {
    expect(countStyleAblationWords(words(180))).toBe(180);
    expect(countStyleAblationWords(words(181))).toBe(181);
    const capture = makeCapture({
      narratives: [words(180), words(181), words(180), words(180)],
    });
    const report = evaluate(capture, makeRatings(capture));
    expect(report.pairResults[0]).toMatchObject({
      defaultInstructionControlObjectivePasses: true,
      profiledObjectivePasses: false,
      objectiveRegression: true,
    });
    expect(report.status).toBe("not_supported_on_probe");
  });

  it("does not claim support when both sides fail the objective constraint", () => {
    const capture = makeCapture({
      narratives: [words(181), words(181), words(181), words(181)],
    });
    const report = evaluate(capture, makeRatings(capture));
    expect(report.pairResults.every(({ objectiveRegression }) => !objectiveRegression)).toBe(
      true,
    );
    expect(report.pairResults.every(({ profiledObjectivePasses }) => !profiledObjectivePasses)).toBe(
      true,
    );
    expect(report.status).toBe("not_supported_on_probe");
  });

  it("builds an ignored blind packet without condition or response identity", () => {
    const capture = makeCapture();
    const packet = buildStyleAblationBlindPacket(plan, capture);
    const serialized = JSON.stringify(packet);
    expect(packet.samples).toHaveLength(4);
    expect(serialized).not.toContain("default_instruction_control");
    expect(serialized).not.toContain("profiled");
    expect(serialized).not.toContain("resp_private");
    expect(serialized).not.toContain("gpt-5.6");
    expect(packet.planSha256).toBe(sha256Canonical(plan));
  });

  it("builds a sanitized write-once receipt bound to the exact plan and capture", () => {
    const capture = makeCapture();
    const receipt = buildStyleAblationCaptureReceipt(plan, capture);
    expect(receipt.captureStatus).toBe("complete");
    expect(receipt.sourceDigests).toEqual({
      planSha256: sha256Canonical(plan),
      captureSha256: sha256Canonical(capture),
    });
    expect(JSON.stringify(receipt)).not.toContain("Control one");
    expect(JSON.stringify(receipt)).not.toContain("resp_private");
    expect(
      StyleAblationCaptureReceiptSchema.parse(
        assertStyleAblationCaptureReceiptBinding({ plan, capture, receipt }),
      ),
    ).toEqual(receipt);
    expect(() =>
      assertStyleAblationCaptureReceiptBinding({
        plan,
        capture,
        receipt: { ...receipt, sourceDigests: { ...receipt.sourceDigests, captureSha256: "f".repeat(64) } },
      }),
    ).toThrow("does not match");
  });

  it("records an incomplete capture without exposing or replacing the failed slot", () => {
    const capture = makeCapture({ failedOrdinal: 2 });
    const receipt = buildStyleAblationCaptureReceipt(plan, capture);
    expect(receipt).toMatchObject({
      captureStatus: "incomplete",
      observedCallCount: 4,
      completedCallCount: 3,
      noAutomaticRetries: true,
      outcomes: [
        { ordinal: 1, outcome: "completed" },
        { ordinal: 2, outcome: "api_error" },
        { ordinal: 3, outcome: "completed" },
        { ordinal: 4, outcome: "completed" },
      ],
    });
    expect(JSON.stringify(receipt)).not.toContain("resp_private");
  });

  it("publishes only aggregate evidence, never prose, response IDs, keys, or paths", () => {
    const secret = "sk-proj-" + "x".repeat(32);
    const personalPath = ["", "Users", "sample-user", "private", "story.md"].join("/");
    const privateNarrative = `private prose ${secret} ${personalPath}`;
    const capture = makeCapture({
      narratives: [privateNarrative, privateNarrative, privateNarrative, privateNarrative],
      responsePrefix: "resp_raw_private_identity",
    });
    const report = evaluate(capture);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("private prose");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(personalPath);
    expect(serialized).not.toContain("resp_raw_private_identity");
    expect(report.contentBoundary).toEqual({
      rawNarrativePublic: false,
      rawResponseIdsPublic: false,
      apiKeysPublic: false,
      filesystemPathsPublic: false,
    });
    expect(
      StyleAblationPublicReportSchema.safeParse({
        ...report,
        rawCapturePath: personalPath,
      }).success,
    ).toBe(false);
  });

  it("fails closed when ratings are not bound to the exact capture", () => {
    const capture = makeCapture();
    const ratings = makeRatings(capture);
    expect(() =>
      evaluateStyleAblation({
        plan,
        capture,
        ratings: { ...ratings, captureSha256: "b".repeat(64) },
        evaluatedAt: "2026-07-15T01:00:00.000Z",
      }),
    ).toThrow("exact capture");
  });

  it("fails closed when ratings are not bound to the exact plan and blind packet", () => {
    const capture = makeCapture();
    const ratings = makeRatings(capture);
    expect(() =>
      evaluateStyleAblation({
        plan,
        capture,
        ratings: { ...ratings, planSha256: "d".repeat(64) },
        evaluatedAt: "2026-07-15T01:00:00.000Z",
      }),
    ).toThrow("exact capture");
    expect(() =>
      evaluateStyleAblation({
        plan,
        capture,
        ratings: { ...ratings, blindPacketSha256: "e".repeat(64) },
        evaluatedAt: "2026-07-15T01:00:00.000Z",
      }),
    ).toThrow("exact capture");
  });
});

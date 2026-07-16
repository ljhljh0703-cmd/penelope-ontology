import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  finalizeStyleAblation,
  writeStyleAblationBlindRatingsIdempotently,
} from "@/scripts/finalize-style-ablation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  StyleAblationBlindRatingsSchema,
  StyleAblationCaptureSchema,
  StyleAblationPlanSchema,
} from "@/src/evaluation/style-ablation-contracts";
import {
  buildStyleAblationBlindPacket,
  buildStyleAblationCaptureReceipt,
} from "@/src/evaluation/style-ablation-evaluator";
import {
  STYLE_ABLATION_EVIDENCE_LOCATORS,
  STYLE_ABLATION_LOCAL_PROOF_LOCATORS,
} from "@/src/evaluation/style-ablation-evidence-verifier";
import { buildStyleAblationSchedule } from "@/src/evaluation/style-ablation-input";

const roots: string[] = [];
const evaluatedAt = "2026-07-15T01:00:00.000Z";
const jsonSource = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const plan = StyleAblationPlanSchema.parse(
  JSON.parse(
    readFileSync(resolve("data/evals/style-ablation-plan.json"), "utf8"),
  ) as unknown,
);

const makeFixture = () => {
  const schedule = buildStyleAblationSchedule(plan);
  const capture = StyleAblationCaptureSchema.parse({
    schemaVersion: 1,
    evaluationId: plan.evaluationId,
    planSha256: sha256Canonical(plan),
    capturedAt: "2026-07-15T00:00:00.000Z",
    requestedModel: plan.targetModel,
    reasoningEffort: plan.reasoningEffort,
    maxOutputTokens: plan.maxOutputTokens,
    expectedCallCount: 4,
    noAutomaticRetries: true,
    commonRequestSha256: schedule[0]?.commonRequestSha256,
    outputSchemaSha256: schedule[0]?.outputSchemaSha256,
    calls: schedule.map((call, index) => ({
      callId: call.callId,
      pairId: call.pairId,
      ordinal: call.ordinal,
      condition: call.condition,
      blindSampleId: call.blindSampleId,
      commonRequestSha256: call.commonRequestSha256,
      fullRequestSha256: call.fullRequestSha256,
      outputSchemaSha256: call.outputSchemaSha256,
      outcome: "completed",
      actualModel: "gpt-5.6-test",
      responseId: `resp.private.${index + 1}`,
      inputTokens: 100 + index,
      outputTokens: 20 + index,
      narrative: `Private sample ${index + 1}.`,
    })),
  });
  const blindPacket = buildStyleAblationBlindPacket(plan, capture);
  const ratings = StyleAblationBlindRatingsSchema.parse({
    schemaVersion: 1,
    evaluationId: plan.evaluationId,
    planSha256: sha256Canonical(plan),
    captureSha256: sha256Canonical(capture),
    blindPacketSha256: sha256Canonical(blindPacket),
    evaluatorRole: "creator",
    ratings: capture.calls.map((call) => ({
      sampleId: call.blindSampleId,
      scores: plan.humanRubric.map(({ constraintId }) => ({
        constraintId,
        score: call.condition === "profiled" ? 2 : 1,
      })),
    })),
  });
  return {
    capture,
    blindPacket,
    ratings,
    receipt: buildStyleAblationCaptureReceipt(plan, capture),
  };
};

const writeJson = async (root: string, locator: string, value: unknown): Promise<void> => {
  const filePath = resolve(root, locator);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, jsonSource(value), "utf8");
};

const prepareFixture = async () => {
  const root = await mkdtemp(resolve(tmpdir(), "style-ablation-finalizer-"));
  roots.push(root);
  const fixture = makeFixture();
  await writeJson(root, STYLE_ABLATION_EVIDENCE_LOCATORS.plan, plan);
  await writeJson(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.capture, fixture.capture);
  await writeJson(
    root,
    STYLE_ABLATION_LOCAL_PROOF_LOCATORS.blindPacket,
    fixture.blindPacket,
  );
  await writeJson(root, STYLE_ABLATION_EVIDENCE_LOCATORS.receipt, fixture.receipt);
  const ratingsPath = resolve(root, "creator-ratings.json");
  await writeFile(ratingsPath, jsonSource(fixture.ratings), "utf8");
  return { root, ratingsPath, ...fixture };
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("style ablation finalizer", () => {
  it("persists validated ratings at the fixed ignored locator and can recover idempotently", async () => {
    const fixture = await prepareFixture();
    const report = await finalizeStyleAblation({
      root: fixture.root,
      ratingsPath: fixture.ratingsPath,
      evaluatedAt,
    });
    expect(report.status).toBe("supported_on_probe");

    const privateRatingsPath = resolve(
      fixture.root,
      STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings,
    );
    expect(await readFile(privateRatingsPath, "utf8")).toBe(
      jsonSource(fixture.ratings),
    );

    await rm(resolve(fixture.root, STYLE_ABLATION_EVIDENCE_LOCATORS.report));
    await expect(
      finalizeStyleAblation({
        root: fixture.root,
        ratingsPath: fixture.ratingsPath,
        evaluatedAt,
      }),
    ).resolves.toEqual(report);
  });

  it("does not persist ratings or a report when ratings are not bound to the capture", async () => {
    const fixture = await prepareFixture();
    const invalidRatings = {
      ...fixture.ratings,
      captureSha256: "f".repeat(64),
    };
    await writeFile(fixture.ratingsPath, jsonSource(invalidRatings), "utf8");

    await expect(
      finalizeStyleAblation({
        root: fixture.root,
        ratingsPath: fixture.ratingsPath,
        evaluatedAt,
      }),
    ).rejects.toThrow("exact capture");
    expect(
      existsSync(resolve(fixture.root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings)),
    ).toBe(false);
    expect(
      existsSync(resolve(fixture.root, STYLE_ABLATION_EVIDENCE_LOCATORS.report)),
    ).toBe(false);
  });

  it("fails before persistence when the stored blind packet was tampered", async () => {
    const fixture = await prepareFixture();
    const tamperedPacket = structuredClone(fixture.blindPacket);
    tamperedPacket.samples[0]!.narrative += " tampered";
    await writeJson(
      fixture.root,
      STYLE_ABLATION_LOCAL_PROOF_LOCATORS.blindPacket,
      tamperedPacket,
    );

    await expect(
      finalizeStyleAblation({
        root: fixture.root,
        ratingsPath: fixture.ratingsPath,
        evaluatedAt,
      }),
    ).rejects.toThrow("Stored blind packet");
    expect(
      existsSync(resolve(fixture.root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings)),
    ).toBe(false);
  });

  it("accepts only byte-identical existing private ratings", async () => {
    const fixture = await prepareFixture();
    const privateRatingsPath = resolve(
      fixture.root,
      STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings,
    );
    expect(
      await writeStyleAblationBlindRatingsIdempotently(
        privateRatingsPath,
        fixture.ratings,
      ),
    ).toBe("written");
    expect(
      await writeStyleAblationBlindRatingsIdempotently(
        privateRatingsPath,
        fixture.ratings,
      ),
    ).toBe("already_exact");

    const differentRatings = structuredClone(fixture.ratings);
    differentRatings.ratings[0]!.scores[0]!.score = 0;
    await expect(
      writeStyleAblationBlindRatingsIdempotently(
        privateRatingsPath,
        differentRatings,
      ),
    ).rejects.toThrow("non-identical");
  });
});

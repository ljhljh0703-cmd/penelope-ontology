import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  StyleAblationBlindRatingsSchema,
  StyleAblationCaptureSchema,
  StyleAblationPlanSchema,
} from "@/src/evaluation/style-ablation-contracts";
import {
  buildStyleAblationBlindPacket,
  buildStyleAblationCaptureReceipt,
  evaluateStyleAblation,
} from "@/src/evaluation/style-ablation-evaluator";
import {
  STYLE_ABLATION_EVIDENCE_LOCATORS,
  STYLE_ABLATION_LOCAL_PROOF_LOCATORS,
  isStyleAblationEvidenceBundleVerified,
  verifyStyleAblationEvidenceFiles,
  verifyStyleAblationLocalProof,
  type StyleAblationEvidenceSources,
} from "@/src/evaluation/style-ablation-evidence-verifier";
import { buildStyleAblationSchedule } from "@/src/evaluation/style-ablation-input";

const roots: string[] = [];
const now = Date.parse("2026-07-16T00:00:00.000Z");
const jsonSource = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const hash = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

type StyleAblationProofFixture = StyleAblationEvidenceSources & {
  captureSource: string;
  blindPacketSource: string;
  ratingsSource: string;
};

const rebuildManifest = (
  sources: Omit<StyleAblationEvidenceSources, "manifestSource" | "now">,
): string =>
  jsonSource({
    schemaVersion: 1,
    files: [
      [STYLE_ABLATION_EVIDENCE_LOCATORS.readiness, sources.readinessSource],
      [STYLE_ABLATION_EVIDENCE_LOCATORS.report, sources.reportSource],
      [STYLE_ABLATION_EVIDENCE_LOCATORS.receipt, sources.receiptSource],
    ].map(([path, source]) => ({
      path,
      sha256: hash(source),
      bytes: Buffer.byteLength(source),
    })),
  });

const makeSources = (): StyleAblationProofFixture => {
  const plan = StyleAblationPlanSchema.parse(
    JSON.parse(
      readFileSync(resolve("data/evals/style-ablation-plan.json"), "utf8"),
    ) as unknown,
  );
  const schedule = buildStyleAblationSchedule(plan);
  const capture = StyleAblationCaptureSchema.parse({
    schemaVersion: 1,
    evaluationId: plan.evaluationId,
    planSha256: sha256Canonical(plan),
    capturedAt: "2026-07-14T22:00:00.000Z",
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
      actualModel: "gpt-5.6-2026-07-15",
      responseId: `resp.synthetic.${index + 1}`,
      inputTokens: 100 + index,
      outputTokens: 20 + index,
      narrative: `A restrained synthetic sample ${index + 1}.`,
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
  const report = evaluateStyleAblation({
    plan,
    capture,
    ratings,
    evaluatedAt: "2026-07-14T23:00:00.000Z",
  });
  const receipt = buildStyleAblationCaptureReceipt(plan, capture);
  const readiness = {
    evidenceType: "style_ablation_readiness",
    status: "supported_on_probe",
    evaluationId: plan.evaluationId,
    requestedModel: plan.targetModel,
    maxOutputTokens: plan.maxOutputTokens,
    reportPath: STYLE_ABLATION_EVIDENCE_LOCATORS.report,
    planSha256: sha256Canonical(plan),
    planBindingVerified: true,
    receiptStatus: "complete",
    receiptPath: STYLE_ABLATION_EVIDENCE_LOCATORS.receipt,
    receiptBindingVerified: true,
    rawNarrativePublic: false,
  };
  const sources = {
    planSource: jsonSource(plan),
    readinessSource: jsonSource(readiness),
    reportSource: jsonSource(report),
    receiptSource: jsonSource(receipt),
  };
  return {
    ...sources,
    manifestSource: rebuildManifest(sources),
    captureSource: jsonSource(capture),
    blindPacketSource: jsonSource(blindPacket),
    ratingsSource: jsonSource(ratings),
    now,
  };
};

const writeBundle = (root: string, sources: StyleAblationProofFixture): void => {
  const byLocator = {
    [STYLE_ABLATION_EVIDENCE_LOCATORS.plan]: sources.planSource,
    [STYLE_ABLATION_EVIDENCE_LOCATORS.readiness]: sources.readinessSource,
    [STYLE_ABLATION_EVIDENCE_LOCATORS.report]: sources.reportSource,
    [STYLE_ABLATION_EVIDENCE_LOCATORS.receipt]: sources.receiptSource,
    [STYLE_ABLATION_EVIDENCE_LOCATORS.manifest]: sources.manifestSource,
    [STYLE_ABLATION_LOCAL_PROOF_LOCATORS.capture]: sources.captureSource,
    [STYLE_ABLATION_LOCAL_PROOF_LOCATORS.blindPacket]: sources.blindPacketSource,
    [STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings]: sources.ratingsSource,
  };
  for (const [locator, source] of Object.entries(byLocator)) {
    const filePath = resolve(root, locator);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, source, "utf8");
  }
};

const initializeProofRepository = (
  root: string,
  sources: StyleAblationProofFixture,
): void => {
  writeBundle(root, sources);
  writeFileSync(resolve(root, ".gitignore"), "artifacts/live/\n", "utf8");
  git(root, ["init"]);
  git(root, ["config", "user.name", "Style Evidence Test"]);
  git(root, ["config", "user.email", "style-evidence@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["add", ".gitignore", "data", "artifacts/evidence"]);
  git(root, ["commit", "-m", "tracked public evidence"]);
};

const git = (root: string, args: string[]): void => {
  execFileSync("git", args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("style ablation public evidence verifier", () => {
  it("binds the exact plan, report, receipt, readiness, and manifest bytes", () => {
    const sources = makeSources();
    expect(isStyleAblationEvidenceBundleVerified(sources)).toBe(true);

    const mismatchedReceipt = JSON.parse(sources.receiptSource) as {
      sourceDigests: { captureSha256: string };
    };
    mismatchedReceipt.sourceDigests.captureSha256 = "f".repeat(64);
    const receiptSource = jsonSource(mismatchedReceipt);
    expect(
      isStyleAblationEvidenceBundleVerified({
        ...sources,
        receiptSource,
        manifestSource: rebuildManifest({ ...sources, receiptSource }),
      }),
    ).toBe(false);
  });

  it("rejects the old readiness-only shape and forged supported semantics", () => {
    const sources = makeSources();
    const readinessSource = jsonSource({
      evidenceType: "style_ablation_readiness",
      status: "supported_on_probe",
      receiptBindingVerified: true,
    });
    expect(
      isStyleAblationEvidenceBundleVerified({
        ...sources,
        readinessSource,
        manifestSource: rebuildManifest({ ...sources, readinessSource }),
      }),
    ).toBe(false);

    const report = JSON.parse(sources.reportSource) as {
      integrity: { noRetryOrReplacement: boolean };
    };
    report.integrity.noRetryOrReplacement = false;
    const reportSource = jsonSource(report);
    expect(
      isStyleAblationEvidenceBundleVerified({
        ...sources,
        reportSource,
        manifestSource: rebuildManifest({ ...sources, reportSource }),
      }),
    ).toBe(false);
  });

  it("rejects aggregate human scores outside the preregistered rubric range", () => {
    const sources = makeSources();
    const report = JSON.parse(sources.reportSource) as {
      conditionResults: Array<{ humanScoreTotal: number }>;
      pairResults: Array<{
        defaultInstructionControlHumanScore: number;
        profiledHumanScore: number;
        humanScoreDelta: number;
      }>;
    };
    for (const pair of report.pairResults) {
      pair.defaultInstructionControlHumanScore = 100;
      pair.profiledHumanScore = 101;
      pair.humanScoreDelta = 1;
    }
    report.conditionResults[0]!.humanScoreTotal = 200;
    report.conditionResults[1]!.humanScoreTotal = 202;
    const reportSource = jsonSource(report);
    expect(
      isStyleAblationEvidenceBundleVerified({
        ...sources,
        reportSource,
        manifestSource: rebuildManifest({ ...sources, reportSource }),
      }),
    ).toBe(false);
  });

  it("requires byte-exact manifest entries and regular in-repository files", () => {
    const root = mkdtempSync(join(tmpdir(), "style-evidence-verifier-"));
    roots.push(root);
    const sources = makeSources();
    writeBundle(root, sources);
    expect(verifyStyleAblationEvidenceFiles(root, now)).toBe(true);

    writeFileSync(
      resolve(root, STYLE_ABLATION_EVIDENCE_LOCATORS.manifest),
      sources.manifestSource.replace(/"bytes": (\d+)/u, (_match, bytes: string) =>
        `"bytes": ${Number(bytes) + 1}`,
      ),
      "utf8",
    );
    expect(verifyStyleAblationEvidenceFiles(root, now)).toBe(false);

    writeFileSync(
      resolve(root, STYLE_ABLATION_EVIDENCE_LOCATORS.manifest),
      sources.manifestSource,
      "utf8",
    );
    const reportPath = resolve(root, STYLE_ABLATION_EVIDENCE_LOCATORS.report);
    rmSync(reportPath);
    const external = resolve(root, "external-report.json");
    writeFileSync(external, sources.reportSource, "utf8");
    symlinkSync(external, reportPath);
    expect(verifyStyleAblationEvidenceFiles(root, now)).toBe(false);
  });

  it("reconstructs the exact public report from ignored local source records", () => {
    const root = mkdtempSync(join(tmpdir(), "style-evidence-local-proof-"));
    roots.push(root);
    const sources = makeSources();
    initializeProofRepository(root, sources);

    expect(verifyStyleAblationLocalProof(root)).toBe(true);
  });

  it("fails when any fixed ignored source record is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "style-evidence-local-missing-"));
    roots.push(root);
    const sources = makeSources();
    initializeProofRepository(root, sources);

    const originals = {
      [STYLE_ABLATION_LOCAL_PROOF_LOCATORS.capture]: sources.captureSource,
      [STYLE_ABLATION_LOCAL_PROOF_LOCATORS.blindPacket]: sources.blindPacketSource,
      [STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings]: sources.ratingsSource,
    };
    for (const [locator, source] of Object.entries(originals)) {
      const filePath = resolve(root, locator);
      rmSync(filePath);
      expect(verifyStyleAblationLocalProof(root)).toBe(false);
      writeFileSync(filePath, source, "utf8");
    }
  });

  it("fails when capture, blind packet, or creator ratings are tampered", () => {
    const root = mkdtempSync(join(tmpdir(), "style-evidence-local-tampered-"));
    roots.push(root);
    const sources = makeSources();
    initializeProofRepository(root, sources);

    const capture = JSON.parse(sources.captureSource) as {
      calls: Array<{ narrative: string }>;
    };
    capture.calls[0]!.narrative += " tampered";
    writeFileSync(
      resolve(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.capture),
      jsonSource(capture),
      "utf8",
    );
    expect(verifyStyleAblationLocalProof(root)).toBe(false);
    writeFileSync(
      resolve(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.capture),
      sources.captureSource,
      "utf8",
    );

    const packet = JSON.parse(sources.blindPacketSource) as {
      samples: Array<{ narrative: string }>;
    };
    packet.samples[0]!.narrative += " tampered";
    writeFileSync(
      resolve(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.blindPacket),
      jsonSource(packet),
      "utf8",
    );
    expect(verifyStyleAblationLocalProof(root)).toBe(false);
    writeFileSync(
      resolve(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.blindPacket),
      sources.blindPacketSource,
      "utf8",
    );

    const ratings = JSON.parse(sources.ratingsSource) as {
      ratings: Array<{ scores: Array<{ score: number }> }>;
    };
    ratings.ratings[0]!.scores[0]!.score = 0;
    writeFileSync(
      resolve(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings),
      jsonSource(ratings),
      "utf8",
    );
    expect(verifyStyleAblationLocalProof(root)).toBe(false);
  });

  it("rejects a local proof record that is symlinked or force-tracked", () => {
    const root = mkdtempSync(join(tmpdir(), "style-evidence-local-boundary-"));
    roots.push(root);
    const sources = makeSources();
    initializeProofRepository(root, sources);

    const ratingsPath = resolve(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings);
    rmSync(ratingsPath);
    const external = resolve(root, "external-ratings.json");
    writeFileSync(external, sources.ratingsSource, "utf8");
    symlinkSync(external, ratingsPath);
    expect(verifyStyleAblationLocalProof(root)).toBe(false);

    rmSync(ratingsPath);
    writeFileSync(ratingsPath, sources.ratingsSource, "utf8");
    git(root, ["add", "-f", STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings]);
    git(root, ["commit", "-m", "force tracked private source"]);
    expect(verifyStyleAblationLocalProof(root)).toBe(false);
  });
});

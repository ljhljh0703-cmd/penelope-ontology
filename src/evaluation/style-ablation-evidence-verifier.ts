import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { HashSchema, IdentifierSchema } from "@/src/contracts/common";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  STYLE_ABLATION_EXPECTED_CALLS,
  StyleAblationBlindPacketSchema,
  StyleAblationBlindRatingsSchema,
  StyleAblationCaptureReceiptSchema,
  StyleAblationCaptureSchema,
  StyleAblationPlanSchema,
  StyleAblationPublicReportSchema,
  type StyleAblationPlan,
  type StyleAblationPublicReport,
} from "@/src/evaluation/style-ablation-contracts";
import {
  assertStyleAblationCaptureReceiptBinding,
  buildStyleAblationBlindPacket,
  evaluateStyleAblation,
} from "@/src/evaluation/style-ablation-evaluator";

export const STYLE_ABLATION_EVIDENCE_LOCATORS = {
  plan: "data/evals/style-ablation-plan.json",
  readiness: "artifacts/evidence/style-ablation-readiness.json",
  report: "artifacts/evidence/style-ablation.json",
  receipt: "artifacts/evidence/style-ablation-capture-receipt.json",
  manifest: "artifacts/evidence/manifest.json",
} as const;

export const STYLE_ABLATION_LOCAL_PROOF_LOCATORS = {
  capture: "artifacts/live/style-ablation/raw-capture.json",
  blindPacket: "artifacts/live/style-ablation/blind-packet.json",
  ratings: "artifacts/live/style-ablation/blind-ratings.json",
} as const;

const StyleAblationReadinessSchema = z
  .object({
    evidenceType: z.literal("style_ablation_readiness"),
    status: z.literal("supported_on_probe"),
    evaluationId: IdentifierSchema,
    requestedModel: z.literal("gpt-5.6"),
    maxOutputTokens: z.literal(4096),
    reportPath: z.literal(STYLE_ABLATION_EVIDENCE_LOCATORS.report),
    planSha256: HashSchema,
    planBindingVerified: z.literal(true),
    receiptStatus: z.literal("complete"),
    receiptPath: z.literal(STYLE_ABLATION_EVIDENCE_LOCATORS.receipt),
    receiptBindingVerified: z.literal(true),
    rawNarrativePublic: z.literal(false),
  })
  .strict();

const EvidenceManifestEntrySchema = z
  .object({
    path: z.string().min(1),
    sha256: HashSchema,
    bytes: z.number().int().positive(),
  })
  .strict();

const EvidenceManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    files: z.array(EvidenceManifestEntrySchema).min(1),
  })
  .strict();

const sha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const sameArray = <T>(left: ReadonlyArray<T>, right: ReadonlyArray<T>): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const isRequestedModelFamily = (actualModel: string, requestedModel: string): boolean =>
  actualModel === requestedModel || actualModel.startsWith(`${requestedModel}-`);

const manifestBinds = (
  manifestInput: unknown,
  sources: Readonly<Record<string, string>>,
): boolean => {
  const parsed = EvidenceManifestSchema.safeParse(manifestInput);
  if (!parsed.success) return false;
  const paths = parsed.data.files.map(({ path: locator }) => locator);
  if (new Set(paths).size !== paths.length) return false;
  return Object.entries(sources).every(([locator, source]) => {
    const matches = parsed.data.files.filter((entry) => entry.path === locator);
    return (
      matches.length === 1 &&
      matches[0]?.bytes === Buffer.byteLength(source) &&
      matches[0]?.sha256 === sha256(source)
    );
  });
};

const hasExactObjectiveSummaries = (
  plan: StyleAblationPlan,
  report: StyleAblationPublicReport,
): boolean => {
  const expected = plan.objectiveChecks.map(({ constraintId, kind }) => ({
    constraintId,
    kind,
  }));
  const profiled = report.conditionResults[1];
  if (
    report.conditionResults[0]?.condition !== "default_instruction_control" ||
    profiled?.condition !== "profiled"
  ) {
    return false;
  }
  const allControlPasses = report.pairResults.filter(
    ({ defaultInstructionControlObjectivePasses }) =>
      defaultInstructionControlObjectivePasses,
  ).length;
  const failedControlRows = 2 - allControlPasses;
  return report.conditionResults.every((condition) => {
    const identities = condition.objectiveChecks.map(({ constraintId, kind }) => ({
      constraintId,
      kind,
    }));
    return (
      condition.completedSamples === 2 &&
      condition.wordCounts.length === 2 &&
      sameArray(identities, expected) &&
      condition.objectiveChecks.every(
        ({ passCount, failCount }) => passCount + failCount === 2,
      ) &&
      (condition.condition !== "default_instruction_control" ||
        (condition.objectiveChecks.every(({ passCount }) => passCount >= allControlPasses) &&
          condition.objectiveChecks.reduce(
            (failures, { failCount }) => failures + failCount,
            0,
          ) >= failedControlRows)) &&
      plan.objectiveChecks.every((check, index) =>
        check.kind !== "max_words"
          ? true
          : condition.objectiveChecks[index]?.passCount ===
              condition.wordCounts.filter((count) => count <= check.maximum).length,
      )
    );
  }) && profiled.objectiveChecks.every(
    ({ passCount, failCount }) => passCount === 2 && failCount === 0,
  );
};

const hasExactHumanSummaries = (
  plan: StyleAblationPlan,
  report: StyleAblationPublicReport,
): boolean => {
  const constraintIds = plan.humanRubric.map(({ constraintId }) => constraintId);
  if (
    !report.humanRubric.provided ||
    !sameArray(report.humanRubric.constraintIds, constraintIds) ||
    report.sourceDigests.ratingsSha256 === null
  ) {
    return false;
  }
  const maximumPerSample = constraintIds.length * 2;
  const controlScores: number[] = [];
  const profiledScores: number[] = [];
  for (const pair of report.pairResults) {
    if (
      pair.defaultInstructionControlHumanScore === null ||
      pair.profiledHumanScore === null ||
      pair.humanScoreDelta === null ||
      pair.humanScoreDelta !==
        pair.profiledHumanScore - pair.defaultInstructionControlHumanScore ||
      pair.humanScoreDelta <= 0 ||
      pair.defaultInstructionControlHumanScore > maximumPerSample ||
      pair.profiledHumanScore > maximumPerSample ||
      pair.humanCriterionRegression ||
      !sameArray(
        pair.humanCriterionDeltas.map(({ constraintId }) => constraintId),
        constraintIds,
      ) ||
      pair.humanCriterionDeltas.some(({ delta }) => delta === null || delta < 0 || delta > 2) ||
      pair.humanCriterionDeltas.reduce(
        (sum, { delta }) => sum + (delta ?? 0),
        0,
      ) !== pair.humanScoreDelta
    ) {
      return false;
    }
    controlScores.push(pair.defaultInstructionControlHumanScore);
    profiledScores.push(pair.profiledHumanScore);
  }
  const expectedMaximum = 2 * constraintIds.length * 2;
  const control = report.conditionResults[0];
  const profiled = report.conditionResults[1];
  return (
    control?.humanScoreMaximum === expectedMaximum &&
    profiled?.humanScoreMaximum === expectedMaximum &&
    control.humanScoreTotal !== null &&
    profiled.humanScoreTotal !== null &&
    control.humanScoreTotal <= expectedMaximum &&
    profiled.humanScoreTotal <= expectedMaximum &&
    control.humanScoreTotal === controlScores.reduce((sum, score) => sum + score, 0) &&
    profiled.humanScoreTotal === profiledScores.reduce((sum, score) => sum + score, 0)
  );
};

const hasSupportedReportSemantics = (
  plan: StyleAblationPlan,
  report: StyleAblationPublicReport,
): boolean => {
  const expectedPairIds = plan.pairs.map(({ pairId }) => pairId);
  return (
    report.status === "supported_on_probe" &&
    report.integrity.expectedCalls === STYLE_ABLATION_EXPECTED_CALLS &&
    report.integrity.observedCalls === STYLE_ABLATION_EXPECTED_CALLS &&
    report.integrity.scheduleMatched &&
    report.integrity.sameCommonRequest &&
    report.integrity.sameOutputSchema &&
    report.integrity.styleBundleOnlyDifference &&
    report.integrity.actualModelConsistent &&
    report.integrity.noRetryOrReplacement &&
    report.integrity.allCallsCompleted &&
    sameArray(
      report.pairResults.map(({ pairId }) => pairId),
      expectedPairIds,
    ) &&
    report.pairResults.every(
      (pair) =>
        pair.completed &&
        pair.actualModelMatched &&
        !pair.objectiveRegression &&
        pair.profiledObjectivePasses,
    ) &&
    hasExactObjectiveSummaries(plan, report) &&
    hasExactHumanSummaries(plan, report)
  );
};

export type StyleAblationEvidenceSources = {
  planSource: string;
  readinessSource: string;
  reportSource: string;
  receiptSource: string;
  manifestSource: string;
  now?: number;
};

export const isStyleAblationEvidenceBundleVerified = ({
  planSource,
  readinessSource,
  reportSource,
  receiptSource,
  manifestSource,
  now = Date.now(),
}: StyleAblationEvidenceSources): boolean => {
  try {
    const plan = StyleAblationPlanSchema.parse(JSON.parse(planSource) as unknown);
    const readiness = StyleAblationReadinessSchema.parse(
      JSON.parse(readinessSource) as unknown,
    );
    const report = StyleAblationPublicReportSchema.parse(
      JSON.parse(reportSource) as unknown,
    );
    const receipt = StyleAblationCaptureReceiptSchema.parse(
      JSON.parse(receiptSource) as unknown,
    );
    const manifest = JSON.parse(manifestSource) as unknown;
    const planSha256 = sha256Canonical(plan);
    const capturedAt = Date.parse(receipt.capturedAt);
    const evaluatedAt = Date.parse(report.evaluatedAt);
    const exactModels =
      report.actualModels.length === 1 &&
      receipt.actualModels.length === 1 &&
      sameArray(report.actualModels, receipt.actualModels) &&
      isRequestedModelFamily(report.actualModels[0] ?? "", plan.targetModel);
    const exactOutcomes = receipt.outcomes.every(
      ({ ordinal, outcome }, index) => ordinal === index + 1 && outcome === "completed",
    );

    return (
      readiness.evaluationId === plan.evaluationId &&
      readiness.requestedModel === plan.targetModel &&
      readiness.maxOutputTokens === plan.maxOutputTokens &&
      readiness.planSha256 === planSha256 &&
      report.evaluationId === plan.evaluationId &&
      report.requestedModel === plan.targetModel &&
      report.reasoningEffort === plan.reasoningEffort &&
      report.maxOutputTokens === plan.maxOutputTokens &&
      report.sourceDigests.planSha256 === planSha256 &&
      receipt.evaluationId === plan.evaluationId &&
      receipt.requestedModel === plan.targetModel &&
      receipt.reasoningEffort === plan.reasoningEffort &&
      receipt.maxOutputTokens === plan.maxOutputTokens &&
      receipt.sourceDigests.planSha256 === planSha256 &&
      report.sourceDigests.captureSha256 === receipt.sourceDigests.captureSha256 &&
      receipt.expectedCallCount === STYLE_ABLATION_EXPECTED_CALLS &&
      receipt.observedCallCount === STYLE_ABLATION_EXPECTED_CALLS &&
      receipt.completedCallCount === STYLE_ABLATION_EXPECTED_CALLS &&
      receipt.captureStatus === "complete" &&
      receipt.noAutomaticRetries &&
      exactOutcomes &&
      exactModels &&
      Number.isFinite(capturedAt) &&
      Number.isFinite(evaluatedAt) &&
      capturedAt <= evaluatedAt &&
      evaluatedAt <= now &&
      hasSupportedReportSemantics(plan, report) &&
      manifestBinds(manifest, {
        [STYLE_ABLATION_EVIDENCE_LOCATORS.readiness]: readinessSource,
        [STYLE_ABLATION_EVIDENCE_LOCATORS.report]: reportSource,
        [STYLE_ABLATION_EVIDENCE_LOCATORS.receipt]: receiptSource,
      })
    );
  } catch {
    return false;
  }
};

const readRegularSource = (root: string, locator: string): string => {
  const realRoot = realpathSync(root);
  const filePath = path.resolve(root, locator);
  const stat = lstatSync(filePath);
  const relative = path.relative(realRoot, realpathSync(filePath)).split(path.sep).join("/");
  if (!stat.isFile() || stat.isSymbolicLink() || relative !== locator) {
    throw new Error("Style evidence locator is not a regular repository file.");
  }
  return readFileSync(filePath, "utf8");
};

export const verifyStyleAblationEvidenceFiles = (root: string, now = Date.now()): boolean => {
  try {
    return isStyleAblationEvidenceBundleVerified({
      planSource: readRegularSource(root, STYLE_ABLATION_EVIDENCE_LOCATORS.plan),
      readinessSource: readRegularSource(
        root,
        STYLE_ABLATION_EVIDENCE_LOCATORS.readiness,
      ),
      reportSource: readRegularSource(root, STYLE_ABLATION_EVIDENCE_LOCATORS.report),
      receiptSource: readRegularSource(root, STYLE_ABLATION_EVIDENCE_LOCATORS.receipt),
      manifestSource: readRegularSource(root, STYLE_ABLATION_EVIDENCE_LOCATORS.manifest),
      now,
    });
  } catch {
    return false;
  }
};

const gitSucceeds = (root: string, args: ReadonlyArray<string>): boolean => {
  try {
    execFileSync("git", args, {
      cwd: root,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
};

const repositoryRootMatches = (root: string): boolean => {
  try {
    const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return realpathSync(repositoryRoot) === realpathSync(root);
  } catch {
    return false;
  }
};

const isTrackedRegularSource = (root: string, locator: string): boolean => {
  try {
    readRegularSource(root, locator);
    return gitSucceeds(root, ["ls-files", "--error-unmatch", "--", locator]);
  } catch {
    return false;
  }
};

const isIgnoredUntrackedRegularSource = (root: string, locator: string): boolean => {
  try {
    readRegularSource(root, locator);
    return (
      gitSucceeds(root, ["check-ignore", "--quiet", "--", locator]) &&
      !gitSucceeds(root, ["ls-files", "--error-unmatch", "--", locator])
    );
  } catch {
    return false;
  }
};

/**
 * Reconstructs the public style-ablation report from its private, ignored source
 * records. This is deliberately separate from the public evidence verifier:
 * public artifacts remain reviewable, while a local submission gate can prove
 * that their aggregate claims were derived from the exact four-call capture and
 * creator ratings without publishing prose or response identifiers.
 */
export const verifyStyleAblationLocalProof = (root: string): boolean => {
  try {
    if (!repositoryRootMatches(root)) return false;

    const trackedLocators = [
      STYLE_ABLATION_EVIDENCE_LOCATORS.plan,
      STYLE_ABLATION_EVIDENCE_LOCATORS.receipt,
      STYLE_ABLATION_EVIDENCE_LOCATORS.report,
    ] as const;
    if (trackedLocators.some((locator) => !isTrackedRegularSource(root, locator))) {
      return false;
    }
    if (
      Object.values(STYLE_ABLATION_LOCAL_PROOF_LOCATORS).some(
        (locator) => !isIgnoredUntrackedRegularSource(root, locator),
      )
    ) {
      return false;
    }

    const plan = StyleAblationPlanSchema.parse(
      JSON.parse(readRegularSource(root, STYLE_ABLATION_EVIDENCE_LOCATORS.plan)) as unknown,
    );
    const capture = StyleAblationCaptureSchema.parse(
      JSON.parse(
        readRegularSource(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.capture),
      ) as unknown,
    );
    const storedBlindPacket = StyleAblationBlindPacketSchema.parse(
      JSON.parse(
        readRegularSource(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.blindPacket),
      ) as unknown,
    );
    const ratings = StyleAblationBlindRatingsSchema.parse(
      JSON.parse(
        readRegularSource(root, STYLE_ABLATION_LOCAL_PROOF_LOCATORS.ratings),
      ) as unknown,
    );
    const receipt = StyleAblationCaptureReceiptSchema.parse(
      JSON.parse(readRegularSource(root, STYLE_ABLATION_EVIDENCE_LOCATORS.receipt)) as unknown,
    );
    const publicReport = StyleAblationPublicReportSchema.parse(
      JSON.parse(readRegularSource(root, STYLE_ABLATION_EVIDENCE_LOCATORS.report)) as unknown,
    );

    assertStyleAblationCaptureReceiptBinding({ plan, capture, receipt });
    const expectedBlindPacket = buildStyleAblationBlindPacket(plan, capture);
    if (sha256Canonical(storedBlindPacket) !== sha256Canonical(expectedBlindPacket)) {
      return false;
    }

    const reconstructedReport = evaluateStyleAblation({
      plan,
      capture,
      ratings,
      evaluatedAt: publicReport.evaluatedAt,
    });
    return sha256Canonical(reconstructedReport) === sha256Canonical(publicReport);
  } catch {
    return false;
  }
};

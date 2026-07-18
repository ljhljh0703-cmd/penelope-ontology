import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertW5PrivateJsonTargetCompatible,
  assertW5PrivateTextTargetCompatible,
  parseW5PublicManifest,
  readW5PrivateJson,
  readW5PrivateJsonWithReceipt,
  writeW5PrivateJsonOnceOrMatch,
} from "@/scripts/w5/private-store";
import {
  W5CreatorDecisionPacketSchema,
  W5PrivateCaptureResultSchema,
  W5PrivateSessionPlanSchema,
  w5BlindPacketFileName,
  w5CaptureFileName,
  w5DecisionFileName,
  w5OperationalEvidenceRootFileName,
  w5PlanFileName,
} from "@/scripts/w5/session";
import {
  assertW5CriticalTreeClean,
  resolveW5RepositoryRoot,
} from "@/scripts/w5/repository";
import {
  assertW5PublicWriteCompatible,
  assertW5PublicTargetMatches,
  w5PublicCaptureFileNames,
  writeW5PublicJsonOnceOrMatch,
  writeW5PublicMarkdownOnceOrMatch,
} from "@/scripts/w5/public-store";
import { canonicalJson } from "@/src/domain/canonical-json";
import { assertW5PublicTextDoesNotQuoteCapturedProse } from "@/scripts/w5/public-text";
import { computeW5OperationalEvidenceRoot } from "@/scripts/w5/capture-binding";
import {
  buildW5PlanCommitment,
  buildW5ReviewBundle,
} from "@/scripts/w5/publication";

const argument = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`w5_argument_missing:${name}`);
  }
  return value;
};

const readDecisionInput = async (inputPath: string): Promise<unknown> => {
  const target = path.resolve(inputPath);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 2_000_000) {
    throw new Error("w5_creator_decision_input_unsafe");
  }
  return JSON.parse(await readFile(target, "utf8")) as unknown;
};

const averageScore = (ratings: ReadonlyArray<{ score: number }>): string =>
  (
    ratings.reduce((sum, { score }) => sum + score, 0) / ratings.length
  ).toFixed(2);

const main = async (): Promise<void> => {
  const sessionId = argument("--session");
  const decisionPath = argument("--decision");
  const repoRoot = await resolveW5RepositoryRoot(process.cwd());
  const plan = W5PrivateSessionPlanSchema.parse(
    await readW5PrivateJson({
      root: repoRoot,
      relativeName: w5PlanFileName(sessionId),
    }),
  );
  const capture = W5PrivateCaptureResultSchema.parse(
    await readW5PrivateJson({
      root: repoRoot,
      relativeName: w5CaptureFileName(sessionId),
    }),
  );
  assertW5CriticalTreeClean({
    repoRoot,
    expectedRevision: plan.sourceRevision,
  });
  const operationalEvidence = await computeW5OperationalEvidenceRoot({
    repoRoot,
    plan,
    capture,
  });
  const operationalEvidenceRecord = await readW5PrivateJsonWithReceipt({
    root: repoRoot,
    relativeName: w5OperationalEvidenceRootFileName(plan.sessionId),
  });
  const expectedOperationalEvidenceRecord = {
    ...operationalEvidence.payload,
    operationalEvidenceRootSha256:
      operationalEvidence.operationalEvidenceRootSha256,
  };
  if (
    canonicalJson(operationalEvidenceRecord.value) !==
    canonicalJson(expectedOperationalEvidenceRecord)
  ) {
    throw new Error("w5_operational_evidence_root_mismatch");
  }
  const publicCaptureFiles = w5PublicCaptureFileNames(
    plan.maskCommitmentSha256,
  );
  const reviewBundle = buildW5ReviewBundle({
    plan,
    capture,
    operationalEvidenceRootSha256:
      operationalEvidence.operationalEvidenceRootSha256,
  });
  await assertW5PrivateTextTargetCompatible({
    root: repoRoot,
    relativeName: w5BlindPacketFileName(plan.sessionId),
    text: reviewBundle.blindPacketMarkdown,
  });
  await assertW5PublicTargetMatches({
    repoRoot,
    fileName: publicCaptureFiles.planCommitment,
    source: canonicalJson(buildW5PlanCommitment(plan)),
  });
  await assertW5PublicTargetMatches({
    repoRoot,
    fileName: publicCaptureFiles.blindCommitments,
    source: canonicalJson(reviewBundle.blindCommitments),
  });
  await assertW5PublicTargetMatches({
    repoRoot,
    fileName: publicCaptureFiles.creatorRatingSheet,
    source: reviewBundle.creatorRatingSheetMarkdown,
  });
  const decision = W5CreatorDecisionPacketSchema.parse(
    await readDecisionInput(decisionPath),
  );
  if (decision.sessionId !== sessionId) {
    throw new Error("w5_creator_decision_session_mismatch");
  }
  if (decision.reviewBundleSha256 !== reviewBundle.reviewBundleSha256) {
    throw new Error("w5_creator_decision_review_bundle_mismatch");
  }
  if (decision.sheets.some(({ tensePreference }) => tensePreference !== null)) {
    throw new Error("w5_creator_decision_tense_must_be_pair_level");
  }
  const expectedLabels = capture.samples
    .map(({ blindLabel }) => blindLabel)
    .sort();
  const receivedLabels = decision.sheets
    .map(({ blindLabel }) => blindLabel)
    .sort();
  if (JSON.stringify(expectedLabels) !== JSON.stringify(receivedLabels)) {
    throw new Error("w5_creator_decision_labels_incomplete");
  }
  const tenseCallIds = new Set(["call.tense.present", "call.tense.past"]);
  const tenseLabels = new Set(
    capture.samples
      .filter(({ callId }) => tenseCallIds.has(callId))
      .map(({ blindLabel }) => blindLabel),
  );
  if (
    decision.preferredTenseSample !== "no_preference" &&
    !tenseLabels.has(decision.preferredTenseSample)
  ) {
    throw new Error("w5_creator_decision_tense_sample_invalid");
  }

  const fullManifest = parseW5PublicManifest(capture.fullManifest);
  const sheetByLabel = new Map(
    decision.sheets.map((sheet) => [sheet.blindLabel, sheet]),
  );
  const callById = new Map(plan.calls.map((call) => [call.callId, call]));
  const revealRows = [...capture.samples]
    .sort(({ blindLabel: left }, { blindLabel: right }) => left.localeCompare(right))
    .map((sample) => {
      const call = callById.get(sample.callId);
      const sheet = sheetByLabel.get(sample.blindLabel);
      if (!call || !sheet) throw new Error("w5_reveal_mapping_invalid");
      return {
        ...sample,
        call,
        sheet,
        average: averageScore(sheet.ratings),
      };
    });
  const preferredTense =
    decision.preferredTenseSample === "no_preference"
      ? "no_preference"
      : callById.get(
          capture.samples.find(
            ({ blindLabel }) => blindLabel === decision.preferredTenseSample,
          )?.callId ?? "",
        )?.tense ?? "unresolved";
  assertW5PublicTextDoesNotQuoteCapturedProse({
    publicTexts: [
      ...decision.sheets.flatMap(({ ratings }) =>
        ratings.map(({ publicRationale }) => publicRationale),
      ),
      ...(decision.correctionReceipt
        ? [
            decision.correctionReceipt.publicReasonSummary,
            decision.correctionReceipt.publicUnspecifiedLeverSummary,
          ]
        : []),
    ],
    capturedProse: capture.samples.map(({ finalProse }) => finalProse),
  });
  const creatorReview = [
    "# W5 Creator Review — Conditions Revealed",
    `Final quality decision (creator): **${decision.finalQualityDecision}**`,
    `Tense preference after reveal: **${preferredTense}**`,
    "Requested model for every live slot: `gpt-5.6-sol`. Actual served model identity and reasoning effort were not reported by the CLI, so no stronger claim is made.",
    "| Blind sample | Condition | Case | Mean score | Sample decision | Critic calls | Final JSON SHA-256 |",
    "|---|---|---|---:|---|---:|---|",
    ...revealRows.map(({ blindLabel, call, sheet, average, criticCallCount, finalOutputSha256 }) =>
      `| ${blindLabel} | ${call.harnessId} / ${call.tense} | ${call.caseId} | ${average} | ${sheet.creatorDecision} | ${criticCallCount} | \`${finalOutputSha256}\` |`,
    ),
    "## Per-criterion creator evidence",
    ...revealRows.map(({ blindLabel, sheet }) =>
      [
        `### ${blindLabel}`,
        "| Criterion | Score | Creator-approved public rationale |",
        "|---|---:|---|",
        ...sheet.ratings.map(
          ({ criterionId, score, publicRationale }) =>
            `| ${criterionId} | ${score} | ${publicRationale} |`,
        ),
      ].join("\n"),
    ),
    "## Structural no-render proof",
    "Unsupported command: renderer 0 · critic 0 · world gain 0 · time advanced · the next authorized action still reached the registered ending.",
    ...(decision.correctionReceipt
      ? [
          "## Correction receipt",
          `Public reason summary: ${decision.correctionReceipt.publicReasonSummary}`,
          `Public unspecified-lever summary: ${decision.correctionReceipt.publicUnspecifiedLeverSummary}`,
        ]
      : []),
    "Scores describe the blind samples. They do not automatically create a quality PASS; the creator decision above is the authority.",
  ].join("\n\n");
  const returnMarkdown = [
    "# RETURN-W5",
    `Status: ${decision.finalQualityDecision === "pass" ? "CREATOR_ACCEPTED" : "CREATOR_CORRECTION_REQUIRED"}`,
    `Source revision: \`${plan.sourceRevision}\``,
    `Mask commitment: \`${plan.maskCommitmentSha256}\``,
    `Creator decision: **${decision.finalQualityDecision}**`,
    `Tense preference: **${preferredTense}**`,
    "Six live English slots were captured without manual rewriting or cherry-picking. The impossible-input case used zero model calls and remained recoverable.",
    "The complete hash manifest was released only after the creator decision was stored write-once. Raw prompts, outputs, and prose remain outside the tracked release surface.",
    "Requested model: `gpt-5.6-sol`; actual model identity and reasoning effort: unreported.",
    ...(decision.correctionReceipt
      ? [
          `Correction reason: ${decision.correctionReceipt.publicReasonSummary}`,
          `Previously unspecified lever: ${decision.correctionReceipt.publicUnspecifiedLeverSummary}`,
        ]
      : []),
  ].join("\n\n");

  await assertW5PrivateJsonTargetCompatible({
    root: repoRoot,
    relativeName: w5DecisionFileName(sessionId),
    value: decision,
  });
  await assertW5PublicWriteCompatible({
    repoRoot,
    fileName: "W5-HASH-MANIFEST.json",
    source: canonicalJson(fullManifest),
  });
  await assertW5PublicWriteCompatible({
    repoRoot,
    fileName: "W5-CREATOR-REVIEW.md",
    source: creatorReview,
  });
  await assertW5PublicWriteCompatible({
    repoRoot,
    fileName: "RETURN-W5.md",
    source: returnMarkdown,
  });

  const decisionReceipt = await writeW5PrivateJsonOnceOrMatch({
    root: repoRoot,
    relativeName: w5DecisionFileName(sessionId),
    value: decision,
  });
  const manifestReceipt = await writeW5PublicJsonOnceOrMatch({
    repoRoot,
    fileName: "W5-HASH-MANIFEST.json",
    value: fullManifest,
  });
  const reviewReceipt = await writeW5PublicMarkdownOnceOrMatch({
    repoRoot,
    fileName: "W5-CREATOR-REVIEW.md",
    markdown: creatorReview,
  });
  const returnReceipt = await writeW5PublicMarkdownOnceOrMatch({
    repoRoot,
    fileName: "RETURN-W5.md",
    markdown: returnMarkdown,
  });
  process.stdout.write(
    `${JSON.stringify({
      status:
        decision.finalQualityDecision === "pass"
          ? "W5_CREATOR_ACCEPTED"
          : "W5_CREATOR_CORRECTION_REQUIRED",
      sessionId,
      decisionReceipt,
      manifestSha256: manifestReceipt.sha256,
      reviewSha256: reviewReceipt.sha256,
      returnSha256: returnReceipt.sha256,
      finalQualityDecision: decision.finalQualityDecision,
    })}\n`,
  );
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "w5_finalize_failed"}\n`,
  );
  process.exitCode = 1;
});

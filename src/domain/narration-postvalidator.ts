import type {
  ModelNarrationOutput,
  NarrationInputEnvelope,
  NarrationPipelineEnvelope,
  PenelopeEnglishStyleProfile,
  PenelopeScenePlan,
} from "@/src/contracts/world-narrator";
import { countEnglishSceneWords } from "@/src/contracts/world-narrator";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { splitNarrationSentences } from "@/src/domain/narration-sentences";
import type {
  NarrationPreflightResult,
  NarrationRuleFinding,
  NarrationValidationClassification,
} from "@/src/domain/narration-preflight";

export const NARRATION_POSTVALIDATOR_RULE_IDS = [
  "AC-DATA-02",
  "AC-LIC-04",
  "AC-PRIV-02",
  "AC-SEP-01",
  "AC-SEP-02",
  "AC-SEP-03",
  "AC-ACT-01",
  "AC-END-01",
  "AC-END-03",
  "AC-FID-01",
  "AC-VOICE-01",
  "AC-LEN-01",
] as const;

export const NARRATION_HUMAN_RULE_IDS = [
  "AC-SAMPLE-01",
  "AC-CORR-01",
  "AC-HUMAN-01",
  "AC-SEV-01",
  "AC-REF-02",
] as const;

export type NarrationPostvalidatorRuleId =
  (typeof NARRATION_POSTVALIDATOR_RULE_IDS)[number];

export type NarrationHumanRuleId = (typeof NARRATION_HUMAN_RULE_IDS)[number];

export type PrivateNarrationPattern = {
  id: string;
  patterns: ReadonlyArray<string>;
};

/** Private material is consumed only in memory and is never copied to results. */
export type PrivateNarrationValidationMaterial = {
  forbiddenKnowledge: ReadonlyArray<PrivateNarrationPattern>;
  forbiddenInferences: ReadonlyArray<PrivateNarrationPattern>;
};

export const NARRATION_EVIDENCE_KINDS = [
  "content_trace",
  "private_screening",
  "reserved_action",
  "license_realization",
  "public_fidelity",
] as const;

export type NarrationEvidenceKind =
  (typeof NARRATION_EVIDENCE_KINDS)[number];

export type NarrationEvidenceBinding<
  Kind extends NarrationEvidenceKind = NarrationEvidenceKind,
> = {
  receiptId: string;
  evidenceKind: Kind;
  subjectFingerprint: string;
  issuer: "deterministic_runtime" | "creator";
  issuerAuthorityId: string;
};

export type NarrationTrustedEvidenceReceipt = NarrationEvidenceBinding & {
  payloadFingerprint: string;
};

/**
 * Lane D owns this trust boundary. Lane B only verifies exact membership and
 * binding; callers must not construct it from untrusted model output.
 */
export type NarrationEvidenceAuthorityRegistry = {
  trustedReceipts: ReadonlyArray<NarrationTrustedEvidenceReceipt>;
  deterministicRuntimeAuthorityIds: ReadonlyArray<string>;
  creatorAuthorityIds: ReadonlyArray<string>;
};

export type PrivateNarrationScreeningEvidence = {
  binding: NarrationEvidenceBinding<"private_screening">;
  screenedIds: ReadonlyArray<string>;
  status: "clear" | "match" | "uncertain";
  basis: "deterministic_resolver" | "creator_review";
};

export type NarrationLicenseRealization = {
  binding: NarrationEvidenceBinding<"license_realization">;
  licenseId: string;
  realizedText: string;
  assessment: "within" | "outside" | "uncertain";
  assessmentBasis: "deterministic_rule" | "creator_review";
};

export type ReservedNarrationActionDescriptor = {
  actionId: string;
  text: string;
};

export type ReservedNarrationActionAssessment = {
  binding: NarrationEvidenceBinding<"reserved_action">;
  actionId: string;
  status: "not_realized" | "realized" | "uncertain";
  basis: "deterministic_rule" | "creator_review";
};

export type NarrationContentTraceEvidence = {
  binding: NarrationEvidenceBinding<"content_trace">;
  status: "complete" | "unsupported" | "uncertain";
  basis: "deterministic_receipt" | "creator_review";
};

export type NarrationFidelityEvidence = {
  binding: NarrationEvidenceBinding<"public_fidelity">;
  status: "complete" | "incomplete";
  basis: "deterministic_extractor" | "creator_review";
  extractorId: "WF-PUBLIC-01" | null;
  beforeFingerprint: string | null;
  afterFingerprint: string | null;
};

export type NarrationSemanticEvidence =
  | PrivateNarrationScreeningEvidence
  | NarrationLicenseRealization
  | ReservedNarrationActionAssessment
  | NarrationContentTraceEvidence
  | NarrationFidelityEvidence;

export const PUBLIC_FIDELITY_FIELDS = [
  "names",
  "numbers",
  "coreClaims",
  "polarity",
  "modality",
  "causalityDirections",
  "knowledgeScopes",
  "actorAuthority",
  "resolvedEventIds",
] as const;

export type PublicFidelityField = (typeof PUBLIC_FIDELITY_FIELDS)[number];

export type PublicFidelityRecord = Record<
  PublicFidelityField,
  ReadonlyArray<string>
>;

export type PublicFidelityRecordInput = Partial<PublicFidelityRecord>;

export type NarrationPostvalidationInput = {
  inputEnvelope: NarrationInputEnvelope;
  scenePlan: PenelopeScenePlan;
  modelOutput: ModelNarrationOutput;
  styleProfile: PenelopeEnglishStyleProfile;
  preflightResult: NarrationPreflightResult;
  evidenceAuthorityRegistry: NarrationEvidenceAuthorityRegistry;
  privateValidationMaterial: PrivateNarrationValidationMaterial;
  privateScreeningEvidence?: PrivateNarrationScreeningEvidence;
  reservedActionDescriptors: ReadonlyArray<ReservedNarrationActionDescriptor>;
  reservedActionAssessments?: ReadonlyArray<ReservedNarrationActionAssessment>;
  licenseRealizations: ReadonlyArray<NarrationLicenseRealization>;
  contentTraceEvidence?: NarrationContentTraceEvidence;
  fidelityEvidence?: NarrationFidelityEvidence;
  fidelityBefore: PublicFidelityRecord;
  fidelityAfter: PublicFidelityRecord;
  additionalFindings?: ReadonlyArray<NarrationRuleFinding>;
};

type NarrationPostvalidationResultBase = {
  findings: ReadonlyArray<NarrationRuleFinding>;
  renderAudit: NarrationPipelineEnvelope["renderAudit"];
  fidelityMismatches: ReadonlyArray<PublicFidelityField>;
  validationSubjectFingerprint: string;
  creatorReviewRequired: boolean;
  disposition: "accepted" | "creator_review" | "hard_fail";
  publishReady: boolean;
  stateTransitionAllowed: boolean;
};

export type NarrationPostvalidationResult =
  | (NarrationPostvalidationResultBase & {
      hardPass: true;
      envelope: NarrationPipelineEnvelope;
    })
  | (NarrationPostvalidationResultBase & {
      hardPass: false;
      envelope: null;
    });

const sortedUnique = (values: ReadonlyArray<string>): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );

export const extractPublicFidelityRecord = (
  input: PublicFidelityRecordInput,
): PublicFidelityRecord =>
  Object.fromEntries(
    PUBLIC_FIDELITY_FIELDS.map((field) => [
      field,
      sortedUnique(input[field] ?? []),
    ]),
  ) as unknown as PublicFidelityRecord;

export const comparePublicFidelityRecords = (
  before: PublicFidelityRecord,
  after: PublicFidelityRecord,
): PublicFidelityField[] =>
  PUBLIC_FIDELITY_FIELDS.filter(
    (field) =>
      JSON.stringify(sortedUnique(before[field])) !==
      JSON.stringify(sortedUnique(after[field])),
  );

export const fingerprintPublicFidelityRecord = (
  record: PublicFidelityRecord,
): string =>
  sha256Canonical({
    schemaVersion: "penelope.public-fidelity-record.v1",
    record: extractPublicFidelityRecord(record),
  });

export type NarrationValidationSubjectInput = Pick<
  NarrationPostvalidationInput,
  "inputEnvelope" | "scenePlan" | "modelOutput"
>;

export const buildNarrationValidationSubjectFingerprint = ({
  inputEnvelope,
  scenePlan,
  modelOutput,
}: NarrationValidationSubjectInput): string =>
  sha256Canonical({
    schemaVersion: "penelope.narration-validation-subject.v1",
    inputEnvelope,
    scenePlan,
    modelOutput,
  });

export const fingerprintNarrationEvidencePayload = (
  evidence: NarrationSemanticEvidence,
): string => {
  const { binding, ...payload } = evidence;
  return sha256Canonical({
    schemaVersion: "penelope.narration-evidence-payload.v1",
    evidenceKind: binding.evidenceKind,
    payload,
  });
};

const normalizeText = (text: string): string =>
  text
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9'\s-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const words = (text: string): string[] =>
  normalizeText(text).split(/\s+/u).filter(Boolean);

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const exactPhraseAppears = (text: string, phrase: string): boolean => {
  const normalizedPhrase = normalizeText(phrase);
  if (normalizedPhrase.length === 0) return false;
  return new RegExp(
    `(?:^|\\s)${escapeRegExp(normalizedPhrase)}(?:$|\\s)`,
    "u",
  ).test(normalizeText(text));
};

const containsVerbatimRun = (
  candidate: string,
  source: string,
  minimumWords = 8,
): boolean => {
  const candidateWords = words(candidate);
  const sourceWords = words(source);
  if (
    candidateWords.length < minimumWords ||
    sourceWords.length < minimumWords
  ) {
    return false;
  }
  const candidateText = candidateWords.join(" ");
  for (let index = 0; index <= sourceWords.length - minimumWords; index += 1) {
    if (
      candidateText.includes(sourceWords.slice(index, index + minimumWords).join(" "))
    ) {
      return true;
    }
  }
  return false;
};

const reorderedRestatementLikely = (candidate: string, source: string): boolean => {
  if (exactPhraseAppears(candidate, source)) return false;
  const candidateWords = new Set(words(candidate));
  const sourceWords = new Set(words(source));
  if (candidateWords.size < 6 || sourceWords.size < 6) return false;
  const intersection = [...candidateWords].filter((word) => sourceWords.has(word));
  const overlap = intersection.length / Math.min(candidateWords.size, sourceWords.size);
  return overlap >= 0.8 && !containsVerbatimRun(candidate, source);
};

const PROCESS_PATTERN =
  /\b(?:pipeline|structured output|json schema|system prompt|model output|preflight receipt|post-validator|validator finding|source authority|sentence plan|resolved event id)\b/iu;
const PIPELINE_FIELD_PATTERN =
  /\b(?:planReceipt|renderAudit|sentencePlanIds?|sourceFactIds?|sourceEventIds?|speechEventIds?|licensedRenderingDetailIds?|styleStateId|sceneMode|resolvedEvents)\b/u;
const RULE_CODE_PATTERN = /\b(?:AC|FC|WF)-[A-Z0-9-]{2,24}\b/u;
const AMBIGUOUS_PROCESS_PATTERN =
  /\b(?:authority|constraint|validation|grounding|schema|state change)\b/iu;
const READER_HANDOFF_PATTERN =
  /\b(?:you (?:must|can|should|may) (?:choose|decide|act)|choose (?:your|what)|decide what|what do you do|the scene (?:ends|stops)|we (?:end|stop) here|to be continued)\b/iu;
const ENDING_LABEL_PATTERN =
  /\b(?:true|good|bad|failure|success|secret|canonical) ending\b|\bending (?:type|kind|label)\b/iu;
const PRESENTATION_PATTERN =
  /(?:<\/?(?:span|strong|em)\b|\[(?:voice|color|font|bold|italic):|\bfont-(?:weight|style|family)\b|\btext-color\b)/iu;

const ALLOWED_ADDITIONAL_FINDING_IDS = new Set([
  "FC-01",
  "FC-02",
  "FC-03",
  "FC-04",
  "FC-05",
  "FC-06",
  "FC-07",
  "FC-08",
  "FC-09",
  "FC-10",
  "AC-END-02",
]);

const pushFinding = (
  findings: NarrationRuleFinding[],
  ruleId: string,
  count: number,
  classification: NarrationValidationClassification,
  severity: NarrationRuleFinding["severity"],
): void => {
  if (count <= 0) return;
  const existing = findings.find(
    (finding) =>
      finding.ruleId === ruleId &&
      finding.classification === classification &&
      finding.severity === severity,
  );
  if (existing) {
    existing.count += count;
    return;
  }
  findings.push({ ruleId, count, classification, severity });
};

const sameIds = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean => JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));

const allCameraSafeTexts = (input: NarrationInputEnvelope): string[] => [
  ...input.modelFacing.presentActors.map(({ renderDescriptor }) => renderDescriptor),
  ...input.modelFacing.visibleFacts.map(({ renderText }) => renderText),
  ...input.modelFacing.resolvedEvents.map(({ observableText }) => observableText),
  ...input.modelFacing.authorizedAnchors.map(({ renderDescriptor }) =>
    renderDescriptor,
  ),
  ...input.modelFacing.licensedRenderingDetails.map(({ contentBoundary }) =>
    contentBoundary,
  ),
];

const effectiveHardSentenceWords = (
  styleProfile: PenelopeEnglishStyleProfile,
  styleStateId: string,
): number => {
  const stateOverride = styleProfile.styleStates.find(
    ({ stateId }) => stateId === styleStateId,
  )?.leverOverrides.sentenceLengthDistribution;
  return (
    stateOverride ?? styleProfile.levers.sentenceLengthDistribution.value
  ).hardMaxWords;
};

const aggregateAuditFindings = (
  findings: ReadonlyArray<NarrationRuleFinding>,
): NarrationPipelineEnvelope["renderAudit"]["findings"] => {
  const aggregate = new Map<
    string,
    NarrationPipelineEnvelope["renderAudit"]["findings"][number]
  >();
  for (const finding of findings) {
    const severity =
      finding.severity === "hard_fail" ? "hard_fail" : "warning";
    const key = `${finding.ruleId}:${severity}`;
    const prior = aggregate.get(key);
    aggregate.set(key, {
      ruleCode: finding.ruleId,
      severity,
      count: Math.min(999, (prior?.count ?? 0) + finding.count),
    });
  }
  return [...aggregate.values()]
    .sort((left, right) => left.ruleCode.localeCompare(right.ruleCode))
    .slice(0, 64);
};

type NarrationEvidenceTrustStatus =
  | "missing"
  | "invalid"
  | "trusted_deterministic"
  | "trusted_creator";

const evidenceTrustStatus = ({
  evidence,
  expectedKind,
  subjectFingerprint,
  registry,
}: {
  evidence: NarrationSemanticEvidence | undefined;
  expectedKind: NarrationEvidenceKind;
  subjectFingerprint: string;
  registry: NarrationEvidenceAuthorityRegistry;
}): NarrationEvidenceTrustStatus => {
  if (evidence === undefined) return "missing";
  const { binding } = evidence;
  if (
    binding.receiptId.trim().length === 0 ||
    binding.evidenceKind !== expectedKind ||
    binding.subjectFingerprint !== subjectFingerprint
  ) {
    return "invalid";
  }
  const matchingReceipts = registry.trustedReceipts.filter(
    ({ receiptId }) => receiptId === binding.receiptId,
  );
  if (matchingReceipts.length !== 1) return "invalid";
  const trusted = matchingReceipts[0]!;
  const issuerRegistry =
    binding.issuer === "deterministic_runtime"
      ? registry.deterministicRuntimeAuthorityIds
      : registry.creatorAuthorityIds;
  if (
    trusted.evidenceKind !== binding.evidenceKind ||
    trusted.subjectFingerprint !== binding.subjectFingerprint ||
    trusted.issuer !== binding.issuer ||
    trusted.issuerAuthorityId !== binding.issuerAuthorityId ||
    !issuerRegistry.includes(binding.issuerAuthorityId) ||
    trusted.payloadFingerprint !== fingerprintNarrationEvidencePayload(evidence)
  ) {
    return "invalid";
  }
  return binding.issuer === "deterministic_runtime"
    ? "trusted_deterministic"
    : "trusted_creator";
};

export const validateNarrationPostGeneration = ({
  inputEnvelope,
  scenePlan,
  modelOutput,
  styleProfile,
  preflightResult,
  evidenceAuthorityRegistry,
  privateValidationMaterial,
  privateScreeningEvidence,
  reservedActionDescriptors,
  reservedActionAssessments = [],
  licenseRealizations,
  contentTraceEvidence,
  fidelityEvidence,
  fidelityBefore,
  fidelityAfter,
  additionalFindings = [],
}: NarrationPostvalidationInput): NarrationPostvalidationResult => {
  const validAdditionalFindings = additionalFindings.filter(
    (finding) =>
      ALLOWED_ADDITIONAL_FINDING_IDS.has(finding.ruleId) &&
      finding.classification === "heuristic" &&
      finding.severity === "warning" &&
      finding.count > 0,
  );
  const findings: NarrationRuleFinding[] = [...validAdditionalFindings];
  const validationSubjectFingerprint =
    buildNarrationValidationSubjectFingerprint({
      inputEnvelope,
      scenePlan,
      modelOutput,
    });
  pushFinding(
    findings,
    "AC-DATA-02",
    additionalFindings.length - validAdditionalFindings.length,
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-DATA-02",
    evidenceAuthorityRegistry.trustedReceipts.length -
      new Set(
        evidenceAuthorityRegistry.trustedReceipts.map(({ receiptId }) =>
          receiptId,
        ),
      ).size,
    "deterministic",
    "hard_fail",
  );
  const prose = modelOutput.readerProse.paragraphs
    .map(({ text }) => text)
    .join("\n\n");
  const planById = new Map(
    scenePlan.sentencePlans.map((plan) => [plan.sentencePlanId, plan]),
  );
  const receiptById = new Map(
    modelOutput.planReceipt.map((receipt) => [receipt.sentencePlanId, receipt]),
  );

  let receiptMismatchCount =
    (scenePlan.sentencePlans.length - planById.size) +
    (modelOutput.planReceipt.length - receiptById.size) +
    (modelOutput.readerProse.paragraphs.length -
      new Set(
        modelOutput.readerProse.paragraphs.map(({ paragraphId }) => paragraphId),
      ).size) +
    Math.abs(planById.size - receiptById.size) +
    modelOutput.planReceipt.filter((receipt) => {
      const plan = planById.get(receipt.sentencePlanId);
      return (
        plan === undefined ||
        plan.role !== receipt.role ||
        !sameIds(plan.sourceFactIds, receipt.sourceFactIds) ||
        !sameIds(plan.sourceEventIds, receipt.sourceEventIds) ||
        !sameIds(plan.speechEventIds, receipt.speechEventIds) ||
        !sameIds(
          plan.licensedRenderingDetailIds,
          receipt.licensedRenderingDetailIds,
        )
      );
    }).length;
  const paragraphPlanIds = modelOutput.readerProse.paragraphs.flatMap(
    ({ sentencePlanIds }) => sentencePlanIds,
  );
  receiptMismatchCount += paragraphPlanIds.filter(
    (sentencePlanId) => !receiptById.has(sentencePlanId),
  ).length;
  receiptMismatchCount += [...receiptById.keys()].filter(
    (sentencePlanId) =>
      paragraphPlanIds.filter((candidate) => candidate === sentencePlanId).length !== 1,
  ).length;
  receiptMismatchCount += modelOutput.readerProse.paragraphs.filter(
    ({ sentencePlanIds, text }) =>
      splitNarrationSentences(text).length !== sentencePlanIds.length,
  ).length;
  pushFinding(
    findings,
    "AC-DATA-02",
    receiptMismatchCount,
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-DATA-02",
    Number(!preflightResult.hardPass) +
      Number(preflightResult.outcome !== "render"),
    "deterministic",
    "hard_fail",
  );
  const contentTraceTrust = evidenceTrustStatus({
    evidence: contentTraceEvidence,
    expectedKind: "content_trace",
    subjectFingerprint: validationSubjectFingerprint,
    registry: evidenceAuthorityRegistry,
  });
  if (contentTraceTrust === "invalid") {
    pushFinding(findings, "AC-DATA-02", 1, "deterministic", "hard_fail");
  } else if (contentTraceTrust === "missing") {
    pushFinding(findings, "AC-DATA-02", 1, "creator_review", "creator_review");
  } else if (
    contentTraceEvidence?.basis === "deterministic_receipt" &&
    contentTraceTrust !== "trusted_deterministic"
  ) {
    pushFinding(findings, "AC-DATA-02", 1, "deterministic", "hard_fail");
  } else if (
    contentTraceTrust !== "trusted_deterministic" ||
    contentTraceEvidence?.basis !== "deterministic_receipt"
  ) {
    pushFinding(findings, "AC-DATA-02", 1, "creator_review", "creator_review");
  } else if (contentTraceEvidence.status === "unsupported") {
    pushFinding(
      findings,
      "AC-DATA-02",
      1,
      "deterministic",
      "hard_fail",
    );
  } else if (contentTraceEvidence.status === "uncertain") {
    pushFinding(findings, "AC-DATA-02", 1, "creator_review", "creator_review");
  }

  const usedLicenseIds = sortedUnique(
    modelOutput.planReceipt.flatMap(({ licensedRenderingDetailIds }) =>
      licensedRenderingDetailIds,
    ),
  );
  const realizationByLicense = new Map(
    licenseRealizations.map((realization) => [realization.licenseId, realization]),
  );
  pushFinding(
    findings,
    "AC-LIC-04",
    licenseRealizations.length - realizationByLicense.size,
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-LIC-04",
    [...realizationByLicense.keys()].filter(
      (licenseId) => !usedLicenseIds.includes(licenseId),
    ).length,
    "deterministic",
    "hard_fail",
  );
  for (const licenseId of usedLicenseIds) {
    const realization = realizationByLicense.get(licenseId);
    const realizationTrust = evidenceTrustStatus({
      evidence: realization,
      expectedKind: "license_realization",
      subjectFingerprint: validationSubjectFingerprint,
      registry: evidenceAuthorityRegistry,
    });
    if (realizationTrust === "invalid") {
      pushFinding(findings, "AC-LIC-04", 1, "deterministic", "hard_fail");
    } else if (realizationTrust === "missing") {
      pushFinding(findings, "AC-LIC-04", 1, "creator_review", "creator_review");
    } else if (
      realization?.assessmentBasis === "deterministic_rule" &&
      realizationTrust !== "trusted_deterministic"
    ) {
      pushFinding(findings, "AC-LIC-04", 1, "deterministic", "hard_fail");
    } else if (
      realizationTrust !== "trusted_deterministic" ||
      realization?.assessmentBasis !== "deterministic_rule"
    ) {
      pushFinding(findings, "AC-LIC-04", 1, "creator_review", "creator_review");
    } else if (
      realization.realizedText.trim().length === 0 ||
      !exactPhraseAppears(prose, realization.realizedText)
    ) {
      pushFinding(findings, "AC-LIC-04", 1, "deterministic", "hard_fail");
    } else if (realization.assessment === "outside") {
      pushFinding(
        findings,
        "AC-LIC-04",
        1,
        "deterministic",
        "hard_fail",
      );
    } else if (realization.assessment === "uncertain") {
      pushFinding(findings, "AC-LIC-04", 1, "creator_review", "creator_review");
    }
  }

  const expectedPrivateIds = new Set([
    ...inputEnvelope.privateValidation.forbiddenKnowledgeIds,
    ...inputEnvelope.privateValidation.forbiddenInferenceRuleIds,
  ]);
  const providedPrivateIds = new Set([
    ...privateValidationMaterial.forbiddenKnowledge.map(({ id }) => id),
    ...privateValidationMaterial.forbiddenInferences.map(({ id }) => id),
  ]);
  const extraPrivateMaterialCount = [...providedPrivateIds].filter(
    (id) => !expectedPrivateIds.has(id),
  ).length;
  pushFinding(
    findings,
    "AC-PRIV-02",
    extraPrivateMaterialCount,
    "deterministic",
    "hard_fail",
  );
  const missingPrivateMaterialCount = [...expectedPrivateIds].filter(
    (id) => !providedPrivateIds.has(id),
  ).length;
  pushFinding(
    findings,
    "AC-PRIV-02",
    missingPrivateMaterialCount,
    "creator_review",
    "creator_review",
  );
  let privateExactMatchCount = 0;
  let privateAmbiguousPatternCount = 0;
  for (const material of [
    ...privateValidationMaterial.forbiddenKnowledge,
    ...privateValidationMaterial.forbiddenInferences,
  ]) {
    for (const pattern of material.patterns) {
      if (words(pattern).length >= 3 && exactPhraseAppears(prose, pattern)) {
        privateExactMatchCount += 1;
      } else if (words(pattern).length < 3) {
        privateAmbiguousPatternCount += 1;
      }
    }
  }
  pushFinding(
    findings,
    "AC-PRIV-02",
    privateExactMatchCount,
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-PRIV-02",
    privateAmbiguousPatternCount,
    "creator_review",
    "creator_review",
  );
  const privateScreeningTrust = evidenceTrustStatus({
    evidence: privateScreeningEvidence,
    expectedKind: "private_screening",
    subjectFingerprint: validationSubjectFingerprint,
    registry: evidenceAuthorityRegistry,
  });
  const screenedIdsMatch = sameIds(
    privateScreeningEvidence?.screenedIds ?? [],
    [...expectedPrivateIds],
  );
  if (privateScreeningTrust === "invalid") {
    pushFinding(findings, "AC-PRIV-02", 1, "deterministic", "hard_fail");
  } else if (
    privateScreeningEvidence?.basis === "deterministic_resolver" &&
    privateScreeningTrust !== "trusted_deterministic"
  ) {
    pushFinding(findings, "AC-PRIV-02", 1, "deterministic", "hard_fail");
  } else if (
    privateScreeningTrust === "trusted_deterministic" &&
    privateScreeningEvidence?.basis === "deterministic_resolver" &&
    !screenedIdsMatch
  ) {
    pushFinding(findings, "AC-PRIV-02", 1, "deterministic", "hard_fail");
  } else if (expectedPrivateIds.size > 0 && privateExactMatchCount === 0) {
    if (privateScreeningTrust === "missing") {
      pushFinding(findings, "AC-PRIV-02", 1, "creator_review", "creator_review");
    } else if (
      privateScreeningTrust !== "trusted_deterministic" ||
      privateScreeningEvidence?.basis !== "deterministic_resolver"
    ) {
      pushFinding(findings, "AC-PRIV-02", 1, "creator_review", "creator_review");
    } else if (privateScreeningEvidence.status === "match") {
      pushFinding(findings, "AC-PRIV-02", 1, "deterministic", "hard_fail");
    } else if (privateScreeningEvidence.status === "uncertain") {
      pushFinding(findings, "AC-PRIV-02", 1, "creator_review", "creator_review");
    }
  } else if (privateScreeningEvidence !== undefined) {
    if (
      privateScreeningTrust !== "trusted_deterministic" ||
      privateScreeningEvidence.basis !== "deterministic_resolver"
    ) {
      pushFinding(findings, "AC-PRIV-02", 1, "creator_review", "creator_review");
    } else if (privateScreeningEvidence.status === "match") {
      pushFinding(findings, "AC-PRIV-02", 1, "deterministic", "hard_fail");
    } else if (privateScreeningEvidence.status === "uncertain") {
      pushFinding(findings, "AC-PRIV-02", 1, "creator_review", "creator_review");
    }
  }

  pushFinding(
    findings,
    "AC-SEP-01",
    Number(PROCESS_PATTERN.test(prose)) + Number(RULE_CODE_PATTERN.test(prose)),
    "deterministic",
    "hard_fail",
  );
  const knownPipelineIds = sortedUnique([
    inputEnvelope.modelFacing.languageProfileId,
    inputEnvelope.modelFacing.referenceReceiptId,
    inputEnvelope.modelFacing.styleStateId,
    ...inputEnvelope.modelFacing.visibleFacts.map(({ factId }) => factId),
    ...inputEnvelope.modelFacing.resolvedEvents.map(({ eventId }) => eventId),
    ...inputEnvelope.modelFacing.authorizedAnchors.map(({ anchorId }) => anchorId),
    ...inputEnvelope.modelFacing.licensedRenderingDetails.map(
      ({ licenseId }) => licenseId,
    ),
    ...inputEnvelope.modelFacing.reservedActionIds,
    scenePlan.scenePlanId,
    ...scenePlan.sentencePlans.map(({ sentencePlanId }) => sentencePlanId),
    ...modelOutput.readerProse.paragraphs.map(({ paragraphId }) => paragraphId),
  ]).filter((identifier) => /[_.:-]/u.test(identifier));
  pushFinding(
    findings,
    "AC-SEP-01",
    knownPipelineIds.filter((identifier) => prose.includes(identifier)).length +
      Number(/\b[a-f0-9]{32,64}\b/iu.test(prose)),
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-SEP-01",
    Number(AMBIGUOUS_PROCESS_PATTERN.test(prose)),
    "heuristic",
    "warning",
  );
  pushFinding(
    findings,
    "AC-SEP-02",
    Number(PIPELINE_FIELD_PATTERN.test(prose)),
    "deterministic",
    "hard_fail",
  );

  const sourceTexts = allCameraSafeTexts(inputEnvelope);
  pushFinding(
    findings,
    "AC-SEP-03",
    sourceTexts.filter((source) => containsVerbatimRun(prose, source)).length,
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-SEP-03",
    sourceTexts.filter((source) => reorderedRestatementLikely(prose, source)).length,
    "heuristic",
    "warning",
  );

  const reservedIds = new Set(inputEnvelope.modelFacing.reservedActionIds);
  const reservedReceiptCount = modelOutput.planReceipt.reduce(
    (count, receipt) =>
      count +
      [
        ...receipt.sourceFactIds,
        ...receipt.sourceEventIds,
        ...receipt.speechEventIds,
        ...receipt.licensedRenderingDetailIds,
      ].filter((id) => reservedIds.has(id)).length,
    0,
  );
  const reservedDescriptorById = new Map(
    reservedActionDescriptors.map((descriptor) => [descriptor.actionId, descriptor]),
  );
  const missingReservedDescriptors = [...reservedIds].filter(
    (id) => !reservedDescriptorById.has(id),
  ).length;
  const realizedReservedDescriptors = [...reservedDescriptorById.values()].filter(
    ({ actionId, text }) =>
      reservedIds.has(actionId) &&
      words(text).length >= 3 &&
      exactPhraseAppears(prose, text),
  ).length;
  pushFinding(
    findings,
    "AC-ACT-01",
    reservedReceiptCount + realizedReservedDescriptors,
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-ACT-01",
    missingReservedDescriptors,
    "creator_review",
    "creator_review",
  );
  const reservedAssessmentById = new Map(
    reservedActionAssessments.map((assessment) => [
      assessment.actionId,
      assessment,
    ]),
  );
  pushFinding(
    findings,
    "AC-ACT-01",
    reservedActionAssessments.length - reservedAssessmentById.size,
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-ACT-01",
    [...reservedAssessmentById.keys()].filter(
      (actionId) => !reservedIds.has(actionId),
    ).length,
    "deterministic",
    "hard_fail",
  );
  for (const actionId of reservedIds) {
    const assessment = reservedAssessmentById.get(actionId);
    const assessmentTrust = evidenceTrustStatus({
      evidence: assessment,
      expectedKind: "reserved_action",
      subjectFingerprint: validationSubjectFingerprint,
      registry: evidenceAuthorityRegistry,
    });
    if (assessmentTrust === "invalid") {
      pushFinding(findings, "AC-ACT-01", 1, "deterministic", "hard_fail");
    } else if (assessmentTrust === "missing") {
      pushFinding(findings, "AC-ACT-01", 1, "creator_review", "creator_review");
    } else if (
      assessment?.basis === "deterministic_rule" &&
      assessmentTrust !== "trusted_deterministic"
    ) {
      pushFinding(findings, "AC-ACT-01", 1, "deterministic", "hard_fail");
    } else if (
      assessmentTrust !== "trusted_deterministic" ||
      assessment?.basis !== "deterministic_rule"
    ) {
      pushFinding(findings, "AC-ACT-01", 1, "creator_review", "creator_review");
    } else if (assessment.status === "realized") {
      pushFinding(
        findings,
        "AC-ACT-01",
        1,
        "deterministic",
        "hard_fail",
      );
    } else if (assessment.status === "uncertain") {
      pushFinding(
        findings,
        "AC-ACT-01",
        1,
        "creator_review",
        "creator_review",
      );
    }
  }

  pushFinding(
    findings,
    "AC-END-01",
    Number(READER_HANDOFF_PATTERN.test(prose)),
    "deterministic",
    "hard_fail",
  );
  pushFinding(
    findings,
    "AC-END-03",
    scenePlan.sceneMode === "ending" && ENDING_LABEL_PATTERN.test(prose) ? 1 : 0,
    "deterministic",
    "hard_fail",
  );

  const expectedBeforeFingerprint = fingerprintPublicFidelityRecord(fidelityBefore);
  const expectedAfterFingerprint = fingerprintPublicFidelityRecord(fidelityAfter);
  const fidelityTrust = evidenceTrustStatus({
    evidence: fidelityEvidence,
    expectedKind: "public_fidelity",
    subjectFingerprint: validationSubjectFingerprint,
    registry: evidenceAuthorityRegistry,
  });
  let fidelityMismatches: PublicFidelityField[] = [];
  if (fidelityTrust === "invalid") {
    pushFinding(findings, "AC-FID-01", 1, "deterministic", "hard_fail");
  } else if (fidelityTrust === "missing") {
    pushFinding(findings, "AC-FID-01", 1, "creator_review", "creator_review");
  } else if (
    fidelityEvidence?.basis === "deterministic_extractor" &&
    fidelityTrust !== "trusted_deterministic"
  ) {
    pushFinding(findings, "AC-FID-01", 1, "deterministic", "hard_fail");
  } else if (
    fidelityTrust !== "trusted_deterministic" ||
    fidelityEvidence?.basis !== "deterministic_extractor"
  ) {
    pushFinding(findings, "AC-FID-01", 1, "creator_review", "creator_review");
  } else if (fidelityEvidence.status === "incomplete") {
    pushFinding(findings, "AC-FID-01", 1, "creator_review", "creator_review");
  } else if (
    fidelityEvidence.extractorId !== "WF-PUBLIC-01" ||
    fidelityEvidence.beforeFingerprint !== expectedBeforeFingerprint ||
    fidelityEvidence.afterFingerprint !== expectedAfterFingerprint
  ) {
    pushFinding(findings, "AC-FID-01", 1, "deterministic", "hard_fail");
  } else {
    fidelityMismatches = comparePublicFidelityRecords(
      fidelityBefore,
      fidelityAfter,
    );
  }
  pushFinding(
    findings,
    "AC-FID-01",
    fidelityMismatches.length,
    "deterministic",
    "hard_fail",
  );

  pushFinding(
    findings,
    "AC-VOICE-01",
    Number(PRESENTATION_PATTERN.test(prose)),
    "deterministic",
    "hard_fail",
  );

  const hardMaxWords = effectiveHardSentenceWords(
    styleProfile,
    inputEnvelope.modelFacing.styleStateId,
  );
  const longSentenceCount = modelOutput.readerProse.paragraphs
    .flatMap(({ text }) => splitNarrationSentences(text))
    .filter((sentence) => countEnglishSceneWords(sentence) > hardMaxWords).length;
  pushFinding(
    findings,
    "AC-LEN-01",
    longSentenceCount,
    "deterministic",
    "hard_fail",
  );

  const preflightHardFindings = preflightResult.findings.filter(
    ({ severity }) => severity === "hard_fail",
  );
  findings.push(...preflightHardFindings);
  const hardPass = !findings.some(({ severity }) => severity === "hard_fail");
  const creatorReviewRequired = findings.some(
    ({ severity }) => severity === "creator_review",
  );
  const disposition = !hardPass
    ? "hard_fail"
    : creatorReviewRequired
      ? "creator_review"
      : "accepted";
  const publishReady = disposition === "accepted";
  const stateTransitionAllowed = disposition === "accepted";
  const auditFindings = aggregateAuditFindings(findings);
  const warningCount = auditFindings
    .filter(({ severity }) => severity === "warning")
    .reduce((count, finding) => count + finding.count, 0);
  const usedSourceIds = sortedUnique(
    modelOutput.planReceipt.flatMap((receipt) => [
      ...receipt.sourceFactIds,
      ...receipt.sourceEventIds,
      ...receipt.speechEventIds,
      ...receipt.licensedRenderingDetailIds,
    ]),
  ).filter(
    (id) =>
      !inputEnvelope.privateValidation.forbiddenKnowledgeIds.includes(id) &&
      !inputEnvelope.privateValidation.forbiddenInferenceRuleIds.includes(id) &&
      !inputEnvelope.privateValidation.creatorOnlyReviewNoteIds.includes(id),
  );
  const acceptedEnvelope: NarrationPipelineEnvelope = {
    modelOutput,
    renderAudit: {
      generatedBy: "deterministic_post_validator",
      usedSourceIds,
      findings: auditFindings,
      hardPass,
      warningCount,
    },
  };
  const renderAudit = acceptedEnvelope.renderAudit;

  const resultBase: NarrationPostvalidationResultBase = {
    findings: findings.sort((left, right) =>
      left.ruleId.localeCompare(right.ruleId),
    ),
    renderAudit,
    fidelityMismatches,
    validationSubjectFingerprint,
    creatorReviewRequired,
    disposition,
    publishReady,
    stateTransitionAllowed,
  };
  return hardPass
    ? { ...resultBase, hardPass: true, envelope: acceptedEnvelope }
    : { ...resultBase, hardPass: false, envelope: null };
};

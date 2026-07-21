import {
  ModelNarrationOutputSchema,
  NarrationRendererRequestSchema,
  type ModelNarrationOutput,
  type NarrationInputEnvelope,
  type NarrationRendererTrace,
  type PenelopeEnglishStyleProfile,
  type PenelopeNarrationPreflightReceipt,
  type PenelopeScenePlan,
} from "@/src/contracts/world-narrator";
import { lintNarration } from "@/src/domain/narration-lint";
import {
  buildNarrationValidationSubjectFingerprint,
  fingerprintNarrationEvidencePayload,
  fingerprintPublicFidelityRecord,
  extractPublicFidelityRecord,
  validateNarrationPostGeneration,
  type NarrationContentTraceEvidence,
  type NarrationEvidenceAuthorityRegistry,
  type NarrationEvidenceBinding,
  type NarrationEvidenceKind,
  type NarrationFidelityEvidence,
  type NarrationLicenseRealization,
  type NarrationPostvalidationResult,
  type NarrationSemanticEvidence,
  type NarrationTrustedEvidenceReceipt,
  type PrivateNarrationScreeningEvidence,
  type PrivateNarrationValidationMaterial,
  type PublicFidelityRecord,
  type ReservedNarrationActionAssessment,
  type ReservedNarrationActionDescriptor,
} from "@/src/domain/narration-postvalidator";
import {
  runNarrationPreflight,
  type CameraSafeProvenance,
  type NarrationAuthorityRegistry,
  type NarrationContinuityProvenance,
  type NarrationPreflightResult,
} from "@/src/domain/narration-preflight";
import type {
  NarrationCritic,
  NarrationRenderer,
} from "@/src/ports/world-narrator";

const RUNTIME_EVIDENCE_AUTHORITY_ID =
  "runtime.penelope.narration_evidence.v1";

export type ReservedActionSourceBinding = {
  actionId: string;
  sourceIds: ReadonlyArray<string>;
};

export type ResolvedNarrationPipelineArtifacts = {
  inputEnvelope: NarrationInputEnvelope;
  scenePlan: PenelopeScenePlan;
  preflightReceipt: PenelopeNarrationPreflightReceipt;
  styleProfile: PenelopeEnglishStyleProfile;
  authorityRegistry: NarrationAuthorityRegistry;
  cameraSafeProvenance: ReadonlyArray<CameraSafeProvenance>;
  continuityProvenance: NarrationContinuityProvenance;
  privateValidationMaterial: PrivateNarrationValidationMaterial;
  reservedActionDescriptors: ReadonlyArray<ReservedNarrationActionDescriptor>;
  reservedActionSourceBindings: ReadonlyArray<ReservedActionSourceBinding>;
  fidelityBefore: PublicFidelityRecord;
};

export type WorldNarrationPipelineResult = {
  disposition:
    | "accepted"
    | "creator_review"
    | "hard_fail"
    | "no_render"
    | "needs_authoring"
    | "renderer_rejected";
  preflight: NarrationPreflightResult;
  validation: NarrationPostvalidationResult | null;
  modelOutput: ModelNarrationOutput | null;
  trace: NarrationRendererTrace | null;
  rendererCallCount: 0 | 1;
  criticCallCount: 0 | 1;
  warningCount: number;
  publishReady: boolean;
  stateTransitionAllowed: boolean;
};

const normalize = (text: string): string =>
  text
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9'\s-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const exactPhraseAppears = (text: string, phrase: string): boolean => {
  const candidate = normalize(text);
  const expected = normalize(phrase);
  return expected.length > 0 && ` ${candidate} `.includes(` ${expected} `);
};

const proseText = (output: ModelNarrationOutput): string =>
  output.readerProse.paragraphs.map(({ text }) => text).join("\n\n");

const collapseWhitespace = (text: string): string =>
  text.replace(/\s+/gu, " ").trim();

const preparedSourceText = (
  artifacts: ResolvedNarrationPipelineArtifacts,
): { sources: Map<string, string>; hasConflictingBindings: boolean } => {
  const sources = new Map<string, string>();
  let hasConflictingBindings = false;
  const register = (sourceId: string, text: string): void => {
    const prepared = text.trim();
    const existing = sources.get(sourceId);
    if (existing === undefined) {
      sources.set(sourceId, prepared);
    } else if (existing !== prepared) {
      hasConflictingBindings = true;
    }
  };
  const request = artifacts.inputEnvelope.modelFacing;

  for (const fact of request.visibleFacts) {
    register(fact.factId, fact.renderText);
  }
  for (const actor of request.presentActors) {
    for (const factId of actor.sourceFactIds) {
      register(factId, actor.renderDescriptor);
    }
  }
  for (const anchor of request.authorizedAnchors) {
    for (const factId of anchor.sourceFactIds) {
      register(factId, anchor.renderDescriptor);
    }
  }
  for (const event of request.resolvedEvents) {
    register(event.eventId, event.observableText);
  }
  for (const detail of request.licensedRenderingDetails) {
    register(detail.licenseId, detail.contentBoundary);
  }

  return { sources, hasConflictingBindings };
};

/**
 * This is deliberately narrower than semantic fidelity. It proves only that
 * every published paragraph is the exact, ordered composition of prepared
 * model-facing source text selected by its sentence plans. Free prose must use
 * creator review until a separate semantic extractor can prove its fidelity.
 */
const preparedSourceCompositionVerified = ({
  artifacts,
  output,
}: {
  artifacts: ResolvedNarrationPipelineArtifacts;
  output: ModelNarrationOutput;
}): boolean => {
  if (
    structuralContentTraceStatus({
      scenePlan: artifacts.scenePlan,
      modelOutput: output,
    }) !== "complete"
  ) {
    return false;
  }

  const plannedIds = artifacts.scenePlan.sentencePlans.map(
    ({ sentencePlanId }) => sentencePlanId,
  );
  const renderedIds = output.readerProse.paragraphs.flatMap(
    ({ sentencePlanIds }) => sentencePlanIds,
  );
  if (JSON.stringify(renderedIds) !== JSON.stringify(plannedIds)) {
    return false;
  }

  const { sources, hasConflictingBindings } = preparedSourceText(artifacts);
  if (hasConflictingBindings) return false;
  const descriptorIds = artifacts.reservedActionDescriptors.map(
    ({ actionId }) => actionId,
  );
  const bindingIds = artifacts.reservedActionSourceBindings.map(
    ({ actionId }) => actionId,
  );
  if (
    new Set(bindingIds).size !== bindingIds.length ||
    JSON.stringify([...descriptorIds].sort()) !==
      JSON.stringify([...bindingIds].sort()) ||
    artifacts.reservedActionSourceBindings.some(
      ({ sourceIds }) =>
        new Set(sourceIds).size !== sourceIds.length ||
        sourceIds.some((sourceId) => !sources.has(sourceId)),
    )
  ) {
    return false;
  }
  const plans = new Map(
    artifacts.scenePlan.sentencePlans.map((plan) => [plan.sentencePlanId, plan]),
  );

  return output.readerProse.paragraphs.every((paragraph) => {
    const expectedParts: string[] = [];
    for (const sentencePlanId of paragraph.sentencePlanIds) {
      const plan = plans.get(sentencePlanId);
      if (!plan) return false;
      const sourceIds = [
        ...plan.sourceFactIds,
        ...plan.sourceEventIds,
        ...plan.speechEventIds,
        ...plan.licensedRenderingDetailIds,
      ];
      const uniqueSourceIds = [...new Set(sourceIds)];
      if (uniqueSourceIds.some((sourceId) => !sources.has(sourceId))) {
        return false;
      }
      expectedParts.push(
        [
          ...new Set(
            uniqueSourceIds.map((sourceId) => sources.get(sourceId)!),
          ),
        ].join(" "),
      );
    }
    return collapseWhitespace(paragraph.text) === collapseWhitespace(expectedParts.join(" "));
  });
};

const placeholderBinding = <Kind extends NarrationEvidenceKind>(
  evidenceKind: Kind,
  receiptId: string,
): NarrationEvidenceBinding<Kind> => ({
  receiptId,
  evidenceKind,
  subjectFingerprint: "pending",
  issuer: "deterministic_runtime",
  issuerAuthorityId: RUNTIME_EVIDENCE_AUTHORITY_ID,
});

const sourceIdsMatch = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean =>
  JSON.stringify([...new Set(left)].sort()) ===
  JSON.stringify([...new Set(right)].sort());

const structuralContentTraceStatus = ({
  scenePlan,
  modelOutput,
}: {
  scenePlan: PenelopeScenePlan;
  modelOutput: ModelNarrationOutput;
}): NarrationContentTraceEvidence["status"] => {
  const planById = new Map(
    scenePlan.sentencePlans.map((plan) => [plan.sentencePlanId, plan]),
  );
  const receiptsComplete =
    modelOutput.planReceipt.length === planById.size &&
    modelOutput.planReceipt.every((receipt) => {
      const plan = planById.get(receipt.sentencePlanId);
      return (
        plan !== undefined &&
        receipt.role === plan.role &&
        sourceIdsMatch(receipt.sourceFactIds, plan.sourceFactIds) &&
        sourceIdsMatch(receipt.sourceEventIds, plan.sourceEventIds) &&
        sourceIdsMatch(receipt.speechEventIds, plan.speechEventIds) &&
        sourceIdsMatch(
          receipt.licensedRenderingDetailIds,
          plan.licensedRenderingDetailIds,
        )
      );
    });
  const paragraphIds = modelOutput.readerProse.paragraphs.flatMap(
    ({ sentencePlanIds }) => sentencePlanIds,
  );
  const paragraphsComplete =
    paragraphIds.length === planById.size &&
    [...planById.keys()].every(
      (id) => paragraphIds.filter((candidate) => candidate === id).length === 1,
    );
  return receiptsComplete && paragraphsComplete ? "complete" : "unsupported";
};

const privateScreening = ({
  output,
  material,
  exactSourceComposition,
}: {
  output: ModelNarrationOutput;
  material: PrivateNarrationValidationMaterial;
  exactSourceComposition: boolean;
}): PrivateNarrationScreeningEvidence => {
  const entries = [
    ...material.forbiddenKnowledge,
    ...material.forbiddenInferences,
  ];
  const prose = proseText(output);
  const patterns = entries.flatMap(({ patterns: values }) => values);
  const ambiguous = patterns.some(
    (pattern) => normalize(pattern).split(/\s+/u).filter(Boolean).length < 3,
  );
  const matched = patterns.some((pattern) => exactPhraseAppears(prose, pattern));
  const status: PrivateNarrationScreeningEvidence["status"] = matched
    ? "match"
    : exactSourceComposition && !ambiguous
      ? "clear"
      : "uncertain";
  return {
    binding: placeholderBinding(
      "private_screening",
      "receipt.private-screening",
    ),
    screenedIds: entries.map(({ id }) => id).sort(),
    status,
    basis: "deterministic_resolver",
  };
};

const reservedAssessments = ({
  artifacts,
  output,
  descriptors,
  exactSourceComposition,
}: {
  artifacts: ResolvedNarrationPipelineArtifacts;
  output: ModelNarrationOutput;
  descriptors: ReadonlyArray<ReservedNarrationActionDescriptor>;
  exactSourceComposition: boolean;
}): ReservedNarrationActionAssessment[] => {
  const prose = proseText(output);
  const usedSourceIds = new Set(
    artifacts.scenePlan.sentencePlans.flatMap((plan) => [
      ...plan.sourceFactIds,
      ...plan.sourceEventIds,
      ...plan.speechEventIds,
      ...plan.licensedRenderingDetailIds,
    ]),
  );
  const bindingByActionId = new Map(
    artifacts.reservedActionSourceBindings.map((binding) => [
      binding.actionId,
      binding,
    ]),
  );
  return descriptors.map(({ actionId, text }, index) => ({
    binding: placeholderBinding(
      "reserved_action",
      `receipt.reserved-action.${index + 1}`,
    ),
    actionId,
    status:
      bindingByActionId
        .get(actionId)
        ?.sourceIds.some((sourceId) => usedSourceIds.has(sourceId))
        ? "realized"
        : normalize(text).split(/\s+/u).filter(Boolean).length < 3
        ? "uncertain"
        : exactPhraseAppears(prose, text)
          ? "realized"
          : exactSourceComposition
            ? "not_realized"
            : "uncertain",
    basis: "deterministic_rule",
  }));
};

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const licenseRealizations = ({
  artifacts,
  output,
}: {
  artifacts: ResolvedNarrationPipelineArtifacts;
  output: ModelNarrationOutput;
}): NarrationLicenseRealization[] => {
  const usedIds = [
    ...new Set(
      output.planReceipt.flatMap(
        ({ licensedRenderingDetailIds }) => licensedRenderingDetailIds,
      ),
    ),
  ].sort();
  const licenseById = new Map(
    artifacts.inputEnvelope.modelFacing.licensedRenderingDetails.map((license) => [
      license.licenseId,
      license,
    ]),
  );
  const paragraphByPlanId = new Map(
    output.readerProse.paragraphs.flatMap((paragraph) =>
      paragraph.sentencePlanIds.map((planId, index) => [
        planId,
        splitSentences(paragraph.text)[index] ?? paragraph.text,
      ] as const),
    ),
  );
  return usedIds.flatMap((licenseId, index) => {
    const license = licenseById.get(licenseId);
    if (!license) return [];
    const planId = output.planReceipt.find(({ licensedRenderingDetailIds }) =>
      licensedRenderingDetailIds.includes(licenseId),
    )?.sentencePlanId;
    const realizedText = (planId && paragraphByPlanId.get(planId)) || proseText(output);
    return [{
      binding: placeholderBinding(
        "license_realization",
        `receipt.license-realization.${index + 1}`,
      ),
      licenseId,
      realizedText,
      assessment: exactPhraseAppears(realizedText, license.contentBoundary)
        ? "within" as const
        : "uncertain" as const,
      assessmentBasis: "deterministic_rule" as const,
    }];
  });
};

const bindEvidence = ({
  artifacts,
  output,
}: {
  artifacts: ResolvedNarrationPipelineArtifacts;
  output: ModelNarrationOutput;
}) => {
  const exactSourceComposition = preparedSourceCompositionVerified({
    artifacts,
    output,
  });
  const subjectFingerprint = buildNarrationValidationSubjectFingerprint({
    inputEnvelope: artifacts.inputEnvelope,
    scenePlan: artifacts.scenePlan,
    modelOutput: output,
  });
  const structuralTraceStatus = structuralContentTraceStatus({
    scenePlan: artifacts.scenePlan,
    modelOutput: output,
  });
  const contentTraceEvidence: NarrationContentTraceEvidence = {
    binding: placeholderBinding("content_trace", "receipt.content-trace"),
    status:
      structuralTraceStatus === "unsupported"
        ? "unsupported"
        : exactSourceComposition
          ? "complete"
          : "uncertain",
    basis: "deterministic_receipt",
  };
  const privateScreeningEvidence = privateScreening({
    output,
    material: artifacts.privateValidationMaterial,
    exactSourceComposition,
  });
  const reservedActionAssessments = reservedAssessments({
    artifacts,
    output,
    descriptors: artifacts.reservedActionDescriptors,
    exactSourceComposition,
  });
  const realizations = licenseRealizations({ artifacts, output });
  const fidelityAfter = exactSourceComposition
    ? artifacts.fidelityBefore
    : extractPublicFidelityRecord({});
  const fidelityEvidence: NarrationFidelityEvidence = {
    binding: placeholderBinding("public_fidelity", "receipt.public-fidelity"),
    status: exactSourceComposition ? "complete" : "incomplete",
    basis: "deterministic_extractor",
    extractorId: "WF-PUBLIC-01",
    beforeFingerprint: fingerprintPublicFidelityRecord(artifacts.fidelityBefore),
    afterFingerprint: exactSourceComposition
      ? fingerprintPublicFidelityRecord(fidelityAfter)
      : null,
  };
  const evidence: NarrationSemanticEvidence[] = [
    contentTraceEvidence,
    privateScreeningEvidence,
    ...reservedActionAssessments,
    ...realizations,
    fidelityEvidence,
  ];
  const trustedReceipts: NarrationTrustedEvidenceReceipt[] = evidence.map(
    (entry) => {
      entry.binding.subjectFingerprint = subjectFingerprint;
      return {
        ...entry.binding,
        payloadFingerprint: fingerprintNarrationEvidencePayload(entry),
      };
    },
  );
  const registry: NarrationEvidenceAuthorityRegistry = {
    trustedReceipts,
    deterministicRuntimeAuthorityIds: [RUNTIME_EVIDENCE_AUTHORITY_ID],
    creatorAuthorityIds: [],
  };
  return {
    contentTraceEvidence,
    privateScreeningEvidence,
    reservedActionAssessments,
    licenseRealizations: realizations,
    fidelityEvidence,
    fidelityAfter,
    registry,
  };
};

const validateOutput = ({
  artifacts,
  output,
  preflight,
}: {
  artifacts: ResolvedNarrationPipelineArtifacts;
  output: ModelNarrationOutput;
  preflight: NarrationPreflightResult;
}) => {
  const lint = lintNarration({
    modelOutput: output,
    scenePlan: artifacts.scenePlan,
    styleProfile: artifacts.styleProfile,
    styleStateId: artifacts.inputEnvelope.modelFacing.styleStateId,
  });
  const evidence = bindEvidence({ artifacts, output });
  const validation = validateNarrationPostGeneration({
    inputEnvelope: artifacts.inputEnvelope,
    scenePlan: artifacts.scenePlan,
    modelOutput: output,
    styleProfile: artifacts.styleProfile,
    preflightResult: preflight,
    evidenceAuthorityRegistry: evidence.registry,
    privateValidationMaterial: artifacts.privateValidationMaterial,
    privateScreeningEvidence: evidence.privateScreeningEvidence,
    reservedActionDescriptors: artifacts.reservedActionDescriptors,
    reservedActionAssessments: evidence.reservedActionAssessments,
    licenseRealizations: evidence.licenseRealizations,
    contentTraceEvidence: evidence.contentTraceEvidence,
    fidelityEvidence: evidence.fidelityEvidence,
    fidelityBefore: artifacts.fidelityBefore,
    fidelityAfter: evidence.fidelityAfter,
    additionalFindings: lint.findings,
  });
  return { lint, validation };
};

export const runWorldNarrationPipeline = async ({
  artifacts,
  renderer,
  critic,
}: {
  artifacts: ResolvedNarrationPipelineArtifacts;
  renderer: NarrationRenderer;
  critic?: NarrationCritic | null;
}): Promise<WorldNarrationPipelineResult> => {
  const preflight = runNarrationPreflight({
    inputEnvelope: artifacts.inputEnvelope,
    scenePlan: artifacts.scenePlan,
    preflightReceipt: artifacts.preflightReceipt,
    styleProfile: artifacts.styleProfile,
    authorityRegistry: artifacts.authorityRegistry,
    cameraSafeProvenance: artifacts.cameraSafeProvenance,
    continuityProvenance: artifacts.continuityProvenance,
    renderability: {
      renderFunctionAvailable: true,
      authoringInputsComplete: true,
    },
  });
  if (preflight.outcome !== "render" || !preflight.hardPass) {
    return {
      disposition:
        preflight.outcome === "render" ? "no_render" : preflight.outcome,
      preflight,
      validation: null,
      modelOutput: null,
      trace: null,
      rendererCallCount: 0,
      criticCallCount: 0,
      warningCount: 0,
      publishReady: false,
      stateTransitionAllowed: false,
    };
  }

  const rendererRequest = NarrationRendererRequestSchema.parse({
    modelFacingRequest: artifacts.inputEnvelope.modelFacing,
    scenePlan: artifacts.scenePlan,
    preflightReceipt: artifacts.preflightReceipt,
    styleProfile: artifacts.styleProfile,
  });
  const rendered = await renderer.render(rendererRequest);
  if (rendered.outcome !== "completed") {
    return {
      disposition: "renderer_rejected",
      preflight,
      validation: null,
      modelOutput: null,
      trace: rendered.trace,
      rendererCallCount: 1,
      criticCallCount: 0,
      warningCount: 0,
      publishReady: false,
      stateTransitionAllowed: false,
    };
  }
  let output = ModelNarrationOutputSchema.parse(rendered.modelOutput);
  let trace = rendered.trace;
  let checked = validateOutput({ artifacts, output, preflight });
  let criticCallCount: 0 | 1 = 0;

  if (
    checked.validation.disposition !== "hard_fail" &&
    checked.lint.criticRecommended &&
    critic
  ) {
    criticCallCount = 1;
    const revised = await critic.revise({
      rendererRequest,
      priorOutput: output,
      warningRuleIds: checked.lint.findings.map(({ ruleId }) => ruleId),
    });
    if (revised.outcome === "completed") {
      output = ModelNarrationOutputSchema.parse(revised.modelOutput);
      trace = revised.trace;
      checked = validateOutput({ artifacts, output, preflight });
    }
  }

  return {
    disposition: checked.validation.disposition,
    preflight,
    validation: checked.validation,
    modelOutput: output,
    trace,
    rendererCallCount: 1,
    criticCallCount,
    warningCount: checked.validation.renderAudit.warningCount,
    publishReady: checked.validation.disposition === "accepted",
    stateTransitionAllowed: checked.validation.disposition === "accepted",
  };
};

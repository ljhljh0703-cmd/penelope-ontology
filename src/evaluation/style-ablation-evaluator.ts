import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  STYLE_ABLATION_EXPECTED_CALLS,
  StyleAblationBlindPacketSchema,
  StyleAblationBlindRatingsSchema,
  StyleAblationCaptureReceiptSchema,
  StyleAblationCaptureSchema,
  StyleAblationPlanSchema,
  StyleAblationPublicReportSchema,
  type StyleAblationBlindPacket,
  type StyleAblationBlindRatings,
  type StyleAblationCapture,
  type StyleAblationCaptureCall,
  type StyleAblationCaptureReceipt,
  type StyleAblationCondition,
  type StyleAblationObjectiveCheck,
  type StyleAblationPlan,
  type StyleAblationPublicReport,
  type StyleAblationStatus,
} from "@/src/evaluation/style-ablation-contracts";
import {
  buildStyleAblationSchedule,
  styleBundleOnlyDifference,
  type StyleAblationScheduledCall,
} from "@/src/evaluation/style-ablation-input";

type CompletedCall = Extract<StyleAblationCaptureCall, { outcome: "completed" }>;

type CaptureIntegrity = StyleAblationPublicReport["integrity"];

const isCompletedCall = (call: StyleAblationCaptureCall): call is CompletedCall =>
  call.outcome === "completed";

const sorted = (values: ReadonlyArray<string>): string[] =>
  [...values].sort((left, right) => left.localeCompare(right));

const sameStringSet = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

const isRequestedModelFamily = (actualModel: string, requestedModel: string): boolean =>
  actualModel === requestedModel || actualModel.startsWith(`${requestedModel}-`);

export const countStyleAblationWords = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;

const objectiveCheckPasses = (
  narrative: string,
  check: StyleAblationObjectiveCheck,
): boolean => {
  if (check.kind === "max_words") {
    return countStyleAblationWords(narrative) <= check.maximum;
  }
  return !narrative
    .toLocaleLowerCase("en-US")
    .includes(check.phrase.toLocaleLowerCase("en-US"));
};

const callsForPair = (
  schedule: ReadonlyArray<StyleAblationScheduledCall>,
  pairId: string,
): [StyleAblationScheduledCall, StyleAblationScheduledCall] => {
  const calls = schedule.filter((call) => call.pairId === pairId);
  if (calls.length !== 2) throw new Error(`Invalid scheduled pair ${pairId}.`);
  return [calls[0], calls[1]];
};

const inspectCaptureIntegrity = (
  plan: StyleAblationPlan,
  capture: StyleAblationCapture,
): CaptureIntegrity => {
  const schedule = buildStyleAblationSchedule(plan);
  const expectedIds = schedule.map(({ callId }) => callId);
  const observedIds = capture.calls.map(({ callId }) => callId);
  const callById = new Map(capture.calls.map((call) => [call.callId, call]));
  const completed = capture.calls.filter(isCompletedCall);
  const actualModels = new Set(completed.map(({ actualModel }) => actualModel));

  const scheduleMatched =
    capture.evaluationId === plan.evaluationId &&
    capture.planSha256 === sha256Canonical(plan) &&
    capture.requestedModel === plan.targetModel &&
    capture.reasoningEffort === plan.reasoningEffort &&
    capture.maxOutputTokens === plan.maxOutputTokens &&
    schedule.every((expected) => {
      const observed = callById.get(expected.callId);
      return (
        observed?.pairId === expected.pairId &&
        observed.ordinal === expected.ordinal &&
        observed.condition === expected.condition &&
        observed.blindSampleId === expected.blindSampleId &&
        observed.fullRequestSha256 === expected.fullRequestSha256
      );
    });

  const styleDifferenceValid = plan.pairs.every(({ pairId }) => {
    const [first, second] = callsForPair(schedule, pairId);
    const control = first.condition === "default_instruction_control" ? first : second;
    const profiled = first.condition === "profiled" ? first : second;
    return styleBundleOnlyDifference(control, profiled);
  });

  return {
    expectedCalls: STYLE_ABLATION_EXPECTED_CALLS,
    observedCalls: capture.calls.length,
    scheduleMatched,
    sameCommonRequest:
      capture.commonRequestSha256 === schedule[0]?.commonRequestSha256 &&
      capture.calls.every(
        ({ commonRequestSha256 }) => commonRequestSha256 === schedule[0]?.commonRequestSha256,
      ),
    sameOutputSchema:
      capture.outputSchemaSha256 === schedule[0]?.outputSchemaSha256 &&
      capture.calls.every(
        ({ outputSchemaSha256 }) => outputSchemaSha256 === schedule[0]?.outputSchemaSha256,
      ),
    styleBundleOnlyDifference: styleDifferenceValid,
    actualModelConsistent:
      completed.length === STYLE_ABLATION_EXPECTED_CALLS &&
      actualModels.size === 1 &&
      completed.every(({ actualModel }) =>
        isRequestedModelFamily(actualModel, plan.targetModel),
      ),
    noRetryOrReplacement:
      capture.noAutomaticRetries &&
      capture.calls.length === STYLE_ABLATION_EXPECTED_CALLS &&
      new Set(observedIds).size === STYLE_ABLATION_EXPECTED_CALLS &&
      sameStringSet(expectedIds, observedIds),
    allCallsCompleted: completed.length === STYLE_ABLATION_EXPECTED_CALLS,
  };
};

const integrityComplete = (integrity: CaptureIntegrity): boolean =>
  integrity.scheduleMatched &&
  integrity.sameCommonRequest &&
  integrity.sameOutputSchema &&
  integrity.styleBundleOnlyDifference &&
  integrity.actualModelConsistent &&
  integrity.noRetryOrReplacement &&
  integrity.allCallsCompleted;

const parseRatings = (
  input: StyleAblationBlindRatings | unknown | undefined,
): StyleAblationBlindRatings | undefined =>
  input === undefined ? undefined : StyleAblationBlindRatingsSchema.parse(input);

const validateRatingsBinding = ({
  plan,
  capture,
  ratings,
}: {
  plan: StyleAblationPlan;
  capture: StyleAblationCapture;
  ratings: StyleAblationBlindRatings;
}): void => {
  const planSha256 = sha256Canonical(plan);
  const captureSha256 = sha256Canonical(capture);
  const blindPacketSha256 = sha256Canonical(
    buildStyleAblationBlindPacket(plan, capture),
  );
  if (
    ratings.evaluationId !== plan.evaluationId ||
    ratings.planSha256 !== planSha256 ||
    ratings.captureSha256 !== captureSha256 ||
    ratings.blindPacketSha256 !== blindPacketSha256 ||
    !sameStringSet(
      ratings.ratings.map(({ sampleId }) => sampleId),
      capture.calls.map(({ blindSampleId }) => blindSampleId),
    )
  ) {
    throw new Error("Blind ratings do not match this exact capture.");
  }

  const expectedConstraintIds = plan.humanRubric.map(({ constraintId }) => constraintId);
  for (const rating of ratings.ratings) {
    if (
      !sameStringSet(
        rating.scores.map(({ constraintId }) => constraintId),
        expectedConstraintIds,
      )
    ) {
      throw new Error(`Blind rating ${rating.sampleId} does not cover the exact rubric.`);
    }
  }
};

export const buildStyleAblationCaptureReceipt = (
  planInput: StyleAblationPlan | unknown,
  captureInput: StyleAblationCapture | unknown,
): StyleAblationCaptureReceipt => {
  const plan = StyleAblationPlanSchema.parse(planInput);
  const capture = StyleAblationCaptureSchema.parse(captureInput);
  const actualModels = sorted(
    capture.calls
      .map(({ actualModel }) => actualModel)
      .filter((model): model is string => model !== null),
  ).filter((model, index, models) => models.indexOf(model) === index);
  const completedCallCount = capture.calls.filter(isCompletedCall).length;

  return StyleAblationCaptureReceiptSchema.parse({
    schemaVersion: 1,
    evidenceType: "style_ablation_capture_receipt",
    evaluationId: plan.evaluationId,
    capturedAt: capture.capturedAt,
    requestedModel: capture.requestedModel,
    actualModels,
    reasoningEffort: capture.reasoningEffort,
    maxOutputTokens: capture.maxOutputTokens,
    expectedCallCount: STYLE_ABLATION_EXPECTED_CALLS,
    observedCallCount: capture.calls.length,
    completedCallCount,
    noAutomaticRetries: capture.noAutomaticRetries,
    captureStatus:
      completedCallCount === STYLE_ABLATION_EXPECTED_CALLS ? "complete" : "incomplete",
    outcomes: capture.calls
      .map(({ ordinal, outcome }) => ({ ordinal, outcome }))
      .sort(({ ordinal: left }, { ordinal: right }) => left - right),
    sourceDigests: {
      planSha256: sha256Canonical(plan),
      captureSha256: sha256Canonical(capture),
    },
    contentBoundary: {
      rawNarrativePublic: false,
      rawResponseIdsPublic: false,
      apiKeysPublic: false,
      filesystemPathsPublic: false,
    },
  });
};

export const assertStyleAblationCaptureReceiptBinding = ({
  plan: planInput,
  capture: captureInput,
  receipt: receiptInput,
}: {
  plan: StyleAblationPlan | unknown;
  capture: StyleAblationCapture | unknown;
  receipt: StyleAblationCaptureReceipt | unknown;
}): StyleAblationCaptureReceipt => {
  const plan = StyleAblationPlanSchema.parse(planInput);
  const capture = StyleAblationCaptureSchema.parse(captureInput);
  const receipt = StyleAblationCaptureReceiptSchema.parse(receiptInput);
  const expected = buildStyleAblationCaptureReceipt(plan, capture);
  if (sha256Canonical(receipt) !== sha256Canonical(expected)) {
    throw new Error("Style ablation capture receipt does not match the exact plan and capture.");
  }
  return receipt;
};

const determineStatus = ({
  complete,
  ratingsProvided,
  pairResults,
}: {
  complete: boolean;
  ratingsProvided: boolean;
  pairResults: StyleAblationPublicReport["pairResults"];
}): StyleAblationStatus => {
  if (!complete) return "incomplete";
  if (!ratingsProvided) return "objective_only";
  if (
    pairResults.some(
      ({ objectiveRegression, profiledObjectivePasses }) =>
        objectiveRegression || !profiledObjectivePasses,
    )
  ) {
    return "not_supported_on_probe";
  }
  const deltas = pairResults.map(({ humanScoreDelta }) => humanScoreDelta);
  if (deltas.every((delta) => delta !== null && delta > 0)) {
    if (pairResults.some(({ humanCriterionRegression }) => humanCriterionRegression)) {
      return "not_supported_on_probe";
    }
    return "supported_on_probe";
  }
  if (deltas.every((delta) => delta !== null && delta <= 0)) {
    return "not_supported_on_probe";
  }
  return "inconclusive";
};

export const buildStyleAblationBlindPacket = (
  planInput: StyleAblationPlan | unknown,
  captureInput: StyleAblationCapture | unknown,
): StyleAblationBlindPacket => {
  const plan = StyleAblationPlanSchema.parse(planInput);
  const capture = StyleAblationCaptureSchema.parse(captureInput);
  const integrity = inspectCaptureIntegrity(plan, capture);
  if (!integrityComplete(integrity)) {
    throw new Error("A complete invariant-matched capture is required for blind review.");
  }

  return StyleAblationBlindPacketSchema.parse({
    schemaVersion: 1,
    evaluationId: plan.evaluationId,
    planSha256: sha256Canonical(plan),
    captureSha256: sha256Canonical(capture),
    instructions:
      "Score every sample independently from 0 to 2 for each rubric item. Do not infer the generation setup.",
    rubric: plan.humanRubric,
    scoreAnchors: plan.scoreAnchors,
    samples: capture.calls
      .filter(isCompletedCall)
      .map(({ blindSampleId, narrative }) => ({
        sampleId: blindSampleId,
        narrative,
      }))
      .sort(({ sampleId: left }, { sampleId: right }) => left.localeCompare(right)),
  });
};

export const evaluateStyleAblation = ({
  plan: planInput,
  capture: captureInput,
  ratings: ratingsInput,
  evaluatedAt,
}: {
  plan: StyleAblationPlan | unknown;
  capture: StyleAblationCapture | unknown;
  ratings?: StyleAblationBlindRatings | unknown;
  evaluatedAt: string;
}): StyleAblationPublicReport => {
  const plan = StyleAblationPlanSchema.parse(planInput);
  const capture = StyleAblationCaptureSchema.parse(captureInput);
  const ratings = parseRatings(ratingsInput);
  if (ratings) validateRatingsBinding({ plan, capture, ratings });

  const schedule = buildStyleAblationSchedule(plan);
  const callById = new Map(capture.calls.map((call) => [call.callId, call]));
  const ratingBySampleId = new Map(
    ratings?.ratings.map((rating) => [rating.sampleId, rating]) ?? [],
  );
  const integrity = inspectCaptureIntegrity(plan, capture);

  const objectivePassesFor = (
    call: StyleAblationCaptureCall | undefined,
  ): Map<string, boolean> => {
    if (!call || !isCompletedCall(call)) return new Map();
    return new Map(
      plan.objectiveChecks.map((check) => [
        check.constraintId,
        objectiveCheckPasses(call.narrative, check),
      ]),
    );
  };

  const humanScoreFor = (call: StyleAblationCaptureCall | undefined): number | null => {
    if (!ratings || !call || !isCompletedCall(call)) return null;
    const rating = ratingBySampleId.get(call.blindSampleId);
    if (!rating) return null;
    return rating.scores.reduce((total, { score }) => total + score, 0);
  };

  const humanScoresByConstraintFor = (
    call: StyleAblationCaptureCall | undefined,
  ): Map<string, number> => {
    if (!ratings || !call || !isCompletedCall(call)) return new Map();
    const rating = ratingBySampleId.get(call.blindSampleId);
    if (!rating) return new Map();
    return new Map(rating.scores.map(({ constraintId, score }) => [constraintId, score]));
  };

  const conditionResults = (
    ["default_instruction_control", "profiled"] as const
  ).map((condition: StyleAblationCondition) => {
    const completedCalls = capture.calls.filter(
      (call): call is CompletedCall => call.condition === condition && isCompletedCall(call),
    );
    const humanScores = completedCalls
      .map((call) => humanScoreFor(call))
      .filter((score): score is number => score !== null);
    return {
      condition,
      completedSamples: completedCalls.length,
      wordCounts: completedCalls.map(({ narrative }) => countStyleAblationWords(narrative)),
      objectiveChecks: plan.objectiveChecks.map((check) => {
        const values = completedCalls.map((call) =>
          objectiveCheckPasses(call.narrative, check),
        );
        return {
          constraintId: check.constraintId,
          kind: check.kind,
          passCount: values.filter(Boolean).length,
          failCount: values.filter((value) => !value).length,
        };
      }),
      humanScoreTotal: ratings
        ? humanScores.reduce((total, score) => total + score, 0)
        : null,
      humanScoreMaximum: ratings
        ? completedCalls.length * plan.humanRubric.length * 2
        : null,
    };
  });

  const pairResults = plan.pairs.map(({ pairId }) => {
    const scheduledPair = schedule.filter((call) => call.pairId === pairId);
    const controlScheduled = scheduledPair.find(
      ({ condition }) => condition === "default_instruction_control",
    );
    const profiledScheduled = scheduledPair.find(({ condition }) => condition === "profiled");
    const control = controlScheduled ? callById.get(controlScheduled.callId) : undefined;
    const profiled = profiledScheduled ? callById.get(profiledScheduled.callId) : undefined;
    const controlChecks = objectivePassesFor(control);
    const profiledChecks = objectivePassesFor(profiled);
    const controlHumanScore = humanScoreFor(control);
    const profiledHumanScore = humanScoreFor(profiled);
    const controlHumanScoresByConstraint = humanScoresByConstraintFor(control);
    const profiledHumanScoresByConstraint = humanScoresByConstraintFor(profiled);
    const humanCriterionDeltas = plan.humanRubric.map(({ constraintId }) => {
      const controlScore = controlHumanScoresByConstraint.get(constraintId);
      const profiledScore = profiledHumanScoresByConstraint.get(constraintId);
      return {
        constraintId,
        delta:
          controlScore === undefined || profiledScore === undefined
            ? null
            : profiledScore - controlScore,
      };
    });
    const completed = Boolean(
      control && profiled && isCompletedCall(control) && isCompletedCall(profiled),
    );

    return {
      pairId,
      completed,
      actualModelMatched: Boolean(
        completed &&
          isCompletedCall(control as StyleAblationCaptureCall) &&
          isCompletedCall(profiled as StyleAblationCaptureCall) &&
          (control as CompletedCall).actualModel === (profiled as CompletedCall).actualModel &&
          isRequestedModelFamily((control as CompletedCall).actualModel, plan.targetModel),
      ),
      objectiveRegression:
        completed &&
        plan.objectiveChecks.some(
          ({ constraintId }) =>
            controlChecks.get(constraintId) === true &&
            profiledChecks.get(constraintId) === false,
        ),
      defaultInstructionControlObjectivePasses:
        completed &&
        plan.objectiveChecks.every(
          ({ constraintId }) => controlChecks.get(constraintId) === true,
        ),
      profiledObjectivePasses:
        completed &&
        plan.objectiveChecks.every(
          ({ constraintId }) => profiledChecks.get(constraintId) === true,
        ),
      defaultInstructionControlHumanScore: controlHumanScore,
      profiledHumanScore,
      humanScoreDelta:
        controlHumanScore === null || profiledHumanScore === null
          ? null
          : profiledHumanScore - controlHumanScore,
      humanCriterionDeltas,
      humanCriterionRegression: humanCriterionDeltas.some(
        ({ delta }) => delta !== null && delta < 0,
      ),
    };
  });

  const report = {
    schemaVersion: 1,
    evidenceType: "style_controllability_ablation",
    evaluationId: plan.evaluationId,
    evaluatedAt,
    requestedModel: plan.targetModel,
    actualModels: sorted(
      capture.calls.filter(isCompletedCall).map(({ actualModel }) => actualModel),
    ).filter((model, index, models) => models.indexOf(model) === index),
    reasoningEffort: plan.reasoningEffort,
    maxOutputTokens: plan.maxOutputTokens,
    sourceDigests: {
      planSha256: sha256Canonical(plan),
      captureSha256: sha256Canonical(capture),
      ratingsSha256: ratings ? sha256Canonical(ratings) : null,
    },
    integrity,
    conditionResults,
    pairResults,
    humanRubric: {
      provided: Boolean(ratings),
      constraintIds: plan.humanRubric.map(({ constraintId }) => constraintId),
      scoreMinimum: 0,
      scoreMaximum: 2,
    },
    status: determineStatus({
      complete: integrityComplete(integrity),
      ratingsProvided: Boolean(ratings),
      pairResults,
    }),
    claimBoundary:
      "This limited synthetic probe tests style controllability within GPT-5.6; it is not a model-vendor writing-quality comparison, a user study, or a general quality claim.",
    contentBoundary: {
      rawNarrativePublic: false,
      rawResponseIdsPublic: false,
      apiKeysPublic: false,
      filesystemPathsPublic: false,
    },
  };

  return StyleAblationPublicReportSchema.parse(report);
};

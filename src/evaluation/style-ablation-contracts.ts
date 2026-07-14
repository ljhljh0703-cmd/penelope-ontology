import { z } from "zod";
import { HashSchema, IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";
import { ParticipantIntentSetSchema } from "@/src/contracts/participant-intent";
import { CharacterAgentViewSchema } from "@/src/contracts/run";
import { StyleProfileSchema } from "@/src/contracts/style-profile";

export const STYLE_ABLATION_EXPECTED_CALLS = 4 as const;
export const STYLE_ABLATION_OUTPUT_SCHEMA_NAME = "style_ablation_narrative" as const;

export const StyleAblationConditionSchema = z.enum([
  "default_instruction_control",
  "profiled",
]);

export const StyleAblationStatusSchema = z.enum([
  "incomplete",
  "objective_only",
  "supported_on_probe",
  "inconclusive",
  "not_supported_on_probe",
]);

export const StyleAblationNarrativeSchema = z
  .object({
    narrative: z.string().trim().min(1).max(20_000),
  })
  .strict();

const StyleAblationOutputContractSchema = z
  .object({
    name: z.literal(STYLE_ABLATION_OUTPUT_SCHEMA_NAME),
    strict: z.literal(true),
    fields: z.tuple([z.literal("narrative")]),
  })
  .strict();

const StyleAblationEvidenceSchema = z
  .object({
    characterViews: z.array(CharacterAgentViewSchema).min(1),
    context: z.string().min(1).max(8_000),
  })
  .strict();

export const StyleAblationCommonInputSchema = z
  .object({
    brief: z.string().min(1).max(2_000),
    participantIntents: ParticipantIntentSetSchema,
    evidence: StyleAblationEvidenceSchema,
  })
  .strict();

export const StyleAblationModelInputSchema = StyleAblationCommonInputSchema.extend({
  creatorStyleBundle: StyleProfileSchema.nullable(),
}).strict();

const MaxWordsObjectiveCheckSchema = z
  .object({
    constraintId: IdentifierSchema,
    kind: z.literal("max_words"),
    maximum: z.number().int().positive(),
  })
  .strict();

const ProhibitedPhraseObjectiveCheckSchema = z
  .object({
    constraintId: IdentifierSchema,
    kind: z.literal("prohibited_phrase"),
    phrase: z.string().min(1),
  })
  .strict();

export const StyleAblationObjectiveCheckSchema = z.discriminatedUnion("kind", [
  MaxWordsObjectiveCheckSchema,
  ProhibitedPhraseObjectiveCheckSchema,
]);

export const StyleAblationHumanRubricItemSchema = z
  .object({
    constraintId: IdentifierSchema,
    criterion: z.string().min(1).max(500),
  })
  .strict();

export const StyleAblationScoreAnchorsSchema = z
  .object({
    zero: z.literal("not demonstrated"),
    one: z.literal("partly demonstrated"),
    two: z.literal("consistently demonstrated"),
  })
  .strict();

const StyleAblationPairSchema = z
  .object({
    pairId: IdentifierSchema,
    order: z.tuple([StyleAblationConditionSchema, StyleAblationConditionSchema]),
  })
  .strict();

const sorted = (values: ReadonlyArray<string>): string[] =>
  [...values].sort((left, right) => left.localeCompare(right));

const sameIds = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

export const StyleAblationPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    evaluationId: IdentifierSchema,
    targetModel: z.literal("gpt-5.6"),
    reasoningEffort: z.literal("medium"),
    maxOutputTokens: z.literal(4096),
    commonInstructions: z.string().min(1).max(4_000),
    outputContract: StyleAblationOutputContractSchema,
    commonInput: StyleAblationCommonInputSchema,
    styleBundle: StyleProfileSchema,
    objectiveChecks: z.array(StyleAblationObjectiveCheckSchema).min(1),
    humanRubric: z.array(StyleAblationHumanRubricItemSchema).min(1),
    scoreAnchors: StyleAblationScoreAnchorsSchema,
    pairs: z.array(StyleAblationPairSchema).length(2),
  })
  .strict()
  .superRefine((plan, context) => {
    addDuplicateIssues(
      plan.pairs.map(({ pairId }) => pairId),
      "style ablation pair id",
      context,
    );
    addDuplicateIssues(
      plan.objectiveChecks.map(({ constraintId }) => constraintId),
      "objective style constraint id",
      context,
    );
    addDuplicateIssues(
      plan.humanRubric.map(({ constraintId }) => constraintId),
      "human rubric constraint id",
      context,
    );

    const expectedOrders = [
      ["default_instruction_control", "profiled"],
      ["profiled", "default_instruction_control"],
    ] as const;
    plan.pairs.forEach((pair, index) => {
      if (JSON.stringify(pair.order) !== JSON.stringify(expectedOrders[index])) {
        context.addIssue({
          code: "custom",
          path: ["pairs", index, "order"],
          message: "Style ablation must preregister one AB pair and one BA pair.",
        });
      }
    });

    const deterministicConstraints = plan.styleBundle.constraints.filter(
      ({ checkMode }) => checkMode === "deterministic",
    );
    const humanConstraints = plan.styleBundle.constraints.filter(
      ({ checkMode }) => checkMode === "human",
    );
    if (
      !sameIds(
        plan.objectiveChecks.map(({ constraintId }) => constraintId),
        deterministicConstraints.map(({ id }) => id),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["objectiveChecks"],
        message: "Objective checks must exactly cover deterministic style constraints.",
      });
    }
    if (
      !sameIds(
        plan.humanRubric.map(({ constraintId }) => constraintId),
        humanConstraints.map(({ id }) => id),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["humanRubric"],
        message: "Human rubric items must exactly cover human-reviewed style constraints.",
      });
    }

    for (const check of plan.objectiveChecks) {
      const constraint = deterministicConstraints.find(({ id }) => id === check.constraintId);
      if (!constraint || constraint.kind !== check.kind) continue;
      const expectedValue = check.kind === "max_words" ? check.maximum : check.phrase;
      if (constraint.value !== expectedValue) {
        context.addIssue({
          code: "custom",
          path: ["objectiveChecks"],
          message: `Objective check ${check.constraintId} must match its style constraint value.`,
        });
      }
    }
  });

const CaptureCallBaseFields = {
  callId: IdentifierSchema,
  pairId: IdentifierSchema,
  ordinal: z.number().int().min(1).max(STYLE_ABLATION_EXPECTED_CALLS),
  condition: StyleAblationConditionSchema,
  blindSampleId: IdentifierSchema,
  commonRequestSha256: HashSchema,
  fullRequestSha256: HashSchema,
  outputSchemaSha256: HashSchema,
} as const;

const CompletedCaptureCallSchema = z
  .object({
    ...CaptureCallBaseFields,
    outcome: z.literal("completed"),
    actualModel: z.string().min(1),
    responseId: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    narrative: z.string().min(1).max(20_000),
  })
  .strict();

const FailedCaptureCallSchema = z
  .object({
    ...CaptureCallBaseFields,
    outcome: z.enum(["refused", "timeout", "api_error", "schema_error"]),
    actualModel: z.string().min(1).nullable(),
    responseId: z.string().min(1).nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    errorCode: IdentifierSchema,
  })
  .strict();

export const StyleAblationCaptureCallSchema = z.union([
  CompletedCaptureCallSchema,
  FailedCaptureCallSchema,
]);

export const StyleAblationCaptureSchema = z
  .object({
    schemaVersion: z.literal(1),
    evaluationId: IdentifierSchema,
    planSha256: HashSchema,
    capturedAt: z.iso.datetime(),
    requestedModel: z.literal("gpt-5.6"),
    reasoningEffort: z.literal("medium"),
    maxOutputTokens: z.literal(4096),
    expectedCallCount: z.literal(STYLE_ABLATION_EXPECTED_CALLS),
    noAutomaticRetries: z.literal(true),
    commonRequestSha256: HashSchema,
    outputSchemaSha256: HashSchema,
    calls: z.array(StyleAblationCaptureCallSchema).length(STYLE_ABLATION_EXPECTED_CALLS),
  })
  .strict()
  .superRefine((capture, context) => {
    addDuplicateIssues(
      capture.calls.map(({ callId }) => callId),
      "style ablation call id",
      context,
    );
    addDuplicateIssues(
      capture.calls.map(({ blindSampleId }) => blindSampleId),
      "blind sample id",
      context,
    );
    addDuplicateIssues(
      capture.calls.map(({ ordinal }) => String(ordinal)),
      "style ablation ordinal",
      context,
    );
  });

const StyleAblationReceiptOutcomeSchema = z
  .object({
    ordinal: z.number().int().min(1).max(STYLE_ABLATION_EXPECTED_CALLS),
    outcome: z.enum(["completed", "refused", "timeout", "api_error", "schema_error"]),
  })
  .strict();

export const StyleAblationCaptureReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("style_ablation_capture_receipt"),
    evaluationId: IdentifierSchema,
    capturedAt: z.iso.datetime(),
    requestedModel: z.literal("gpt-5.6"),
    actualModels: z.array(z.string().min(1)).max(STYLE_ABLATION_EXPECTED_CALLS),
    reasoningEffort: z.literal("medium"),
    maxOutputTokens: z.literal(4096),
    expectedCallCount: z.literal(STYLE_ABLATION_EXPECTED_CALLS),
    observedCallCount: z.literal(STYLE_ABLATION_EXPECTED_CALLS),
    completedCallCount: z.number().int().min(0).max(STYLE_ABLATION_EXPECTED_CALLS),
    noAutomaticRetries: z.literal(true),
    captureStatus: z.enum(["complete", "incomplete"]),
    outcomes: z.array(StyleAblationReceiptOutcomeSchema).length(STYLE_ABLATION_EXPECTED_CALLS),
    sourceDigests: z
      .object({
        planSha256: HashSchema,
        captureSha256: HashSchema,
      })
      .strict(),
    contentBoundary: z
      .object({
        rawNarrativePublic: z.literal(false),
        rawResponseIdsPublic: z.literal(false),
        apiKeysPublic: z.literal(false),
        filesystemPathsPublic: z.literal(false),
      })
      .strict(),
  })
  .strict()
  .superRefine((receipt, context) => {
    addDuplicateIssues(
      receipt.outcomes.map(({ ordinal }) => String(ordinal)),
      "style ablation receipt ordinal",
      context,
    );
    const completed = receipt.outcomes.filter(({ outcome }) => outcome === "completed").length;
    if (completed !== receipt.completedCallCount) {
      context.addIssue({
        code: "custom",
        path: ["completedCallCount"],
        message: "Receipt completed-call count must match its sanitized outcomes.",
      });
    }
    if ((completed === STYLE_ABLATION_EXPECTED_CALLS) !== (receipt.captureStatus === "complete")) {
      context.addIssue({
        code: "custom",
        path: ["captureStatus"],
        message: "Receipt status must match whether every preregistered call completed.",
      });
    }
  });

const BlindSampleSchema = z
  .object({
    sampleId: IdentifierSchema,
    narrative: z.string().min(1).max(20_000),
  })
  .strict();

const containsConditionLabel = (value: unknown): boolean =>
  /(?:default_instruction_control|profiled)/iu.test(JSON.stringify(value));

export const StyleAblationBlindPacketSchema = z
  .object({
    schemaVersion: z.literal(1),
    evaluationId: IdentifierSchema,
    planSha256: HashSchema,
    captureSha256: HashSchema,
    instructions: z.literal(
      "Score every sample independently from 0 to 2 for each rubric item. Do not infer the generation setup.",
    ),
    rubric: z.array(StyleAblationHumanRubricItemSchema).min(1),
    scoreAnchors: StyleAblationScoreAnchorsSchema,
    samples: z.array(BlindSampleSchema).length(STYLE_ABLATION_EXPECTED_CALLS),
  })
  .strict()
  .superRefine((packet, context) => {
    addDuplicateIssues(
      packet.samples.map(({ sampleId }) => sampleId),
      "blind packet sample id",
      context,
    );
    if (containsConditionLabel(packet)) {
      context.addIssue({
        code: "custom",
        message: "Blind packets must not expose evaluation condition labels.",
      });
    }
  });

const BlindScoreSchema = z
  .object({
    constraintId: IdentifierSchema,
    score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  })
  .strict();

const BlindSampleRatingSchema = z
  .object({
    sampleId: IdentifierSchema,
    scores: z.array(BlindScoreSchema).min(1),
  })
  .strict()
  .superRefine((rating, context) => {
    addDuplicateIssues(
      rating.scores.map(({ constraintId }) => constraintId),
      "blind rating constraint id",
      context,
    );
  });

export const StyleAblationBlindRatingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    evaluationId: IdentifierSchema,
    planSha256: HashSchema,
    captureSha256: HashSchema,
    blindPacketSha256: HashSchema,
    evaluatorRole: z.literal("creator"),
    ratings: z.array(BlindSampleRatingSchema).length(STYLE_ABLATION_EXPECTED_CALLS),
  })
  .strict()
  .superRefine((ratings, context) => {
    addDuplicateIssues(
      ratings.ratings.map(({ sampleId }) => sampleId),
      "blind rating sample id",
      context,
    );
    if (containsConditionLabel(ratings)) {
      context.addIssue({
        code: "custom",
        message: "Blind ratings must not contain evaluation condition labels.",
      });
    }
  });

const PublicObjectiveSummarySchema = z
  .object({
    constraintId: IdentifierSchema,
    kind: z.enum(["max_words", "prohibited_phrase"]),
    passCount: z.number().int().nonnegative(),
    failCount: z.number().int().nonnegative(),
  })
  .strict();

const PublicConditionResultSchema = z
  .object({
    condition: StyleAblationConditionSchema,
    completedSamples: z.number().int().min(0).max(2),
    wordCounts: z.array(z.number().int().nonnegative()).max(2),
    objectiveChecks: z.array(PublicObjectiveSummarySchema).min(1),
    humanScoreTotal: z.number().int().nonnegative().nullable(),
    humanScoreMaximum: z.number().int().nonnegative().nullable(),
  })
  .strict();

const PublicHumanCriterionDeltaSchema = z
  .object({
    constraintId: IdentifierSchema,
    delta: z.number().int().nullable(),
  })
  .strict();

const PublicPairResultSchema = z
  .object({
    pairId: IdentifierSchema,
    completed: z.boolean(),
    actualModelMatched: z.boolean(),
    objectiveRegression: z.boolean(),
    defaultInstructionControlObjectivePasses: z.boolean(),
    profiledObjectivePasses: z.boolean(),
    defaultInstructionControlHumanScore: z.number().int().nonnegative().nullable(),
    profiledHumanScore: z.number().int().nonnegative().nullable(),
    humanScoreDelta: z.number().int().nullable(),
    humanCriterionDeltas: z.array(PublicHumanCriterionDeltaSchema).min(1),
    humanCriterionRegression: z.boolean(),
  })
  .strict();

export const StyleAblationPublicReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("style_controllability_ablation"),
    evaluationId: IdentifierSchema,
    evaluatedAt: z.iso.datetime(),
    requestedModel: z.literal("gpt-5.6"),
    actualModels: z.array(z.string().min(1)).max(STYLE_ABLATION_EXPECTED_CALLS),
    reasoningEffort: z.literal("medium"),
    maxOutputTokens: z.literal(4096),
    sourceDigests: z
      .object({
        planSha256: HashSchema,
        captureSha256: HashSchema,
        ratingsSha256: HashSchema.nullable(),
      })
      .strict(),
    integrity: z
      .object({
        expectedCalls: z.literal(STYLE_ABLATION_EXPECTED_CALLS),
        observedCalls: z.number().int().min(0).max(STYLE_ABLATION_EXPECTED_CALLS),
        scheduleMatched: z.boolean(),
        sameCommonRequest: z.boolean(),
        sameOutputSchema: z.boolean(),
        styleBundleOnlyDifference: z.boolean(),
        actualModelConsistent: z.boolean(),
        noRetryOrReplacement: z.boolean(),
        allCallsCompleted: z.boolean(),
      })
      .strict(),
    conditionResults: z.array(PublicConditionResultSchema).length(2),
    pairResults: z.array(PublicPairResultSchema).length(2),
    humanRubric: z
      .object({
        provided: z.boolean(),
        constraintIds: z.array(IdentifierSchema).min(1),
        scoreMinimum: z.literal(0),
        scoreMaximum: z.literal(2),
      })
      .strict(),
    status: StyleAblationStatusSchema,
    claimBoundary: z.literal(
      "This limited synthetic probe tests style controllability within GPT-5.6; it is not a model-vendor writing-quality comparison, a user study, or a general quality claim.",
    ),
    contentBoundary: z
      .object({
        rawNarrativePublic: z.literal(false),
        rawResponseIdsPublic: z.literal(false),
        apiKeysPublic: z.literal(false),
        filesystemPathsPublic: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type StyleAblationCondition = z.infer<typeof StyleAblationConditionSchema>;
export type StyleAblationStatus = z.infer<typeof StyleAblationStatusSchema>;
export type StyleAblationNarrative = z.infer<typeof StyleAblationNarrativeSchema>;
export type StyleAblationPlan = z.infer<typeof StyleAblationPlanSchema>;
export type StyleAblationObjectiveCheck = z.infer<
  typeof StyleAblationObjectiveCheckSchema
>;
export type StyleAblationCaptureCall = z.infer<typeof StyleAblationCaptureCallSchema>;
export type StyleAblationCapture = z.infer<typeof StyleAblationCaptureSchema>;
export type StyleAblationCaptureReceipt = z.infer<
  typeof StyleAblationCaptureReceiptSchema
>;
export type StyleAblationBlindPacket = z.infer<typeof StyleAblationBlindPacketSchema>;
export type StyleAblationBlindRatings = z.infer<typeof StyleAblationBlindRatingsSchema>;
export type StyleAblationPublicReport = z.infer<typeof StyleAblationPublicReportSchema>;

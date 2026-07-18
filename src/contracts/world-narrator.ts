import { z } from "zod";
import {
  IdentifierSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";
import {
  LicensedRenderingDetailSchema,
  NarrationAuthorityIdentifierArraySchema,
  NarrationAuthorityIdentifierSchema,
  NarrationIdentifierArraySchema,
  NarrationIdentifierSchema,
  NarrationSceneModeSchema,
  NarrationSentenceRoleSchema,
  NarrationSpeechActSchema,
} from "@/src/contracts/narration-license";

export {
  FableNarrativeAuthorityTextSchema,
  FableNarrativeDialogueAuthoritySchema,
  FableNarrativeLicensedRenderingDetailSchema,
  FableNarrativePlainDramaticPlanSchema,
  FableNarrativePreflightSchema,
  FableNarrativeReferenceReceiptSchema,
  FableNarrativeSceneAuthoritySchema,
  LicensedRenderingDetailSchema,
  NarrationIdentifierSchema,
  NarrationLicenseCategorySchema,
  NarrationLicenseIssuerSchema,
  NarrationSceneModeSchema,
  NarrationSentenceRoleSchema,
  NarrationSpeechActSchema,
  NarrationSpeechEventReferenceSchema,
  PenelopeNarrationPreflightReceiptSchema,
  PenelopeScenePlanSchema,
  PenelopeSentencePlanSchema,
  TypedSpeechEventReferenceSchema,
  type FableNarrativeAuthorityText,
  type FableNarrativeDialogueAuthority,
  type FableNarrativeLicensedRenderingDetail,
  type FableNarrativePlainDramaticPlan,
  type FableNarrativePreflight,
  type FableNarrativeReferenceReceipt,
  type FableNarrativeSceneAuthority,
  type LicensedRenderingDetail,
  type NarrationIdentifier,
  type NarrationAuthorityIdentifier,
  type NarrationLicenseCategory,
  type NarrationLicenseIssuer,
  type NarrationSceneMode,
  type NarrationSentenceRole,
  type NarrationSpeechAct,
  type NarrationSpeechEventReference,
  type PenelopeNarrationPreflightReceipt,
  type PenelopeScenePlan,
  type PenelopeSentencePlan,
  type TypedSpeechEventReference,
} from "@/src/contracts/narration-license";

const containsNonEnglishLetters = (text: string): boolean =>
  [...text].some(
    (character) => /\p{L}/u.test(character) && !/[A-Za-z]/u.test(character),
  );

export const countEnglishSceneWords = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;

const EnglishTextSchema = (maximumLength: number) =>
  z
    .string()
    .min(1)
    .max(maximumLength)
    .superRefine((text, context) => {
      if (text.trim().length === 0) {
        context.addIssue({
          code: "custom",
          message: "World narration text cannot contain only whitespace.",
        });
      }
      if (containsNonEnglishLetters(text)) {
        context.addIssue({
          code: "custom",
          message: "World narration input and output must use English prose.",
        });
      }
    });

const CameraSafeTextSchema = z.string().min(1).max(600);

export const NarrationPresentActorSchema = z
  .object({
    entityId: NarrationIdentifierSchema,
    renderDescriptor: CameraSafeTextSchema,
    sourceFactIds: NarrationIdentifierArraySchema.min(1),
  })
  .strict();

export const NarrationVisibleFactSchema = z
  .object({
    factId: NarrationIdentifierSchema,
    renderText: CameraSafeTextSchema,
  })
  .strict();

export const NarrationResolvedEventSchema = z
  .object({
    eventId: NarrationIdentifierSchema,
    observableText: CameraSafeTextSchema,
    sourceAuthorityIds: NarrationIdentifierArraySchema.min(1),
  })
  .strict();

export const NarrationAuthorizedAnchorSchema = z
  .object({
    anchorId: NarrationIdentifierSchema,
    renderDescriptor: CameraSafeTextSchema,
    sourceFactIds: NarrationIdentifierArraySchema.min(1),
  })
  .strict();

const ModelFacingNarrationRequestFields = {
  sceneMode: NarrationSceneModeSchema,
  languageProfileId: NarrationIdentifierSchema,
  referenceReceiptId: NarrationIdentifierSchema,
  focalActorId: NarrationIdentifierSchema,
  presentActors: z.array(NarrationPresentActorSchema).min(1).max(12),
  visibleFacts: z.array(NarrationVisibleFactSchema).min(1).max(24),
  resolvedEvents: z.array(NarrationResolvedEventSchema).max(8),
  authorizedActionEventIds: NarrationIdentifierArraySchema,
  authorizedReactionEventIds: NarrationIdentifierArraySchema,
  authorizedChangeEventIds: NarrationIdentifierArraySchema,
  authorizedAnchors: z.array(NarrationAuthorizedAnchorSchema).max(12),
  licensedRenderingDetails: z.array(LicensedRenderingDetailSchema).max(12),
  styleStateId: NarrationIdentifierSchema,
  reservedActionIds: NarrationIdentifierArraySchema,
} as const;

/** PENELOPE-NARRATIVE-INPUT model-facing boundary. */
export const ModelFacingNarrationRequestSchema = z
  .object(ModelFacingNarrationRequestFields)
  .strict()
  .superRefine((request, context) => {
    const actionCount = request.authorizedActionEventIds.length;
    const reactionCount = request.authorizedReactionEventIds.length;
    const changeCount = request.authorizedChangeEventIds.length;
    const resolvedCount = request.resolvedEvents.length;
    const issue = (path: string, message: string): void => {
      context.addIssue({ code: "custom", path: [path], message });
    };

    switch (request.sceneMode) {
      case "setup":
        if (actionCount !== 0) issue("authorizedActionEventIds", "Setup cannot authorize an action event.");
        if (reactionCount !== 0) issue("authorizedReactionEventIds", "Setup cannot authorize a reaction event.");
        if (changeCount !== 0) issue("authorizedChangeEventIds", "Setup cannot authorize a change event.");
        break;
      case "turn":
        if (resolvedCount === 0) issue("resolvedEvents", "Turn requires a resolved event.");
        if (actionCount === 0) issue("authorizedActionEventIds", "Turn requires an authorized action event.");
        if (reactionCount === 0) issue("authorizedReactionEventIds", "Turn requires an authorized reaction event.");
        if (changeCount === 0) issue("authorizedChangeEventIds", "Turn requires an authorized change event.");
        break;
      case "aftermath":
        if (resolvedCount === 0) issue("resolvedEvents", "Aftermath requires a resolved event.");
        if (actionCount !== 0) issue("authorizedActionEventIds", "Aftermath cannot authorize a new action event.");
        if (changeCount === 0) issue("authorizedChangeEventIds", "Aftermath requires an authorized change event.");
        break;
      case "transition":
        if (actionCount !== 0) issue("authorizedActionEventIds", "Transition cannot authorize an action event.");
        if (reactionCount !== 0) issue("authorizedReactionEventIds", "Transition cannot authorize a reaction event.");
        if (changeCount !== 0) issue("authorizedChangeEventIds", "Transition cannot authorize a change event.");
        break;
      case "ending":
        if (resolvedCount === 0) issue("resolvedEvents", "Ending requires a resolved event.");
        if (actionCount !== 0) issue("authorizedActionEventIds", "Ending cannot authorize a new action event.");
        break;
    }
  });

/** Private post-generation context; never serialize this into a model request. */
export const PrivateNarrationValidationContextSchema = z
  .object({
    forbiddenKnowledgeIds: NarrationIdentifierArraySchema,
    forbiddenInferenceRuleIds: NarrationIdentifierArraySchema,
    creatorOnlyReviewNoteIds: NarrationIdentifierArraySchema,
  })
  .strict();

/** PENELOPE-NARRATIVE-INPUT root used only inside the deterministic pipeline. */
export const PenelopeNarrationInputEnvelopeSchema = z
  .object({
    modelFacing: ModelFacingNarrationRequestSchema,
    privateValidation: PrivateNarrationValidationContextSchema,
  })
  .strict();

/** Short consumer-facing alias for the PENELOPE-NARRATIVE-INPUT root. */
export const NarrationInputEnvelopeSchema =
  PenelopeNarrationInputEnvelopeSchema;

export const NarrationPlanReceiptEntrySchema = z
  .object({
    sentencePlanId: NarrationIdentifierSchema,
    role: NarrationSentenceRoleSchema,
    sourceFactIds: NarrationIdentifierArraySchema,
    sourceEventIds: NarrationIdentifierArraySchema,
    speechEventIds: NarrationIdentifierArraySchema,
    licensedRenderingDetailIds: NarrationIdentifierArraySchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (
      entry.sourceFactIds.length === 0 &&
      entry.sourceEventIds.length === 0 &&
      entry.speechEventIds.length === 0 &&
      entry.licensedRenderingDetailIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "A plan receipt entry must bind to at least one source.",
      });
    }
    if (entry.role === "licensed_dialogue") {
      if (
        entry.speechEventIds.length === 0 &&
        entry.licensedRenderingDetailIds.length === 0
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Licensed dialogue must bind to a speech event or rendering detail.",
        });
      }
    } else if (entry.speechEventIds.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["speechEventIds"],
        message: "Only licensed dialogue may cite speech event IDs.",
      });
    }
  });

export const NarrationReaderProseSchema = z
  .object({
    format: z.literal("english_prose_paragraphs"),
    paragraphs: z
      .array(
        z
          .object({
            paragraphId: NarrationIdentifierSchema,
            sentencePlanIds: NarrationIdentifierArraySchema.min(1),
            text: z.string().min(1).max(2_400),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

/** PENELOPE-NARRATIVE-OUTPUT root; renderAudit is intentionally absent. */
export const ModelNarrationOutputSchema = z
  .object({
    planReceipt: z.array(NarrationPlanReceiptEntrySchema).min(2).max(14),
    readerProse: NarrationReaderProseSchema,
  })
  .strict();

export const NarrationRenderAuditFindingSchema = z
  .object({
    ruleCode: z.string().regex(/^(AC|FC|WF)-[A-Z0-9-]{2,24}$/u),
    severity: z.enum(["info", "warning", "hard_fail"]),
    count: z.number().int().min(0).max(999),
  })
  .strict();

export const NarrationRenderAuditSchema = z
  .object({
    generatedBy: z.literal("deterministic_post_validator"),
    usedSourceIds: NarrationIdentifierArraySchema,
    findings: z.array(NarrationRenderAuditFindingSchema).max(64),
    hardPass: z.boolean(),
    warningCount: z.number().int().min(0).max(999),
  })
  .strict()
  .superRefine((audit, context) => {
    if (
      audit.hardPass &&
      audit.findings.some(({ severity }) => severity === "hard_fail")
    ) {
      context.addIssue({
        code: "custom",
        path: ["hardPass"],
        message: "hardPass must be false when any finding is a hard failure.",
      });
    }
  });

/** PENELOPE-NARRATIVE-PIPELINE-ENVELOPE root; never model-produced. */
export const NarrationPipelineEnvelopeSchema = z
  .object({
    modelOutput: ModelNarrationOutputSchema,
    renderAudit: NarrationRenderAuditSchema,
  })
  .strict();

export const NarrationLeverEnforcementSchema = z.enum([
  "prompt_owner",
  "deterministic_check",
  "heuristic",
  "human_review",
]);

const NarrationLeverMetaFields = {
  whyNeeded: z.string().min(1).max(500),
  changesWith: z.string().min(1).max(300),
  enforcement: NarrationLeverEnforcementSchema,
  overtighteningFailure: z.string().min(1).max(400),
} as const;

const narrationLever = <T extends z.ZodType>(value: T) =>
  z.object({ value, ...NarrationLeverMetaFields }).strict();

const uniqueEnumArray = <T extends z.ZodType>(item: T) =>
  z.array(item).superRefine((values, context) => {
    addDuplicateIssues(
      values.map((value) => JSON.stringify(value)),
      "style lever value",
      context,
    );
  });

const NarrativeDistanceValueSchema = z.enum([
  "close_limited",
  "medium",
  "distant",
]);
const NarrativeTenseValueSchema = z.enum(["present", "past"]);

export const NarrationSentenceLengthValueSchema = z
  .object({
    medianWordsMin: z.number().int().min(3).max(30),
    medianWordsMax: z.number().int().min(3).max(40),
    hardMaxWords: z.number().int().min(10).max(60),
    shortSentenceShareMin: z.number().min(0).max(1),
  })
  .strict();

export const NarrationDialogueDensityValueSchema = z
  .object({
    defaultLinesPerScene: z.literal(0),
    maxLinesPerScene: z.number().int().min(0).max(4),
    requiresLicense: z.literal(true),
  })
  .strict();

export const NarrationFigurativeBudgetValueSchema = z
  .object({
    maxFigurativePerScene: z.number().int().min(0).max(2),
    allowedBasis: uniqueEnumArray(
      z.literal("physical_sensory_grounded"),
    ).min(1),
    personifiedAbstractionsAllowed: z.literal(false),
  })
  .strict();

export const NarrationAbstractionBudgetValueSchema = z
  .object({
    maxAbstractNounsPerScene: z.number().int().min(0).max(6),
    narratorEpistemicNounsAllowed: z.literal(false),
  })
  .strict();

export const NarrationEndingModeValueSchema = z.enum([
  "in_world_open",
  "in_world_settled",
  "in_world_closure",
]);

const PenelopeEnglishStyleLeversSchema = z
  .object({
    narrativeDistance: z
      .object({
        value: NarrativeDistanceValueSchema,
        allowedRange: uniqueEnumArray(NarrativeDistanceValueSchema).min(1),
        ...NarrationLeverMetaFields,
      })
      .strict(),
    tense: z
      .object({
        value: NarrativeTenseValueSchema,
        allowedRange: uniqueEnumArray(NarrativeTenseValueSchema).min(1),
        ...NarrationLeverMetaFields,
      })
      .strict(),
    focalization: narrationLever(
      z.enum(["single_focal_strict", "single_focal_soft"]),
    ),
    actorNamingFrequency: narrationLever(
      z
        .object({
          firstReference: z.literal("name_or_render_descriptor"),
          subsequentReference: z.enum([
            "pronoun_until_ambiguity",
            "name_each_paragraph",
          ]),
          epithetsAllowed: z.literal(false),
        })
        .strict(),
    ),
    sentenceLengthDistribution: narrationLever(
      NarrationSentenceLengthValueSchema,
    ),
    clauseComplexityCeiling: narrationLever(
      z
        .object({
          maxSubordinateClausesPerSentence: z.number().int().min(0).max(4),
          nestedParentheticalsAllowed: z.boolean(),
        })
        .strict(),
    ),
    dialogueDensity: narrationLever(NarrationDialogueDensityValueSchema),
    dialogueFunctionAllowlist: narrationLever(
      uniqueEnumArray(NarrationSpeechActSchema).min(1),
    ),
    expositionBudget: narrationLever(
      z
        .object({
          maxOrientationSentencesPerScene: z.number().int().min(0).max(4),
          backstoryAllowed: z.literal(false),
        })
        .strict(),
    ),
    figurativeLanguageBudget: narrationLever(
      NarrationFigurativeBudgetValueSchema,
    ),
    abstractionBudget: narrationLever(NarrationAbstractionBudgetValueSchema),
    temporalOrderPolicy: narrationLever(
      z.enum([
        "strict_chronological",
        "chronological_with_licensed_recall",
      ]),
    ),
    objectSpaceUsagePolicy: narrationLever(
      z
        .object({
          registeredAnchorsOnly: z.literal(true),
          minCausalAnchorUseInTurnScenes: z.number().int().min(0).max(3),
        })
        .strict(),
    ),
    endingMode: narrationLever(
      z
        .object({
          setup: NarrationEndingModeValueSchema,
          turn: NarrationEndingModeValueSchema,
          aftermath: NarrationEndingModeValueSchema,
          transition: NarrationEndingModeValueSchema,
          ending: NarrationEndingModeValueSchema,
        })
        .strict(),
    ),
    forbiddenConstructionIds: narrationLever(
      NarrationAuthorityIdentifierArraySchema.min(1),
    ),
    translationRobustnessReview: narrationLever(
      z
        .object({
          layer: z.literal("heuristic_advisory"),
          humanConfirmationRequired: z.literal(true),
        })
        .strict(),
    ),
  })
  .strict();

export const PenelopeNarrativeStyleStateSchema = z
  .object({
    stateId: NarrationAuthorityIdentifierSchema,
    trigger: z.string().min(1).max(300),
    leverOverrides: z
      .object({
        sentenceLengthDistribution:
          NarrationSentenceLengthValueSchema.optional(),
        abstractionBudget: NarrationAbstractionBudgetValueSchema.optional(),
        dialogueDensity: NarrationDialogueDensityValueSchema.optional(),
        figurativeLanguageBudget:
          NarrationFigurativeBudgetValueSchema.optional(),
      })
      .strict(),
    factInvariance: z.literal(true),
  })
  .strict();

/** PENELOPE-ENGLISH-STYLE-PROFILE root. */
export const PenelopeEnglishStyleProfileSchema = z
  .object({
    profileId: NarrationAuthorityIdentifierSchema,
    languageTag: z.literal("en"),
    version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/u),
    status: z.enum(["agent_proposed", "creator_locked"]),
    levers: PenelopeEnglishStyleLeversSchema,
    styleStates: z.array(PenelopeNarrativeStyleStateSchema).min(1).max(6),
    correctionIngestion: z
      .object({
        policy: z.literal("additive_under_lock"),
        entries: z.array(
          z
            .object({
              creatorCorrectionReceiptId:
                NarrationAuthorityIdentifierSchema,
              ruleId: NarrationAuthorityIdentifierSchema,
              date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u),
            })
            .strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const WorldNarratorFactSchema = z
  .object({
    factId: IdentifierSchema,
    summary: EnglishTextSchema(600),
  })
  .strict();

export const WorldNarratorResolvedEventSchema = z
  .object({
    eventId: IdentifierSchema,
    source: z.enum(["player", "npc", "world"]),
    summary: EnglishTextSchema(800),
  })
  .strict();

export const WorldNarratorStyleConstraintSchema = z
  .object({
    constraintId: IdentifierSchema,
    ownership: z.enum(["creator_owned_original", "agent_proposed"]),
    instruction: EnglishTextSchema(400),
  })
  .strict();

export const WorldNarratorNextActionSchema = z
  .object({
    actionId: IdentifierSchema,
    actorEntityId: IdentifierSchema,
    actionTypeId: IdentifierSchema,
    label: EnglishTextSchema(160),
    intent: EnglishTextSchema(800),
  })
  .strict();

/**
 * The complete model-facing boundary. Hidden world truth, canon mutation,
 * effects, branch IDs, and facilitator-only state intentionally have no field.
 *
 * @deprecated Legacy runtime authority retained only until Lane D migrates the
 * renderer path to ModelFacingNarrationRequestSchema.
 */
export const WorldNarrationRequestSchema = z
  .object({
    focalEntityId: IdentifierSchema,
    observableFacts: z.array(WorldNarratorFactSchema).min(1).max(24),
    focalKnowledge: z.array(WorldNarratorFactSchema).max(24),
    resolvedEvents: z.array(WorldNarratorResolvedEventSchema).min(1).max(8),
    previousVisibleSceneSummary: EnglishTextSchema(1_600).nullable(),
    styleConstraints: z
      .array(WorldNarratorStyleConstraintSchema)
      .min(1)
      .max(8),
    nextActionCandidates: z
      .array(WorldNarratorNextActionSchema)
      .max(3),
  })
  .strict()
  .superRefine((request, context) => {
    addDuplicateIssues(
      [
        ...request.observableFacts.map(({ factId }) => factId),
        ...request.focalKnowledge.map(({ factId }) => factId),
      ],
      "world narrator fact",
      context,
    );
    addDuplicateIssues(
      request.resolvedEvents.map(({ eventId }) => eventId),
      "world narrator event",
      context,
    );
    addDuplicateIssues(
      request.styleConstraints.map(({ constraintId }) => constraintId),
      "world narrator style constraint",
      context,
    );
    addDuplicateIssues(
      request.nextActionCandidates.map(({ actionId }) => actionId),
      "world narrator next action",
      context,
    );
  });

export const WorldNarrationGroundingSchema = z
  .object({
    factIds: z.array(IdentifierSchema),
    eventIds: z.array(IdentifierSchema),
  })
  .strict()
  .superRefine((grounding, context) => {
    addDuplicateIssues(grounding.factIds, "narration grounding fact", context);
    addDuplicateIssues(grounding.eventIds, "narration grounding event", context);
  });

export const WorldNarrationSegmentSchema = z
  .object({
    segmentId: IdentifierSchema,
    text: EnglishTextSchema(2_400),
    grounding: WorldNarrationGroundingSchema,
  })
  .strict();

const orderedUnique = (values: ReadonlyArray<string>): Array<string> => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

/**
 * @deprecated Legacy runtime authority retained only until Lane D migrates the
 * renderer path to ModelNarrationOutputSchema and NarrationPipelineEnvelopeSchema.
 */
export const WorldNarrationSchema = z
  .object({
    title: EnglishTextSchema(160),
    prose: EnglishTextSchema(12_000),
    segments: z.array(WorldNarrationSegmentSchema).min(1).max(12),
    grounding: WorldNarrationGroundingSchema,
    nextActions: z.array(WorldNarratorNextActionSchema).max(3),
  })
  .strict()
  .superRefine((narration, context) => {
    const words = countEnglishSceneWords(narration.prose);
    if (words < 120 || words > 180) {
      context.addIssue({
        code: "custom",
        path: ["prose"],
        message: `World narration must contain 120 through 180 English words; received ${words}.`,
      });
    }
    if (narration.grounding.factIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["grounding", "factIds"],
        message: "World narration must cite at least one supplied fact.",
      });
    }

    addDuplicateIssues(
      narration.segments.map(({ segmentId }) => segmentId),
      "world narration segment",
      context,
    );

    const composedProse = narration.segments
      .map(({ text }) => text)
      .join("\n\n");
    if (narration.prose !== composedProse) {
      context.addIssue({
        code: "custom",
        path: ["prose"],
        message: "World narration prose must exactly concatenate its ordered segments.",
      });
    }

    const segmentFactIds = orderedUnique(
      narration.segments.flatMap(({ grounding }) => grounding.factIds),
    );
    const segmentEventIds = orderedUnique(
      narration.segments.flatMap(({ grounding }) => grounding.eventIds),
    );
    if (!equalIdSets(narration.grounding.factIds, segmentFactIds)) {
      context.addIssue({
        code: "custom",
        path: ["grounding", "factIds"],
        message: "Top-level fact grounding must match the facts cited by segments.",
      });
    }
    if (!equalIdSets(narration.grounding.eventIds, segmentEventIds)) {
      context.addIssue({
        code: "custom",
        path: ["grounding", "eventIds"],
        message: "Top-level event grounding must match the events cited by segments.",
      });
    }
  });

/** Post-generation scope data. This is never part of WorldNarrationRequest. */
export const WorldNarrationWithheldFactSchema = z
  .object({
    factId: IdentifierSchema,
    forbiddenPhrases: z.array(EnglishTextSchema(240)).min(1).max(8),
  })
  .strict();

const RestrictedConceptPhraseSchema = EnglishTextSchema(160);

export const WorldNarrationRestrictedEquivalenceSchema = z
  .object({
    subjectTerms: z.array(RestrictedConceptPhraseSchema).min(1).max(16),
    relationTerms: z.array(RestrictedConceptPhraseSchema).min(1).max(16),
    objectTerms: z.array(RestrictedConceptPhraseSchema).min(1).max(16),
    maxTokenDistance: z.number().int().min(3).max(40),
  })
  .strict()
  .superRefine((equivalence, context) => {
    addDuplicateIssues(
      equivalence.subjectTerms.map(normalizeLeakText),
      "restricted concept subject term",
      context,
    );
    addDuplicateIssues(
      equivalence.relationTerms.map(normalizeLeakText),
      "restricted concept relation term",
      context,
    );
    addDuplicateIssues(
      equivalence.objectTerms.map(normalizeLeakText),
      "restricted concept object term",
      context,
    );
  });

/**
 * Creator-only post-generation scope. Specific aliases and equivalences must
 * never be serialized into WorldNarrationRequest or sent to a model.
 */
export const WorldNarrationRestrictedConceptSchema = z
  .object({
    conceptId: IdentifierSchema,
    unlockFactId: IdentifierSchema,
    forbiddenTerms: z.array(RestrictedConceptPhraseSchema).min(1).max(16),
    equivalences: z
      .array(WorldNarrationRestrictedEquivalenceSchema)
      .min(1)
      .max(4),
  })
  .strict()
  .superRefine((concept, context) => {
    addDuplicateIssues(
      concept.forbiddenTerms.map(normalizeLeakText),
      "restricted concept forbidden term",
      context,
    );
  });

export const WorldNarrationValidationCodeSchema = z.enum([
  "request_invalid",
  "narration_invalid",
  "fact_not_visible",
  "event_not_supplied",
  "resolved_event_omitted",
  "next_actions_mutated",
  "hidden_fact_leak",
  "restricted_concept_leak",
]);

const normalizeLeakText = (text: string): string =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

type TokenSpan = { start: number; end: number };

const tokenSpans = (tokens: string[], phrase: string): TokenSpan[] => {
  const phraseTokens = normalizeLeakText(phrase).split(/\s+/u).filter(Boolean);
  if (phraseTokens.length === 0 || phraseTokens.length > tokens.length) return [];
  const spans: TokenSpan[] = [];
  for (let start = 0; start <= tokens.length - phraseTokens.length; start += 1) {
    if (phraseTokens.every((token, offset) => tokens[start + offset] === token)) {
      spans.push({ start, end: start + phraseTokens.length - 1 });
    }
  }
  return spans;
};

const phraseAppears = (tokens: string[], phrase: string): boolean =>
  tokenSpans(tokens, phrase).length > 0;

export const worldNarrationTextMatchesRestrictedConcept = ({
  text,
  concept,
}: {
  text: string;
  concept: WorldNarrationRestrictedConcept;
}): boolean => {
  const parsed = WorldNarrationRestrictedConceptSchema.parse(concept);
  const tokens = normalizeLeakText(text).split(/\s+/u).filter(Boolean);
  if (parsed.forbiddenTerms.some((term) => phraseAppears(tokens, term))) {
    return true;
  }

  return parsed.equivalences.some((equivalence) => {
    const subjectSpans = equivalence.subjectTerms.flatMap((term) =>
      tokenSpans(tokens, term),
    );
    const relationSpans = equivalence.relationTerms.flatMap((term) =>
      tokenSpans(tokens, term),
    );
    const objectSpans = equivalence.objectTerms.flatMap((term) =>
      tokenSpans(tokens, term),
    );
    return subjectSpans.some((subject) =>
      objectSpans.some((object) => {
        const windowStart = Math.min(subject.start, object.start);
        const windowEnd = Math.max(subject.end, object.end);
        if (windowEnd - windowStart + 1 > equivalence.maxTokenDistance) {
          return false;
        }
        return relationSpans.some(
          (relation) =>
            relation.start >= Math.max(0, windowStart - 3) &&
            relation.end <= windowEnd + 3,
        );
      }),
    );
  });
};

const equalIdSets = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

export const validateWorldNarration = (input: {
  request: unknown;
  narration: unknown;
  withheldFacts?: ReadonlyArray<WorldNarrationWithheldFact>;
  restrictedConcepts?: ReadonlyArray<WorldNarrationRestrictedConcept>;
}): WorldNarrationValidationResult => {
  const requestResult = WorldNarrationRequestSchema.safeParse(input.request);
  if (!requestResult.success) {
    return {
      ok: false,
      code: "request_invalid",
      message: requestResult.error.issues[0]?.message ?? "Narration request is invalid.",
    };
  }

  const narrationResult = WorldNarrationSchema.safeParse(input.narration);
  if (!narrationResult.success) {
    return {
      ok: false,
      code: "narration_invalid",
      message:
        narrationResult.error.issues[0]?.message ?? "World narration is invalid.",
    };
  }

  const withheldResult = z
    .array(WorldNarrationWithheldFactSchema)
    .safeParse(input.withheldFacts ?? []);
  if (!withheldResult.success) {
    return {
      ok: false,
      code: "request_invalid",
      message:
        withheldResult.error.issues[0]?.message ??
        "Withheld fact validation context is invalid.",
    };
  }

  const restrictedConceptResult = z
    .array(WorldNarrationRestrictedConceptSchema)
    .safeParse(input.restrictedConcepts ?? []);
  if (!restrictedConceptResult.success) {
    return {
      ok: false,
      code: "request_invalid",
      message:
        restrictedConceptResult.error.issues[0]?.message ??
        "Restricted concept validation context is invalid.",
    };
  }

  const request = requestResult.data;
  const narration = narrationResult.data;
  const visibleFactIds = new Set([
    ...request.observableFacts.map(({ factId }) => factId),
    ...request.focalKnowledge.map(({ factId }) => factId),
  ]);
  const suppliedEventIds = new Set(
    request.resolvedEvents.map(({ eventId }) => eventId),
  );

  const unknownFactId = narration.grounding.factIds.find(
    (factId) => !visibleFactIds.has(factId),
  );
  if (unknownFactId !== undefined) {
    return {
      ok: false,
      code: "fact_not_visible",
      message: `Narration cited a fact outside the focal boundary: ${unknownFactId}`,
    };
  }

  const unknownEventId = narration.grounding.eventIds.find(
    (eventId) => !suppliedEventIds.has(eventId),
  );
  if (unknownEventId !== undefined) {
    return {
      ok: false,
      code: "event_not_supplied",
      message: `Narration cited an unresolved event: ${unknownEventId}`,
    };
  }

  if (
    !equalIdSets(
      narration.grounding.eventIds,
      request.resolvedEvents.map(({ eventId }) => eventId),
    )
  ) {
    return {
      ok: false,
      code: "resolved_event_omitted",
      message: "Narration must ground every resolved player, NPC, and world event.",
    };
  }

  if (
    JSON.stringify(narration.nextActions) !==
    JSON.stringify(request.nextActionCandidates)
  ) {
    return {
      ok: false,
      code: "next_actions_mutated",
      message: "Narration must copy runtime-supplied next actions exactly.",
    };
  }

  const visibleOutput = normalizeLeakText(
    `${narration.title}\n${narration.prose}`,
  );
  for (const withheld of withheldResult.data) {
    const leakedPhrase = withheld.forbiddenPhrases.find((phrase) => {
      const normalizedPhrase = normalizeLeakText(phrase);
      return normalizedPhrase.length > 0 && visibleOutput.includes(normalizedPhrase);
    });
    if (leakedPhrase !== undefined) {
      return {
        ok: false,
        code: "hidden_fact_leak",
        message: `Narration exposed withheld fact ${withheld.factId}.`,
      };
    }
  }

  const focalKnowledgeIds = new Set(
    request.focalKnowledge.map(({ factId }) => factId),
  );
  for (const concept of restrictedConceptResult.data) {
    if (
      !focalKnowledgeIds.has(concept.unlockFactId) &&
      worldNarrationTextMatchesRestrictedConcept({
        text: visibleOutput,
        concept,
      })
    ) {
      return {
        ok: false,
        code: "restricted_concept_leak",
        message: `Narration exposed restricted concept ${concept.conceptId}.`,
      };
    }
  }

  return { ok: true, request, narration };
};

export const WorldNarratorTraceSchema = z
  .object({
    provenance: z.enum(["fixture", "model"]),
    adapterId: IdentifierSchema,
  })
  .strict();

export const WorldNarratorOutcomeSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("completed"),
      narration: WorldNarrationSchema,
      trace: WorldNarratorTraceSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal("rejected"),
      error: z
        .object({
          code: IdentifierSchema,
          message: z.string().min(1),
        })
        .strict(),
      trace: WorldNarratorTraceSchema,
    })
    .strict(),
]);

export type NarrationPresentActor = z.infer<
  typeof NarrationPresentActorSchema
>;
export type NarrationVisibleFact = z.infer<typeof NarrationVisibleFactSchema>;
export type NarrationResolvedEvent = z.infer<
  typeof NarrationResolvedEventSchema
>;
export type NarrationAuthorizedAnchor = z.infer<
  typeof NarrationAuthorizedAnchorSchema
>;
export type ModelFacingNarrationRequest = z.infer<
  typeof ModelFacingNarrationRequestSchema
>;
export type PrivateNarrationValidationContext = z.infer<
  typeof PrivateNarrationValidationContextSchema
>;
export type PenelopeNarrationInputEnvelope = z.infer<
  typeof PenelopeNarrationInputEnvelopeSchema
>;
export type NarrationInputEnvelope = z.infer<
  typeof NarrationInputEnvelopeSchema
>;
export type NarrationPlanReceiptEntry = z.infer<
  typeof NarrationPlanReceiptEntrySchema
>;
export type NarrationReaderProse = z.infer<
  typeof NarrationReaderProseSchema
>;
export type ModelNarrationOutput = z.infer<
  typeof ModelNarrationOutputSchema
>;
export type NarrationRenderAuditFinding = z.infer<
  typeof NarrationRenderAuditFindingSchema
>;
export type NarrationRenderAudit = z.infer<
  typeof NarrationRenderAuditSchema
>;
export type NarrationPipelineEnvelope = z.infer<
  typeof NarrationPipelineEnvelopeSchema
>;
export type NarrationSentenceLengthValue = z.infer<
  typeof NarrationSentenceLengthValueSchema
>;
export type NarrationDialogueDensityValue = z.infer<
  typeof NarrationDialogueDensityValueSchema
>;
export type NarrationFigurativeBudgetValue = z.infer<
  typeof NarrationFigurativeBudgetValueSchema
>;
export type NarrationAbstractionBudgetValue = z.infer<
  typeof NarrationAbstractionBudgetValueSchema
>;
export type PenelopeNarrativeStyleState = z.infer<
  typeof PenelopeNarrativeStyleStateSchema
>;
export type PenelopeEnglishStyleProfile = z.infer<
  typeof PenelopeEnglishStyleProfileSchema
>;

export type WorldNarratorFact = z.infer<typeof WorldNarratorFactSchema>;
export type WorldNarratorResolvedEvent = z.infer<
  typeof WorldNarratorResolvedEventSchema
>;
export type WorldNarratorStyleConstraint = z.infer<
  typeof WorldNarratorStyleConstraintSchema
>;
export type WorldNarratorNextAction = z.infer<
  typeof WorldNarratorNextActionSchema
>;
/** @deprecated Use ModelFacingNarrationRequest after Lane D migration. */
export type WorldNarrationRequest = z.infer<typeof WorldNarrationRequestSchema>;
export type WorldNarrationGrounding = z.infer<
  typeof WorldNarrationGroundingSchema
>;
export type WorldNarrationSegment = z.infer<
  typeof WorldNarrationSegmentSchema
>;
/** @deprecated Use ModelNarrationOutput after Lane D migration. */
export type WorldNarration = z.infer<typeof WorldNarrationSchema>;
export type WorldNarrationWithheldFact = z.infer<
  typeof WorldNarrationWithheldFactSchema
>;
export type WorldNarrationRestrictedEquivalence = z.infer<
  typeof WorldNarrationRestrictedEquivalenceSchema
>;
export type WorldNarrationRestrictedConcept = z.infer<
  typeof WorldNarrationRestrictedConceptSchema
>;
export type WorldNarrationValidationCode = z.infer<
  typeof WorldNarrationValidationCodeSchema
>;
export type WorldNarrationValidationResult =
  | {
      ok: true;
      request: WorldNarrationRequest;
      narration: WorldNarration;
    }
  | {
      ok: false;
      code: WorldNarrationValidationCode;
      message: string;
    };
export type WorldNarratorOutcome = z.infer<typeof WorldNarratorOutcomeSchema>;

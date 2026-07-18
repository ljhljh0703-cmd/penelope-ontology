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
  PenelopeNarrationPreflightReceiptSchema,
  PenelopeScenePlanSchema,
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
            text: EnglishTextSchema(2_400),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
  .superRefine(({ paragraphs }, context) => {
    const prose = paragraphs.map(({ text }) => text).join("\n\n");
    if (prose.length > 12_000) {
      context.addIssue({
        code: "custom",
        path: ["paragraphs"],
        message: "English narration prose cannot exceed 12,000 characters.",
      });
    }
  });

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

/**
 * Renderer-only request boundary. Deterministic preflight owns private
 * validation and evidence registries; neither may cross this port.
 */
export const NarrationRendererRequestSchema = z
  .object({
    modelFacingRequest: ModelFacingNarrationRequestSchema,
    scenePlan: PenelopeScenePlanSchema,
    preflightReceipt: PenelopeNarrationPreflightReceiptSchema,
    styleProfile: PenelopeEnglishStyleProfileSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const sceneModes = [
      request.modelFacingRequest.sceneMode,
      request.scenePlan.sceneMode,
      request.preflightReceipt.sceneMode,
    ];
    if (new Set(sceneModes).size !== 1) {
      context.addIssue({
        code: "custom",
        path: ["scenePlan", "sceneMode"],
        message: "Renderer request scene modes must agree.",
      });
    }
    if (
      request.modelFacingRequest.languageProfileId !==
      request.styleProfile.profileId
    ) {
      context.addIssue({
        code: "custom",
        path: ["styleProfile", "profileId"],
        message: "Renderer request must use the selected language profile.",
      });
    }
    if (
      !request.styleProfile.styleStates.some(
        ({ stateId }) => stateId === request.modelFacingRequest.styleStateId,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["modelFacingRequest", "styleStateId"],
        message: "Renderer request must select a registered style state.",
      });
    }
    if (
      request.modelFacingRequest.referenceReceiptId !==
      request.preflightReceipt.referenceReceipt.referenceId
    ) {
      context.addIssue({
        code: "custom",
        path: ["modelFacingRequest", "referenceReceiptId"],
        message: "Renderer request must use the preflight reference receipt.",
      });
    }
    if (
      request.modelFacingRequest.focalActorId !==
      request.preflightReceipt.plainDramaticPlan.focalActorId
    ) {
      context.addIssue({
        code: "custom",
        path: ["modelFacingRequest", "focalActorId"],
        message: "Renderer request focal actor must match deterministic preflight.",
      });
    }
  });

/** Adapter-owned trace. It is not part of the model-produced output root. */
export const NarrationRendererTraceSchema = z
  .object({
    provenance: z.enum(["fixture", "model"]),
    adapterId: NarrationIdentifierSchema,
  })
  .strict();

/**
 * Result of the renderer-only port. Post-validation appends renderAudit only
 * after this boundary; the renderer can never self-certify trusted evidence.
 */
export const NarrationRendererOutcomeSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("completed"),
      modelOutput: ModelNarrationOutputSchema,
      trace: NarrationRendererTraceSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal("rejected"),
      error: z
        .object({
          code: NarrationIdentifierSchema,
          message: z.string().min(1),
        })
        .strict(),
      trace: NarrationRendererTraceSchema,
    })
    .strict(),
]);

/**
 * Bounded warning-only revision request. Hard failures never enter this port,
 * and the critic receives no render audit, private context, or trust registry.
 */
export const NarrationCriticRequestSchema = z
  .object({
    rendererRequest: NarrationRendererRequestSchema,
    priorOutput: ModelNarrationOutputSchema,
    warningRuleIds: z
      .array(z.string().regex(/^(?:AC|FC)-[A-Z0-9-]{2,24}$/u))
      .min(1)
      .max(16)
      .superRefine((values, context) =>
        addDuplicateIssues(values, "narration critic warning rule", context),
      ),
  })
  .strict();

export const WorldNarratorResolvedEventSchema = z
  .object({
    eventId: IdentifierSchema,
    source: z.enum(["player", "npc", "world"]),
    summary: EnglishTextSchema(800),
  })
  .strict();

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
export type NarrationRendererRequest = z.infer<
  typeof NarrationRendererRequestSchema
>;
export type NarrationRendererTrace = z.infer<
  typeof NarrationRendererTraceSchema
>;
export type NarrationRendererOutcome = z.infer<
  typeof NarrationRendererOutcomeSchema
>;
export type NarrationCriticRequest = z.infer<
  typeof NarrationCriticRequestSchema
>;

export type WorldNarratorResolvedEvent = z.infer<
  typeof WorldNarratorResolvedEventSchema
>;

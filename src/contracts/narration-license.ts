import { z } from "zod";

const addUniqueValueIssues = (
  values: ReadonlyArray<unknown>,
  label: string,
  context: z.RefinementCtx,
): void => {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: `Duplicate ${label}.`,
      });
    }
    seen.add(key);
  }
};

/** Identifier contract shared by the Penelope input, plan, and output roots. */
export const NarrationIdentifierSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[a-z][a-z0-9_.:-]*$/u,
    "Use a lowercase narration identifier beginning with a letter.",
  );

/**
 * The style-profile and Fable preflight source schemas deliberately permit
 * uppercase identifiers. Keep this boundary separate from the model-facing
 * Penelope identifier contract rather than silently widening it.
 */
export const NarrationAuthorityIdentifierSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_.:-]*$/u,
    "Use an authority identifier beginning with a letter.",
  );

export const NarrationIdentifierArraySchema = z
  .array(NarrationIdentifierSchema)
  .superRefine((values, context) =>
    addUniqueValueIssues(values, "narration identifier", context),
  );

export const NarrationAuthorityIdentifierArraySchema = z
  .array(NarrationAuthorityIdentifierSchema)
  .superRefine((values, context) =>
    addUniqueValueIssues(values, "authority identifier", context),
  );

export const NARRATION_SCENE_MODES = [
  "setup",
  "turn",
  "aftermath",
  "transition",
  "ending",
] as const;

export const NARRATION_SENTENCE_ROLES = [
  "orientation",
  "authorized_action",
  "observable_reaction",
  "resolved_consequence",
  "pressure",
  "licensed_dialogue",
  "in_world_stop",
] as const;

export const NARRATION_SPEECH_ACTS = [
  "request",
  "refusal",
  "question",
  "answer",
  "command",
  "warning",
  "offer",
  "commitment",
  "report_of_observable",
  "misdirection",
] as const;

export const NARRATION_LICENSE_CATEGORIES = [
  "gesture",
  "movement",
  "speech_act",
  "prop_use",
  "spatial_relation",
  "sensory_detail",
] as const;

export const NARRATION_LICENSE_ISSUERS = [
  "creator",
  "deterministic_runtime",
] as const;

export const NarrationSceneModeSchema = z.enum(NARRATION_SCENE_MODES);
export const NarrationSentenceRoleSchema = z.enum(NARRATION_SENTENCE_ROLES);
export const NarrationSpeechActSchema = z.enum(NARRATION_SPEECH_ACTS);
export const NarrationLicenseCategorySchema = z.enum(
  NARRATION_LICENSE_CATEGORIES,
);
export const NarrationLicenseIssuerSchema = z.enum(NARRATION_LICENSE_ISSUERS);

const LicensedRenderingDetailFields = {
  licenseId: NarrationIdentifierSchema,
  issuer: NarrationLicenseIssuerSchema,
  issuerAuthorityId: NarrationIdentifierSchema,
  issuedBeforeGeneration: z.literal(true),
  category: NarrationLicenseCategorySchema,
  contentBoundary: z.string().min(1).max(400),
  sourceAuthorityIds: NarrationIdentifierArraySchema.min(1),
} as const;

/** A rendering permission issued before generation at the Penelope boundary. */
export const LicensedRenderingDetailSchema = z
  .object(LicensedRenderingDetailFields)
  .strict();

/**
 * Narrow registry reference for later deterministic preflight/runtime mapping.
 * This is not a field added to WorldSimulationEvent and does not claim that the
 * current runtime already models speech as an event kind.
 */
export const NarrationSpeechEventReferenceSchema = z
  .object({
    eventId: NarrationIdentifierSchema,
    registeredKind: z.literal("speech"),
  })
  .strict();

/** Consumer-facing name used by deterministic preflight and Lane D mapping. */
export const TypedSpeechEventReferenceSchema =
  NarrationSpeechEventReferenceSchema;

const SentencePlanSchemaBase = z
  .object({
    sentencePlanId: NarrationIdentifierSchema,
    role: NarrationSentenceRoleSchema,
    actorId: NarrationIdentifierSchema.nullable(),
    speakerId: NarrationIdentifierSchema.nullable(),
    sourceFactIds: NarrationIdentifierArraySchema,
    sourceEventIds: NarrationIdentifierArraySchema,
    speechEventIds: NarrationIdentifierArraySchema,
    licensedRenderingDetailIds: NarrationIdentifierArraySchema,
    plainFunction: z.string().min(1).max(300),
    plainFunctionSourceAuthorityIds: NarrationIdentifierArraySchema.min(1),
    plainIntent: z.string().min(1).max(300).nullable(),
    plainIntentSourceAuthorityIds: NarrationIdentifierArraySchema,
    changesState: z.boolean(),
  })
  .strict();

/** PENELOPE-SENTENCE-HARNESS SentencePlan. */
export const PenelopeSentencePlanSchema = SentencePlanSchemaBase.superRefine(
  (plan, context) => {
    if (
      plan.sourceFactIds.length === 0 &&
      plan.sourceEventIds.length === 0 &&
      plan.speechEventIds.length === 0 &&
      plan.licensedRenderingDetailIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "A sentence plan must bind to at least one source.",
      });
    }

    if (
      (plan.plainIntent === null &&
        plan.plainIntentSourceAuthorityIds.length !== 0) ||
      (plan.plainIntent !== null &&
        plan.plainIntentSourceAuthorityIds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["plainIntentSourceAuthorityIds"],
        message: "Plain intent and its source authority IDs must agree.",
      });
    }

    if (
      plan.role === "authorized_action" &&
      (plan.actorId === null || plan.sourceEventIds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "An authorized action requires an actor and a source event.",
      });
    }
    if (
      plan.role === "observable_reaction" &&
      plan.sourceEventIds.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceEventIds"],
        message: "An observable reaction requires a source event.",
      });
    }
    if (
      plan.role === "resolved_consequence" &&
      (plan.sourceEventIds.length === 0 || !plan.changesState)
    ) {
      context.addIssue({
        code: "custom",
        message: "A resolved consequence requires a source event and state change.",
      });
    }

    if (plan.role === "licensed_dialogue") {
      if (
        plan.speakerId === null ||
        plan.plainIntent === null ||
        (plan.speechEventIds.length === 0 &&
          plan.licensedRenderingDetailIds.length === 0)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Licensed dialogue requires a speaker, plain intent, and speech authority.",
        });
      }
    } else if (plan.speechEventIds.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["speechEventIds"],
        message: "Only licensed dialogue may cite speech event IDs.",
      });
    }

    if (
      ["orientation", "pressure", "in_world_stop"].includes(plan.role) &&
      plan.changesState
    ) {
      context.addIssue({
        code: "custom",
        path: ["changesState"],
        message: `${plan.role} cannot change state.`,
      });
    }
    if (
      plan.changesState &&
      ![
        "authorized_action",
        "observable_reaction",
        "resolved_consequence",
      ].includes(plan.role)
    ) {
      context.addIssue({
        code: "custom",
        path: ["role"],
        message: "A state-changing sentence requires an event-bearing role.",
      });
    }
  },
);

const sceneModeRolePolicy = {
  setup: {
    allowed: new Set([
      "orientation",
      "pressure",
      "licensed_dialogue",
      "in_world_stop",
    ]),
    required: ["orientation", "in_world_stop"],
  },
  turn: {
    allowed: new Set(NARRATION_SENTENCE_ROLES),
    required: [
      "authorized_action",
      "observable_reaction",
      "resolved_consequence",
      "in_world_stop",
    ],
  },
  aftermath: {
    allowed: new Set([
      "orientation",
      "observable_reaction",
      "resolved_consequence",
      "pressure",
      "licensed_dialogue",
      "in_world_stop",
    ]),
    required: ["resolved_consequence", "in_world_stop"],
  },
  transition: {
    allowed: new Set(["orientation", "in_world_stop"]),
    required: ["orientation", "in_world_stop"],
  },
  ending: {
    allowed: new Set([
      "orientation",
      "resolved_consequence",
      "pressure",
      "licensed_dialogue",
      "in_world_stop",
    ]),
    required: ["resolved_consequence", "in_world_stop"],
  },
} as const;

/** PENELOPE-SENTENCE-HARNESS root. */
export const PenelopeScenePlanSchema = z
  .object({
    scenePlanId: NarrationIdentifierSchema,
    sceneMode: NarrationSceneModeSchema,
    sentencePlans: z.array(PenelopeSentencePlanSchema).min(2).max(14),
  })
  .strict()
  .superRefine((scene, context) => {
    const policy = sceneModeRolePolicy[scene.sceneMode];
    if (scene.sceneMode === "transition" && scene.sentencePlans.length > 5) {
      context.addIssue({
        code: "custom",
        path: ["sentencePlans"],
        message: "A transition scene may contain at most five sentence plans.",
      });
    }
    for (const [index, plan] of scene.sentencePlans.entries()) {
      if (!policy.allowed.has(plan.role)) {
        context.addIssue({
          code: "custom",
          path: ["sentencePlans", index, "role"],
          message: `${plan.role} is not allowed in ${scene.sceneMode} mode.`,
        });
      }
      if (
        ["setup", "transition"].includes(scene.sceneMode) &&
        plan.changesState
      ) {
        context.addIssue({
          code: "custom",
          path: ["sentencePlans", index, "changesState"],
          message: `${scene.sceneMode} scenes cannot change state.`,
        });
      }
    }
    for (const requiredRole of policy.required) {
      if (!scene.sentencePlans.some(({ role }) => role === requiredRole)) {
        context.addIssue({
          code: "custom",
          path: ["sentencePlans"],
          message: `${scene.sceneMode} mode requires ${requiredRole}.`,
        });
      }
    }
  });

export const FableNarrativeLicensedRenderingDetailSchema = z
  .object({
    licenseId: NarrationAuthorityIdentifierSchema,
    issuer: NarrationLicenseIssuerSchema,
    issuerAuthorityId: NarrationAuthorityIdentifierSchema,
    issuedBeforeGeneration: z.literal(true),
    category: NarrationLicenseCategorySchema,
    contentBoundary: z.string().min(1).max(400),
    sourceAuthorityIds: NarrationAuthorityIdentifierArraySchema.min(1),
  })
  .strict();

export const FableNarrativeAuthorityTextSchema = z
  .object({
    text: z.string().min(1).max(400),
    sourceAuthorityIds: NarrationAuthorityIdentifierArraySchema.min(1),
  })
  .strict();

export const FableNarrativeSceneAuthoritySchema = z
  .object({
    factIds: NarrationAuthorityIdentifierArraySchema,
    eventIds: NarrationAuthorityIdentifierArraySchema,
    actorEntityIds: NarrationAuthorityIdentifierArraySchema.min(1),
    licensedRenderingDetailIds: NarrationAuthorityIdentifierArraySchema,
    licensedRenderingDetails: z
      .array(FableNarrativeLicensedRenderingDetailSchema)
      .max(12),
  })
  .strict();

export const FableNarrativeReferenceReceiptSchema = z
  .object({
    status: z.enum(["available", "unavailable"]),
    referenceId: NarrationAuthorityIdentifierSchema,
    transferableTechniqueIds:
      NarrationAuthorityIdentifierArraySchema.max(2),
    sceneApplicability: z
      .array(
        z
          .object({
            techniqueId: NarrationAuthorityIdentifierSchema,
            plainReason: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(2),
    forbiddenImitation: z.literal(true),
    excludedGimmicks: NarrationAuthorityIdentifierArraySchema.min(1),
  })
  .strict()
  .superRefine((receipt, context) => {
    const mustHaveTechniques = receipt.status === "available";
    if (
      (mustHaveTechniques &&
        (receipt.transferableTechniqueIds.length === 0 ||
          receipt.sceneApplicability.length === 0)) ||
      (!mustHaveTechniques &&
        (receipt.transferableTechniqueIds.length !== 0 ||
          receipt.sceneApplicability.length !== 0))
    ) {
      context.addIssue({
        code: "custom",
        message: "Reference availability and technique selection must agree.",
      });
    }
  });

export const FableNarrativePlainDramaticPlanSchema = z
  .object({
    focalActorId: NarrationAuthorityIdentifierSchema,
    immediateWant: FableNarrativeAuthorityTextSchema.optional(),
    immediateObstacle: FableNarrativeAuthorityTextSchema.optional(),
    actionSourceEventIds: NarrationAuthorityIdentifierArraySchema,
    reactionSourceEventIds: NarrationAuthorityIdentifierArraySchema,
    changeSourceEventIds: NarrationAuthorityIdentifierArraySchema,
    changeInPlainTerms: FableNarrativeAuthorityTextSchema.optional(),
  })
  .strict();

export const FableNarrativeDialogueAuthoritySchema = z
  .object({
    mode: z.enum(["none", "licensed"]),
    speakerId: NarrationAuthorityIdentifierSchema.nullable(),
    speechAct: NarrationSpeechActSchema.nullable(),
    speechEventIds: NarrationAuthorityIdentifierArraySchema,
    speechActLicenseIds: NarrationAuthorityIdentifierArraySchema,
    authorizedContentIds: NarrationAuthorityIdentifierArraySchema,
    plainIntent: z.string().min(1).max(300).nullable(),
    plainIntentSourceAuthorityIds: NarrationAuthorityIdentifierArraySchema,
  })
  .strict()
  .superRefine((authority, context) => {
    if (authority.mode === "none") {
      if (
        authority.speakerId !== null ||
        authority.speechAct !== null ||
        authority.speechEventIds.length !== 0 ||
        authority.speechActLicenseIds.length !== 0 ||
        authority.authorizedContentIds.length !== 0 ||
        authority.plainIntent !== null ||
        authority.plainIntentSourceAuthorityIds.length !== 0
      ) {
        context.addIssue({
          code: "custom",
          message: "Dialogue authority mode none must carry no dialogue data.",
        });
      }
      return;
    }
    if (
      authority.speakerId === null ||
      authority.speechAct === null ||
      authority.authorizedContentIds.length === 0 ||
      authority.plainIntent === null ||
      authority.plainIntentSourceAuthorityIds.length === 0 ||
      (authority.speechEventIds.length === 0 &&
        authority.speechActLicenseIds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Licensed dialogue requires a speaker, speech act, bounded intent, and typed speech authority.",
      });
    }
  });

/** FABLE-NARRATIVE-PREFLIGHT root. */
export const FableNarrativePreflightSchema = z
  .object({
    preflightId: NarrationAuthorityIdentifierSchema,
    sceneMode: NarrationSceneModeSchema,
    sceneAuthority: FableNarrativeSceneAuthoritySchema,
    referenceReceipt: FableNarrativeReferenceReceiptSchema,
    plainDramaticPlan: FableNarrativePlainDramaticPlanSchema,
    dialogueAuthority: FableNarrativeDialogueAuthoritySchema,
    additionalDialogueAuthorities: z
      .array(FableNarrativeDialogueAuthoritySchema)
      .max(3)
      .optional(),
    creatorReviewRequired: z.literal(true),
  })
  .strict()
  .superRefine((receipt, context) => {
    const additional = receipt.additionalDialogueAuthorities ?? [];
    if (additional.some(({ mode }) => mode !== "licensed")) {
      context.addIssue({
        code: "custom",
        path: ["additionalDialogueAuthorities"],
        message: "Every additional dialogue authority must be licensed.",
      });
    }
    if (receipt.dialogueAuthority.mode === "none" && additional.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["dialogueAuthority"],
        message:
          "A scene with additional dialogue authorities requires one licensed primary authority.",
      });
    }
    const licensedAuthorities = [
      receipt.dialogueAuthority,
      ...additional,
    ].filter(({ mode }) => mode === "licensed");
    addUniqueValueIssues(
      licensedAuthorities.flatMap(({ speechEventIds }) => speechEventIds),
      "dialogue authority speech event",
      context,
    );
    addUniqueValueIssues(
      licensedAuthorities.flatMap(({ speechActLicenseIds }) =>
        speechActLicenseIds,
      ),
      "dialogue authority speech license",
      context,
    );
    const plan = receipt.plainDramaticPlan;
    switch (receipt.sceneMode) {
      case "turn":
        if (
          plan.changeInPlainTerms === undefined ||
          plan.actionSourceEventIds.length === 0 ||
          plan.reactionSourceEventIds.length === 0 ||
          plan.changeSourceEventIds.length === 0
        ) {
          context.addIssue({
            code: "custom",
            path: ["plainDramaticPlan"],
            message: "Turn preflight requires action, reaction, and change authority.",
          });
        }
        break;
      case "setup":
      case "transition":
        if (
          plan.changeInPlainTerms !== undefined ||
          plan.actionSourceEventIds.length !== 0 ||
          plan.reactionSourceEventIds.length !== 0 ||
          plan.changeSourceEventIds.length !== 0
        ) {
          context.addIssue({
            code: "custom",
            path: ["plainDramaticPlan"],
            message: `${receipt.sceneMode} preflight cannot assert a change beat.`,
          });
        }
        break;
      case "aftermath":
        if (
          plan.actionSourceEventIds.length !== 0 ||
          plan.changeSourceEventIds.length === 0
        ) {
          context.addIssue({
            code: "custom",
            path: ["plainDramaticPlan"],
            message: "Aftermath preflight requires change without a new action.",
          });
        }
        break;
      case "ending":
        if (plan.actionSourceEventIds.length !== 0) {
          context.addIssue({
            code: "custom",
            path: ["plainDramaticPlan", "actionSourceEventIds"],
            message: "Ending preflight cannot authorize a new action.",
          });
        }
        break;
    }
  });

/** Public contract name of the FABLE-NARRATIVE-PREFLIGHT root schema. */
export const PenelopeNarrationPreflightReceiptSchema =
  FableNarrativePreflightSchema;

export type NarrationIdentifier = z.infer<typeof NarrationIdentifierSchema>;
export type NarrationAuthorityIdentifier = z.infer<
  typeof NarrationAuthorityIdentifierSchema
>;
export type NarrationSceneMode = z.infer<typeof NarrationSceneModeSchema>;
export type NarrationSentenceRole = z.infer<
  typeof NarrationSentenceRoleSchema
>;
export type NarrationSpeechAct = z.infer<typeof NarrationSpeechActSchema>;
export type NarrationLicenseCategory = z.infer<
  typeof NarrationLicenseCategorySchema
>;
export type NarrationLicenseIssuer = z.infer<
  typeof NarrationLicenseIssuerSchema
>;
export type LicensedRenderingDetail = z.infer<
  typeof LicensedRenderingDetailSchema
>;
export type NarrationSpeechEventReference = z.infer<
  typeof NarrationSpeechEventReferenceSchema
>;
export type TypedSpeechEventReference = z.infer<
  typeof TypedSpeechEventReferenceSchema
>;
export type PenelopeSentencePlan = z.infer<
  typeof PenelopeSentencePlanSchema
>;
export type PenelopeScenePlan = z.infer<typeof PenelopeScenePlanSchema>;
export type FableNarrativeAuthorityText = z.infer<
  typeof FableNarrativeAuthorityTextSchema
>;
export type FableNarrativeLicensedRenderingDetail = z.infer<
  typeof FableNarrativeLicensedRenderingDetailSchema
>;
export type FableNarrativeSceneAuthority = z.infer<
  typeof FableNarrativeSceneAuthoritySchema
>;
export type FableNarrativeReferenceReceipt = z.infer<
  typeof FableNarrativeReferenceReceiptSchema
>;
export type FableNarrativePlainDramaticPlan = z.infer<
  typeof FableNarrativePlainDramaticPlanSchema
>;
export type FableNarrativeDialogueAuthority = z.infer<
  typeof FableNarrativeDialogueAuthoritySchema
>;
export type FableNarrativePreflight = z.infer<
  typeof FableNarrativePreflightSchema
>;
export type PenelopeNarrationPreflightReceipt = z.infer<
  typeof PenelopeNarrationPreflightReceiptSchema
>;

import { z } from "zod";
import {
  CampaignLedgerSchema,
  CausalEffectSchema,
} from "@/src/contracts/campaign";
import {
  HashSchema,
  IdentifierSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";

export const StoryResolutionAuthorityKindSchema = z.enum([
  "user_choice",
  "gm_ruling",
  "dice",
  "condition",
  "item",
  "world_rule",
]);

export const StoryResolutionOutcomeSchema = z.enum([
  "success",
  "success_with_cost",
  "failure_with_progress",
  "catastrophic_failure",
]);

export const StoryResolutionAuthoritySchema = z
  .object({
    kind: StoryResolutionAuthorityKindSchema,
    evidenceRefs: z.array(IdentifierSchema),
  })
  .strict()
  .superRefine((authority, context) => {
    addDuplicateIssues(authority.evidenceRefs, "resolution authority evidence", context);
  });

export const ResolutionEnvelopeSchema = z
  .object({
    resolutionId: IdentifierSchema,
    choiceId: IdentifierSchema,
    authority: StoryResolutionAuthoritySchema,
    outcome: StoryResolutionOutcomeSchema,
    actionTypeId: IdentifierSchema,
    targetEntityIds: z.array(IdentifierSchema),
    effects: z.array(CausalEffectSchema).min(1).max(8),
    openedDebtEffectIds: z.array(IdentifierSchema),
    resolvedDebtEffectIds: z.array(IdentifierSchema),
    evidenceClaimIds: z.array(IdentifierSchema),
    evidenceRuleIds: z.array(IdentifierSchema),
    summary: z.string().min(1).max(800),
  })
  .strict()
  .superRefine((resolution, context) => {
    addDuplicateIssues(resolution.targetEntityIds, "resolution target entity", context);
    addDuplicateIssues(
      resolution.effects.map(({ effectId }) => effectId),
      "resolution effect",
      context,
    );
    addDuplicateIssues(resolution.openedDebtEffectIds, "opened causal debt", context);
    addDuplicateIssues(resolution.resolvedDebtEffectIds, "resolved causal debt", context);
    addDuplicateIssues(resolution.evidenceClaimIds, "resolution evidence claim", context);
    addDuplicateIssues(resolution.evidenceRuleIds, "resolution evidence rule", context);

    const opened = resolution.effects
      .filter((effect) => effect.kind === "debt_open")
      .map(({ effectId }) => effectId)
      .sort();
    const declaredOpened = [...resolution.openedDebtEffectIds].sort();
    if (JSON.stringify(opened) !== JSON.stringify(declaredOpened)) {
      context.addIssue({
        code: "custom",
        path: ["openedDebtEffectIds"],
        message: "Opened causal debt IDs must exactly match debt_open effects.",
      });
    }

    const resolved = resolution.effects
      .filter((effect) => effect.kind === "debt_resolve")
      .map((effect) => effect.debtEffectId)
      .sort();
    const declaredResolved = [...resolution.resolvedDebtEffectIds].sort();
    if (JSON.stringify(resolved) !== JSON.stringify(declaredResolved)) {
      context.addIssue({
        code: "custom",
        path: ["resolvedDebtEffectIds"],
        message: "Resolved causal debt IDs must exactly match debt_resolve targets.",
      });
    }
  });

export const StoryThreadSchema = z
  .object({
    threadId: IdentifierSchema,
    question: z.string().min(1).max(400),
    openedInScene: z.number().int().min(0).max(8),
    payoffByScene: z.number().int().min(1).max(8),
    status: z.enum(["dormant", "open", "closed"]),
  })
  .strict();

export const StoryPayoffObligationSchema = z
  .object({
    obligationId: IdentifierSchema,
    sourceChoiceId: IdentifierSchema,
    description: z.string().min(1).max(400),
    payoffByScene: z.number().int().min(1).max(8),
    status: z.enum(["dormant", "open", "paid"]),
  })
  .strict();

export const StorySpineSchema = z
  .object({
    premise: z.string().min(1).max(800),
    dramaticQuestion: z.string().min(1).max(400),
    targetEnding: z.string().min(1).max(800),
    maximumSceneCount: z.number().int().min(1).max(8),
    currentBeat: z.number().int().min(0).max(8),
    openThreads: z.array(StoryThreadSchema),
    mustPayOffObligations: z.array(StoryPayoffObligationSchema),
    forbiddenResolutions: z.array(z.string().min(1).max(400)),
  })
  .strict()
  .superRefine((spine, context) => {
    if (spine.currentBeat > spine.maximumSceneCount) {
      context.addIssue({
        code: "custom",
        path: ["currentBeat"],
        message: "The current story beat cannot exceed the maximum scene count.",
      });
    }
    addDuplicateIssues(
      spine.openThreads.map(({ threadId }) => threadId),
      "story thread",
      context,
    );
    addDuplicateIssues(
      spine.mustPayOffObligations.map(({ obligationId }) => obligationId),
      "story payoff obligation",
      context,
    );
    for (const thread of spine.openThreads) {
      if (thread.payoffByScene > spine.maximumSceneCount) {
        context.addIssue({
          code: "custom",
          path: ["openThreads"],
          message: `Thread ${thread.threadId} cannot pay off after the story ends.`,
        });
      }
    }
    for (const obligation of spine.mustPayOffObligations) {
      if (obligation.payoffByScene > spine.maximumSceneCount) {
        context.addIssue({
          code: "custom",
          path: ["mustPayOffObligations"],
          message: `Obligation ${obligation.obligationId} cannot pay off after the story ends.`,
        });
      }
    }
  });

export const CharacterDriveSchema = z
  .object({
    characterId: IdentifierSchema,
    desire: z.string().min(1).max(400),
    fear: z.string().min(1).max(400),
    tactic: z.string().min(1).max(400),
    redLine: z.string().min(1).max(400),
    relationshipPressure: z.string().min(1).max(400),
  })
  .strict();

export const StoryStyleProfileSchema = z
  .object({
    styleProfileId: IdentifierSchema,
    label: z.string().min(1).max(160),
    pointOfView: z.enum(["limited_first", "limited_third", "omniscient"]),
    tense: z.enum(["past", "present"]),
    rhythm: z.string().min(1).max(400),
    dialogueAndSubtext: z.string().min(1).max(400),
    recurringImages: z.array(z.string().min(1).max(160)).min(1).max(4),
    forbiddenHabits: z.array(z.string().min(1).max(240)).min(1).max(8),
    microExamples: z
      .array(
        z
          .object({
            constraint: z.string().min(1).max(240),
            example: z.string().min(1).max(400),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();

export const StoryActionAuthoritySchema = z
  .object({
    choiceId: IdentifierSchema,
    actionTypeId: IdentifierSchema,
    actorEntityId: IdentifierSchema.nullable(),
  })
  .strict();

export const StoryActionBoundarySchema = z
  .object({
    performedAction: StoryActionAuthoritySchema,
    underwayActions: z.array(StoryActionAuthoritySchema).max(2),
    reservedNextActions: z.array(StoryActionAuthoritySchema).max(2),
  })
  .strict()
  .superRefine((boundary, context) => {
    const all = [
      boundary.performedAction,
      ...boundary.underwayActions,
      ...boundary.reservedNextActions,
    ];
    addDuplicateIssues(
      all.map(({ choiceId }) => choiceId),
      "story action boundary choice",
      context,
    );
    for (const reserved of boundary.reservedNextActions) {
      if (reserved.actorEntityId === null) {
        context.addIssue({
          code: "custom",
          path: ["reservedNextActions"],
          message: "A reserved next action requires its authorized actor.",
        });
      }
    }
  });

export const SceneContractSchema = z
  .object({
    sceneNumber: z.number().int().min(1).max(8),
    focalCharacterId: IdentifierSchema,
    presentSpeakerIds: z.array(IdentifierSchema).min(1).max(3),
    goal: z.string().min(1).max(500),
    opposition: z.string().min(1).max(500),
    inheritedConsequenceIds: z.array(IdentifierSchema),
    requiredDramaticTurn: z.string().min(1).max(500),
    stateDeltaEffectIds: z.array(IdentifierSchema).min(1),
    forwardPressure: z.string().min(1).max(500),
    closedThreadIds: z.array(IdentifierSchema),
    openedThreadIds: z.array(IdentifierSchema),
    openedObligationIds: z.array(IdentifierSchema),
    paidObligationIds: z.array(IdentifierSchema),
    actionBoundary: StoryActionBoundarySchema,
  })
  .strict()
  .superRefine((scene, context) => {
    addDuplicateIssues(scene.inheritedConsequenceIds, "inherited consequence", context);
    addDuplicateIssues(scene.presentSpeakerIds, "present scene speaker", context);
    if (!scene.presentSpeakerIds.includes(scene.focalCharacterId)) {
      context.addIssue({
        code: "custom",
        path: ["presentSpeakerIds"],
        message: "The focal character must be present in the scene scope.",
      });
    }
    addDuplicateIssues(scene.stateDeltaEffectIds, "scene state delta", context);
    addDuplicateIssues(scene.closedThreadIds, "closed story thread", context);
    addDuplicateIssues(scene.openedThreadIds, "opened story thread", context);
    addDuplicateIssues(scene.openedObligationIds, "opened story obligation", context);
    addDuplicateIssues(scene.paidObligationIds, "paid story obligation", context);
  });

export const StoryChoiceSchema = z
  .object({
    choiceId: IdentifierSchema,
    actionTypeId: IdentifierSchema,
    actorEntityId: IdentifierSchema,
    label: z.string().min(1).max(160),
    intent: z.string().min(1).max(800),
    source: z.enum(["direct", "suggested"]),
  })
  .strict();

export const StoryChoiceHistoryEntrySchema = z
  .object({
    choiceId: IdentifierSchema,
    actorEntityId: IdentifierSchema,
    intent: z.string().min(1).max(800),
    interpretation: z.string().min(1).max(800),
    source: z.enum(["direct", "suggested"]),
    sceneNumber: z.number().int().min(2).max(8),
    resolutionId: IdentifierSchema,
  })
  .strict();

export const StoryProseSegmentSchema = z
  .object({
    segmentId: IdentifierSchema,
    kind: z.enum(["narration", "dialogue"]),
    speakerId: IdentifierSchema.nullable(),
    text: z.string().min(1).max(2_000),
    groundingClaimIds: z.array(IdentifierSchema),
    echoedEffectIds: z.array(IdentifierSchema),
  })
  .strict()
  .superRefine((segment, context) => {
    if (segment.kind === "narration" && segment.speakerId !== null) {
      context.addIssue({
        code: "custom",
        path: ["speakerId"],
        message: "Narration cannot declare a dialogue speaker.",
      });
    }
    if (segment.kind === "dialogue" && segment.speakerId === null) {
      context.addIssue({
        code: "custom",
        path: ["speakerId"],
        message: "Dialogue requires a speaker.",
      });
    }
    addDuplicateIssues(segment.groundingClaimIds, "segment grounding claim", context);
    addDuplicateIssues(segment.echoedEffectIds, "segment echoed effect", context);
  });

const wordCount = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;

const hasExcessiveContentWordRepetition = (text: string): boolean => {
  const stopWords = new Set([
    "about", "after", "again", "against", "before", "could", "every", "their",
    "there", "these", "those", "through", "under", "where", "which", "while",
    "would",
  ]);
  const words = text
    .toLocaleLowerCase("en-US")
    .match(/[a-z]+/gu)
    ?.filter((word) => word.length >= 5 && !stopWords.has(word)) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const ceiling = Math.max(8, Math.ceil(wordCount(text) * 0.08));
  return [...counts.values()].some((count) => count > ceiling);
};

export const StorySceneDraftSchema = z
  .object({
    title: z.string().min(1).max(160),
    prose: z.string().min(1),
    segments: z.array(StoryProseSegmentSchema).min(1),
    suggestedContinuations: z.array(StoryChoiceSchema).max(2),
    actionBoundary: StoryActionBoundarySchema,
    centralQuestionClosed: z.boolean(),
    residualHook: z.string().min(1).max(400).nullable(),
  })
  .strict()
  .superRefine((draft, context) => {
    const words = wordCount(draft.prose);
    if (words < 110 || words > 220) {
      context.addIssue({
        code: "custom",
        path: ["prose"],
        message: `A story scene must contain 110 through 220 English words; received ${words}.`,
      });
    }
    if (hasExcessiveContentWordRepetition(draft.prose)) {
      context.addIssue({
        code: "custom",
        path: ["prose"],
        message: "Scene prose repeats one content word too mechanically.",
      });
    }
    addDuplicateIssues(
      draft.segments.map(({ segmentId }) => segmentId),
      "story prose segment",
      context,
    );
    addDuplicateIssues(
      draft.suggestedContinuations.map(({ choiceId }) => choiceId),
      "suggested continuation",
      context,
    );
    if (draft.actionBoundary.underwayActions.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["actionBoundary", "underwayActions"],
        message: "A scene cannot begin a reserved next action before the user chooses it.",
      });
    }
    const expectedReserved = draft.suggestedContinuations.map(
      ({ choiceId, actionTypeId, actorEntityId }) => ({
        choiceId,
        actionTypeId,
        actorEntityId,
      }),
    );
    if (
      JSON.stringify(draft.actionBoundary.reservedNextActions) !==
      JSON.stringify(expectedReserved)
    ) {
      context.addIssue({
        code: "custom",
        path: ["actionBoundary", "reservedNextActions"],
        message: "Reserved next actions must exactly match the visible continuation authority.",
      });
    }
    const derivedProse = draft.segments.map(({ text }) => text).join("\n\n");
    if (draft.prose !== derivedProse) {
      context.addIssue({
        code: "custom",
        path: ["prose"],
        message: "Scene prose must be the exact ordered concatenation of structured segment text.",
      });
    }
  });

export const ScopedStoryClaimSchema = z
  .object({
    claimId: IdentifierSchema,
    summary: z.string().min(1),
  })
  .strict();

export const ScopedStoryKnowledgePayloadSchema = z
  .object({
    focalCharacterId: IdentifierSchema,
    presentSpeakerIds: z.array(IdentifierSchema).min(1).max(3),
    allowedClaimIds: z.array(IdentifierSchema),
    withheldClaimIds: z.array(IdentifierSchema),
    claims: z.array(ScopedStoryClaimSchema),
    context: z.string().min(1),
  })
  .strict();

export const ScopedStoryKnowledgeSchema = z
  .object({
    ...ScopedStoryKnowledgePayloadSchema.shape,
    scopeHash: HashSchema,
  })
  .strict();

export const StoryProcessDiagnosticsSchema = z
  .object({
    exitCode: z.number().int().nullable(),
    signal: z.string().min(1).nullable(),
    timedOut: z.boolean(),
    stdoutBytes: z.number().int().nonnegative(),
    stderrBytes: z.number().int().nonnegative(),
    stdoutSha256: HashSchema,
    stderrSha256: HashSchema,
  })
  .strict();

export const StoryModelTraceSchema = z
  .object({
    mode: z.enum(["fixture", "codex_cli", "responses_api"]),
    requestedModel: z.string().min(1),
    actualModel: z.string().min(1).nullable(),
    responseId: z.string().min(1).nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    outputSha256: HashSchema.nullable(),
    processDiagnostics: StoryProcessDiagnosticsSchema.nullable(),
  })
  .strict();

export const StoryModelRequestSchema = z
  .object({
    scenarioId: IdentifierSchema,
    sceneNumber: z.number().int().min(1).max(8),
    outputLocale: z.literal("en"),
    spine: StorySpineSchema,
    characterDrives: z.array(CharacterDriveSchema).min(1),
    styleProfile: StoryStyleProfileSchema,
    acceptedChoice: StoryChoiceSchema,
    allowedNextChoices: z.array(StoryChoiceSchema).max(2),
    choiceHistory: z.array(StoryChoiceHistoryEntrySchema).max(7),
    resolution: ResolutionEnvelopeSchema,
    resolutionInterpretation: z
      .object({
        attemptedIntent: z.string().min(1).max(800),
        interpretation: z.string().min(1).max(800),
        failedReason: z.string().min(1).max(500).nullable(),
        progress: z.string().min(1).max(500),
        cost: z.string().min(1).max(500),
      })
      .strict(),
    sceneContract: SceneContractSchema,
    knowledgeScope: ScopedStoryKnowledgeSchema,
    causalContext: z.string().min(1).max(16_384),
    previousScene: StorySceneDraftSchema.nullable(),
  })
  .strict();

const StoryModelErrorSchema = z
  .object({
    code: IdentifierSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();

export const StoryModelOutcomeSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("completed"),
      draft: StorySceneDraftSchema,
      trace: StoryModelTraceSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.enum([
        "refused",
        "timeout",
        "configuration_error",
        "schema_error",
        "process_error",
      ]),
      error: StoryModelErrorSchema,
      trace: StoryModelTraceSchema,
    })
    .strict(),
]);

export const StorySceneSchema = z
  .object({
    sceneId: IdentifierSchema,
    sceneNumber: z.number().int().min(1).max(8),
    resolution: ResolutionEnvelopeSchema,
    contract: SceneContractSchema,
    ...StorySceneDraftSchema.shape,
    echoedEffectIds: z.array(IdentifierSchema),
    sceneHash: HashSchema,
  })
  .strict()
  .superRefine((scene, context) => {
    const performed = scene.contract.actionBoundary.performedAction;
    if (
      performed.choiceId !== scene.resolution.choiceId ||
      performed.actionTypeId !== scene.resolution.actionTypeId
    ) {
      context.addIssue({
        code: "custom",
        path: ["contract", "actionBoundary", "performedAction"],
        message: "The performed scene action must match its resolution choice and action type.",
      });
    }
    if (
      JSON.stringify(scene.actionBoundary) !==
      JSON.stringify(scene.contract.actionBoundary)
    ) {
      context.addIssue({
        code: "custom",
        path: ["actionBoundary"],
        message: "The draft action report must exactly match the registered scene boundary.",
      });
    }
  });

export const StorySessionPayloadSchema = z
  .object({
    sessionId: IdentifierSchema,
    scenarioId: IdentifierSchema,
    worldPackId: IdentifierSchema,
    worldPackVersion: z.string().min(1),
    focalEntityId: IdentifierSchema,
    currentSceneNumber: z.number().int().min(0).max(8),
    status: z.enum(["active", "completed"]),
    spine: StorySpineSchema,
    characterDrives: z.array(CharacterDriveSchema).min(1),
    styleProfile: StoryStyleProfileSchema,
    storyStateHash: HashSchema,
    ledger: CampaignLedgerSchema,
    scenes: z.array(StorySceneSchema).max(8),
    selectedChoiceIds: z.array(IdentifierSchema),
    choiceHistory: z.array(StoryChoiceHistoryEntrySchema).max(7),
  })
  .strict();

export const StorySessionSchema = z
  .object({
    ...StorySessionPayloadSchema.shape,
    sessionHash: HashSchema,
  })
  .strict();

export const StoryTurnRequestSchema = z
  .object({
    session: StorySessionSchema,
    choice: StoryChoiceSchema,
  })
  .strict();

export const StartStorySessionRequestSchema = z
  .object({
    scenarioId: IdentifierSchema.optional(),
  })
  .strict();

export const StorySessionBootstrapSchema = z
  .object({
    scenario: z
      .object({
        id: IdentifierSchema,
        title: z.string().min(1),
        dramaticQuestion: z.string().min(1),
        maximumSceneCount: z.number().int().min(1).max(8),
      })
      .strict(),
    session: StorySessionSchema,
    opening: StorySceneSchema,
    choices: z.array(StoryChoiceSchema).min(2),
  })
  .strict();

export const StoryTurnResultSchema = z
  .object({
    status: z.enum(["advanced", "completed"]),
    session: StorySessionSchema,
    scene: StorySceneSchema,
    resolution: ResolutionEnvelopeSchema,
    whatChanged: z.array(CausalEffectSchema).min(1),
    causalContext: z.string().min(1).max(16_384),
    knowledgeScope: ScopedStoryKnowledgeSchema,
    trace: StoryModelTraceSchema,
  })
  .strict();

export const StoryOntologySchema = z
  .object({
    knownEntityIds: z.array(IdentifierSchema).min(1),
    activeClaimIds: z.array(IdentifierSchema),
    activeRuleIds: z.array(IdentifierSchema),
    actionTypeIds: z.array(IdentifierSchema).min(1),
    relationAxisIds: z.array(IdentifierSchema),
    resourceIds: z.array(IdentifierSchema),
    flagIds: z.array(IdentifierSchema),
    clockIds: z.array(IdentifierSchema),
    debtKindIds: z.array(IdentifierSchema),
  })
  .strict();

export const StoryFixtureTurnSchema = z
  .object({
    branchId: IdentifierSchema,
    sceneNumber: z.number().int().min(1).max(8),
    priorChoiceIds: z.array(IdentifierSchema),
    acceptedChoiceIds: z.array(IdentifierSchema).min(1),
    defaultChoiceId: IdentifierSchema,
    resolution: ResolutionEnvelopeSchema,
    contract: SceneContractSchema,
    draft: StorySceneDraftSchema,
  })
  .strict();

export const StoryOpeningFixtureSchema = z
  .object({
    resolution: ResolutionEnvelopeSchema,
    contract: SceneContractSchema,
    draft: StorySceneDraftSchema,
  })
  .strict();

export const StoryScenarioSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: IdentifierSchema,
    title: z.string().min(1),
    worldPackId: IdentifierSchema,
    worldPackVersion: z.string().min(1),
    baseCanonHash: HashSchema,
    baseStateHash: HashSchema,
    focalEntityId: IdentifierSchema,
    participantId: IdentifierSchema,
    opening: StoryOpeningFixtureSchema,
    spine: StorySpineSchema,
    characterDrives: z.array(CharacterDriveSchema).min(1),
    styleProfile: StoryStyleProfileSchema,
    ontology: StoryOntologySchema,
    choices: z.array(StoryChoiceSchema).min(2),
    fixtureTurns: z.array(StoryFixtureTurnSchema).min(1),
  })
  .strict()
  .superRefine((scenario, context) => {
    addDuplicateIssues(
      scenario.characterDrives.map(({ characterId }) => characterId),
      "story character drive",
      context,
    );
    addDuplicateIssues(
      scenario.choices.map(({ choiceId }) => choiceId),
      "story scenario choice",
      context,
    );
    addDuplicateIssues(
      scenario.fixtureTurns.map(({ branchId }) => branchId),
      "story fixture branch",
      context,
    );
    for (const choice of scenario.choices) {
      if (!scenario.ontology.actionTypeIds.includes(choice.actionTypeId)) {
        context.addIssue({
          code: "custom",
          path: ["choices"],
          message: `Choice ${choice.choiceId} uses inactive action type ${choice.actionTypeId}.`,
        });
      }
      if (!scenario.ontology.knownEntityIds.includes(choice.actorEntityId)) {
        context.addIssue({
          code: "custom",
          path: ["choices"],
          message: `Choice ${choice.choiceId} uses unknown actor ${choice.actorEntityId}.`,
        });
      }
    }
    const openingPerformed = scenario.opening.contract.actionBoundary.performedAction;
    if (
      JSON.stringify(scenario.opening.contract.actionBoundary) !==
        JSON.stringify(scenario.opening.draft.actionBoundary) ||
      openingPerformed.choiceId !== scenario.opening.resolution.choiceId ||
      openingPerformed.actionTypeId !== scenario.opening.resolution.actionTypeId ||
      openingPerformed.actorEntityId !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["opening", "contract", "actionBoundary"],
        message: "The opening action boundary must report its world action and reserve choices without an actor transfer.",
      });
    }
    if (scenario.opening.contract.sceneNumber !== 1) {
      context.addIssue({
        code: "custom",
        path: ["opening", "contract", "sceneNumber"],
        message: "The formal opening must be visible Scene 1.",
      });
    }
    if (scenario.opening.resolution.authority.kind !== "world_rule") {
      context.addIssue({
        code: "custom",
        path: ["opening", "resolution", "authority", "kind"],
        message: "The opening scene must enter through world-rule authority.",
      });
    }
    if (
      scenario.opening.draft.centralQuestionClosed ||
      scenario.opening.draft.suggestedContinuations.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["opening", "draft"],
        message: "The nonterminal opening must keep the central question open and expose a real choice.",
      });
    }
    const expectedTurnNumbers = Array.from(
      { length: scenario.spine.maximumSceneCount - 1 },
      (_, index) => index + 2,
    );
    if (
      expectedTurnNumbers.some(
        (sceneNumber) =>
          !scenario.fixtureTurns.some((turn) => turn.sceneNumber === sceneNumber),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["fixtureTurns"],
        message: "Fixture branches must cover every visible scene after the opening.",
      });
    }
    for (const turn of scenario.fixtureTurns) {
      if (turn.contract.sceneNumber !== turn.sceneNumber) {
        context.addIssue({
          code: "custom",
          path: ["fixtureTurns"],
          message: `Scene contract ${turn.contract.sceneNumber} does not match fixture turn ${turn.sceneNumber}.`,
        });
      }
      if (!turn.acceptedChoiceIds.includes(turn.defaultChoiceId)) {
        context.addIssue({
          code: "custom",
          path: ["fixtureTurns"],
          message: `Fixture turn ${turn.sceneNumber} has an unaccepted default choice.`,
        });
      }
      const registeredChoice = scenario.choices.find(
        ({ choiceId }) => choiceId === turn.defaultChoiceId,
      );
      const performed = turn.contract.actionBoundary.performedAction;
      if (
        !registeredChoice ||
        performed.choiceId !== registeredChoice.choiceId ||
        performed.actionTypeId !== registeredChoice.actionTypeId ||
        performed.actorEntityId !== registeredChoice.actorEntityId ||
        turn.resolution.choiceId !== registeredChoice.choiceId ||
        turn.resolution.actionTypeId !== registeredChoice.actionTypeId ||
        JSON.stringify(turn.contract.actionBoundary) !==
          JSON.stringify(turn.draft.actionBoundary)
      ) {
        context.addIssue({
          code: "custom",
          path: ["fixtureTurns"],
          message: `Fixture branch ${turn.branchId} must report the selected action and actor exactly once.`,
        });
      }
      if (turn.priorChoiceIds.length !== turn.sceneNumber - 2) {
        context.addIssue({
          code: "custom",
          path: ["fixtureTurns"],
          message: `Fixture branch ${turn.branchId} has the wrong prior-choice depth.`,
        });
      }
      const terminal = turn.sceneNumber === scenario.spine.maximumSceneCount;
      if (
        terminal &&
        (!turn.draft.centralQuestionClosed ||
          turn.draft.suggestedContinuations.length !== 0 ||
          !turn.contract.closedThreadIds.includes("thread.red_sail_question"))
      ) {
        context.addIssue({
          code: "custom",
          path: ["fixtureTurns"],
          message: `Terminal branch ${turn.branchId} must close the central question and expose no continuation choice.`,
        });
      }
      if (
        !terminal &&
        (turn.draft.centralQuestionClosed || turn.draft.suggestedContinuations.length === 0)
      ) {
        context.addIssue({
          code: "custom",
          path: ["fixtureTurns"],
          message: `Nonterminal branch ${turn.branchId} must keep the question open and expose a real continuation.`,
        });
      }
    }
    for (const openingChoice of scenario.opening.draft.suggestedContinuations) {
      if (
        !scenario.fixtureTurns.some(
          (turn) =>
            turn.sceneNumber === 2 && turn.acceptedChoiceIds.includes(openingChoice.choiceId),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["fixtureTurns"],
          message: `Visible opening choice ${openingChoice.choiceId} has no real Scene 2 branch.`,
        });
      }
    }
    for (const turn of scenario.fixtureTurns) {
      if (turn.sceneNumber >= scenario.spine.maximumSceneCount) continue;
      for (const nextChoice of turn.draft.suggestedContinuations) {
        const expectedPriorChoices = [...turn.priorChoiceIds, turn.defaultChoiceId];
        const hasNextBranch = scenario.fixtureTurns.some(
          (candidate) =>
            candidate.sceneNumber === turn.sceneNumber + 1 &&
            JSON.stringify(candidate.priorChoiceIds) ===
              JSON.stringify(expectedPriorChoices) &&
            candidate.acceptedChoiceIds.includes(nextChoice.choiceId),
        );
        if (!hasNextBranch) {
          context.addIssue({
            code: "custom",
            path: ["fixtureTurns"],
            message: `Visible choice ${nextChoice.choiceId} in ${turn.branchId} has no exact next-scene branch.`,
          });
        }
      }
    }
  });

export type ResolutionEnvelope = z.infer<typeof ResolutionEnvelopeSchema>;
export type StorySpine = z.infer<typeof StorySpineSchema>;
export type CharacterDrive = z.infer<typeof CharacterDriveSchema>;
export type StoryStyleProfile = z.infer<typeof StoryStyleProfileSchema>;
export type StoryActionAuthority = z.infer<typeof StoryActionAuthoritySchema>;
export type StoryActionBoundary = z.infer<typeof StoryActionBoundarySchema>;
export type SceneContract = z.infer<typeof SceneContractSchema>;
export type StoryChoice = z.infer<typeof StoryChoiceSchema>;
export type StoryChoiceHistoryEntry = z.infer<typeof StoryChoiceHistoryEntrySchema>;
export type StoryProseSegment = z.infer<typeof StoryProseSegmentSchema>;
export type StorySceneDraft = z.infer<typeof StorySceneDraftSchema>;
export type ScopedStoryKnowledgePayload = z.infer<typeof ScopedStoryKnowledgePayloadSchema>;
export type ScopedStoryKnowledge = z.infer<typeof ScopedStoryKnowledgeSchema>;
export type StoryProcessDiagnostics = z.infer<typeof StoryProcessDiagnosticsSchema>;
export type StoryModelTrace = z.infer<typeof StoryModelTraceSchema>;
export type StoryModelRequest = z.infer<typeof StoryModelRequestSchema>;
export type StoryModelOutcome = z.infer<typeof StoryModelOutcomeSchema>;
export type StoryScene = z.infer<typeof StorySceneSchema>;
export type StorySessionPayload = z.infer<typeof StorySessionPayloadSchema>;
export type StorySession = z.infer<typeof StorySessionSchema>;
export type StoryTurnRequest = z.infer<typeof StoryTurnRequestSchema>;
export type StartStorySessionRequest = z.infer<typeof StartStorySessionRequestSchema>;
export type StorySessionBootstrap = z.infer<typeof StorySessionBootstrapSchema>;
export type StoryTurnResult = z.infer<typeof StoryTurnResultSchema>;
export type StoryScenario = z.infer<typeof StoryScenarioSchema>;

import { createHash } from "node:crypto";
import { z } from "zod";
import { HashSchema, IdentifierSchema } from "@/src/contracts/common";
import {
  WorldSimulationScenarioSchema,
  type WorldSimulationScenario,
} from "@/src/contracts/world-simulation";
import { WorldSimulationEventSchema } from "@/src/contracts/world-runtime";

export const PENELOPE_WORLD_PACK_FORMAT = "penelope_world_pack" as const;
export const PENELOPE_WORLD_PACK_SCHEMA_VERSION = 1 as const;

const PackTextSchema = z.string().trim().min(12).max(800);
const PackNameSchema = z.string().trim().min(1).max(120);
const PackVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/u, "Use a semantic version such as 1.0.0.");
const RenderTextSchema = z.string().trim().min(3).max(1_200);
const RenderTextByIdSchema = z.record(IdentifierSchema, RenderTextSchema);

export const WorldPackProvenanceSchema = z
  .object({
    kind: z.enum(["public_domain", "creator_owned", "licensed", "original"]),
    sourceTitle: PackNameSchema,
    sourceEdition: z.string().trim().min(1).max(160),
    sourceUrl: z.string().url().nullable(),
    rightsNote: PackTextSchema,
    sourceStatus: z.enum(["source_checked", "creator_attested", "license_recorded"]),
  })
  .strict()
  .superRefine((provenance, context) => {
    if (
      provenance.kind === "public_domain" &&
      (provenance.sourceUrl === null || provenance.sourceStatus !== "source_checked")
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "A public-domain pack needs a checked public source URL.",
      });
    }
    if (
      provenance.kind === "creator_owned" &&
      provenance.sourceStatus !== "creator_attested"
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceStatus"],
        message: "A creator-owned pack must be creator-attested.",
      });
    }
    if (provenance.kind === "licensed" && provenance.sourceStatus !== "license_recorded") {
      context.addIssue({
        code: "custom",
        path: ["sourceStatus"],
        message: "A licensed pack must record its license status.",
      });
    }
  });

export const WorldPackPresentationSchema = z
  .object({
    publicTitle: PackNameSchema,
    publicSubtitle: z.string().trim().min(1).max(180),
    hook: PackTextSchema,
    sourceEyebrow: z.string().trim().min(3).max(120),
    sourceIntroduction: PackTextSchema,
    productThesis: PackTextSchema,
    participantSummary: PackTextSchema,
    guidedCreatorMove: z
      .object({
        actionText: z.string().trim().min(3).max(800),
        helperText: z.string().trim().min(3).max(300),
        forkBeforeAction: z.boolean(),
      })
      .strict(),
    // The portable envelope can grow language lanes later, but this runtime
    // currently renders only the reviewed English lane. Do not let a pack
    // advertise an output language that the renderer cannot actually serve.
    defaultLocale: z.literal("en"),
    availableLocales: z.tuple([z.literal("en")]),
    demoOrder: z.number().int().positive().max(99),
  })
  .strict()
  .superRefine((presentation, context) => {
    if (!presentation.availableLocales.includes(presentation.defaultLocale)) {
      context.addIssue({
        code: "custom",
        path: ["availableLocales"],
        message: "The default locale must be included in availableLocales.",
      });
    }
    if (new Set(presentation.availableLocales).size !== presentation.availableLocales.length) {
      context.addIssue({
        code: "custom",
        path: ["availableLocales"],
        message: "availableLocales must not contain duplicates.",
      });
    }
  });

export const WorldPackActionVocabularySchema = z
  .object({
    actionId: IdentifierSchema,
    creatorFacingLabel: PackNameSchema,
    cueTerms: z
      .array(
        z
          .string()
          .trim()
          .min(2)
          .max(48)
          .regex(/^[\p{L}\p{N}][\p{L}\p{N} '-]*$/u, "Use plain action cue terms."),
      )
      .min(1)
      .max(12),
    praise: PackTextSchema,
  })
  .strict()
  .superRefine(({ cueTerms }, context) => {
    const normalized = cueTerms.map((term) => term.toLocaleLowerCase("en-US"));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: "custom",
        path: ["cueTerms"],
        message: "Action cue terms must be unique without case differences.",
      });
    }
  });

export const WorldPackCreatorInputSchema = z
  .object({
    recommendedActionPolicies: z
      .array(
        z
          .object({
            whenFlagId: IdentifierSchema.nullable(),
            whenFlagValue: z.boolean().nullable(),
            actionIds: z.array(IdentifierSchema).min(1).max(3),
          })
          .strict()
          .superRefine((policy, context) => {
            if ((policy.whenFlagId === null) !== (policy.whenFlagValue === null)) {
              context.addIssue({
                code: "custom",
                message: "A conditional recommendation needs both a flag id and value.",
              });
            }
          }),
      )
      .min(1)
      .max(6),
    actionVocabulary: z.array(WorldPackActionVocabularySchema).min(2).max(18),
    tacitKnowledgePrompts: z
      .object({
        desiredOutcome: PackTextSchema,
        characterMotive: PackTextSchema,
        acceptedCost: PackTextSchema,
      })
      .strict(),
    unsupportedMechanisms: z
      .array(
        z
          .object({
            cueTerms: z.array(z.string().trim().min(2).max(48)).min(1).max(12),
            explanation: PackTextSchema,
          })
          .strict(),
      )
      .max(12),
    expansionPrompt: PackTextSchema,
  })
  .strict();

export const WorldPackIdentityPolicySchema = z
  .object({
    actorAliases: z
      .array(
        z
          .object({
            entityId: IdentifierSchema,
            modelFacingEntityId: IdentifierSchema,
            renderText: RenderTextSchema,
          })
          .strict(),
      )
      .max(12),
    hiddenKnowledge: z
      .array(
        z
          .object({
            premiseId: IdentifierSchema,
            privateKnowledgeId: IdentifierSchema,
            withheldPremiseIds: z.array(IdentifierSchema).max(24),
            forbiddenPatterns: z.array(z.string().trim().min(2).max(120)).min(1).max(12),
          })
          .strict(),
      )
      .max(24),
    creatorMayInspectHiddenState: z.literal(true),
  })
  .strict();

export const WorldPackRenderPolicySchema = z
  .object({
    tense: z.enum(["present", "past"]),
    pointOfView: z.enum(["close_third", "limited_third", "omniscient"]),
    sceneModes: z
      .array(z.enum(["setup", "pressure", "revelation", "aftermath", "ending"]))
      .min(1)
      .max(5),
    prohibitedTerms: z.array(z.string().trim().min(2).max(80)).max(24),
    openingEvent: WorldSimulationEventSchema,
    unsupportedActionText: RenderTextSchema,
    zoneActiveText: RenderTextSchema,
    zoneCompleteText: RenderTextSchema,
    actorRenderTextById: RenderTextByIdSchema,
    registeredEventTextByActionId: RenderTextByIdSchema,
    currentEventTextByActionId: RenderTextByIdSchema,
    currentReactionTextByRuleId: RenderTextByIdSchema,
    currentTurnConsequenceTextByActionId: RenderTextByIdSchema,
    registeredEndingTextById: RenderTextByIdSchema,
    currentEndingTextById: RenderTextByIdSchema,
    participantEndingTextByKind: RenderTextByIdSchema,
    lockedEventTextByActionId: RenderTextByIdSchema,
    criticalFlagIds: z.array(IdentifierSchema).max(8),
    setupStopActorId: IdentifierSchema,
    endingStopActorId: IdentifierSchema,
  })
  .strict()
  .superRefine(({ sceneModes, prohibitedTerms }, context) => {
    if (new Set(sceneModes).size !== sceneModes.length) {
      context.addIssue({
        code: "custom",
        path: ["sceneModes"],
        message: "sceneModes must not contain duplicates.",
      });
    }
    const normalizedTerms = prohibitedTerms.map((term) => term.toLocaleLowerCase("en-US"));
    if (new Set(normalizedTerms).size !== normalizedTerms.length) {
      context.addIssue({
        code: "custom",
        path: ["prohibitedTerms"],
        message: "prohibitedTerms must not contain duplicates without case differences.",
      });
    }
  });

const WorldPackBaseSchema = z
  .object({
    format: z.literal(PENELOPE_WORLD_PACK_FORMAT),
    schemaVersion: z.literal(PENELOPE_WORLD_PACK_SCHEMA_VERSION),
    packId: IdentifierSchema,
    packVersion: PackVersionSchema,
    provenance: WorldPackProvenanceSchema,
    presentation: WorldPackPresentationSchema,
    creatorInput: WorldPackCreatorInputSchema,
    identityPolicy: WorldPackIdentityPolicySchema,
    renderPolicy: WorldPackRenderPolicySchema,
    scenario: WorldSimulationScenarioSchema,
  })
  .strict();

type ParticipantVisibleStaticText = Readonly<{
  path: ReadonlyArray<string | number>;
  text: string;
}>;

const normalizedSecretSurfaceText = (text: string): string =>
  text.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();

/**
 * Static text emitted before any world action must not disclose a fact that a
 * pack marks hidden. This is deliberately a narrow seal-time check, not a
 * ban on a character asking a direct question or a later registered reveal.
 *
 * It scans only the initial participant/narrator surfaces: participantSummary,
 * the focal-visible opening event, the opening action's setup render text,
 * the focal zone's public text, and text for actors initially present with the
 * focal actor. It deliberately excludes out-of-world source/hook copy,
 * creatorInput prompts and explanations, source locators, premise bodies,
 * agendas, provenance, and all action/reaction/ending render text. Later
 * action output remains the responsibility of the dynamic narration and
 * knowledge validators, where an authorized reveal can be distinguished from
 * an unsolicited disclosure.
 */
const preActionParticipantStaticText = (
  pack: z.infer<typeof WorldPackBaseSchema>,
): ParticipantVisibleStaticText[] => {
  const entries: ParticipantVisibleStaticText[] = [];
  const add = (path: Array<string | number>, text: string): void => {
    entries.push({ path, text });
  };
  const { presentation, scenario, identityPolicy, renderPolicy } = pack;
  add(["presentation", "participantSummary"], presentation.participantSummary);
  const focalZoneId = scenario.actors.find(
    ({ id }) => id === scenario.focalParticipantEntityId,
  )?.currentZoneId;
  const focalZone = scenario.zones.find(({ id }) => id === focalZoneId);
  if (focalZone) {
    add(["scenario", "zones", scenario.zones.indexOf(focalZone), "name"], focalZone.name);
    add(["scenario", "zones", scenario.zones.indexOf(focalZone), "summary"], focalZone.summary);
  }
  add(["renderPolicy", "zoneActiveText"], renderPolicy.zoneActiveText);
  for (const [index, actor] of scenario.actors.entries()) {
    if (actor.currentZoneId !== focalZoneId) continue;
    add(["scenario", "actors", index, "participantLabel"], actor.participantLabel);
    add(["scenario", "actors", index, "publicDescription"], actor.publicDescription);
    const alias = identityPolicy.actorAliases.find(
      ({ entityId }) => entityId === actor.id,
    );
    if (alias) {
      add(
        [
          "identityPolicy",
          "actorAliases",
          identityPolicy.actorAliases.indexOf(alias),
          "renderText",
        ],
        alias.renderText,
      );
    }
    const actorRenderText = renderPolicy.actorRenderTextById[actor.id];
    if (actorRenderText) {
      add(["renderPolicy", "actorRenderTextById", actor.id], actorRenderText);
    }
  }
  if (
    renderPolicy.openingEvent.visibleToEntityIds.includes(
      scenario.focalParticipantEntityId,
    )
  ) {
    add(["renderPolicy", "openingEvent", "summary"], renderPolicy.openingEvent.summary);
    const openingRegistered =
      renderPolicy.registeredEventTextByActionId[renderPolicy.openingEvent.actionId];
    if (openingRegistered) {
      add(
        [
          "renderPolicy",
          "registeredEventTextByActionId",
          renderPolicy.openingEvent.actionId,
        ],
        openingRegistered,
      );
    }
    const openingCurrent =
      renderPolicy.currentEventTextByActionId[renderPolicy.openingEvent.actionId];
    if (openingCurrent) {
      add(
        [
          "renderPolicy",
          "currentEventTextByActionId",
          renderPolicy.openingEvent.actionId,
        ],
        openingCurrent,
      );
    }
  }
  return entries;
};

const validateWorldPackReferences = (
  pack: z.infer<typeof WorldPackBaseSchema>,
  context: z.RefinementCtx,
): void => {
  const actionIds = new Set(pack.scenario.actions.map(({ id }) => id));
  const renderActionIds = new Set([
    ...actionIds,
    pack.renderPolicy.openingEvent.actionId,
  ]);
  const actorIds = new Set(pack.scenario.actors.map(({ id }) => id));
  const premiseIds = new Set(pack.scenario.premises.map(({ id }) => id));
  const flagIds = new Set(pack.scenario.initialFlags.map(({ id }) => id));
  const reactionRuleIds = new Set(pack.scenario.reactionRules.map(({ id }) => id));
  const endingIds = new Set(pack.scenario.endingRules.map(({ id }) => id));
  const endingKinds = new Set(pack.scenario.endingRules.map(({ kind }) => kind));
  const vocabularyActionIds = pack.creatorInput.actionVocabulary.map(({ actionId }) => actionId);
  const participantActionIds = new Set(
    pack.scenario.actions
      .filter(({ actorMode, allowedActorEntityIds }) =>
        actorMode === "participant" &&
        allowedActorEntityIds.includes(pack.scenario.focalParticipantEntityId),
      )
      .map(({ id }) => id),
  );

  const requireCoverage = (
    issuePath: (string | number)[],
    label: string,
    actualValues: readonly string[],
    requiredValues: ReadonlySet<string>,
  ): void => {
    const actual = new Set(actualValues);
    for (const required of requiredValues) {
      if (!actual.has(required)) {
        context.addIssue({
          code: "custom",
          path: issuePath,
          message: `${label} is missing required render coverage: ${required}`,
        });
      }
    }
  };

  requireCoverage(
    ["renderPolicy", "actorRenderTextById"],
    "actorRenderTextById",
    Object.keys(pack.renderPolicy.actorRenderTextById),
    actorIds,
  );
  requireCoverage(
    ["renderPolicy", "registeredEventTextByActionId"],
    "registeredEventTextByActionId",
    Object.keys(pack.renderPolicy.registeredEventTextByActionId),
    renderActionIds,
  );
  requireCoverage(
    ["renderPolicy", "currentReactionTextByRuleId"],
    "currentReactionTextByRuleId",
    Object.keys(pack.renderPolicy.currentReactionTextByRuleId),
    reactionRuleIds,
  );
  requireCoverage(
    ["renderPolicy", "currentTurnConsequenceTextByActionId"],
    "currentTurnConsequenceTextByActionId",
    Object.keys(pack.renderPolicy.currentTurnConsequenceTextByActionId),
    participantActionIds,
  );
  requireCoverage(
    ["renderPolicy", "registeredEndingTextById"],
    "registeredEndingTextById",
    Object.keys(pack.renderPolicy.registeredEndingTextById),
    endingIds,
  );
  requireCoverage(
    ["renderPolicy", "currentEndingTextById"],
    "currentEndingTextById",
    Object.keys(pack.renderPolicy.currentEndingTextById),
    endingIds,
  );
  requireCoverage(
    ["renderPolicy", "participantEndingTextByKind"],
    "participantEndingTextByKind",
    Object.keys(pack.renderPolicy.participantEndingTextByKind),
    endingKinds,
  );
  requireCoverage(
    ["creatorInput", "actionVocabulary"],
    "creatorInput.actionVocabulary",
    vocabularyActionIds,
    participantActionIds,
  );

  if (new Set(vocabularyActionIds).size !== vocabularyActionIds.length) {
    context.addIssue({
      code: "custom",
      path: ["creatorInput", "actionVocabulary"],
      message: "Creator action vocabulary must name each registered action at most once.",
    });
  }
  for (const [index, actionId] of vocabularyActionIds.entries()) {
    if (!actionIds.has(actionId)) {
      context.addIssue({
        code: "custom",
        path: ["creatorInput", "actionVocabulary", index, "actionId"],
        message: `Creator action vocabulary references an unknown scenario action: ${actionId}`,
      });
    }
  }
  for (const [policyIndex, policy] of pack.creatorInput.recommendedActionPolicies.entries()) {
    if (policy.whenFlagId !== null && !flagIds.has(policy.whenFlagId)) {
      context.addIssue({
        code: "custom",
        path: ["creatorInput", "recommendedActionPolicies", policyIndex, "whenFlagId"],
        message: `Recommendation policy references an unknown scenario flag: ${policy.whenFlagId}`,
      });
    }
    for (const [actionIndex, actionId] of policy.actionIds.entries()) {
      if (!actionIds.has(actionId)) {
        context.addIssue({
          code: "custom",
          path: ["creatorInput", "recommendedActionPolicies", policyIndex, "actionIds", actionIndex],
          message: `Recommended action references an unknown scenario action: ${actionId}`,
        });
      }
      if (!participantActionIds.has(actionId)) {
        context.addIssue({
          code: "custom",
          path: ["creatorInput", "recommendedActionPolicies", policyIndex, "actionIds", actionIndex],
          message:
            `Recommended action must belong to the focal participant: ${actionId}`,
        });
      }
    }
    if (new Set(policy.actionIds).size !== policy.actionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["creatorInput", "recommendedActionPolicies", policyIndex, "actionIds"],
        message: "Recommended actions must not contain duplicates.",
      });
    }
  }
  const hasUnconditionalFallback = pack.creatorInput.recommendedActionPolicies.some(
    (policy) => policy.whenFlagId === null && policy.whenFlagValue === null,
  );
  for (const [policyIndex, policy] of pack.creatorInput.recommendedActionPolicies.entries()) {
    if (new Set(policy.actionIds).size < 2) {
      context.addIssue({
        code: "custom",
        path: ["creatorInput", "recommendedActionPolicies", policyIndex, "actionIds"],
        message:
          "Every recommendation policy must supply at least two distinct focal-participant actions for A/B.",
      });
    }
  }
  if (!hasUnconditionalFallback) {
    const conditionalValuesByFlag = new Map<string, Set<boolean>>();
    for (const policy of pack.creatorInput.recommendedActionPolicies) {
      if (policy.whenFlagId === null || policy.whenFlagValue === null) continue;
      const values = conditionalValuesByFlag.get(policy.whenFlagId) ?? new Set<boolean>();
      values.add(policy.whenFlagValue);
      conditionalValuesByFlag.set(policy.whenFlagId, values);
    }
    for (const [flagId, values] of conditionalValuesByFlag) {
      if (values.size === 2) continue;
      context.addIssue({
        code: "custom",
        path: ["creatorInput", "recommendedActionPolicies"],
        message:
          `Conditional recommendation policies for ${flagId} must cover both boolean values unless an unconditional fallback exists.`,
      });
    }
  }

  const staticText = preActionParticipantStaticText(pack);
  for (const [boundaryIndex, boundary] of pack.identityPolicy.hiddenKnowledge.entries()) {
    for (const [patternIndex, pattern] of boundary.forbiddenPatterns.entries()) {
      const normalizedPattern = normalizedSecretSurfaceText(pattern);
      for (const surface of staticText) {
        if (!normalizedSecretSurfaceText(surface.text).includes(normalizedPattern)) {
          continue;
        }
        context.addIssue({
          code: "custom",
          path: [...surface.path],
          message:
            `Participant-visible static text contains hidden-knowledge forbidden pattern from identityPolicy.hiddenKnowledge.${boundaryIndex}.forbiddenPatterns.${patternIndex}.`,
        });
      }
    }
  }
  for (const [field, values, known] of [
    ["actorAliases", pack.identityPolicy.actorAliases.map(({ entityId }) => entityId), actorIds],
    ["hiddenKnowledge", pack.identityPolicy.hiddenKnowledge.map(({ premiseId }) => premiseId), premiseIds],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        path: ["identityPolicy", field],
        message: `${field} must not contain duplicates.`,
      });
    }
    for (const [index, value] of values.entries()) {
      if (!known.has(value)) {
        context.addIssue({
          code: "custom",
          path: ["identityPolicy", field, index],
          message: `${field} references an unknown scenario identifier: ${value}`,
        });
      }
    }
  }
  const modelFacingEntityIds = pack.identityPolicy.actorAliases.map(
    ({ modelFacingEntityId }) => modelFacingEntityId,
  );
  if (new Set(modelFacingEntityIds).size !== modelFacingEntityIds.length) {
    context.addIssue({
      code: "custom",
      path: ["identityPolicy", "actorAliases"],
      message: "actorAliases must not reuse a model-facing entity identifier.",
    });
  }
  for (const [index, alias] of pack.identityPolicy.actorAliases.entries()) {
    if (
      actorIds.has(alias.modelFacingEntityId) &&
      alias.modelFacingEntityId !== alias.entityId
    ) {
      context.addIssue({
        code: "custom",
        path: ["identityPolicy", "actorAliases", index, "modelFacingEntityId"],
        message:
          "A model-facing entity identifier may not impersonate a different scenario actor.",
      });
    }
  }
  const privateKnowledgeIds = pack.identityPolicy.hiddenKnowledge.map(
    ({ privateKnowledgeId }) => privateKnowledgeId,
  );
  if (new Set(privateKnowledgeIds).size !== privateKnowledgeIds.length) {
    context.addIssue({
      code: "custom",
      path: ["identityPolicy", "hiddenKnowledge"],
      message: "hiddenKnowledge must not reuse a private knowledge identifier.",
    });
  }
  for (const [hiddenIndex, hidden] of pack.identityPolicy.hiddenKnowledge.entries()) {
    for (const [premiseIndex, premiseId] of hidden.withheldPremiseIds.entries()) {
      if (!premiseIds.has(premiseId)) {
        context.addIssue({
          code: "custom",
          path: ["identityPolicy", "hiddenKnowledge", hiddenIndex, "withheldPremiseIds", premiseIndex],
          message: `Hidden knowledge policy references an unknown scenario premise: ${premiseId}`,
        });
      }
    }
  }
  for (const actorId of [
    pack.renderPolicy.setupStopActorId,
    pack.renderPolicy.endingStopActorId,
  ]) {
    if (!actorIds.has(actorId)) {
      context.addIssue({
        code: "custom",
        path: ["renderPolicy"],
        message: `Render policy references an unknown scenario actor: ${actorId}`,
      });
    }
  }
  for (const [field, values, known] of [
    ["registeredEventTextByActionId", Object.keys(pack.renderPolicy.registeredEventTextByActionId), renderActionIds],
    ["actorRenderTextById", Object.keys(pack.renderPolicy.actorRenderTextById), actorIds],
    ["currentEventTextByActionId", Object.keys(pack.renderPolicy.currentEventTextByActionId), renderActionIds],
    ["currentReactionTextByRuleId", Object.keys(pack.renderPolicy.currentReactionTextByRuleId), reactionRuleIds],
    ["currentTurnConsequenceTextByActionId", Object.keys(pack.renderPolicy.currentTurnConsequenceTextByActionId), actionIds],
    ["registeredEndingTextById", Object.keys(pack.renderPolicy.registeredEndingTextById), endingIds],
    ["currentEndingTextById", Object.keys(pack.renderPolicy.currentEndingTextById), endingIds],
    ["participantEndingTextByKind", Object.keys(pack.renderPolicy.participantEndingTextByKind), endingKinds],
    ["lockedEventTextByActionId", Object.keys(pack.renderPolicy.lockedEventTextByActionId), renderActionIds],
    ["criticalFlagIds", pack.renderPolicy.criticalFlagIds, flagIds],
  ] as const) {
    for (const [index, value] of values.entries()) {
      if (!known.has(value)) {
        context.addIssue({
          code: "custom",
          path: ["renderPolicy", field, index],
          message: `${field} references an unknown scenario identifier: ${value}`,
        });
      }
    }
  }
  if (
    pack.renderPolicy.openingEvent.visibleToEntityIds.some(
      (entityId) => !actorIds.has(entityId),
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["renderPolicy", "openingEvent", "visibleToEntityIds"],
      message: "The opening event may only be visible to actors registered in the scenario.",
    });
  }
};

export const PenelopeWorldPackDefinitionSchema = WorldPackBaseSchema.superRefine(
  validateWorldPackReferences,
);

const definitionPayload = (pack: z.infer<typeof WorldPackBaseSchema>) => ({
  format: pack.format,
  schemaVersion: pack.schemaVersion,
  packId: pack.packId,
  packVersion: pack.packVersion,
  provenance: pack.provenance,
  presentation: pack.presentation,
  creatorInput: pack.creatorInput,
  identityPolicy: pack.identityPolicy,
  renderPolicy: pack.renderPolicy,
  scenario: pack.scenario,
});

/**
 * A deterministic SHA-256 binding of every pack field that can affect a
 * simulation, creator proposal, presentation, or renderer policy.
 */
export const computePenelopeWorldPackDigest = (
  pack: z.infer<typeof WorldPackBaseSchema>,
): string => {
  const canonicalize = (value: unknown): string => {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return JSON.stringify(value);
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError("World pack digest rejects non-finite numbers.");
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
        .join(",")}}`;
    }
    throw new TypeError("World pack digest rejects unsupported values.");
  };

  return createHash("sha256")
    .update(canonicalize(definitionPayload(pack)))
    .digest("hex");
};

export const PenelopeWorldPackV1Schema = WorldPackBaseSchema.extend({
  definitionDigest: HashSchema,
})
  .superRefine(validateWorldPackReferences)
  .superRefine((pack, context) => {
    const expectedDigest = computePenelopeWorldPackDigest(pack);
    if (pack.definitionDigest !== expectedDigest) {
      context.addIssue({
        code: "custom",
        path: ["definitionDigest"],
        message: "World pack definitionDigest does not match its canonical payload.",
      });
    }
  });

export type PenelopeWorldPackDefinition = z.infer<
  typeof PenelopeWorldPackDefinitionSchema
>;
export type PenelopeWorldPackV1 = z.infer<typeof PenelopeWorldPackV1Schema>;

export const sealPenelopeWorldPack = (
  definition: PenelopeWorldPackDefinition,
): PenelopeWorldPackV1 => {
  const parsedDefinition = PenelopeWorldPackDefinitionSchema.parse(definition);
  return PenelopeWorldPackV1Schema.parse({
    ...parsedDefinition,
    definitionDigest: computePenelopeWorldPackDigest(parsedDefinition),
  });
};

export const WorldPackSessionBindingSchema = z
  .object({
    packId: IdentifierSchema,
    packVersion: PackVersionSchema,
    definitionDigest: HashSchema,
  })
  .strict();

export type WorldPackSessionBinding = z.infer<typeof WorldPackSessionBindingSchema>;

export const bindSessionToWorldPack = (
  pack: PenelopeWorldPackV1,
): WorldPackSessionBinding =>
  WorldPackSessionBindingSchema.parse({
    packId: pack.packId,
    packVersion: pack.packVersion,
    definitionDigest: pack.definitionDigest,
  });

export const doesSessionBindingMatchWorldPack = (
  binding: WorldPackSessionBinding,
  pack: PenelopeWorldPackV1,
): boolean =>
  binding.packId === pack.packId &&
  binding.packVersion === pack.packVersion &&
  binding.definitionDigest === pack.definitionDigest;

export const scenarioFromWorldPack = (
  pack: PenelopeWorldPackV1,
): WorldSimulationScenario => pack.scenario;

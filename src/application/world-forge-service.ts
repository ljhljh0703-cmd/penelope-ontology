import {
  PenelopeWorldPackDefinitionSchema,
  sealPenelopeWorldPack,
} from "@/src/contracts/penelope-world-pack";
import {
  WORLD_FORGE_FACT_FIELD_IDS,
  WorldForgeCompileRequestSchema,
  WorldForgeCompileResponseSchema,
  type WorldForgeCompileRequest,
  type WorldForgeCompileResponse,
  type WorldForgeDraft,
  type WorldForgeFactFieldId,
} from "@/src/contracts/world-forge";
import { WorldSimulationScenarioSchema } from "@/src/contracts/world-simulation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  buildCreatorRuleApprovalSubjectFingerprint,
  fingerprintCreatorRuleApprovalReceiptPayload,
} from "@/src/domain/world-runtime";

const HASH_PLACEHOLDER = "0".repeat(64);

const text = (
  draft: WorldForgeDraft,
  fieldId: WorldForgeFactFieldId,
): string => draft[fieldId].value;

const actionAlias = (value: string, fallback: string): string => {
  const words = value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9 ]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 4);
  return words.length > 0 ? words.join(" ") : fallback;
};

const buildScenario = (draft: WorldForgeDraft) => {
  const fingerprint = sha256Canonical({
    schemaVersion: "penelope.world-forge.compiler.v1",
    draft,
  });
  const token = fingerprint.slice(0, 12);
  const scenarioId = `scenario.creator_owned.forge_${token}`;
  const focalId = `entity.forge_focal_${token}`;
  const counterpartId = `entity.forge_counterpart_${token}`;
  const zoneId = `zone.forge_scene_${token}`;
  const immutablePremiseId = `premise.forge_immutable_${token}`;
  const hiddenPremiseId = `premise.forge_hidden_${token}`;
  const alternativeFlagId = `flag.forge_alternative_${token}`;
  const recommendedFlagId = `flag.forge_recommended_${token}`;
  const clockId = `clock.forge_scene_${token}`;
  const relationshipId = `relationship.forge_focal_counterpart_${token}`;
  const sceneIds = [
    `scene.forge_setup_${token}`,
    `scene.forge_pressure_${token}`,
    `scene.forge_turn_${token}`,
    `scene.forge_reckoning_${token}`,
    `scene.forge_resolution_${token}`,
  ] as const;
  const recommendedActionId = `action.forge_recommended_${token}`;
  const alternativeActionId = `action.forge_alternative_${token}`;
  const recommendedResponseActionId = `action.forge_response_recommended_${token}`;
  const alternativeResponseActionId = `action.forge_response_alternative_${token}`;
  const recommendedReactionId = `reaction.forge_recommended_${token}`;
  const alternativeReactionId = `reaction.forge_alternative_${token}`;
  const recommendedEndingId = `ending.forge_recommended_${token}`;
  const alternativeEndingId = `ending.forge_alternative_${token}`;
  const timeoutEndingId = `ending.forge_timeout_${token}`;
  const receiptId = `receipt.creator.forge_${token}`;
  const authorityId = `creator.forge_authority_${token}`;
  const decisionId = `decision.creator.forge_rules_${token}`;
  const premiseDecisionId = `decision.creator.forge_facts_${token}`;
  const ruleIds = [
    recommendedReactionId,
    alternativeReactionId,
    recommendedEndingId,
    alternativeEndingId,
    timeoutEndingId,
  ];
  const recommendedAlias = actionAlias(
    text(draft, "recommendedAction"),
    "choose recommended path",
  );
  const proposedAlternativeAlias = actionAlias(
    text(draft, "alternativeAction"),
    "choose alternative path",
  );
  const alternativeAlias =
    proposedAlternativeAlias === recommendedAlias
      ? "choose alternative path"
      : proposedAlternativeAlias;
  const creatorRuleProvenance = (premiseIds: string[]) => ({
    basis: "creator_authored" as const,
    premiseIds,
    reviewState: "creator_approved" as const,
    canonStatus: "not_source_canon" as const,
    creatorApprovalReceiptId: receiptId,
    creatorDecisionId: decisionId,
  });

  let scenario = WorldSimulationScenarioSchema.parse({
    id: scenarioId,
    title: text(draft, "title"),
    summary: `${text(draft, "focalCharacterName")} and ${text(
      draft,
      "counterpartName",
    )} face a bounded decision at ${text(draft, "locationName")}. ${text(
      draft,
      "stakes",
    )}`,
    focalParticipantEntityId: focalId,
    maxTurns: 5,
    maxReactionsPerTurn: 1,
    sourceLocators: [
      {
        id: `source.creator.forge_${token}`,
        work: text(draft, "title"),
        book: "World Forge one-scene draft",
        passage: `Creator approval ${draft.approvedOn}`,
        url: null,
        sourceStatus: "creator_source_attested",
        checkedAt: draft.approvedOn,
        evidenceSummary:
          "The creator supplied and approved every fact used by this one-scene world pack.",
        usage: "original_summary_only",
      },
    ],
    premises: [
      {
        id: immutablePremiseId,
        summary: text(draft, "immutableFact"),
        textForm: "original_summary",
        origin: { kind: "creator", creatorDecisionId: premiseDecisionId },
        meaning: text(draft, "forbiddenDevelopment"),
        recognizerEntityIds: [focalId, counterpartId],
        stakes: [
          {
            id: `stake.forge_scene_${token}`,
            summary: text(draft, "stakes"),
            affectedEntityIds: [focalId, counterpartId],
          },
        ],
        approvalState: "creator_approved",
      },
      {
        id: hiddenPremiseId,
        summary: text(draft, "knowledgeAsymmetry"),
        textForm: "original_summary",
        origin: { kind: "creator", creatorDecisionId: premiseDecisionId },
        meaning:
          "This creator-approved knowledge boundary determines what the counterpart may reveal and what the focal character cannot assume.",
        recognizerEntityIds: [counterpartId],
        stakes: [
          {
            id: `stake.forge_knowledge_${token}`,
            summary: text(draft, "acceptedCost"),
            affectedEntityIds: [focalId, counterpartId],
          },
        ],
        approvalState: "creator_approved",
      },
    ],
    zones: [
      {
        id: zoneId,
        name: text(draft, "locationName"),
        summary: `${text(draft, "seedText")} The immediate stakes are clear: ${text(
          draft,
          "stakes",
        )}`,
        connectedZoneIds: [],
      },
    ],
    actors: [
      {
        id: focalId,
        name: text(draft, "focalCharacterName"),
        participantLabel: text(draft, "focalCharacterName"),
        simulationRole: "focal_participant",
        publicDescription: text(draft, "focalDesire"),
        currentZoneId: zoneId,
        agenda: {
          desire: text(draft, "focalDesire"),
          avoids: text(draft, "acceptedCost"),
          priority: 100,
          state: "active",
          defaultActionId: recommendedActionId,
        },
      },
      {
        id: counterpartId,
        name: text(draft, "counterpartName"),
        participantLabel: text(draft, "counterpartName"),
        simulationRole: "npc",
        publicDescription: text(draft, "counterpartDesire"),
        currentZoneId: zoneId,
        agenda: {
          desire: text(draft, "counterpartDesire"),
          avoids: text(draft, "forbiddenDevelopment"),
          priority: 90,
          state: "active",
          defaultActionId: recommendedResponseActionId,
        },
      },
    ],
    episodeBlueprint: {
      schemaVersion: 2,
      scenes: [
        {
          id: sceneIds[0],
          sequence: 1,
          role: "setup",
          title: "The world opens",
          purpose: text(draft, "seedText"),
          pressure: text(draft, "stakes"),
          completion: `The first decision is made through ${text(draft, "recommendedAction")}.`,
        },
        {
          id: sceneIds[1],
          sequence: 2,
          role: "pressure",
          title: "The cost becomes visible",
          purpose: text(draft, "sceneTwo"),
          pressure: text(draft, "relationshipPressure"),
          completion: text(draft, "acceptedCost"),
        },
        {
          id: sceneIds[2],
          sequence: 3,
          role: "turn",
          title: "The balance turns",
          purpose: text(draft, "sceneThree"),
          pressure: text(draft, "knowledgeAsymmetry"),
          completion: `The turning point answers ${text(draft, "alternativeAction")}.`,
        },
        {
          id: sceneIds[3],
          sequence: 4,
          role: "reckoning",
          title: "Earlier choices return",
          purpose: text(draft, "sceneFour"),
          pressure: text(draft, "forbiddenDevelopment"),
          completion: text(draft, "acceptedCost"),
        },
        {
          id: sceneIds[4],
          sequence: 5,
          role: "resolution",
          title: "The episode answers",
          purpose: text(draft, "sceneFive"),
          pressure: text(draft, "endingCondition"),
          completion: text(draft, "endingCondition"),
        },
      ],
    },
    relationships: [
      {
        id: relationshipId,
        subjectEntityId: focalId,
        objectEntityId: counterpartId,
        axisId: `axis.${actionAlias(text(draft, "relationshipAxis"), "trust")}`.replace(/ /gu, "_"),
        direction: "directed",
        initialLevel: 0,
        minLevel: -2,
        maxLevel: 2,
      },
    ],
    actions: [
      {
        id: recommendedActionId,
        label: text(draft, "recommendedAction"),
        summary: `${text(draft, "focalCharacterName")} chooses to ${text(
          draft,
          "recommendedAction",
        ).replace(/[.!?]+$/gu, "")}.`,
        verbAliases: [recommendedAlias],
        actorMode: "participant",
        allowedActorEntityIds: [focalId],
        targetMode: "entity",
        allowedTargetEntityIds: [counterpartId],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: text(draft, "recommendedConsequence"),
      },
      {
        id: alternativeActionId,
        label: text(draft, "alternativeAction"),
        summary: `${text(draft, "focalCharacterName")} chooses to ${text(
          draft,
          "alternativeAction",
        ).replace(/[.!?]+$/gu, "")}.`,
        verbAliases: [alternativeAlias],
        actorMode: "participant",
        allowedActorEntityIds: [focalId],
        targetMode: "entity",
        allowedTargetEntityIds: [counterpartId],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: text(draft, "alternativeConsequence"),
      },
      {
        id: recommendedResponseActionId,
        label: "Answer the recommended action",
        summary: text(draft, "recommendedConsequence"),
        verbAliases: ["answer recommended path"],
        actorMode: "npc",
        allowedActorEntityIds: [counterpartId],
        targetMode: "entity",
        allowedTargetEntityIds: [focalId],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: text(draft, "recommendedConsequence"),
      },
      {
        id: alternativeResponseActionId,
        label: "Answer the alternative action",
        summary: text(draft, "alternativeConsequence"),
        verbAliases: ["answer alternative path"],
        actorMode: "npc",
        allowedActorEntityIds: [counterpartId],
        targetMode: "entity",
        allowedTargetEntityIds: [focalId],
        allowedZoneIds: [],
        cost: { turns: 1 },
        worldMeaning: text(draft, "alternativeConsequence"),
      },
    ],
    initialPrivateKnowledge: [
      { entityId: focalId, premiseIds: [immutablePremiseId] },
      {
        entityId: counterpartId,
        premiseIds: [immutablePremiseId, hiddenPremiseId],
      },
    ],
    initialFlags: [
      { id: alternativeFlagId, value: false },
      { id: recommendedFlagId, value: false },
    ],
    clocks: [
      {
        id: clockId,
        label: "Scene pressure",
        initialValue: 0,
        maxValue: 2,
      },
    ],
    creatorRuleApprovalReceipts: [
      {
        binding: {
          receiptId,
          subjectFingerprint: HASH_PLACEHOLDER,
          issuer: "creator",
          issuerAuthorityId: authorityId,
        },
        scenarioId,
        approvedOn: draft.approvedOn,
        decisions: [{ decisionId, action: "approve", ruleIds }],
      },
    ],
    creatorRuleApprovalAuthorityRegistry: {
      creatorAuthorityIds: [authorityId],
      trustedReceipts: [
        {
          receiptId,
          subjectFingerprint: HASH_PLACEHOLDER,
          issuer: "creator",
          issuerAuthorityId: authorityId,
          payloadFingerprint: HASH_PLACEHOLDER,
        },
      ],
    },
    reactionRules: [
      {
        id: recommendedReactionId,
        actorEntityId: counterpartId,
        actionId: recommendedResponseActionId,
        priority: 100,
        summary: text(draft, "recommendedConsequence"),
        observableSummary: text(draft, "recommendedConsequence"),
        provenance: creatorRuleProvenance([hiddenPremiseId]),
        conditions: [
          {
            kind: "action_observed",
            actionId: recommendedActionId,
            actorEntityId: focalId,
          },
        ],
        effects: [
          { kind: "grant_knowledge", entityId: focalId, premiseId: hiddenPremiseId },
          { kind: "set_flag", flagId: recommendedFlagId, value: true },
          { kind: "set_flag", flagId: alternativeFlagId, value: false },
          { kind: "adjust_relationship", relationshipId, delta: 1 },
        ],
        once: false,
      },
      {
        id: alternativeReactionId,
        actorEntityId: counterpartId,
        actionId: alternativeResponseActionId,
        priority: 90,
        summary: text(draft, "alternativeConsequence"),
        observableSummary: text(draft, "alternativeConsequence"),
        provenance: creatorRuleProvenance([immutablePremiseId]),
        conditions: [
          {
            kind: "action_observed",
            actionId: alternativeActionId,
            actorEntityId: focalId,
          },
        ],
        effects: [
          { kind: "set_flag", flagId: alternativeFlagId, value: true },
          { kind: "set_flag", flagId: recommendedFlagId, value: false },
          { kind: "adjust_relationship", relationshipId, delta: -1 },
        ],
        once: false,
      },
    ],
    narrationSpeechDirectives: [],
    endingRules: [
      {
        id: recommendedEndingId,
        kind: `forge_recommended_${token}`,
        priority: 100,
        summary: `${text(draft, "endingCondition")} ${text(
          draft,
          "recommendedConsequence",
        )}`,
        provenance: creatorRuleProvenance([hiddenPremiseId]),
        conditions: [
          { kind: "flag_equals", flagId: recommendedFlagId, value: true },
          { kind: "turn_at_least", turn: 5 },
        ],
        terminal: true,
      },
      {
        id: alternativeEndingId,
        kind: `forge_alternative_${token}`,
        priority: 90,
        summary: `${text(draft, "endingCondition")} ${text(
          draft,
          "alternativeConsequence",
        )}`,
        provenance: creatorRuleProvenance([immutablePremiseId]),
        conditions: [
          { kind: "flag_equals", flagId: alternativeFlagId, value: true },
          { kind: "turn_at_least", turn: 5 },
        ],
        terminal: true,
      },
      {
        id: timeoutEndingId,
        kind: "timeout",
        priority: 1,
        summary: `${text(draft, "endingCondition")} The bounded episode closes after five accepted turns.`,
        provenance: creatorRuleProvenance([]),
        conditions: [{ kind: "turn_at_least", turn: 5 }],
        terminal: true,
      },
    ],
  });

  const subjectFingerprint = buildCreatorRuleApprovalSubjectFingerprint({
    scenario,
    receiptId,
  });
  const receipt = {
    ...scenario.creatorRuleApprovalReceipts[0]!,
    binding: {
      ...scenario.creatorRuleApprovalReceipts[0]!.binding,
      subjectFingerprint,
    },
  };
  const payloadFingerprint = fingerprintCreatorRuleApprovalReceiptPayload(receipt);
  scenario = WorldSimulationScenarioSchema.parse({
    ...scenario,
    creatorRuleApprovalReceipts: [receipt],
    creatorRuleApprovalAuthorityRegistry: {
      creatorAuthorityIds: [authorityId],
      trustedReceipts: [
        {
          receiptId,
          subjectFingerprint,
          issuer: "creator",
          issuerAuthorityId: authorityId,
          payloadFingerprint,
        },
      ],
    },
  });

  return { scenario, token };
};

export const compileWorldForgeDraft = (
  input: WorldForgeCompileRequest,
): WorldForgeCompileResponse => {
  const { draft } = WorldForgeCompileRequestSchema.parse(input);
  const { scenario, token } = buildScenario(draft);
  const focalId = scenario.focalParticipantEntityId;
  const counterpartId = scenario.actors.find(
    ({ simulationRole }) => simulationRole === "npc",
  )!.id;
  const recommendedActionId = scenario.actions[0]!.id;
  const alternativeActionId = scenario.actions[1]!.id;
  const recommendedReactionId = scenario.reactionRules[0]!.id;
  const alternativeReactionId = scenario.reactionRules[1]!.id;
  const recommendedEndingId = scenario.endingRules[0]!.id;
  const alternativeEndingId = scenario.endingRules[1]!.id;
  const timeoutEndingId = scenario.endingRules[2]!.id;
  const alternativeFlagId = scenario.initialFlags[0]!.id;
  const recommendedFlagId = scenario.initialFlags[1]!.id;
  const relationship = scenario.relationships![0]!;

  const definition = PenelopeWorldPackDefinitionSchema.parse({
    format: "penelope_world_pack",
    schemaVersion: 1,
    packId: `pack.creator_owned.forge_${token}`,
    packVersion: "2.0.0",
    provenance: {
      kind: "creator_owned",
      sourceTitle: text(draft, "title"),
      sourceEdition: "Penelope World Forge creator approval, episode schema 2",
      sourceUrl: null,
      rightsNote:
        "The creator attests ownership or authorized use of every fact entered into this private World Forge draft.",
      sourceStatus: "creator_attested",
    },
    presentation: {
      publicTitle: text(draft, "title"),
      publicSubtitle: `A creator-forged five-scene episode at ${text(draft, "locationName")}`,
      hook: text(draft, "stakes"),
      sourceEyebrow: "Creator-owned · forged inside Penelope",
      sourceIntroduction: text(draft, "seedText"),
      productThesis:
        "Penelope turns creator-approved facts into a five-scene causal episode without silently adding canon.",
      participantSummary: `${text(draft, "focalCharacterName")} must act while ${text(
        draft,
        "counterpartName",
      )} follows a separate desire. ${text(draft, "stakes")}`,
      guidedCreatorMove: {
        actionText: text(draft, "recommendedAction"),
        helperText: text(draft, "recommendedConsequence"),
        forkBeforeAction: false,
      },
      defaultLocale: "en",
      availableLocales: ["en"],
      demoOrder: 99,
    },
    creatorInput: {
      recommendedActionPolicies: [
        {
          whenFlagId: null,
          whenFlagValue: null,
          actionIds: [recommendedActionId, alternativeActionId],
        },
      ],
      actionVocabulary: [
        {
          actionId: recommendedActionId,
          creatorFacingLabel: text(draft, "recommendedAction"),
          cueTerms: ["recommended path", "advance"],
          praise: text(draft, "recommendedConsequence"),
        },
        {
          actionId: alternativeActionId,
          creatorFacingLabel: text(draft, "alternativeAction"),
          cueTerms: ["alternative path", "reframe"],
          praise: text(draft, "alternativeConsequence"),
        },
      ],
      tacitKnowledgePrompts: {
        desiredOutcome: text(draft, "endingCondition"),
        characterMotive: text(draft, "focalDesire"),
        acceptedCost: text(draft, "acceptedCost"),
      },
      unsupportedMechanisms: [
        {
          cueTerms: ["ignore canon", "bypass cost"],
          explanation: text(draft, "forbiddenDevelopment"),
        },
      ],
      expansionPrompt:
        "Describe what you want to achieve, why this character acts now, and which consequence you will accept.",
    },
    identityPolicy: {
      actorAliases: [],
      hiddenKnowledge: [
        {
          premiseId: scenario.premises[1]!.id,
          privateKnowledgeId: `private.forge_hidden_${token}`,
          withheldPremiseIds: [scenario.premises[1]!.id],
          forbiddenPatterns: [text(draft, "knowledgeAsymmetry")],
        },
      ],
      creatorMayInspectHiddenState: true,
    },
    worldCodex: {
      dramaticQuestion: text(draft, "endingCondition"),
      relationships: [
        {
          id: relationship.id,
          subjectEntityId: relationship.subjectEntityId,
          objectEntityId: relationship.objectEntityId,
          axisId: relationship.axisId,
          label: text(draft, "relationshipLabel"),
          direction: relationship.direction,
          provenance: "creator_approved",
          summary: text(draft, "relationshipPressure"),
          initialLevel: relationship.initialLevel,
          levelLabels: [
            "broken",
            "strained",
            "uncertain",
            "strengthened",
            "bound",
          ],
        },
      ],
    },
    renderPolicy: {
      tense: "present",
      pointOfView: "limited_third",
      sceneModes: ["setup", "pressure", "revelation", "aftermath", "ending"],
      prohibitedTerms: ["prompt", "model", "system", "algorithm"],
      openingEvent: {
        eventId: `event.opening.forge_${token}`,
        source: { kind: "world", reactionRuleId: `reaction.opening.forge_${token}` },
        actionId: `action.opening.forge_${token}`,
        summary: text(draft, "seedText"),
        effects: [],
        visibleToEntityIds: [focalId, counterpartId],
      },
      unsupportedActionText: text(draft, "forbiddenDevelopment"),
      zoneActiveText: "The bounded scene remains under pressure.",
      zoneCompleteText: "The scene reaches its declared end.",
      actorRenderTextById: {
        [focalId]: "The focal character must choose.",
        [counterpartId]: "The counterpart keeps a separate priority.",
      },
      registeredEventTextByActionId: {
        [`action.opening.forge_${token}`]: "The bounded scene is ready.",
        [recommendedActionId]: "The focal character takes route A.",
        [alternativeActionId]: "The focal character takes route B.",
        [scenario.actions[2]!.id]: "The counterpart answers route A.",
        [scenario.actions[3]!.id]: "The counterpart answers route B.",
      },
      currentEventTextByActionId: {
        [`action.opening.forge_${token}`]: "The bounded decision begins.",
        [recommendedActionId]: "The focal character chooses route A.",
        [alternativeActionId]: "The focal character chooses route B.",
      },
      currentReactionTextByRuleId: {
        [recommendedReactionId]: "The counterpart answers the chosen route.",
        [alternativeReactionId]: "The counterpart redirects the chosen route.",
      },
      currentTurnConsequenceTextByActionId: {
        [recommendedActionId]: "The world records route A's consequence.",
        [alternativeActionId]: "The world records route B's consequence.",
      },
      registeredEndingTextById: {
        [recommendedEndingId]: "Route A reaches its declared result.",
        [alternativeEndingId]: "Route B reaches its declared result.",
        [timeoutEndingId]: "The bounded scene reaches its limit.",
      },
      currentEndingTextById: {
        [recommendedEndingId]: "Route A closes the scene.",
        [alternativeEndingId]: "Route B closes the scene.",
        [timeoutEndingId]: "The scene closes without resolution.",
      },
      participantEndingTextByKind: {
        [scenario.endingRules[0]!.kind]: text(draft, "recommendedConsequence"),
        [scenario.endingRules[1]!.kind]: text(draft, "alternativeConsequence"),
        timeout: text(draft, "endingCondition"),
      },
      lockedEventTextByActionId: {},
      criticalFlagIds: [alternativeFlagId, recommendedFlagId],
      setupStopActorId: counterpartId,
      endingStopActorId: focalId,
    },
    scenario,
  });

  const sealed = sealPenelopeWorldPack(definition);
  const { definitionDigest, ...unsealedDefinition } = sealed;
  return WorldForgeCompileResponseSchema.parse({
    definition: unsealedDefinition,
    definitionDigest,
    approvedFacts: WORLD_FORGE_FACT_FIELD_IDS.map((fieldId) => ({
      fieldId,
      value: text(draft, fieldId),
      origin: draft[fieldId].origin,
      approval: "creator_approved" as const,
    })),
  });
};

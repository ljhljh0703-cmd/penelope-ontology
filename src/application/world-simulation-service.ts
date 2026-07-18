import {
  WorldCreatorReceiptSchema,
  WorldNarrationProjectionSchema,
  WorldParticipantSessionViewSchema,
  type WorldCreatorReceipt,
  type WorldNarrationProjection,
  type WorldParticipantSessionView,
  type WorldPresentationTransport,
} from "@/src/contracts/world-api";
import {
  NarrationInputEnvelopeSchema,
  PenelopeEnglishStyleProfileSchema,
  PenelopeNarrationPreflightReceiptSchema,
  PenelopeScenePlanSchema,
  type ModelNarrationOutput,
  type NarrationRendererTrace,
  type PenelopeEnglishStyleProfile,
} from "@/src/contracts/world-narrator";
import type { WorldSimulationScenario } from "@/src/contracts/world-simulation";
import type {
  WorldSimulationEvent,
  WorldSimulationSession,
  WorldTurnReceipt,
} from "@/src/contracts/world-runtime";
import {
  focalPremiseIds,
  worldActionCandidates,
} from "@/src/domain/world-runtime";
import {
  runWorldNarrationPipeline,
  type ResolvedNarrationPipelineArtifacts,
  type WorldNarrationPipelineResult,
} from "@/src/application/world-narration-pipeline";
import { extractPublicFidelityRecord } from "@/src/domain/narration-postvalidator";
import type {
  NarrationCritic,
  NarrationRenderer,
} from "@/src/ports/world-narrator";
import type { WorldNarrationHumanDecisionReceipt } from "@/src/application/world-session-store";

const PARTICIPANT_SUMMARY =
  "At the Ithacan hearth, Penelope questions a guarded stranger while an old nurse and a hostile servant act on different fragments of the truth.";

const STRANGER_IDENTITY_FACT_ID = "premise.stranger_identity";
const IDENTITY_BEARING_PREMISE_IDS = new Set([
  STRANGER_IDENTITY_FACT_ID,
  "premise.scar_recognition",
  "premise.penelope_bounded_evidence",
  "premise.penelope_not_certain",
  "premise.eurycleia_loyalty",
]);

const selectedActionCandidates = ({
  scenario,
  session,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
}) => {
  const candidates = worldActionCandidates({ scenario });
  const scarExposed =
    session.state.flags.find(({ id }) => id === "flag.scar_exposed")?.value ?? false;
  const preferred = scarExposed
    ? [
        "action.penelope.confront_privately",
        "action.penelope.observe",
        "action.penelope.clear_room",
      ]
    : [
        "action.penelope.test_testimony",
        "action.penelope.order_washing",
        "action.penelope.observe",
      ];
  return preferred
    .map((actionId) => candidates.find((candidate) => candidate.actionId === actionId))
    .filter((candidate): candidate is (typeof candidates)[number] => Boolean(candidate));
};

const openingEvent = (): WorldSimulationEvent => ({
  eventId: "event.opening.hearth_interview",
  source: { kind: "world", reactionRuleId: "reaction.opening" },
  actionId: "action.opening",
  summary:
    "Penelope keeps the late interview at the hearth, with the stranger before her, Eurycleia attending, and Melantho close enough to become a risk.",
  effects: [],
  visibleToEntityIds: ["entity.penelope"],
});

const safeFactId = (kind: string, value: string): string =>
  `fact.${kind}.${value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")}`;

const lowerInitial = (value: string): string =>
  value.length === 0
    ? value
    : `${value.slice(0, 1).toLocaleLowerCase("en-US")}${value.slice(1)}`;

const observableFacts = ({
  scenario,
  session,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
}) => {
  const focalId = scenario.focalParticipantEntityId;
  const focalZoneId = session.state.actors.find(({ entityId }) => entityId === focalId)?.zoneId;
  const zone = scenario.zones.find(({ id }) => id === focalZoneId);
  const actorIds = new Set(
    session.state.actors
      .filter(({ zoneId }) => zoneId === focalZoneId)
      .map(({ entityId }) => entityId),
  );
  const actorFacts = scenario.actors
    .filter(({ id }) => actorIds.has(id))
    .map((actor) => ({
      factId: safeFactId("visible_actor", actor.participantLabel),
      summary: `${actor.participantLabel} is ${lowerInitial(actor.publicDescription)}`,
    }));
  return [
    {
      factId: safeFactId("zone", zone?.name ?? focalZoneId ?? "unknown"),
      summary: zone?.summary ?? "The focal character remains inside the bounded palace scene.",
    },
    ...actorFacts,
  ];
};

const focalKnowledgeFacts = ({
  scenario,
  session,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
}) => {
  const knownIds = new Set(focalPremiseIds(session, scenario.focalParticipantEntityId));
  const identityGranted = knownIds.has(STRANGER_IDENTITY_FACT_ID);
  return scenario.premises
    .filter(
      ({ id }) =>
        knownIds.has(id) &&
        (identityGranted || !IDENTITY_BEARING_PREMISE_IDS.has(id)),
    )
    .map(({ id, summary }) => ({ factId: id, summary }));
};

const focalKnowsStrangerIdentity = ({
  scenario,
  session,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
}): boolean =>
  focalPremiseIds(session, scenario.focalParticipantEntityId).includes(
    STRANGER_IDENTITY_FACT_ID,
  );

const safeVisibleEvents = ({
  scenario,
  receipt,
}: {
  scenario: WorldSimulationScenario;
  receipt: WorldTurnReceipt | null;
}): WorldSimulationEvent[] => {
  if (!receipt) return [openingEvent()];
  return receipt.events.filter(({ visibleToEntityIds }) =>
    visibleToEntityIds.includes(scenario.focalParticipantEntityId),
  );
};

/**
 * Continuity memory is derived from registered, focal-visible runtime events.
 * Model prose is intentionally excluded so an unsupported sentence cannot
 * become an input fact on the following turn.
 */
export const buildWorldVisibleSceneMemory = ({
  scenario,
  receipt,
}: {
  scenario: WorldSimulationScenario;
  receipt: WorldTurnReceipt | null;
}): string => {
  const summary = safeVisibleEvents({ scenario, receipt })
    .map(({ summary: eventSummary }) => eventSummary.trim())
    .join(" ");
  return summary.length <= 1_600
    ? summary
    : `${summary.slice(0, 1_597).trimEnd()}...`;
};

const narratorEvents = (events: WorldSimulationEvent[]) =>
  events.map((event, index) => ({
    eventId: `event.visible_${index + 1}`,
    source:
      event.source.kind === "participant"
        ? ("player" as const)
        : event.source.kind,
    summary: event.summary,
  }));

const WORLD_NARRATION_RUNTIME_AUTHORITY_ID =
  "runtime.penelope.world_scene.v1";
const WORLD_NARRATION_CREATOR_AUTHORITY_ID =
  "creator.penelope.world_copy.v1";
const WORLD_NARRATION_REFERENCE_RECEIPT_ID =
  "creator-craft-reference-2026-07-17-01";
const UNSUPPORTED_ACTION_NARRATION_TEXT =
  "Nothing in the room answers Penelope's attempt. No one acts on it, and nothing shifts in her favor. The moment passes, and the night moves on.";
const UNSUPPORTED_ACTION_NARRATION_TRACE: NarrationRendererTrace = {
  provenance: "fixture",
  adapterId: "world.unsupported_no_render.v1",
};

const unsupportedActionNarration = (): WorldNarrationProjection =>
  WorldNarrationProjectionSchema.parse({
    format: "english_prose_paragraphs",
    paragraphs: [
      {
        paragraphId: "paragraph.unsupported_action",
        text: UNSUPPORTED_ACTION_NARRATION_TEXT,
      },
    ],
    prose: UNSUPPORTED_ACTION_NARRATION_TEXT,
  });

const modelFacingEntityId = (entityId: string): string =>
  entityId === "entity.odysseus" ? "entity.stranger" : entityId;

const REGISTERED_EVENT_RENDER_TEXT: Readonly<Record<string, string>> = {
  "action.opening": "The household gathers around the hearth.",
  "action.penelope.observe": "Penelope waits and watches the room.",
  "action.penelope.test_testimony": "Penelope tests the stranger's account.",
  "action.penelope.order_washing": "Penelope orders Eurycleia to begin.",
  "action.penelope.clear_room": "Penelope clears the nearby servants.",
  "action.penelope.confront_privately": "Penelope questions the stranger in private.",
  "action.odysseus.answer_carefully": "The stranger answers Penelope with care.",
  "action.odysseus.contain_recognition": "The stranger checks Eurycleia's alarm.",
  "action.eurycleia.wash_feet": "Eurycleia stops at the old scar.",
  "action.eurycleia.guard_secret": "Eurycleia keeps the moment private.",
  "action.eurycleia.confirm_privately": "Eurycleia identifies the stranger as Odysseus.",
  "action.melantho.investigate": "Melantho watches the visible disturbance.",
  "action.unsupported": UNSUPPORTED_ACTION_NARRATION_TEXT,
};

const REGISTERED_ENDING_RENDER_TEXT: Readonly<Record<string, string>> = {
  "ending.canon_contained":
    "Recognition stays contained; Penelope remains uncertain.",
  "ending.controlled_discovery":
    "The confirmation stays inside the closed room.",
  "ending.plan_compromised":
    "The disturbance escapes and raises immediate danger.",
  "ending.timeout":
    "Night closes; the unresolved consequences remain.",
};

const boundedEventRenderText = (
  event: WorldSimulationEvent,
  scenario: WorldSimulationScenario,
): string => {
  const registered = REGISTERED_EVENT_RENDER_TEXT[event.actionId];
  if (registered) return registered;
  if (event.source.kind === "participant") {
    return "Penelope acts before the watching household.";
  }
  if (event.source.kind === "npc") {
    const actorEntityId = event.source.actorEntityId;
    const label =
      scenario.actors.find(({ id }) => id === actorEntityId)
        ?.participantLabel ?? "Someone nearby";
    return `${label} reacts inside the household.`;
  }
  return "The household answers the visible change.";
};

const narrationSceneMode = ({
  session,
  receipt,
}: {
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt | null;
}): "setup" | "turn" | "ending" =>
  receipt === null ? "setup" : session.state.status === "complete" ? "ending" : "turn";

const narrationStyleStateId = ({
  scenario,
  session,
  styleProfile,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  styleProfile: PenelopeEnglishStyleProfile;
}): string => {
  const byId = new Map(
    styleProfile.styleStates.map(({ stateId }) => [stateId, stateId]),
  );
  const clockById = new Map(
    scenario.clocks.map(({ id, initialValue, maxValue }) => [
      id,
      { initialValue, maxValue },
    ]),
  );
  const planCompromised =
    session.state.flags.find(({ id }) => id === "flag.plan_compromised")
      ?.value ?? false;
  const atMaximum = session.state.clocks.some(({ id, value }) => {
    const clock = clockById.get(id);
    return clock !== undefined && value >= clock.maxValue;
  });
  const aboveBaseline = session.state.clocks.some(({ id, value }) => {
    const clock = clockById.get(id);
    return clock !== undefined && value > clock.initialValue;
  });
  if (planCompromised || atMaximum) {
    return byId.get("en-penelope-state-critical") ?? styleProfile.styleStates[0]!.stateId;
  }
  if (aboveBaseline) {
    return byId.get("en-penelope-state-elevated") ?? styleProfile.styleStates[0]!.stateId;
  }
  return byId.get("en-penelope-state-baseline") ?? styleProfile.styleStates[0]!.stateId;
};

export type WorldNarrationPipelineArtifacts =
  ResolvedNarrationPipelineArtifacts & {
    reservedActionSourceBindings: ReadonlyArray<{
      actionId: string;
      sourceIds: ReadonlyArray<string>;
    }>;
  };

export const buildWorldNarrationPipelineArtifacts = ({
  scenario,
  session,
  receipt,
  styleProfile: styleProfileInput,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt | null;
  styleProfile: PenelopeEnglishStyleProfile;
}): WorldNarrationPipelineArtifacts => {
  const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileInput);
  const sceneMode = narrationSceneMode({ session, receipt });
  const focalId = scenario.focalParticipantEntityId;
  const focalZoneId = session.state.actors.find(
    ({ entityId }) => entityId === focalId,
  )?.zoneId;
  const zone = scenario.zones.find(({ id }) => id === focalZoneId);
  const zoneFactId = safeFactId("narration_zone", zone?.id ?? "unknown");
  const zoneRenderText = `${zone?.name ?? "The room"} holds the gathered household.`;
  const presentActorIds = new Set(
    session.state.actors
      .filter(({ zoneId }) => zoneId === focalZoneId)
      .map(({ entityId }) => entityId),
  );
  const presentActors = scenario.actors
    .filter(({ id }) => presentActorIds.has(id))
    .map((actor) => {
      const entityId = modelFacingEntityId(actor.id);
      const factId = safeFactId("narration_actor", entityId);
      return {
        entityId,
        renderDescriptor: `${actor.participantLabel} remains in ${zone?.name ?? "the room"}.`,
        sourceFactIds: [factId],
      };
    });
  const visibleFacts = [
    { factId: zoneFactId, renderText: zoneRenderText },
    ...presentActors.map(({ entityId, renderDescriptor, sourceFactIds }) => ({
      factId: sourceFactIds[0]!,
      renderText: renderDescriptor,
      entityId,
    })),
  ].map(({ factId, renderText }) => ({ factId, renderText }));
  const visibleRuntimeEvents = safeVisibleEvents({ scenario, receipt });
  const runtimeResolvedEvents = visibleRuntimeEvents.map((event, index) => ({
    eventId: `event.visible_${index + 1}`,
    observableText: boundedEventRenderText(event, scenario),
    sourceAuthorityIds: [WORLD_NARRATION_RUNTIME_AUTHORITY_ID],
  }));
  const endingResolvedEvent = session.state.endingId
    ? {
        eventId: "event.ending_consequence",
        observableText:
          REGISTERED_ENDING_RENDER_TEXT[session.state.endingId] ??
          "The registered ending leaves its resolved consequence inside the household.",
        sourceAuthorityIds: [WORLD_NARRATION_RUNTIME_AUTHORITY_ID],
      }
    : null;
  const resolvedEvents = [
    ...runtimeResolvedEvents,
    ...(endingResolvedEvent ? [endingResolvedEvent] : []),
  ];
  const resolvedSpeech = visibleRuntimeEvents.flatMap((event, index) => {
    if (event.source.kind !== "npc") return [];
    const resolvedReactionRuleId = event.source.reactionRuleId;
    const directive = scenario.narrationSpeechDirectives.find(
      ({ reactionRuleId }) =>
        reactionRuleId === resolvedReactionRuleId,
    );
    const resolvedEvent = runtimeResolvedEvents[index];
    if (!directive || !resolvedEvent) return [];
    const approvalReceipt = scenario.creatorRuleApprovalReceipts.find(
      ({ binding }) =>
        binding.receiptId === directive.creatorApprovalReceiptId,
    );
    if (!approvalReceipt) {
      throw new Error(
        `Narration speech directive is missing creator authority: ${directive.id}`,
      );
    }
    return [
      {
        directive,
        resolvedEvent,
        license: {
          licenseId: `license.${directive.id}`,
          issuer: "creator" as const,
          issuerAuthorityId: approvalReceipt.binding.issuerAuthorityId,
          issuedBeforeGeneration: true as const,
          category: "speech_act" as const,
          contentBoundary: directive.contentBoundary,
          sourceAuthorityIds: [resolvedEvent.eventId],
        },
      },
    ];
  });
  if (resolvedSpeech.length > 1) {
    throw new Error("A bounded scene may expose only one licensed speech event.");
  }
  const speech = resolvedSpeech[0] ?? null;
  const actionEvent =
    resolvedEvents.find((_, index) => visibleRuntimeEvents[index]?.source.kind === "participant") ??
    resolvedEvents[0];
  const reactionEvent =
    resolvedEvents.find((_, index) => visibleRuntimeEvents[index]?.source.kind !== "participant") ??
    resolvedEvents.at(-1);
  const changeEvent = endingResolvedEvent ?? resolvedEvents.at(-1);
  const actionIds = sceneMode === "turn" && actionEvent ? [actionEvent.eventId] : [];
  const reactionIds =
    sceneMode === "turn" && reactionEvent ? [reactionEvent.eventId] : [];
  const changeIds =
    sceneMode !== "setup" && changeEvent ? [changeEvent.eventId] : [];
  const privateKnowledgeIds = focalKnowsStrangerIdentity({ scenario, session })
    ? []
    : ["private.stranger_identity"];
  const reservedCandidates =
    session.state.status === "complete"
      ? []
      : selectedActionCandidates({ scenario, session });
  const inputEnvelope = NarrationInputEnvelopeSchema.parse({
    modelFacing: {
      sceneMode,
      languageProfileId: styleProfile.profileId,
      referenceReceiptId: WORLD_NARRATION_REFERENCE_RECEIPT_ID,
      focalActorId: focalId,
      presentActors,
      visibleFacts,
      resolvedEvents,
      authorizedActionEventIds: actionIds,
      authorizedReactionEventIds: reactionIds,
      authorizedChangeEventIds: changeIds,
      authorizedAnchors: [],
      licensedRenderingDetails: speech ? [speech.license] : [],
      styleStateId: narrationStyleStateId({ scenario, session, styleProfile }),
      reservedActionIds: reservedCandidates.map(({ actionId }) => actionId),
    },
    privateValidation: {
      forbiddenKnowledgeIds: privateKnowledgeIds,
      forbiddenInferenceRuleIds: [],
      creatorOnlyReviewNoteIds: [],
    },
  });

  const plan = ({
    id,
    role,
    sourceFactIds = [],
    sourceEventIds = [],
    actorId = null,
    speakerId = null,
    speechEventIds = [],
    licensedRenderingDetailIds = [],
    plainIntent = null,
    plainIntentSourceAuthorityIds = [],
    changesState = false,
    plainFunction,
  }: {
    id: string;
    role: "orientation" | "authorized_action" | "observable_reaction" | "resolved_consequence" | "licensed_dialogue" | "in_world_stop";
    sourceFactIds?: string[];
    sourceEventIds?: string[];
    actorId?: string | null;
    speakerId?: string | null;
    speechEventIds?: string[];
    licensedRenderingDetailIds?: string[];
    plainIntent?: string | null;
    plainIntentSourceAuthorityIds?: string[];
    changesState?: boolean;
    plainFunction: string;
  }) => ({
    sentencePlanId: id,
    role,
    actorId,
    speakerId,
    sourceFactIds,
    sourceEventIds,
    speechEventIds,
    licensedRenderingDetailIds,
    plainFunction,
    plainFunctionSourceAuthorityIds: [
      ...sourceFactIds,
      ...sourceEventIds,
      ...speechEventIds,
      ...licensedRenderingDetailIds,
    ],
    plainIntent,
    plainIntentSourceAuthorityIds,
    changesState,
  });
  const speechPlan = speech
    ? plan({
        id: `sentence.${sceneMode}.licensed_dialogue`,
        role: "licensed_dialogue",
        speakerId: modelFacingEntityId(speech.directive.speakerEntityId),
        licensedRenderingDetailIds: [speech.license.licenseId],
        plainIntent: speech.directive.plainIntent,
        plainIntentSourceAuthorityIds: [
          speech.resolvedEvent.eventId,
          speech.license.licenseId,
        ],
        plainFunction: "Render the creator-approved answer within its stated boundary.",
      })
    : null;
  const sentencePlans =
    sceneMode === "setup"
      ? [
          plan({
            id: "sentence.setup.orientation",
            role: "orientation",
            sourceFactIds: [zoneFactId],
            plainFunction: "Place the focal actor in the registered room.",
          }),
          plan({
            id: "sentence.setup.stop",
            role: "in_world_stop",
            sourceFactIds: [presentActors[0]?.sourceFactIds[0] ?? zoneFactId],
            plainFunction: "Stop on a registered person in the room.",
          }),
        ]
      : sceneMode === "turn"
        ? [
            plan({
              id: "sentence.turn.action",
              role: "authorized_action",
              actorId: focalId,
              sourceEventIds: actionIds,
              changesState: true,
              plainFunction: "Render the resolved participant action.",
            }),
            plan({
              id: "sentence.turn.reaction",
              role: "observable_reaction",
              sourceEventIds: reactionIds,
              changesState: true,
              plainFunction: "Render the registered visible reaction.",
            }),
            ...(speechPlan ? [speechPlan] : []),
            plan({
              id: "sentence.turn.consequence",
              role: "resolved_consequence",
              sourceEventIds: changeIds,
              changesState: true,
              plainFunction: "Render the already resolved consequence.",
            }),
            plan({
              id: "sentence.turn.stop",
              role: "in_world_stop",
              sourceFactIds: [zoneFactId],
              plainFunction: "Stop inside the registered room.",
            }),
          ]
        : [
            plan({
              id: "sentence.ending.orientation",
              role: "orientation",
              sourceEventIds: resolvedEvents[0] ? [resolvedEvents[0].eventId] : [zoneFactId],
              sourceFactIds: resolvedEvents[0] ? [] : [zoneFactId],
              plainFunction: "Place the final resolved beat in view.",
            }),
            ...(speechPlan ? [speechPlan] : []),
            plan({
              id: "sentence.ending.consequence",
              role: "resolved_consequence",
              sourceEventIds: changeIds,
              changesState: true,
              plainFunction: "Render the terminal resolved consequence.",
            }),
            plan({
              id: "sentence.ending.stop",
              role: "in_world_stop",
              sourceFactIds: [zoneFactId],
              plainFunction: "Close inside the registered world.",
            }),
          ];
  const scenePlan = PenelopeScenePlanSchema.parse({
    scenePlanId: `scene.${sceneMode}.turn_${session.state.turn}`,
    sceneMode,
    sentencePlans,
  });
  const eventText = (eventId: string | undefined): string =>
    resolvedEvents.find((event) => event.eventId === eventId)?.observableText ??
    "The registered scene changes.";
  const preflightReceipt = PenelopeNarrationPreflightReceiptSchema.parse({
    preflightId: `preflight.${sceneMode}.turn_${session.state.turn}`,
    sceneMode,
    sceneAuthority: {
      factIds: visibleFacts.map(({ factId }) => factId),
      eventIds: resolvedEvents.map(({ eventId }) => eventId),
      actorEntityIds: presentActors.map(({ entityId }) => entityId),
      licensedRenderingDetailIds: speech ? [speech.license.licenseId] : [],
      licensedRenderingDetails: speech ? [speech.license] : [],
    },
    referenceReceipt: {
      status: "available",
      referenceId: WORLD_NARRATION_REFERENCE_RECEIPT_ID,
      transferableTechniqueIds: ["TT-01"],
      sceneApplicability: [
        {
          techniqueId: "TT-01",
          plainReason: "The scene keeps each resolved beat physically legible.",
        },
      ],
      forbiddenImitation: true,
      excludedGimmicks: ["FC-04"],
    },
    plainDramaticPlan: {
      focalActorId: focalId,
      actionSourceEventIds: actionIds,
      reactionSourceEventIds: reactionIds,
      changeSourceEventIds: changeIds,
      ...(sceneMode === "setup"
        ? {}
        : {
            changeInPlainTerms: {
              text: eventText(changeIds[0]),
              sourceAuthorityIds: changeIds,
            },
          }),
    },
    dialogueAuthority: speech
      ? {
          mode: "licensed",
          speakerId: modelFacingEntityId(
            speech.directive.speakerEntityId,
          ),
          speechAct: speech.directive.speechAct,
          speechEventIds: [speech.resolvedEvent.eventId],
          speechActLicenseIds: [speech.license.licenseId],
          authorizedContentIds: [
            speech.resolvedEvent.eventId,
            speech.license.licenseId,
          ],
          plainIntent: speech.directive.plainIntent,
          plainIntentSourceAuthorityIds: [
            speech.resolvedEvent.eventId,
            speech.license.licenseId,
          ],
        }
      : {
          mode: "none",
          speakerId: null,
          speechAct: null,
          speechEventIds: [],
          speechActLicenseIds: [],
          authorizedContentIds: [],
          plainIntent: null,
          plainIntentSourceAuthorityIds: [],
        },
    creatorReviewRequired: true,
  });
  const cameraSafeProvenance = [
    ...presentActors.map(({ entityId, renderDescriptor }) => ({
      fieldKey: `present_actor:${entityId}` as const,
      text: renderDescriptor,
      authoredBy: "deterministic_runtime" as const,
      authorityId: WORLD_NARRATION_RUNTIME_AUTHORITY_ID,
      rawSourceTexts: [],
    })),
    ...visibleFacts.map(({ factId, renderText }) => ({
      fieldKey: `visible_fact:${factId}` as const,
      text: renderText,
      authoredBy: "deterministic_runtime" as const,
      authorityId: WORLD_NARRATION_RUNTIME_AUTHORITY_ID,
      rawSourceTexts: [],
    })),
    ...resolvedEvents.map(({ eventId, observableText }) => ({
      fieldKey: `resolved_event:${eventId}` as const,
      text: observableText,
      authoredBy: "deterministic_runtime" as const,
      authorityId: WORLD_NARRATION_RUNTIME_AUTHORITY_ID,
      rawSourceTexts: [],
    })),
  ];
  const privateValidationMaterial = {
    forbiddenKnowledge:
      privateKnowledgeIds.length === 0
        ? []
        : [
            {
              id: "private.stranger_identity",
              patterns: [
                "the stranger is Odysseus",
                "the stranger was Odysseus",
                "Odysseus in disguise",
                "Ulysses in disguise",
              ],
            },
          ],
    forbiddenInferences: [],
  };
  const artifacts = {
    inputEnvelope,
    scenePlan,
    preflightReceipt,
    styleProfile,
    authorityRegistry: {
      typedSpeechEvents: speech
        ? [
            {
              eventId: speech.resolvedEvent.eventId,
              registeredKind: "speech" as const,
            },
          ]
        : [],
      creatorAuthorityIds: [
        ...new Set([
          WORLD_NARRATION_CREATOR_AUTHORITY_ID,
          ...scenario.creatorRuleApprovalAuthorityRegistry.creatorAuthorityIds,
        ]),
      ],
      deterministicRuntimeAuthorityIds: [WORLD_NARRATION_RUNTIME_AUTHORITY_ID],
      approvedReferenceReceiptIds: [WORLD_NARRATION_REFERENCE_RECEIPT_ID],
    },
    cameraSafeProvenance,
    continuityProvenance: {
      source: "registered_events",
      authority: "deterministic_runtime",
      registeredEventIds: resolvedEvents.map(({ eventId }) => eventId),
      readerProseImported: false,
    },
    privateValidationMaterial,
    reservedActionDescriptors: reservedCandidates.map((candidate) => ({
      actionId: candidate.actionId,
      text: `Penelope may ${candidate.suggestedInput}.`,
    })),
    reservedActionSourceBindings: reservedCandidates.map((candidate) => ({
      actionId: candidate.actionId,
      sourceIds: resolvedEvents
        .filter(
          (_, index) =>
            visibleRuntimeEvents[index]?.actionId === candidate.actionId,
        )
        .map(({ eventId }) => eventId),
    })),
    fidelityBefore: extractPublicFidelityRecord({
      names: presentActors.map(({ entityId }) => entityId),
      coreClaims: [
        ...visibleFacts.map(({ renderText }) => renderText),
        ...resolvedEvents.map(({ observableText }) => observableText),
      ],
      causalityDirections: visibleRuntimeEvents.flatMap(({ effects }) =>
        effects.map(({ kind }) => kind),
      ),
      knowledgeScopes: focalPremiseIds(session, focalId),
      actorAuthority: [focalId],
      resolvedEventIds: resolvedEvents.map(({ eventId }) => eventId),
    }),
  } satisfies WorldNarrationPipelineArtifacts;
  return artifacts;
};

export type WorldSessionNarrationPipelineOutcome =
  | {
      outcome: "accepted";
      pipeline: WorldNarrationPipelineResult;
      committableSession: WorldSimulationSession;
      committableReceipt: WorldTurnReceipt | null;
      modelOutput: ModelNarrationOutput;
      trace: NarrationRendererTrace;
    }
  | {
      outcome: "no_render";
      committableSession: WorldSimulationSession;
      committableReceipt: WorldTurnReceipt;
      narration: WorldNarrationProjection;
      trace: NarrationRendererTrace;
      reason: "unsupported_action";
      rendererCallCount: 0;
      criticCallCount: 0;
    }
  | {
      outcome: "creator_review";
      pipeline: WorldNarrationPipelineResult;
      candidateSession: WorldSimulationSession;
      candidateReceipt: WorldTurnReceipt;
      modelOutput: ModelNarrationOutput;
      trace: NarrationRendererTrace;
      artifacts: ResolvedNarrationPipelineArtifacts;
      creatorReviewRuleIds: string[];
    }
  | {
      outcome: "blocked";
      pipeline: WorldNarrationPipelineResult;
      committableSession: null;
      committableReceipt: null;
      modelOutput: null;
      trace: null;
    };

export const runWorldSessionNarrationPipeline = async ({
  scenario,
  session,
  receipt,
  styleProfile,
  renderer,
  critic,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt | null;
  styleProfile: PenelopeEnglishStyleProfile;
  renderer: NarrationRenderer;
  critic?: NarrationCritic | null;
}): Promise<WorldSessionNarrationPipelineOutcome> => {
  if (receipt?.action.status === "unsupported") {
    return {
      outcome: "no_render",
      committableSession: session,
      committableReceipt: receipt,
      narration: unsupportedActionNarration(),
      trace: UNSUPPORTED_ACTION_NARRATION_TRACE,
      reason: "unsupported_action",
      rendererCallCount: 0,
      criticCallCount: 0,
    };
  }
  const artifacts = buildWorldNarrationPipelineArtifacts({
    scenario,
    session,
    receipt,
    styleProfile,
  });
  const pipeline = await runWorldNarrationPipeline({
    artifacts,
    renderer,
    critic,
  });
  if (
    pipeline.disposition === "creator_review" &&
    pipeline.validation?.hardPass === true &&
    receipt &&
    pipeline.modelOutput &&
    pipeline.trace
  ) {
    return {
      outcome: "creator_review",
      pipeline,
      candidateSession: session,
      candidateReceipt: receipt,
      modelOutput: pipeline.modelOutput,
      trace: pipeline.trace,
      artifacts,
      creatorReviewRuleIds: [
        ...new Set(
          pipeline.validation.findings
            .filter(({ severity }) => severity === "creator_review")
            .map(({ ruleId }) => ruleId),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    };
  }
  if (pipeline.disposition !== "accepted") {
    return {
      outcome: "blocked",
      pipeline,
      committableSession: null,
      committableReceipt: null,
      modelOutput: null,
      trace: null,
    };
  }
  if (!pipeline.modelOutput || !pipeline.trace) {
    throw new Error("Accepted world narration is missing its validated renderer result.");
  }
  return {
    outcome: "accepted",
    pipeline,
    committableSession: session,
    committableReceipt: receipt,
    modelOutput: pipeline.modelOutput,
    trace: pipeline.trace,
  };
};

export class WorldNarrationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorldNarrationError";
  }
}

export type WorldSessionProjectionInput = {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  sessionId: string;
  parentCheckpointId: string | null;
  forked: boolean;
  transport: WorldPresentationTransport;
  receipt: WorldTurnReceipt | null;
  narrationDecisionReceipt?: WorldNarrationHumanDecisionReceipt | null;
  narration: WorldNarrationProjection;
  trace: NarrationRendererTrace;
};

const participantEndingSummary = (kind: string): string => {
  switch (kind) {
    case "canon_contained":
      return "The immediate disturbance settles without giving Penelope a final answer.";
    case "controlled_discovery":
      return "Penelope reaches a private conclusion while the wider household remains outside it.";
    case "plan_compromised":
      return "A visible disturbance reaches the hostile household network and forces a riskier timetable.";
    case "timeout":
      return "The night closes with unresolved knowledge and every visible consequence preserved.";
    default:
      return "The bounded scene closes on the consequences visible to Penelope.";
  }
};

export const buildWorldParticipantView = ({
  scenario,
  session,
  sessionId,
  parentCheckpointId,
  forked,
  transport,
  receipt,
  narration,
  trace,
}: WorldSessionProjectionInput): WorldParticipantSessionView => {
  const focal = scenario.actors.find(
    ({ id }) => id === scenario.focalParticipantEntityId,
  );
  if (!focal) throw new Error("The focal world actor is unavailable.");
  const endingRule = session.state.endingId
    ? scenario.endingRules.find(({ id }) => id === session.state.endingId)
    : null;
  const visibleEvents = safeVisibleEvents({ scenario, receipt });
  const allEvents = receipt?.events ?? [openingEvent()];
  const nextActions =
    session.state.status === "complete"
      ? []
      : selectedActionCandidates({ scenario, session });
  const facts = [
    ...observableFacts({ scenario, session }).map(({ factId, summary }) => ({
      id: factId,
      summary,
    })),
    ...focalKnowledgeFacts({ scenario, session }).map(({ factId, summary }) => ({
      id: factId,
      summary,
    })),
  ];
  return WorldParticipantSessionViewSchema.parse({
    sessionId,
    parentCheckpointId,
    scenarioId: scenario.id,
    title: scenario.title,
    participantSummary: PARTICIPANT_SUMMARY,
    transport,
    cursor: session.cursor,
    forked,
    turn: session.state.turn,
    maxTurns: scenario.maxTurns,
    stateHash: session.state.stateHash,
    status: session.state.status,
    ending: endingRule
      ? {
          id: endingRule.id,
          kind: endingRule.kind,
          summary: participantEndingSummary(endingRule.kind),
        }
      : null,
    focalActor: {
      entityId: focal.id,
      label: focal.participantLabel,
      description: focal.publicDescription,
    },
    visibleFacts: facts,
    visibleEvents: narratorEvents(visibleEvents),
    hiddenEventCount: allEvents.length - visibleEvents.length,
    nextActions,
    narration,
    narratorTrace: trace,
  });
};

export const buildWorldCreatorReceipt = ({
  scenario,
  session,
  receipt,
  narrationDecisionReceipt = null,
}: Pick<WorldSessionProjectionInput, "scenario" | "session" | "receipt"> & {
  narrationDecisionReceipt?: WorldNarrationHumanDecisionReceipt | null;
}): WorldCreatorReceipt =>
  WorldCreatorReceiptSchema.parse({
    actors: scenario.actors.map((actor) => {
      const runtime = session.state.actors.find(
        ({ entityId }) => entityId === actor.id,
      );
      return {
        entityId: actor.id,
        creatorName: actor.name,
        participantLabel: actor.participantLabel,
        zoneId: runtime?.zoneId ?? actor.currentZoneId,
        agendaState: runtime?.agendaState ?? actor.agenda.state,
        knownPremiseIds:
          session.state.knowledge.find(({ entityId }) => entityId === actor.id)
            ?.premiseIds ?? [],
      };
    }),
    flags: session.state.flags,
    clocks: scenario.clocks.map((clock) => ({
      id: clock.id,
      label: clock.label,
      value:
        session.state.clocks.find(({ id }) => id === clock.id)?.value ?? 0,
      maxValue: clock.maxValue,
    })),
    ruleReview: {
      sourceGroundedIds: [
        ...scenario.reactionRules,
        ...scenario.endingRules,
      ]
        .filter(({ provenance }) => provenance.reviewState === "source_grounded")
        .map(({ id }) => id)
        .sort(),
      creatorApprovedNotSourceCanonIds: [
        ...scenario.reactionRules,
        ...scenario.endingRules,
      ]
        .filter(
          ({ provenance }) =>
            provenance.reviewState === "creator_approved" &&
            provenance.canonStatus === "not_source_canon",
        )
        .map(({ id }) => id)
        .sort(),
      creatorReviewRequiredIds: [
        ...scenario.reactionRules,
        ...scenario.endingRules,
      ]
        .filter(
          ({ provenance }) =>
            provenance.reviewState === "creator_review_required",
        )
        .map(({ id }) => id)
        .sort(),
    },
    events: receipt?.events ?? [openingEvent()],
    ledgerHeadHash: session.ledger.cursor.headEntryHash,
    receiptHash: receipt?.receiptHash ?? null,
    narrationDecisionProof: narrationDecisionReceipt
      ? {
          receiptHash: narrationDecisionReceipt.receiptHash,
          decision: narrationDecisionReceipt.decision,
          draftId: narrationDecisionReceipt.draftId,
          draftHash: narrationDecisionReceipt.draftHash,
          approvedModelOutputHash:
            narrationDecisionReceipt.approvedModelOutputHash,
          originalCreatorReviewRuleIds:
            narrationDecisionReceipt.originalCreatorReviewRuleIds,
          satisfiedCreatorReviewRuleIds:
            narrationDecisionReceipt.satisfiedCreatorReviewRuleIds,
        }
      : null,
  });

export const buildWorldSessionProjections = (
  input: WorldSessionProjectionInput,
): {
  participantView: WorldParticipantSessionView;
  creatorReceipt: WorldCreatorReceipt;
} => ({
  participantView: buildWorldParticipantView(input),
  creatorReceipt: buildWorldCreatorReceipt(input),
});

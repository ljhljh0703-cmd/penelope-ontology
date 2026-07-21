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
import {
  PenelopeWorldPackV1Schema,
  type PenelopeWorldPackV1,
} from "@/src/contracts/penelope-world-pack";
import {
  isRegisteredWorldPack,
  listWorldPacks,
} from "@/src/adapters/world-packs/registry";

/**
 * A session runtime never infers a pack from a scenario id.  That shortcut
 * would make imported, creator-owned packs impossible and would allow a
 * same-id registry pack to replace the sealed session definition.  Callers
 * must carry the sealed pack they selected or imported with the session.
 */
const requireWorldPack = ({
  scenario,
  worldPack,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
}): PenelopeWorldPackV1 => {
  const parsed = PenelopeWorldPackV1Schema.parse(worldPack);
  if (parsed.scenario.id !== scenario.id) {
    throw new WorldNarrationError(
      "world_pack_scenario_mismatch",
      "The sealed world pack does not belong to this simulation scenario.",
    );
  }
  return parsed;
};

export const selectedWorldActionCandidates = ({
  scenario,
  worldPack,
  session,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
  session: WorldSimulationSession;
}) => {
  const pack = requireWorldPack({ scenario, worldPack });
  const candidates = worldActionCandidates({ scenario });
  const preferred =
    pack.creatorInput.recommendedActionPolicies.find((policy) => {
      if (policy.whenFlagId === null) return true;
      return session.state.flags.some(
        ({ id, value }) =>
          id === policy.whenFlagId && value === policy.whenFlagValue,
      );
    })?.actionIds ?? [];
  return preferred
    .map((actionId) => candidates.find((candidate) => candidate.actionId === actionId))
    .filter((candidate): candidate is (typeof candidates)[number] => Boolean(candidate));
};

const openingEvent = (
  scenario: WorldSimulationScenario,
  worldPack: PenelopeWorldPackV1,
): WorldSimulationEvent =>
  structuredClone(requireWorldPack({ scenario, worldPack }).renderPolicy.openingEvent);

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
  worldPack,
  session,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
  session: WorldSimulationSession;
}) => {
  const pack = requireWorldPack({ scenario, worldPack });
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
    .map((actor) => {
      const alias = pack.identityPolicy.actorAliases.find(
        ({ entityId }) => entityId === actor.id,
      );
      const visibleLabel = alias?.renderText ?? actor.participantLabel;
      return {
        factId: safeFactId("visible_actor", alias?.modelFacingEntityId ?? actor.participantLabel),
        summary: `${visibleLabel} is ${lowerInitial(actor.publicDescription)}`,
      };
    });
  return [
    {
      factId: safeFactId("zone", zone?.name ?? focalZoneId ?? "unknown"),
      summary: zone?.summary ?? "The focal character remains inside the bounded scene.",
    },
    ...actorFacts,
  ];
};

const focalKnowledgeFacts = ({
  scenario,
  worldPack,
  session,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
  session: WorldSimulationSession;
}) => {
  const pack = requireWorldPack({ scenario, worldPack });
  const knownIds = new Set(focalPremiseIds(session, scenario.focalParticipantEntityId));
  const withheldIds = new Set(
    pack.identityPolicy.hiddenKnowledge.flatMap((policy) =>
      knownIds.has(policy.premiseId) ? [] : policy.withheldPremiseIds,
    ),
  );
  return scenario.premises
    .filter(({ id }) => knownIds.has(id) && !withheldIds.has(id))
    .map(({ id, summary }) => ({ factId: id, summary }));
};

const unresolvedHiddenKnowledge = ({
  scenario,
  worldPack,
  session,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
  session: WorldSimulationSession;
}) => {
  const knownIds = new Set(
    focalPremiseIds(session, scenario.focalParticipantEntityId),
  );
  return requireWorldPack({ scenario, worldPack }).identityPolicy.hiddenKnowledge.filter(
    ({ premiseId }) => !knownIds.has(premiseId),
  );
};

const safeVisibleEvents = ({
  scenario,
  worldPack,
  receipt,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
  receipt: WorldTurnReceipt | null;
}): WorldSimulationEvent[] => {
  const pack = requireWorldPack({ scenario, worldPack });
  if (!receipt) return [openingEvent(scenario, pack)];
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
  worldPack,
  receipt,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
  receipt: WorldTurnReceipt | null;
}): string => {
  const summary = safeVisibleEvents({ scenario, worldPack, receipt })
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
const UNSUPPORTED_ACTION_NARRATION_TRACE: NarrationRendererTrace = {
  provenance: "fixture",
  adapterId: "world.unsupported_no_render.v1",
};

const unsupportedActionNarration = (
  scenario: WorldSimulationScenario,
  worldPack: PenelopeWorldPackV1,
): WorldNarrationProjection => {
  const text = requireWorldPack({ scenario, worldPack }).renderPolicy.unsupportedActionText;
  return WorldNarrationProjectionSchema.parse({
    format: "english_prose_paragraphs",
    paragraphs: [
      {
        paragraphId: "paragraph.unsupported_action",
        text,
      },
    ],
    prose: text,
  });
};

const modelFacingEntityId = (
  worldPack: PenelopeWorldPackV1,
  entityId: string,
): string =>
  worldPack.identityPolicy.actorAliases.find(
    (alias) => alias.entityId === entityId,
  )?.modelFacingEntityId ?? entityId;

const behindCurtainRisks = ({
  scenario,
  receipt,
}: {
  scenario: WorldSimulationScenario;
  receipt: WorldTurnReceipt | null;
}) =>
  (receipt?.events ?? []).flatMap((event) => {
    if (event.source.kind !== "npc") return [];
    const reactionRuleId = event.source.reactionRuleId;
    const directive = scenario.narrationSpeechDirectives.find(
      (candidate) => candidate.reactionRuleId === reactionRuleId,
    );
    if (!directive || directive.disclosureGeometry.potentialHearerIds.length === 0) {
      return [];
    }
    const speaker = scenario.actors.find(
      ({ id }) => id === directive.speakerEntityId,
    );
    const potentialHearers = directive.disclosureGeometry.potentialHearerIds.map(
      (entityId) => ({
        entityId,
        label:
          scenario.actors.find(({ id }) => id === entityId)?.name ?? entityId,
      }),
    );
    return [
      {
        riskId: `risk.${directive.id}.potential_audience`,
        eventId: event.eventId,
        exposureStatus: "latent" as const,
        potentialHearers,
        summary: `${speaker?.name ?? directive.speakerEntityId}'s answer may have reached ${potentialHearers
          .map(({ label }) => label)
          .join(", ")}. This is a live possibility, not a resolved fact.`,
      },
    ];
  });

const behindCurtainPremises = ({
  scenario,
  worldPack,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
}) => {
  const pack = requireWorldPack({ scenario, worldPack });
  const sourceLocators = new Map(
    scenario.sourceLocators.map((locator) => [locator.id, locator]),
  );
  const seenPremiseIds = new Set<string>();

  return pack.identityPolicy.hiddenKnowledge.flatMap((boundary) =>
    boundary.withheldPremiseIds.flatMap((premiseId) => {
      if (seenPremiseIds.has(premiseId)) return [];
      seenPremiseIds.add(premiseId);

      const premise = scenario.premises.find(({ id }) => id === premiseId);
      if (!premise) return [];

      const sourceGrounding =
        premise.origin.kind === "source"
          ? premise.origin.sourceLocatorIds
              .map((locatorId) => {
                const locator = sourceLocators.get(locatorId);
                return locator
                  ? `${locator.work} · ${locator.book} · ${locator.passage}`
                  : locatorId;
              })
              .join("; ")
          : `Creator-approved decision: ${premise.origin.creatorDecisionId}`;

      return [
        {
          premiseId: premise.id,
          summary: premise.summary,
          meaning: premise.meaning,
          approvalStatus: premise.approvalState,
          sourceGrounding,
          whyWithheld:
            premise.id === boundary.premiseId
              ? "It states the concealed fact directly, so participant prose must wait for a registered reveal."
              : "It would confirm or materially narrow the concealed fact before a registered reveal makes it observable.",
        },
      ];
    }),
  );
};

const boundedEventRenderText = (
  event: WorldSimulationEvent,
  scenario: WorldSimulationScenario,
  worldPack: PenelopeWorldPackV1,
  narrationContractMode: "current" | "w5_locked_2026_07_18",
): string => {
  const renderPolicy = requireWorldPack({ scenario, worldPack }).renderPolicy;
  if (narrationContractMode === "w5_locked_2026_07_18") {
    const locked = renderPolicy.lockedEventTextByActionId[event.actionId];
    if (locked) return locked;
  }
  if (narrationContractMode === "current" && event.source.kind === "npc") {
    const currentReaction =
      renderPolicy.currentReactionTextByRuleId[event.source.reactionRuleId];
    if (currentReaction) return currentReaction;
  }
  if (narrationContractMode === "current") {
    const current = renderPolicy.currentEventTextByActionId[event.actionId];
    if (current) return current;
  }
  const registered = renderPolicy.registeredEventTextByActionId[event.actionId];
  if (registered) return registered;
  if (event.source.kind === "participant") {
    const focal = scenario.actors.find(
      ({ id }) => id === scenario.focalParticipantEntityId,
    );
    return `${focal?.participantLabel ?? "The focal character"} acts inside the bounded scene.`;
  }
  if (event.source.kind === "npc") {
    const actorEntityId = event.source.actorEntityId;
    const label =
      scenario.actors.find(({ id }) => id === actorEntityId)
        ?.participantLabel ?? "Someone nearby";
    return `${label} reacts inside the bounded scene.`;
  }
  return "The world answers the visible change.";
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
  worldPack,
  session,
  styleProfile,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
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
  const criticalFlagActive = requireWorldPack({ scenario, worldPack }).renderPolicy.criticalFlagIds.some(
    (flagId) =>
      session.state.flags.find(({ id }) => id === flagId)?.value === true,
  );
  const atMaximum = session.state.clocks.some(({ id, value }) => {
    const clock = clockById.get(id);
    return clock !== undefined && value >= clock.maxValue;
  });
  const aboveBaseline = session.state.clocks.some(({ id, value }) => {
    const clock = clockById.get(id);
    return clock !== undefined && value > clock.initialValue;
  });
  if (criticalFlagActive || atMaximum) {
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
  worldPack,
  session,
  receipt,
  styleProfile: styleProfileInput,
  narrationContractMode = "current",
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt | null;
  styleProfile: PenelopeEnglishStyleProfile;
  narrationContractMode?: "current" | "w5_locked_2026_07_18";
}): WorldNarrationPipelineArtifacts => {
  const pack = requireWorldPack({ scenario, worldPack });
  const renderPolicy = pack.renderPolicy;
  const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileInput);
  const sceneMode = narrationSceneMode({ session, receipt });
  const focalId = scenario.focalParticipantEntityId;
  const focalZoneId = session.state.actors.find(
    ({ entityId }) => entityId === focalId,
  )?.zoneId;
  const zone = scenario.zones.find(({ id }) => id === focalZoneId);
  const zoneFactId = safeFactId("narration_zone", zone?.id ?? "unknown");
  const zoneRenderText =
    narrationContractMode === "current"
      ? sceneMode === "ending"
        ? renderPolicy.zoneCompleteText
        : renderPolicy.zoneActiveText
      : `${zone?.name ?? "The room"} contains the registered scene.`;
  const presentActorIds = new Set(
    session.state.actors
      .filter(({ zoneId }) => zoneId === focalZoneId)
      .map(({ entityId }) => entityId),
  );
  const presentActors = scenario.actors
    .filter(({ id }) => presentActorIds.has(id))
    .map((actor) => {
      const alias = pack.identityPolicy.actorAliases.find(
        ({ entityId }) => entityId === actor.id,
      );
      const entityId = modelFacingEntityId(pack, actor.id);
      const factId = safeFactId("narration_actor", entityId);
      return {
        entityId,
        renderDescriptor:
          narrationContractMode === "current"
            ? renderPolicy.actorRenderTextById[actor.id] ?? alias?.renderText ??
              `${actor.participantLabel} remains in ${zone?.name ?? "the room"}.`
            : alias?.renderText ?? `${actor.participantLabel} remains in ${zone?.name ?? "the room"}.`,
        sourceFactIds: [factId],
      };
    });
  const focalActorFactId =
    presentActors.find(
      ({ entityId }) => entityId === modelFacingEntityId(pack, focalId),
    )?.sourceFactIds[0] ?? zoneFactId;
  const endingActorFactId =
    presentActors.find(
      ({ entityId }) =>
        entityId === modelFacingEntityId(pack, renderPolicy.endingStopActorId),
    )
      ?.sourceFactIds[0] ?? focalActorFactId;
  const turnStopFactId =
    narrationContractMode === "current" ? focalActorFactId : zoneFactId;
  const endingStopFactId =
    narrationContractMode === "current" ? endingActorFactId : zoneFactId;
  const visibleFacts = [
    { factId: zoneFactId, renderText: zoneRenderText },
    ...presentActors.map(({ entityId, renderDescriptor, sourceFactIds }) => ({
      factId: sourceFactIds[0]!,
      renderText: renderDescriptor,
      entityId,
    })),
  ].map(({ factId, renderText }) => ({ factId, renderText }));
  const visibleRuntimeEvents = safeVisibleEvents({ scenario, worldPack: pack, receipt });
  const runtimeResolvedEvents = visibleRuntimeEvents.map((event, index) => ({
    eventId: `event.visible_${index + 1}`,
    observableText: boundedEventRenderText(
      event,
      scenario,
      pack,
      narrationContractMode,
    ),
    sourceAuthorityIds: [WORLD_NARRATION_RUNTIME_AUTHORITY_ID],
  }));
  const endingResolvedEvent = session.state.endingId
    ? {
        eventId: "event.ending_consequence",
        observableText:
          (narrationContractMode === "current"
            ? renderPolicy.currentEndingTextById[session.state.endingId]
            : undefined) ??
          renderPolicy.registeredEndingTextById[session.state.endingId] ??
          "The registered ending leaves its resolved consequence inside the bounded scene.",
        sourceAuthorityIds: [WORLD_NARRATION_RUNTIME_AUTHORITY_ID],
      }
    : null;
  const baseResolvedEvents = [
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
        deliveryLicenses:
          narrationContractMode === "w5_locked_2026_07_18"
            ? []
            : directive.deliveryCues.map((cue) => ({
                licenseId: `license.${cue.id}`,
                issuer: "creator" as const,
                issuerAuthorityId: approvalReceipt.binding.issuerAuthorityId,
                issuedBeforeGeneration: true as const,
                category: cue.category,
                contentBoundary: cue.contentBoundary,
                sourceAuthorityIds: [resolvedEvent.eventId],
              })),
      },
    ];
  });
  const speechLicenses = resolvedSpeech.flatMap((speech) => [
    speech.license,
    ...speech.deliveryLicenses,
  ]);
  const actionEvent =
    baseResolvedEvents.find((_, index) => visibleRuntimeEvents[index]?.source.kind === "participant") ??
    baseResolvedEvents[0];
  const reactionEvent =
    baseResolvedEvents.find((_, index) => visibleRuntimeEvents[index]?.source.kind !== "participant") ??
    baseResolvedEvents.at(-1);
  const participantActionId = visibleRuntimeEvents.find(
    ({ source }) => source.kind === "participant",
  )?.actionId;
  const turnConsequenceEvent =
    narrationContractMode === "current" &&
    sceneMode === "turn" &&
    reactionEvent?.eventId === baseResolvedEvents.at(-1)?.eventId &&
    participantActionId
      ? {
          eventId: "event.turn_consequence",
          observableText:
            renderPolicy.currentTurnConsequenceTextByActionId[participantActionId] ??
            "The room carries the visible change.",
          sourceAuthorityIds: [WORLD_NARRATION_RUNTIME_AUTHORITY_ID],
        }
      : null;
  const resolvedEvents = [
    ...baseResolvedEvents,
    ...(turnConsequenceEvent ? [turnConsequenceEvent] : []),
  ];
  const changeEvent =
    endingResolvedEvent ?? turnConsequenceEvent ?? baseResolvedEvents.at(-1);
  const actionIds = sceneMode === "turn" && actionEvent ? [actionEvent.eventId] : [];
  const reactionIds =
    sceneMode === "turn" && reactionEvent ? [reactionEvent.eventId] : [];
  const changeIds =
    sceneMode !== "setup" && changeEvent ? [changeEvent.eventId] : [];
  const unresolvedKnowledge = unresolvedHiddenKnowledge({
    scenario,
    worldPack: pack,
    session,
  });
  const privateKnowledgeIds = unresolvedKnowledge.map(
    ({ privateKnowledgeId }) => privateKnowledgeId,
  );
  const reservedCandidates =
    session.state.status === "complete"
      ? []
      : selectedWorldActionCandidates({ scenario, worldPack: pack, session });
  const inputEnvelope = NarrationInputEnvelopeSchema.parse({
    modelFacing: {
      sceneMode,
      languageProfileId: styleProfile.profileId,
      referenceReceiptId: WORLD_NARRATION_REFERENCE_RECEIPT_ID,
      focalActorId: modelFacingEntityId(pack, focalId),
      presentActors,
      visibleFacts,
      resolvedEvents,
      authorizedActionEventIds: actionIds,
      authorizedReactionEventIds: reactionIds,
      authorizedChangeEventIds: changeIds,
      authorizedAnchors: [],
      licensedRenderingDetails: speechLicenses,
      speechDisclosures:
        narrationContractMode === "current"
          ? resolvedSpeech.map((speech) => ({
              eventId: speech.resolvedEvent.eventId,
              speakerId: modelFacingEntityId(
                pack,
                speech.directive.disclosureGeometry.speakerId,
              ),
              addresseeIds:
                speech.directive.disclosureGeometry.addresseeIds.map((entityId) =>
                  modelFacingEntityId(pack, entityId),
                ),
              volume: speech.directive.disclosureGeometry.volume,
              distance: speech.directive.disclosureGeometry.distance,
              lineOfSightIds:
                speech.directive.disclosureGeometry.lineOfSightIds.map((entityId) =>
                  modelFacingEntityId(pack, entityId),
                ),
              confirmedHearerIds:
                speech.directive.disclosureGeometry.confirmedHearerIds.map((entityId) =>
                  modelFacingEntityId(pack, entityId),
                ),
              deliveryCueLicenseIds: speech.deliveryLicenses.map(
                ({ licenseId }) => licenseId,
              ),
            }))
          : [],
      styleStateId: narrationStyleStateId({
        scenario,
        worldPack: pack,
        session,
        styleProfile,
      }),
      reservedActionIds: reservedCandidates.map(({ actionId }) => actionId),
    },
    privateValidation: {
      forbiddenKnowledgeIds: privateKnowledgeIds,
      forbiddenInferenceRuleIds: [],
      creatorOnlyReviewNoteIds: [],
      latentDisclosureRisks:
        narrationContractMode === "current"
          ? behindCurtainRisks({ scenario, receipt }).map((risk) => ({
              riskId: risk.riskId,
              eventId:
                resolvedSpeech.find(
                  ({ directive }) =>
                    `risk.${directive.id}.potential_audience` === risk.riskId,
                )?.resolvedEvent.eventId ?? risk.eventId,
              potentialHearerIds: risk.potentialHearers.map(({ entityId }) =>
                modelFacingEntityId(pack, entityId),
              ),
              channel: "behind_curtain" as const,
              exposureStatus: risk.exposureStatus,
            }))
          : [],
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
    role: "orientation" | "authorized_action" | "observable_reaction" | "resolved_consequence" | "pressure" | "licensed_dialogue" | "in_world_stop";
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
  const speechPlans = resolvedSpeech.map((speech, index) =>
    plan({
        id:
          narrationContractMode === "w5_locked_2026_07_18" && index === 0
            ? `sentence.${sceneMode}.licensed_dialogue`
            : `sentence.${sceneMode}.licensed_dialogue_${index + 1}`,
        role: "licensed_dialogue",
        speakerId: modelFacingEntityId(
          pack,
          speech.directive.speakerEntityId,
        ),
        speechEventIds:
          narrationContractMode === "w5_locked_2026_07_18"
            ? []
            : [speech.resolvedEvent.eventId],
        licensedRenderingDetailIds: [speech.license.licenseId],
        plainIntent: speech.directive.plainIntent,
        plainIntentSourceAuthorityIds: [
          speech.resolvedEvent.eventId,
          speech.license.licenseId,
        ],
        plainFunction: "Render the creator-approved answer within its stated boundary.",
      }),
  );
  const deliveryPlans = resolvedSpeech.flatMap((speech, speechIndex) =>
    speech.deliveryLicenses.map((license, cueIndex) =>
        plan({
          id:
            narrationContractMode === "w5_locked_2026_07_18" &&
            speechIndex === 0
              ? `sentence.${sceneMode}.delivery_${cueIndex + 1}`
              : `sentence.${sceneMode}.delivery_${speechIndex + 1}_${cueIndex + 1}`,
          role: "pressure",
          licensedRenderingDetailIds: [license.licenseId],
          plainFunction: "Render one authorized delivery fact.",
        }),
      ),
  );
  const speechEventIds = new Set(
    resolvedSpeech.map(({ resolvedEvent }) => resolvedEvent.eventId),
  );
  const endingReactionPlans =
    sceneMode === "ending"
      ? runtimeResolvedEvents.flatMap((event, index) => {
          const source = visibleRuntimeEvents[index];
          if (
            !source ||
            source.source.kind === "participant" ||
            speechEventIds.has(event.eventId)
          ) {
            return [];
          }
          return [
            plan({
              id: `sentence.ending.pressure_${index + 1}`,
              role: "pressure",
              sourceEventIds: [event.eventId],
              plainFunction: "Render one registered reaction that drives the ending.",
            }),
          ];
        })
      : [];
  const setupStopFactId =
    presentActors.find(
      ({ entityId }) =>
        entityId === modelFacingEntityId(pack, renderPolicy.setupStopActorId),
    )
      ?.sourceFactIds[0] ??
    presentActors.find(
      ({ entityId }) => entityId !== modelFacingEntityId(pack, focalId),
    )?.sourceFactIds[0] ??
    zoneFactId;
  const sentencePlans =
    sceneMode === "setup"
      ? [
          plan({
            id: "sentence.setup.orientation",
            role: "orientation",
            sourceEventIds: resolvedEvents[0] ? [resolvedEvents[0].eventId] : [],
            sourceFactIds: resolvedEvents[0] ? [] : [zoneFactId],
            plainFunction: "Open on the registered scene and its present actors.",
          }),
          plan({
            id: "sentence.setup.stop",
            role: "in_world_stop",
            sourceFactIds: [setupStopFactId],
            plainFunction: "Stop on the pack-designated present actor.",
          }),
        ]
      : sceneMode === "turn"
        ? [
            plan({
              id: "sentence.turn.action",
              role: "authorized_action",
              actorId: modelFacingEntityId(pack, focalId),
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
            ...deliveryPlans,
            ...speechPlans,
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
              sourceFactIds: [turnStopFactId],
              plainFunction:
                "End with the focal actor still inside the registered scene; never make the place the grammatical subject.",
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
            ...endingReactionPlans,
            ...deliveryPlans,
            ...speechPlans,
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
              sourceFactIds: [endingStopFactId],
              plainFunction:
                "Close on the pack-designated actor; never repeat the prior consequence or make the place the grammatical subject.",
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
      licensedRenderingDetailIds: speechLicenses.map(
        ({ licenseId }) => licenseId,
      ),
      licensedRenderingDetails: speechLicenses,
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
      focalActorId: modelFacingEntityId(pack, focalId),
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
    dialogueAuthority: resolvedSpeech[0]
      ? {
          mode: "licensed",
          speakerId: modelFacingEntityId(
            pack,
            resolvedSpeech[0].directive.speakerEntityId,
          ),
          speechAct: resolvedSpeech[0].directive.speechAct,
          speechEventIds: [resolvedSpeech[0].resolvedEvent.eventId],
          speechActLicenseIds: [resolvedSpeech[0].license.licenseId],
          authorizedContentIds: [
            resolvedSpeech[0].resolvedEvent.eventId,
            resolvedSpeech[0].license.licenseId,
          ],
          plainIntent: resolvedSpeech[0].directive.plainIntent,
          plainIntentSourceAuthorityIds: [
            resolvedSpeech[0].resolvedEvent.eventId,
            resolvedSpeech[0].license.licenseId,
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
    ...(resolvedSpeech.length > 1
      ? {
          additionalDialogueAuthorities: resolvedSpeech
            .slice(1)
            .map((speech) => ({
              mode: "licensed" as const,
              speakerId: modelFacingEntityId(
                pack,
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
            })),
        }
      : {}),
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
    forbiddenKnowledge: unresolvedKnowledge.map((policy) => ({
      id: policy.privateKnowledgeId,
      patterns: policy.forbiddenPatterns,
    })),
    forbiddenInferences: [],
  };
  const artifacts = {
    inputEnvelope,
    scenePlan,
    preflightReceipt,
    styleProfile,
    authorityRegistry: {
      typedSpeechEvents: resolvedSpeech.map((speech) => ({
        eventId: speech.resolvedEvent.eventId,
        registeredKind: "speech" as const,
      })),
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
      text: `${
        scenario.actors.find(({ id }) => id === focalId)?.participantLabel ??
        "The focal character"
      } may ${candidate.suggestedInput}.`,
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
  worldPack,
  session,
  receipt,
  styleProfile,
  renderer,
  critic,
}: {
  scenario: WorldSimulationScenario;
  worldPack: PenelopeWorldPackV1;
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt | null;
  styleProfile: PenelopeEnglishStyleProfile;
  renderer: NarrationRenderer;
  critic?: NarrationCritic | null;
}): Promise<WorldSessionNarrationPipelineOutcome> => {
  const pack = requireWorldPack({ scenario, worldPack });
  if (receipt?.action.status === "unsupported") {
    return {
      outcome: "no_render",
      committableSession: session,
      committableReceipt: receipt,
      narration: unsupportedActionNarration(scenario, pack),
      trace: UNSUPPORTED_ACTION_NARRATION_TRACE,
      reason: "unsupported_action",
      rendererCallCount: 0,
      criticCallCount: 0,
    };
  }
  const artifacts = buildWorldNarrationPipelineArtifacts({
    scenario,
    worldPack: pack,
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
  worldPack: PenelopeWorldPackV1;
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

const presentationForWorldPack = (
  pack: PenelopeWorldPackV1,
  availability: "registered" | "session_private",
) => ({
  packId: pack.packId,
  packVersion: pack.packVersion,
  availability,
  definitionDigest: pack.definitionDigest,
  publicTitle: pack.presentation.publicTitle,
  publicSubtitle: pack.presentation.publicSubtitle,
  hook: pack.presentation.hook,
  demoOrder: pack.presentation.demoOrder,
  sourceEyebrow: pack.presentation.sourceEyebrow,
  sourceIntroduction: pack.presentation.sourceIntroduction,
  productThesis: pack.presentation.productThesis,
  guidedCreatorMove: pack.presentation.guidedCreatorMove,
});

/**
 * Registered packs populate the selector, while an imported session pack is
 * always retained as the active choice even when it is not public registry
 * material.  The list deliberately exposes only summary data.
 */
const availableWorldPacksFor = (pack: PenelopeWorldPackV1) => {
  const registered = listWorldPacks().map((summary) => ({
    ...summary,
    availability: "registered" as const,
  }));
  const activeAvailability = isRegisteredWorldPack(pack)
    ? "registered"
    : "session_private";
  const active = presentationForWorldPack(pack, activeAvailability);
  return [
    ...registered.filter(({ packId }) => packId !== active.packId),
    {
      packId: active.packId,
      packVersion: active.packVersion,
      availability: active.availability,
      publicTitle: active.publicTitle,
      publicSubtitle: active.publicSubtitle,
      hook: active.hook,
      demoOrder: active.demoOrder,
    },
  ].sort((left, right) => left.demoOrder - right.demoOrder);
};

export const buildWorldParticipantView = ({
  scenario,
  worldPack,
  session,
  sessionId,
  parentCheckpointId,
  forked,
  transport,
  receipt,
  narration,
  trace,
}: WorldSessionProjectionInput): WorldParticipantSessionView => {
  const pack = requireWorldPack({ scenario, worldPack });
  const focal = scenario.actors.find(
    ({ id }) => id === scenario.focalParticipantEntityId,
  );
  if (!focal) throw new Error("The focal world actor is unavailable.");
  const endingRule = session.state.endingId
    ? scenario.endingRules.find(({ id }) => id === session.state.endingId)
    : null;
  const visibleEvents = safeVisibleEvents({ scenario, worldPack: pack, receipt });
  const allEvents = receipt?.events ?? [openingEvent(scenario, pack)];
  const nextActions =
    session.state.status === "complete"
      ? []
      : selectedWorldActionCandidates({ scenario, worldPack: pack, session });
  const facts = [
    ...observableFacts({ scenario, worldPack: pack, session }).map(({ factId, summary }) => ({
      id: factId,
      summary,
    })),
    ...focalKnowledgeFacts({ scenario, worldPack: pack, session }).map(({ factId, summary }) => ({
      id: factId,
      summary,
    })),
  ];
  return WorldParticipantSessionViewSchema.parse({
    sessionId,
    parentCheckpointId,
    scenarioId: scenario.id,
    title: scenario.title,
    participantSummary: pack.presentation.participantSummary,
    worldPack: presentationForWorldPack(
      pack,
      availableWorldPacksFor(pack).find(({ packId }) => packId === pack.packId)
        ?.availability ?? "session_private",
    ),
    availableWorldPacks: availableWorldPacksFor(pack),
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
          summary:
            pack.renderPolicy.participantEndingTextByKind[endingRule.kind] ??
            "The bounded scene closes with every resolved consequence preserved.",
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
  worldPack,
  session,
  receipt,
  narrationDecisionReceipt = null,
}: Pick<WorldSessionProjectionInput, "scenario" | "worldPack" | "session" | "receipt"> & {
  narrationDecisionReceipt?: WorldNarrationHumanDecisionReceipt | null;
}): WorldCreatorReceipt => {
  const pack = requireWorldPack({ scenario, worldPack });
  return WorldCreatorReceiptSchema.parse({
    worldCodex: {
      scenarioSummary: scenario.summary,
      dramaticQuestion: pack.worldCodex?.dramaticQuestion ?? null,
      relationships: pack.worldCodex?.relationships ?? [],
      possibleEndings: scenario.endingRules.map((ending) => ({
        id: ending.id,
        kind: ending.kind,
        summary: ending.summary,
        provenance: ending.provenance.reviewState,
      })),
    },
    actors: scenario.actors.map((actor) => {
      const runtime = session.state.actors.find(
        ({ entityId }) => entityId === actor.id,
      );
      return {
        entityId: actor.id,
        creatorName: actor.name,
        participantLabel: actor.participantLabel,
        simulationRole: actor.simulationRole,
        zoneId: runtime?.zoneId ?? actor.currentZoneId,
        agendaState: runtime?.agendaState ?? actor.agenda.state,
        agendaDesire: actor.agenda.desire,
        agendaAvoids: actor.agenda.avoids,
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
    behindCurtainPremises: behindCurtainPremises({ scenario, worldPack: pack }),
    behindCurtainRisks: behindCurtainRisks({ scenario, receipt }),
    events: receipt?.events ?? [openingEvent(scenario, pack)],
    creatorDirections: session.turns.flatMap((turn) =>
      turn.creatorDirection ? [turn.creatorDirection] : [],
    ),
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
};

export const buildWorldSessionProjections = (
  input: WorldSessionProjectionInput,
): {
  participantView: WorldParticipantSessionView;
  creatorReceipt: WorldCreatorReceipt;
} => ({
  participantView: buildWorldParticipantView(input),
  creatorReceipt: buildWorldCreatorReceipt(input),
});

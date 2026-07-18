import {
  WorldCreatorReceiptSchema,
  WorldParticipantSessionViewSchema,
  type WorldCreatorReceipt,
  type WorldParticipantSessionView,
  type WorldPresentationTransport,
} from "@/src/contracts/world-api";
import {
  WorldNarrationRequestSchema,
  validateWorldNarration,
  worldNarrationTextMatchesRestrictedConcept,
  type WorldNarrationRequest,
  type WorldNarrationRestrictedConcept,
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
import type { WorldNarrator } from "@/src/ports/world-narrator";

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

const STRANGER_IDENTITY_RESTRICTION: WorldNarrationRestrictedConcept = {
  conceptId: "concept.stranger_identity",
  unlockFactId: STRANGER_IDENTITY_FACT_ID,
  forbiddenTerms: [
    "disguised Odysseus",
    "Odysseus in disguise",
    "Ulysses in disguise",
    "Laertiades in disguise",
    "Odysseus himself",
    "Ulysses himself",
    "Laertiades himself",
  ],
  equivalences: [
    {
      subjectTerms: [
        "the stranger",
        "stranger",
        "the beggar",
        "beggar",
        "the guest",
        "guest",
        "the wanderer",
        "wanderer",
        "the man before her",
        "whom she faced",
        "the speaker",
      ],
      relationTerms: [
        "is",
        "was",
        "really",
        "actually",
        "true identity",
        "real identity",
        "true name",
        "real name",
        "revealed as",
        "recognized as",
        "known as",
        "in disguise",
        "disguised",
        "none other than",
        "returned as",
        "realized",
      ],
      objectTerms: [
        "Odysseus",
        "Ulysses",
        "Laertiades",
        "son of Laertes",
        "the king of Ithaca",
        "king of Ithaca",
        "Penelope's husband",
        "her husband",
        "the returned king",
      ],
      maxTokenDistance: 24,
    },
  ],
};

const STYLE_CONSTRAINTS = [
  {
    constraintId: "style.limited_penelope_view",
    ownership: "agent_proposed" as const,
    instruction:
      "Use a close third-person view limited to what Penelope can perceive, remember, or reasonably infer.",
  },
  {
    constraintId: "style.concrete_pressure",
    ownership: "agent_proposed" as const,
    instruction:
      "Render pressure through physical action, interrupted speech, and objects in the room instead of abstract explanation.",
  },
  {
    constraintId: "style.dialogue_subtext",
    ownership: "agent_proposed" as const,
    instruction:
      "Let dialogue conceal as much as it reveals; do not make characters explain the ontology or causal rules.",
  },
  {
    constraintId: "style.no_false_certainty",
    ownership: "agent_proposed" as const,
    instruction:
      "Preserve uncertainty. Evidence may alter suspicion without becoming knowledge unless the resolved events explicitly grant it.",
  },
];

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

export const buildWorldNarrationRestrictedConcepts = ({
  scenario,
  session,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
}): WorldNarrationRestrictedConcept[] => {
  const knownIds = new Set(focalPremiseIds(session, scenario.focalParticipantEntityId));
  return knownIds.has(STRANGER_IDENTITY_FACT_ID)
    ? []
    : [structuredClone(STRANGER_IDENTITY_RESTRICTION)];
};

export const buildWorldNarrationRequest = ({
  scenario,
  session,
  receipt,
  previousVisibleSceneSummary,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt | null;
  previousVisibleSceneSummary: string | null;
}): WorldNarrationRequest => {
  const restrictedConcepts = buildWorldNarrationRestrictedConcepts({
    scenario,
    session,
  });
  const candidates =
    session.state.status === "complete"
      ? []
      : selectedActionCandidates({ scenario, session });
  return WorldNarrationRequestSchema.parse({
    focalEntityId: scenario.focalParticipantEntityId,
    observableFacts: observableFacts({ scenario, session }),
    focalKnowledge: focalKnowledgeFacts({ scenario, session }),
    resolvedEvents: narratorEvents(safeVisibleEvents({ scenario, receipt })),
    previousVisibleSceneSummary:
      previousVisibleSceneSummary !== null &&
      restrictedConcepts.some((concept) =>
        worldNarrationTextMatchesRestrictedConcept({
          text: previousVisibleSceneSummary,
          concept,
        }),
      )
        ? null
        : previousVisibleSceneSummary,
    styleConstraints: STYLE_CONSTRAINTS,
    nextActionCandidates: candidates.map((candidate) => ({
      actionId: candidate.actionId,
      actorEntityId: scenario.focalParticipantEntityId,
      actionTypeId: candidate.actionId,
      label: candidate.label,
      intent: candidate.suggestedInput,
    })),
  });
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

export const narrateWorldSession = async ({
  scenario,
  session,
  receipt,
  previousVisibleSceneSummary,
  narrator,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  receipt: WorldTurnReceipt | null;
  previousVisibleSceneSummary: string | null;
  narrator: WorldNarrator;
}) => {
  const request = buildWorldNarrationRequest({
    scenario,
    session,
    receipt,
    previousVisibleSceneSummary,
  });
  const outcome = await narrator.narrate(request);
  if (outcome.outcome !== "completed") {
    throw new WorldNarrationError(outcome.error.code, outcome.error.message);
  }
  const validation = validateWorldNarration({
    request,
    narration: outcome.narration,
    restrictedConcepts: buildWorldNarrationRestrictedConcepts({
      scenario,
      session,
    }),
  });
  if (!validation.ok) {
    throw new WorldNarrationError(
      `world_narration_${validation.code}`,
      validation.message,
    );
  }
  return { narration: validation.narration, trace: outcome.trace };
};

export type WorldSessionProjectionInput = {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  sessionId: string;
  parentCheckpointId: string | null;
  forked: boolean;
  transport: WorldPresentationTransport;
  receipt: WorldTurnReceipt | null;
  narration: Awaited<ReturnType<typeof narrateWorldSession>>["narration"];
  trace: Awaited<ReturnType<typeof narrateWorldSession>>["trace"];
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
}: Pick<
  WorldSessionProjectionInput,
  "scenario" | "session" | "receipt"
>): WorldCreatorReceipt =>
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

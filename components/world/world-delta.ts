import type {
  WorldCreatorReceipt,
  WorldEvent,
  WorldSessionView,
} from "@/components/world/api-types";

/**
 * The smallest checkpoint shape needed by the public World Pulse.  The
 * workbench's richer local checkpoint can satisfy this structurally without
 * making the pure projection depend on React state or transport details.
 */
export type WorldPulseCheckpoint = {
  sequence: number;
  view: WorldSessionView;
  creatorReceipt: WorldCreatorReceipt | null;
};

export type WorldKnowledgeDelta = {
  actorId: string;
  actorName: string;
  gainedPremiseIds: string[];
  lostPremiseIds: string[];
  summary: string;
};

export type WorldActorMovement = {
  actorId: string;
  actorName: string;
  fromZoneId: string;
  toZoneId: string;
  eventId: string | null;
  offstage: boolean;
  summary: string;
};

export type WorldClockDelta = {
  clockId: string;
  label: string;
  beforeValue: number;
  afterValue: number;
  maxValue: number;
  delta: number;
  summary: string;
};

export type WorldRelationshipDelta = {
  relationshipId: string;
  label: string;
  beforeLevel: number;
  afterLevel: number;
  delta: number;
  summary: string;
};

export type WorldEndingDelta = {
  beforeEndingId: string | null;
  afterEndingId: string | null;
  beforeKind: string | null;
  afterKind: string | null;
  changed: boolean;
  summary: string;
};

export type WorldCausalRuleProvenance = {
  ruleId: string;
  category: "source_grounded" | "creator_approved_if" | "creator_review_required" | "unclassified";
  label: string;
  eventId: string | null;
  eventSummary: string | null;
  summary: string;
};

export type WorldPulse = {
  fromCheckpointId: string | null;
  toCheckpointId: string;
  knowledge: WorldKnowledgeDelta[];
  movements: WorldActorMovement[];
  clocks: WorldClockDelta[];
  relationships: WorldRelationshipDelta[];
  ending: WorldEndingDelta;
  causalRules: WorldCausalRuleProvenance[];
  summary: string;
};

export type WorldLineComparison = {
  compatible: boolean;
  mode: "same_checkpoint" | "same_parent" | "selected_checkpoints" | "incompatible";
  sharedParentCheckpointId: string | null;
  summary: string;
  knowledge: WorldKnowledgeDelta[];
  movements: WorldActorMovement[];
  clocks: WorldClockDelta[];
  relationships: WorldRelationshipDelta[];
  ending: WorldEndingDelta;
  causalRules: WorldCausalRuleProvenance[];
};

type ActorState = WorldCreatorReceipt["actors"][number];
type ClockState = WorldCreatorReceipt["clocks"][number];

const titleFromId = (value: string): string =>
  value
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const actorMap = (receipt: WorldCreatorReceipt | null): Map<string, ActorState> =>
  new Map(receipt?.actors.map((actor) => [actor.entityId, actor]) ?? []);

const clockMap = (receipt: WorldCreatorReceipt | null): Map<string, ClockState> =>
  new Map(receipt?.clocks.map((clock) => [clock.id, clock]) ?? []);

const relationshipMap = (
  receipt: WorldCreatorReceipt | null,
): Map<string, number> =>
  new Map(
    receipt?.worldCodex.relationshipStates?.map((relationship) => [
      relationship.relationshipId,
      relationship.level,
    ]) ?? [],
  );

const relationshipLabel = (
  receipt: WorldCreatorReceipt | null,
  relationshipId: string,
): string =>
  receipt?.worldCodex.relationships.find(({ id }) => id === relationshipId)
    ?.label ?? titleFromId(relationshipId);

const eventForMovement = (
  events: readonly WorldEvent[],
  actorId: string,
  toZoneId: string,
): WorldEvent | null =>
  events.find((event) =>
    event.effects.some(
      (effect) =>
        effect.kind === "move_actor" &&
        effect.entityId === actorId &&
        effect.toZoneId === toZoneId,
    ),
  ) ?? null;

const orderedActorIds = (
  before: WorldCreatorReceipt | null,
  after: WorldCreatorReceipt | null,
): string[] =>
  [...new Set([...(before?.actors ?? []), ...(after?.actors ?? [])].map(({ entityId }) => entityId))]
    .sort((left, right) => left.localeCompare(right));

const orderedClockIds = (
  before: WorldCreatorReceipt | null,
  after: WorldCreatorReceipt | null,
): string[] =>
  [...new Set([...(before?.clocks ?? []), ...(after?.clocks ?? [])].map(({ id }) => id))]
    .sort((left, right) => left.localeCompare(right));

const orderedRelationshipIds = (
  before: WorldCreatorReceipt | null,
  after: WorldCreatorReceipt | null,
): string[] =>
  [
    ...new Set([
      ...(before?.worldCodex.relationshipStates ?? []),
      ...(after?.worldCodex.relationshipStates ?? []),
    ].map(({ relationshipId }) => relationshipId)),
  ].sort((left, right) => left.localeCompare(right));

const ruleCategory = (
  receipt: WorldCreatorReceipt,
  ruleId: string,
): Pick<WorldCausalRuleProvenance, "category" | "label"> => {
  if (receipt.ruleReview.sourceGroundedIds.includes(ruleId)) {
    return { category: "source_grounded", label: "Source-grounded canon" };
  }
  if (receipt.ruleReview.creatorApprovedNotSourceCanonIds.includes(ruleId)) {
    return {
      category: "creator_approved_if",
      label: "Creator-approved IF · not source canon",
    };
  }
  if (receipt.ruleReview.creatorReviewRequiredIds.includes(ruleId)) {
    return { category: "creator_review_required", label: "Creator review required" };
  }
  return { category: "unclassified", label: "Unclassified causal rule" };
};

const eventRuleIds = (events: readonly WorldEvent[]): Array<{ ruleId: string; event: WorldEvent }> =>
  events
    .flatMap((event) =>
      event.source.kind === "participant"
        ? []
        : [{ ruleId: event.source.reactionRuleId, event }],
    )
    .sort((left, right) =>
      left.ruleId.localeCompare(right.ruleId) || left.event.eventId.localeCompare(right.event.eventId),
    );

const summarizePulse = (pulse: Omit<WorldPulse, "summary">): string => {
  const changes = [
    pulse.knowledge.length > 0 ? `${pulse.knowledge.length} knowledge change${pulse.knowledge.length === 1 ? "" : "s"}` : null,
    pulse.movements.length > 0 ? `${pulse.movements.length} movement${pulse.movements.length === 1 ? "" : "s"}` : null,
    pulse.clocks.length > 0 ? `${pulse.clocks.length} clock shift${pulse.clocks.length === 1 ? "" : "s"}` : null,
    pulse.relationships.length > 0 ? `${pulse.relationships.length} relationship shift${pulse.relationships.length === 1 ? "" : "s"}` : null,
    pulse.ending.changed ? "ending changed" : null,
  ].filter((entry): entry is string => entry !== null);

  return changes.length > 0
    ? `World Pulse: ${changes.join(", ")}.`
    : "World Pulse: no creator-visible state change.";
};

/**
 * Derives a creator-readable delta from receipts only.  It never infers a
 * fact from narration, and it leaves absent creator projections blank rather
 * than presenting a guessed world state.
 */
export const deriveWorldPulse = (
  before: WorldPulseCheckpoint | null,
  after: WorldPulseCheckpoint,
): WorldPulse => {
  const beforeReceipt = before?.creatorReceipt ?? null;
  const afterReceipt = after.creatorReceipt;
  const beforeActors = actorMap(beforeReceipt);
  const afterActors = actorMap(afterReceipt);
  const beforeClocks = clockMap(beforeReceipt);
  const afterClocks = clockMap(afterReceipt);
  const beforeRelationships = relationshipMap(beforeReceipt);
  const afterRelationships = relationshipMap(afterReceipt);

  const knowledge = orderedActorIds(beforeReceipt, afterReceipt).flatMap((actorId) => {
    const previous = beforeActors.get(actorId);
    const current = afterActors.get(actorId);
    if (!current) return [];
    const previousKnowledge = new Set(previous?.knownPremiseIds ?? []);
    const currentKnowledge = new Set(current.knownPremiseIds);
    const gainedPremiseIds = [...currentKnowledge]
      .filter((premiseId) => !previousKnowledge.has(premiseId))
      .sort((left, right) => left.localeCompare(right));
    const lostPremiseIds = [...previousKnowledge]
      .filter((premiseId) => !currentKnowledge.has(premiseId))
      .sort((left, right) => left.localeCompare(right));
    if (gainedPremiseIds.length === 0 && lostPremiseIds.length === 0) return [];
    const fragments = [
      gainedPremiseIds.length > 0 ? `learned ${gainedPremiseIds.map(titleFromId).join(", ")}` : null,
      lostPremiseIds.length > 0 ? `lost ${lostPremiseIds.map(titleFromId).join(", ")}` : null,
    ].filter((fragment): fragment is string => fragment !== null);
    return [{
      actorId,
      actorName: current.creatorName,
      gainedPremiseIds,
      lostPremiseIds,
      summary: `${current.creatorName} ${fragments.join("; ")}.`,
    }];
  });

  const movements = orderedActorIds(beforeReceipt, afterReceipt).flatMap((actorId) => {
    const previous = beforeActors.get(actorId);
    const current = afterActors.get(actorId);
    if (!previous || !current || previous.zoneId === current.zoneId) return [];
    const event = eventForMovement(afterReceipt?.events ?? [], actorId, current.zoneId);
    const offstage = event !== null && event.source.kind !== "participant";
    return [{
      actorId,
      actorName: current.creatorName,
      fromZoneId: previous.zoneId,
      toZoneId: current.zoneId,
      eventId: event?.eventId ?? null,
      offstage,
      summary: `${current.creatorName} moved from ${titleFromId(previous.zoneId)} to ${titleFromId(current.zoneId)}${offstage ? " offstage" : ""}.`,
    }];
  });

  const clocks = orderedClockIds(beforeReceipt, afterReceipt).flatMap((clockId) => {
    const previous = beforeClocks.get(clockId);
    const current = afterClocks.get(clockId);
    if (!current) return [];
    const beforeValue = previous?.value ?? 0;
    const delta = current.value - beforeValue;
    if (delta === 0) return [];
    const direction = delta > 0 ? "rose" : "fell";
    return [{
      clockId,
      label: current.label,
      beforeValue,
      afterValue: current.value,
      maxValue: current.maxValue,
      delta,
      summary: `${current.label} ${direction} from ${beforeValue} to ${current.value} of ${current.maxValue}.`,
    }];
  });

  const relationships = orderedRelationshipIds(beforeReceipt, afterReceipt).flatMap(
    (relationshipId) => {
      const beforeLevel = beforeRelationships.get(relationshipId);
      const afterLevel = afterRelationships.get(relationshipId);
      if (
        beforeLevel === undefined ||
        afterLevel === undefined ||
        beforeLevel === afterLevel
      ) {
        return [];
      }
      const label = relationshipLabel(afterReceipt, relationshipId);
      const delta = afterLevel - beforeLevel;
      return [{
        relationshipId,
        label,
        beforeLevel,
        afterLevel,
        delta,
        summary: `${label} ${delta > 0 ? "strengthened" : "weakened"} from ${beforeLevel} to ${afterLevel}.`,
      }];
    },
  );

  const ending: WorldEndingDelta = {
    beforeEndingId: before?.view.ending?.id ?? null,
    afterEndingId: after.view.ending?.id ?? null,
    beforeKind: before?.view.ending?.kind ?? null,
    afterKind: after.view.ending?.kind ?? null,
    changed:
      (before?.view.ending?.id ?? null) !== (after.view.ending?.id ?? null),
    summary:
      after.view.ending === null
        ? before?.view.ending
          ? "The previous ending is no longer active in this world line."
          : "This world line remains open."
        : before?.view.ending?.id === after.view.ending.id
          ? `This world line remains at ${titleFromId(after.view.ending.kind)}.`
          : `This world line reaches ${titleFromId(after.view.ending.kind)}: ${after.view.ending.summary}`,
  };

  const causalRules = afterReceipt
    ? eventRuleIds(afterReceipt.events).map(({ ruleId, event }) => {
        const category = ruleCategory(afterReceipt, ruleId);
        return {
          ruleId,
          ...category,
          eventId: event.eventId,
          eventSummary: event.summary,
          summary: `${category.label}: ${titleFromId(ruleId)} caused ${event.summary}`,
        };
      })
    : [];

  const pulse = {
    fromCheckpointId: before?.view.sessionId ?? null,
    toCheckpointId: after.view.sessionId,
    knowledge,
    movements,
    clocks,
    relationships,
    ending,
    causalRules,
  };
  return { ...pulse, summary: summarizePulse(pulse) };
};

const compareCausalRules = (
  left: WorldPulseCheckpoint,
  right: WorldPulseCheckpoint,
): WorldCausalRuleProvenance[] => {
  const leftRules = new Set(
    eventRuleIds(left.creatorReceipt?.events ?? []).map(({ ruleId }) => ruleId),
  );
  const rightRules = new Set(
    eventRuleIds(right.creatorReceipt?.events ?? []).map(({ ruleId }) => ruleId),
  );
  return [...new Set([...leftRules, ...rightRules])]
    .filter((ruleId) => leftRules.has(ruleId) !== rightRules.has(ruleId))
    .sort((first, second) => first.localeCompare(second))
    .map((ruleId) => {
      const owner = rightRules.has(ruleId) ? right.creatorReceipt : left.creatorReceipt;
      const category = owner
        ? ruleCategory(owner, ruleId)
        : { category: "unclassified" as const, label: "Unclassified causal rule" };
      const presentOn = rightRules.has(ruleId) ? "right" : "left";
      return {
        ruleId,
        ...category,
        eventId: null,
        eventSummary: null,
        summary: `${category.label}: ${titleFromId(ruleId)} is active only on the ${presentOn} world line.`,
      };
    });
};

/**
 * Compares two visible checkpoints without requiring a graph database.  A
 * sibling pair gets explicit lineage; any two checkpoints in the same
 * scenario remain comparable only as a user-selected state comparison.
 */
export const compareWorldLines = (
  left: WorldPulseCheckpoint,
  right: WorldPulseCheckpoint,
): WorldLineComparison => {
  if (left.view.scenarioId !== right.view.scenarioId) {
    return {
      compatible: false,
      mode: "incompatible",
      sharedParentCheckpointId: null,
      summary: "These checkpoints belong to different worlds and cannot be compared as one simulation.",
      knowledge: [],
      movements: [],
      clocks: [],
      relationships: [],
      ending: {
        beforeEndingId: left.view.ending?.id ?? null,
        afterEndingId: right.view.ending?.id ?? null,
        beforeKind: left.view.ending?.kind ?? null,
        afterKind: right.view.ending?.kind ?? null,
        changed: false,
        summary: "No ending comparison is available across different worlds.",
      },
      causalRules: [],
    };
  }

  const sameCheckpoint = left.view.sessionId === right.view.sessionId;
  const sharedParentCheckpointId =
    left.view.parentCheckpointId !== null &&
    left.view.parentCheckpointId === right.view.parentCheckpointId
      ? left.view.parentCheckpointId
      : null;
  const mode = sameCheckpoint
    ? "same_checkpoint"
    : sharedParentCheckpointId !== null
      ? "same_parent"
      : "selected_checkpoints";

  const leftActors = actorMap(left.creatorReceipt);
  const rightActors = actorMap(right.creatorReceipt);
  const knowledge = orderedActorIds(left.creatorReceipt, right.creatorReceipt).flatMap((actorId) => {
    const leftActor = leftActors.get(actorId);
    const rightActor = rightActors.get(actorId);
    if (!leftActor || !rightActor) return [];
    const gainedPremiseIds = rightActor.knownPremiseIds
      .filter((premiseId) => !leftActor.knownPremiseIds.includes(premiseId))
      .sort((first, second) => first.localeCompare(second));
    const lostPremiseIds = leftActor.knownPremiseIds
      .filter((premiseId) => !rightActor.knownPremiseIds.includes(premiseId))
      .sort((first, second) => first.localeCompare(second));
    if (gainedPremiseIds.length === 0 && lostPremiseIds.length === 0) return [];
    const fragments = [
      gainedPremiseIds.length > 0 ? `knows ${gainedPremiseIds.map(titleFromId).join(", ")} only on the right` : null,
      lostPremiseIds.length > 0 ? `knows ${lostPremiseIds.map(titleFromId).join(", ")} only on the left` : null,
    ].filter((fragment): fragment is string => fragment !== null);
    return [{
      actorId,
      actorName: rightActor.creatorName,
      gainedPremiseIds,
      lostPremiseIds,
      summary: `${rightActor.creatorName} ${fragments.join("; ")}.`,
    }];
  });

  const movements = orderedActorIds(left.creatorReceipt, right.creatorReceipt).flatMap((actorId) => {
    const leftActor = leftActors.get(actorId);
    const rightActor = rightActors.get(actorId);
    if (!leftActor || !rightActor || leftActor.zoneId === rightActor.zoneId) return [];
    return [{
      actorId,
      actorName: rightActor.creatorName,
      fromZoneId: leftActor.zoneId,
      toZoneId: rightActor.zoneId,
      eventId: null,
      offstage: false,
      summary: `${rightActor.creatorName} is at ${titleFromId(leftActor.zoneId)} on the left and ${titleFromId(rightActor.zoneId)} on the right.`,
    }];
  });

  const leftClocks = clockMap(left.creatorReceipt);
  const rightClocks = clockMap(right.creatorReceipt);
  const clocks = orderedClockIds(left.creatorReceipt, right.creatorReceipt).flatMap((clockId) => {
    const leftClock = leftClocks.get(clockId);
    const rightClock = rightClocks.get(clockId);
    if (!leftClock || !rightClock || leftClock.value === rightClock.value) return [];
    return [{
      clockId,
      label: rightClock.label,
      beforeValue: leftClock.value,
      afterValue: rightClock.value,
      maxValue: rightClock.maxValue,
      delta: rightClock.value - leftClock.value,
      summary: `${rightClock.label} is ${leftClock.value} of ${leftClock.maxValue} on the left and ${rightClock.value} of ${rightClock.maxValue} on the right.`,
    }];
  });
  const leftRelationships = relationshipMap(left.creatorReceipt);
  const rightRelationships = relationshipMap(right.creatorReceipt);
  const relationships = orderedRelationshipIds(
    left.creatorReceipt,
    right.creatorReceipt,
  ).flatMap((relationshipId) => {
    const beforeLevel = leftRelationships.get(relationshipId);
    const afterLevel = rightRelationships.get(relationshipId);
    if (
      beforeLevel === undefined ||
      afterLevel === undefined ||
      beforeLevel === afterLevel
    ) {
      return [];
    }
    const label = relationshipLabel(right.creatorReceipt, relationshipId);
    return [{
      relationshipId,
      label,
      beforeLevel,
      afterLevel,
      delta: afterLevel - beforeLevel,
      summary: `${label} is ${beforeLevel} on the left and ${afterLevel} on the right.`,
    }];
  });

  const ending: WorldEndingDelta = {
    beforeEndingId: left.view.ending?.id ?? null,
    afterEndingId: right.view.ending?.id ?? null,
    beforeKind: left.view.ending?.kind ?? null,
    afterKind: right.view.ending?.kind ?? null,
    changed: (left.view.ending?.id ?? null) !== (right.view.ending?.id ?? null),
    summary:
      left.view.ending?.id === right.view.ending?.id
        ? left.view.ending
          ? `Both world lines reach ${titleFromId(left.view.ending.kind)}.`
          : "Neither world line has reached an ending."
        : `The left world line is ${left.view.ending ? titleFromId(left.view.ending.kind) : "still open"}; the right world line is ${right.view.ending ? titleFromId(right.view.ending.kind) : "still open"}.`,
  };
  const causalRules = compareCausalRules(left, right);
  const differences = knowledge.length + movements.length + clocks.length + relationships.length + (ending.changed ? 1 : 0) + causalRules.length;
  const lineage =
    mode === "same_parent"
      ? `These sibling world lines fork from checkpoint ${sharedParentCheckpointId}.`
      : mode === "same_checkpoint"
        ? "These labels point to the same checkpoint."
        : "These are selected checkpoints in the same bounded world.";

  return {
    compatible: true,
    mode,
    sharedParentCheckpointId,
    summary: `${lineage} ${differences === 0 ? "No creator-visible state difference is recorded." : `${differences} creator-visible difference${differences === 1 ? "" : "s"} recorded.`}`,
    knowledge,
    movements,
    clocks,
    relationships,
    ending,
    causalRules,
  };
};

import type {
  WorldCreatorReceipt,
  WorldSessionView,
} from "@/components/world/api-types";

export type WorldCodexCheckpoint = Readonly<{
  sequence: number;
  view: WorldSessionView;
  creatorReceipt: WorldCreatorReceipt;
}>;

export type WorldCodexProjection = Readonly<{
  overview: Readonly<{
    scenarioSummary: string;
    dramaticQuestion: string | null;
    checkpointLabel: string;
    activeClockCount: number;
    latentRiskCount: number;
  }>;
  cast: ReadonlyArray<
    Readonly<{
      entityId: string;
      name: string;
      participantLabel: string;
      role: string;
      location: string;
      agendaState: string;
      desire: string;
      avoids: string;
      knownPremiseCount: number;
      changes: ReadonlyArray<string>;
    }>
  >;
  relationships: ReadonlyArray<
    WorldCreatorReceipt["worldCodex"]["relationships"][number] &
      Readonly<{
        subjectName: string;
        objectName: string;
      }>
  >;
  plot: Readonly<{
    currentEvents: ReadonlyArray<string>;
    clocks: WorldCreatorReceipt["clocks"];
    possibleEndings: WorldCreatorReceipt["worldCodex"]["possibleEndings"];
    latentRisks: WorldCreatorReceipt["behindCurtainRisks"];
  }>;
  branches: ReadonlyArray<
    Readonly<{
      sequence: number;
      checkpointId: string;
      parentCheckpointId: string | null;
      branchId: string;
      parentBranchId: string | null;
      turn: number;
      status: WorldSessionView["status"];
      endingKind: string | null;
      active: boolean;
    }>
  >;
}>;

const actorChanges = (
  actor: WorldCreatorReceipt["actors"][number],
  parent: WorldCreatorReceipt["actors"][number] | undefined,
): string[] => {
  if (!parent) return [];
  const changes: string[] = [];
  if (parent.zoneId !== actor.zoneId) {
    changes.push(`moved from ${parent.zoneId} to ${actor.zoneId}`);
  }
  if (parent.agendaState !== actor.agendaState) {
    changes.push(`agenda changed from ${parent.agendaState} to ${actor.agendaState}`);
  }
  const newlyKnown = actor.knownPremiseIds.filter(
    (premiseId) => !parent.knownPremiseIds.includes(premiseId),
  );
  if (newlyKnown.length > 0) {
    changes.push(
      `learned ${newlyKnown.length} new premise${newlyKnown.length === 1 ? "" : "s"}`,
    );
  }
  return changes;
};

export const buildWorldCodexProjection = ({
  active,
  parent,
  checkpoints,
}: {
  active: WorldCodexCheckpoint;
  parent: WorldCodexCheckpoint | null;
  checkpoints: ReadonlyArray<WorldCodexCheckpoint>;
}): WorldCodexProjection => {
  const actorNames = new Map(
    active.creatorReceipt.actors.map((actor) => [actor.entityId, actor.creatorName]),
  );
  const parentActors = new Map(
    parent?.creatorReceipt.actors.map((actor) => [actor.entityId, actor]) ?? [],
  );

  return {
    overview: {
      scenarioSummary: active.creatorReceipt.worldCodex.scenarioSummary,
      dramaticQuestion: active.creatorReceipt.worldCodex.dramaticQuestion,
      checkpointLabel: `Checkpoint ${String(active.sequence).padStart(2, "0")} · Turn ${active.view.turn} of ${active.view.maxTurns}`,
      activeClockCount: active.creatorReceipt.clocks.filter(
        ({ value, maxValue }) => value > 0 && value < maxValue,
      ).length,
      latentRiskCount: active.creatorReceipt.behindCurtainRisks.length,
    },
    cast: active.creatorReceipt.actors.map((actor) => ({
      entityId: actor.entityId,
      name: actor.creatorName,
      participantLabel: actor.participantLabel,
      role: actor.simulationRole,
      location: actor.zoneId,
      agendaState: actor.agendaState,
      desire: actor.agendaDesire,
      avoids: actor.agendaAvoids,
      knownPremiseCount: actor.knownPremiseIds.length,
      changes: actorChanges(actor, parentActors.get(actor.entityId)),
    })),
    relationships: active.creatorReceipt.worldCodex.relationships.map(
      (relationship) => ({
        ...relationship,
        subjectName:
          actorNames.get(relationship.subjectEntityId) ??
          relationship.subjectEntityId,
        objectName:
          actorNames.get(relationship.objectEntityId) ??
          relationship.objectEntityId,
      }),
    ),
    plot: {
      currentEvents: active.creatorReceipt.events.map(({ summary }) => summary),
      clocks: active.creatorReceipt.clocks,
      possibleEndings: active.creatorReceipt.worldCodex.possibleEndings,
      latentRisks: active.creatorReceipt.behindCurtainRisks,
    },
    branches: checkpoints.map((checkpoint) => ({
      sequence: checkpoint.sequence,
      checkpointId: checkpoint.view.sessionId,
      parentCheckpointId: checkpoint.view.parentCheckpointId,
      branchId: checkpoint.view.cursor.branchId,
      parentBranchId: checkpoint.view.cursor.parentBranchId,
      turn: checkpoint.view.turn,
      status: checkpoint.view.status,
      endingKind: checkpoint.view.ending?.kind ?? null,
      active: checkpoint.view.sessionId === active.view.sessionId,
    })),
  };
};

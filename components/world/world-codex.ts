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
    currentScene: Readonly<{
      id: string;
      title: string;
      sequence: number;
      total: number;
    }> | null;
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
        currentLevel: number | null;
        currentLabel: string | null;
        changeFromParent: number | null;
        history: ReadonlyArray<{
          checkpointId: string;
          sequence: number;
          from: number;
          to: number;
          cause: string;
        }>;
      }>
  >;
  plot: Readonly<{
    currentEvents: ReadonlyArray<string>;
    episodeSpine: ReadonlyArray<{
      id: string;
      sequence: number;
      role: string;
      title: string;
      purpose: string;
      pressure: string;
      completion: string;
      status: "past" | "current" | "future";
    }>;
    realizedBeats: ReadonlyArray<{
      checkpointId: string;
      sequence: number;
      sceneId: string | null;
      sceneTitle: string | null;
      choice: string | null;
      events: ReadonlyArray<string>;
    }>;
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
      depth: number;
      lane: number;
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
  const checkpointById = new Map(
    checkpoints.map((checkpoint) => [checkpoint.view.sessionId, checkpoint]),
  );
  const lineage: WorldCodexCheckpoint[] = [];
  let lineageCursor: WorldCodexCheckpoint | undefined = active;
  const seenCheckpointIds = new Set<string>();
  while (
    lineageCursor &&
    !seenCheckpointIds.has(lineageCursor.view.sessionId)
  ) {
    lineage.unshift(lineageCursor);
    seenCheckpointIds.add(lineageCursor.view.sessionId);
    lineageCursor = lineageCursor.view.parentCheckpointId
      ? checkpointById.get(lineageCursor.view.parentCheckpointId)
      : undefined;
  }
  const episode = active.creatorReceipt.worldCodex.episode ?? null;
  const currentScene = episode
    ? episode.blueprint.scenes.find(({ id }) => id === episode.currentSceneId) ??
      null
    : null;
  const relationshipState = (
    checkpoint: WorldCodexCheckpoint | null,
    relationshipId: string,
  ): number | null =>
    checkpoint?.creatorReceipt.worldCodex.relationshipStates?.find(
      (state) => state.relationshipId === relationshipId,
    )?.level ?? null;
  const branchByCheckpointId = new Map(
    checkpoints.map((checkpoint) => [checkpoint.view.sessionId, checkpoint]),
  );
  const depthCache = new Map<string, number>();
  const branchDepth = (checkpoint: WorldCodexCheckpoint): number => {
    const cached = depthCache.get(checkpoint.view.sessionId);
    if (cached !== undefined) return cached;
    const parentCheckpoint = checkpoint.view.parentCheckpointId
      ? branchByCheckpointId.get(checkpoint.view.parentCheckpointId)
      : null;
    const depth = parentCheckpoint ? branchDepth(parentCheckpoint) + 1 : 0;
    depthCache.set(checkpoint.view.sessionId, depth);
    return depth;
  };
  const laneByBranchId = new Map<string, number>();
  checkpoints.forEach((checkpoint) => {
    if (!laneByBranchId.has(checkpoint.view.cursor.branchId)) {
      laneByBranchId.set(checkpoint.view.cursor.branchId, laneByBranchId.size);
    }
  });

  return {
    overview: {
      scenarioSummary: active.creatorReceipt.worldCodex.scenarioSummary,
      dramaticQuestion: active.creatorReceipt.worldCodex.dramaticQuestion,
      checkpointLabel: `Checkpoint ${String(active.sequence).padStart(2, "0")} · Turn ${active.view.turn} of ${active.view.maxTurns}`,
      activeClockCount: active.creatorReceipt.clocks.filter(
        ({ value }) => value > 0,
      ).length,
      latentRiskCount: active.creatorReceipt.behindCurtainRisks.length,
      currentScene: currentScene
        ? {
            id: currentScene.id,
            title: currentScene.title,
            sequence: currentScene.sequence,
            total: episode!.blueprint.scenes.length,
          }
        : null,
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
      (relationship) => {
        const currentLevel = relationshipState(active, relationship.id);
        const parentLevel = relationshipState(parent, relationship.id);
        const history = lineage.flatMap((checkpoint, index) => {
          if (index === 0) return [];
          const previous = lineage[index - 1]!;
          const from = relationshipState(previous, relationship.id);
          const to = relationshipState(checkpoint, relationship.id);
          if (from === null || to === null || from === to) return [];
          const cause = checkpoint.creatorReceipt.events.find((event) =>
            event.effects.some(
              (effect) =>
                effect.kind === "adjust_relationship" &&
                effect.relationshipId === relationship.id,
            ),
          )?.summary ?? "A typed relationship effect changed this bond.";
          return [{
            checkpointId: checkpoint.view.sessionId,
            sequence: checkpoint.sequence,
            from,
            to,
            cause,
          }];
        });
        return {
          ...relationship,
          subjectName:
            actorNames.get(relationship.subjectEntityId) ??
            relationship.subjectEntityId,
          objectName:
            actorNames.get(relationship.objectEntityId) ??
            relationship.objectEntityId,
          currentLevel,
          currentLabel:
            currentLevel !== null && relationship.levelLabels
              ? relationship.levelLabels[currentLevel + 2]
              : null,
          changeFromParent:
            currentLevel !== null && parentLevel !== null
              ? currentLevel - parentLevel
              : null,
          history,
        };
      },
    ),
    plot: {
      currentEvents: active.creatorReceipt.events.map(({ summary }) => summary),
      episodeSpine:
        episode?.blueprint.scenes.map((scene) => ({
          ...scene,
          status:
            scene.sequence < (currentScene?.sequence ?? 1)
              ? "past"
              : scene.sequence === (currentScene?.sequence ?? 1)
                ? "current"
                : "future",
        })) ?? [],
      realizedBeats: lineage.map((checkpoint) => {
        const transition = checkpoint.creatorReceipt.sceneTransition ?? null;
        const sceneId =
          transition?.fromSceneId ??
          checkpoint.creatorReceipt.worldCodex.episode?.currentSceneId ??
          null;
        const blueprint =
          checkpoint.creatorReceipt.worldCodex.episode?.blueprint ?? null;
        return {
          checkpointId: checkpoint.view.sessionId,
          sequence: checkpoint.sequence,
          sceneId,
          sceneTitle:
            blueprint?.scenes.find(({ id }) => id === sceneId)?.title ?? null,
          choice:
            checkpoint.creatorReceipt.creatorDirections.at(-1)?.originalAction ??
            null,
          events: checkpoint.creatorReceipt.events.map(({ summary }) => summary),
        };
      }),
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
      depth: branchDepth(checkpoint),
      lane: laneByBranchId.get(checkpoint.view.cursor.branchId) ?? 0,
    })),
  };
};

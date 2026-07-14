import {
  ReplayCaseSchema,
  ReplayCaseSetSchema,
  type ReplayCase,
} from "@/src/contracts/replay";
import type { WorldPack } from "@/src/domain/schemas";

export { ReplayCaseSchema, ReplayCaseSetSchema };
export type { ReplayCase };

export type ReplayFixtureIndex = {
  draftFixtureIds: ReadonlySet<string>;
  overlayFixtureIds: ReadonlySet<string>;
  snapshotFixtureIds: ReadonlySet<string>;
};

export const validateReplayCaseReferences = (
  pack: WorldPack,
  cases: ReadonlyArray<ReplayCase>,
  fixtures: ReplayFixtureIndex,
): string[] => {
  const declaredIds = new Set(pack.replayCaseIds);
  const fixtureCaseIds = new Set(cases.map(({ id }) => id));
  const styleProfileIds = new Set(pack.styleProfiles.map(({ id }) => id));
  const characterIds = new Set(
    pack.entities.filter(({ kind }) => kind === "character").map(({ id }) => id),
  );
  const issues: string[] = [];

  for (const replayCase of cases) {
    const priorStageIds = new Set<string>();
    for (const stage of replayCase.stages) {
      if (stage.kind === "run") {
        if (!fixtures.draftFixtureIds.has(stage.draftFixtureId)) {
          issues.push(`Replay ${replayCase.id} references unknown draft fixture ${stage.draftFixtureId}`);
        }
        if (!fixtures.overlayFixtureIds.has(stage.overlayFixtureId)) {
          issues.push(`Replay ${replayCase.id} references unknown overlay fixture ${stage.overlayFixtureId}`);
        }
        if (!fixtures.snapshotFixtureIds.has(stage.snapshotFixtureId)) {
          issues.push(`Replay ${replayCase.id} references unknown snapshot fixture ${stage.snapshotFixtureId}`);
        }
        if (!styleProfileIds.has(stage.styleProfileId)) {
          issues.push(`Replay ${replayCase.id} references unknown style profile ${stage.styleProfileId}`);
        }
        for (const entityId of stage.participantIntents.flatMap(
          ({ controlledEntityIds }) => controlledEntityIds,
        )) {
          if (!characterIds.has(entityId)) {
            issues.push(`Replay ${replayCase.id} controls unknown character ${entityId}`);
          }
        }
      } else if (stage.kind === "decision") {
        if (!priorStageIds.has(stage.proposalFromStageId)) {
          issues.push(
            `Replay ${replayCase.id} decision references unavailable stage ${stage.proposalFromStageId}`,
          );
        }
        if (!fixtures.overlayFixtureIds.has(stage.expectedOverlayFixtureId)) {
          issues.push(
            `Replay ${replayCase.id} references unknown overlay fixture ${stage.expectedOverlayFixtureId}`,
          );
        }
        if (!fixtures.snapshotFixtureIds.has(stage.expectedSnapshotFixtureId)) {
          issues.push(
            `Replay ${replayCase.id} references unknown snapshot fixture ${stage.expectedSnapshotFixtureId}`,
          );
        }
      } else {
        if (!fixtures.draftFixtureIds.has(stage.draftFixtureId)) {
          issues.push(`Replay ${replayCase.id} references unknown draft fixture ${stage.draftFixtureId}`);
        }
        if (!fixtures.overlayFixtureIds.has(stage.overlayFixtureId)) {
          issues.push(`Replay ${replayCase.id} references unknown overlay fixture ${stage.overlayFixtureId}`);
        }
        if (!fixtures.snapshotFixtureIds.has(stage.snapshotFixtureId)) {
          issues.push(`Replay ${replayCase.id} references unknown snapshot fixture ${stage.snapshotFixtureId}`);
        }
      }
      priorStageIds.add(stage.stageId);
    }
  }

  for (const id of declaredIds) {
    if (!fixtureCaseIds.has(id)) issues.push(`World Pack declares missing replay fixture ${id}`);
  }
  for (const id of fixtureCaseIds) {
    if (!declaredIds.has(id)) issues.push(`Replay fixture ${id} is not declared by the World Pack`);
  }

  return issues.sort();
};

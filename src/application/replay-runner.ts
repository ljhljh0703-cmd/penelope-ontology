import {
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import type { CreatorDecision } from "@/src/contracts/creator-decision";
import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { ReplayCase } from "@/src/contracts/replay";
import type { RunResult } from "@/src/contracts/run";
import type { WorldPack } from "@/src/domain/schemas";
import { applyCreatorDecision } from "@/src/domain/canon-overlay";
import { activeRules } from "@/src/domain/retrieval";
import { applySimulationAction, rebaseSnapshot } from "@/src/domain/simulation";
import type { NarrativeModel } from "@/src/ports/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";

export type ReplayStageResult = {
  stageId: string;
  kind: "run" | "decision" | "transition";
  passed: boolean;
  detail: string;
};

export type ReplayCaseResult = {
  id: string;
  description: string;
  passed: boolean;
  stages: ReplayStageResult[];
};

export type OverlayReplayResult = {
  suiteId: "approved_overlay_regression";
  overlayId: string;
  overlayVersion: number;
  overlayHash: string;
  passed: boolean;
  cases: ReplayCaseResult[];
};

const disabledLiveModel: NarrativeModel = {
  async generate() {
    return {
      outcome: "configuration_error",
      error: { code: "replay_live_forbidden", message: "Replay is fixture-only.", retryable: false },
      trace: {
        mode: "live",
        outcome: "configuration_error",
        requestedModel: "gpt-5.6",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      },
    };
  },
};

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  [...left].sort().join("\n") === [...right].sort().join("\n");

export const runFrozenReplay = async ({
  worldPack,
  replayCases,
  fixtureModel,
}: {
  worldPack: WorldPack;
  replayCases: ReadonlyArray<ReplayCase>;
  fixtureModel: NarrativeModel;
}): Promise<ReplayCaseResult[]> => {
  const run = createRunOrchestrator({
    worldPack,
    fixtureModel,
    liveModel: disabledLiveModel,
  });
  const output: ReplayCaseResult[] = [];

  for (const replayCase of replayCases) {
    const stageResults: ReplayStageResult[] = [];
    const runs = new Map<string, RunResult>();

    for (const stage of replayCase.stages) {
      if (stage.kind === "run") {
        const [overlay, snapshot] = await Promise.all([
          loadOverlayFixture(stage.overlayFixtureId),
          loadSnapshotFixture(stage.snapshotFixtureId),
        ]);
        const result = await run({
          modelMode: "fixture",
          draftFixtureId: stage.draftFixtureId,
          overlay,
          snapshot,
          styleProfileId: stage.styleProfileId,
          taskType: stage.taskType,
          brief: stage.brief,
          participantIntents: stage.participantIntents,
        });
        runs.set(stage.stageId, result);
        const codes = result.hardViolations.map(({ code }) => code);
        const proposalIds = result.proposals.map(({ id }) => id);
        const passed =
          result.status === stage.expected.status &&
          stage.expected.requiredViolationCodes.every((code) => codes.includes(code)) &&
          stage.expected.forbiddenViolationCodes.every((code) => !codes.includes(code)) &&
          sameIds(proposalIds, stage.expected.proposalIds);
        stageResults.push({
          stageId: stage.stageId,
          kind: stage.kind,
          passed,
          detail: `${result.status}; violations=${codes.join(",") || "none"}`,
        });
        continue;
      }

      if (stage.kind === "decision") {
        const prior = runs.get(stage.proposalFromStageId);
        const proposal = prior?.proposals[0];
        if (!prior || !proposal) {
          stageResults.push({
            stageId: stage.stageId,
            kind: stage.kind,
            passed: false,
            detail: "Referenced proposal stage is unavailable.",
          });
          continue;
        }
        const priorStage = replayCase.stages.find(
          (candidate) =>
            candidate.kind === "run" && candidate.stageId === stage.proposalFromStageId,
        );
        if (!priorStage || priorStage.kind !== "run") {
          stageResults.push({
            stageId: stage.stageId,
            kind: stage.kind,
            passed: false,
            detail: "Referenced run-stage authority is unavailable.",
          });
          continue;
        }
        const decision: CreatorDecision =
          stage.action === "edit"
            ? {
                action: "edit",
                proposalId: proposal.id,
                proposalHash: proposal.proposalHash,
                baseOverlayId: proposal.baseOverlayId,
                baseOverlayVersion: proposal.baseOverlayVersion,
                baseOverlayHash: proposal.baseOverlayHash,
                patches: proposal.patches,
              }
            : {
                action: stage.action,
                proposalId: proposal.id,
                proposalHash: proposal.proposalHash,
                baseOverlayId: proposal.baseOverlayId,
                baseOverlayVersion: proposal.baseOverlayVersion,
                baseOverlayHash: proposal.baseOverlayHash,
              };
        const result = applyCreatorDecision({
          worldPack,
          overlay: await loadOverlayFixture(priorStage.overlayFixtureId),
          snapshot: prior.currentSnapshot,
          proposal,
          decision,
        });
        const [expectedOverlay, expectedSnapshot] = await Promise.all([
          loadOverlayFixture(stage.expectedOverlayFixtureId),
          loadSnapshotFixture(stage.expectedSnapshotFixtureId),
        ]);
        const passed =
          result.status === (stage.action === "reject" ? "rejected" : "applied") &&
          result.overlay.hash === expectedOverlay.hash &&
          result.snapshot.stateHash === expectedSnapshot.stateHash;
        stageResults.push({
          stageId: stage.stageId,
          kind: stage.kind,
          passed,
          detail: `${result.status}; overlay=v${result.overlay.version}`,
        });
        continue;
      }

      const [overlay, snapshot, draft] = await Promise.all([
        loadOverlayFixture(stage.overlayFixtureId),
        loadSnapshotFixture(stage.snapshotFixtureId),
        loadDraftFixture(stage.draftFixtureId),
      ]);
      const scenario = worldPack.simulationScenarios.find(
        ({ id }) => id === snapshot.scenarioId,
      );
      const action = draft.actions[0];
      if (!scenario || !action || draft.actions.length !== 1) {
        stageResults.push({
          stageId: stage.stageId,
          kind: stage.kind,
          passed: false,
          detail: "Transition fixture must contain exactly one action.",
        });
        continue;
      }
      const result = applySimulationAction({
        scenario,
        snapshot,
        action,
        activeRuleIds: new Set(activeRules(worldPack, overlay, snapshot).map(({ id }) => id)),
      });
      const passed =
        result.status === stage.expected.status &&
        result.transition.fromStateHash === stage.expected.fromStateHash &&
        result.transition.toStateHash === stage.expected.toStateHash &&
        result.snapshot.turnIndex === stage.expected.turnIndex &&
        JSON.stringify(result.snapshot.variables) === JSON.stringify(stage.expected.variables);
      stageResults.push({
        stageId: stage.stageId,
        kind: stage.kind,
        passed,
        detail: `${result.status}; turn=${result.snapshot.turnIndex}`,
      });
    }

    output.push({
      id: replayCase.id,
      description: replayCase.description,
      passed: stageResults.every(({ passed }) => passed),
      stages: stageResults,
    });
  }

  return output;
};

export const runApprovedOverlayReplay = async ({
  worldPack,
  replayCases,
  fixtureModel,
  overlay,
}: {
  worldPack: WorldPack;
  replayCases: ReadonlyArray<ReplayCase>;
  fixtureModel: NarrativeModel;
  overlay: CanonOverlay;
}): Promise<OverlayReplayResult> => {
  if (
    overlay.worldPackId !== worldPack.meta.id ||
    overlay.worldPackVersion !== worldPack.meta.version
  ) {
    throw new Error("Approved-overlay replay authority does not match the World Pack.");
  }

  const controls = replayCases.filter(({ stages }) =>
    stages.every(({ kind }) => kind === "run"),
  );
  if (controls.length === 0) {
    throw new Error("Approved-overlay replay has no run-only safety controls.");
  }

  const run = createRunOrchestrator({
    worldPack,
    fixtureModel,
    liveModel: disabledLiveModel,
  });
  const cases: ReplayCaseResult[] = [];

  for (const replayCase of controls) {
    const stages: ReplayStageResult[] = [];
    for (const stage of replayCase.stages) {
      if (stage.kind !== "run") {
        throw new Error("Approved-overlay replay accepts run-only controls.");
      }
      const baseSnapshot = await loadSnapshotFixture(stage.snapshotFixtureId);
      const snapshot = rebaseSnapshot(baseSnapshot, overlay);
      const result = await run({
        modelMode: "fixture",
        draftFixtureId: stage.draftFixtureId,
        overlay,
        snapshot,
        styleProfileId: stage.styleProfileId,
        taskType: stage.taskType,
        brief: stage.brief,
        participantIntents: stage.participantIntents,
      });
      const codes = result.hardViolations.map(({ code }) => code);
      const proposalIds = result.proposals.map(({ id }) => id);
      const passed =
        result.status === stage.expected.status &&
        stage.expected.requiredViolationCodes.every((code) => codes.includes(code)) &&
        stage.expected.forbiddenViolationCodes.every((code) => !codes.includes(code)) &&
        sameIds(proposalIds, stage.expected.proposalIds);
      stages.push({
        stageId: stage.stageId,
        kind: stage.kind,
        passed,
        detail: `overlay=v${overlay.version}; ${result.status}; violations=${codes.join(",") || "none"}`,
      });
    }
    cases.push({
      id: replayCase.id,
      description: replayCase.description,
      passed: stages.every(({ passed }) => passed),
      stages,
    });
  }

  return {
    suiteId: "approved_overlay_regression",
    overlayId: overlay.id,
    overlayVersion: overlay.version,
    overlayHash: overlay.hash,
    passed: cases.every(({ passed }) => passed),
    cases,
  };
};

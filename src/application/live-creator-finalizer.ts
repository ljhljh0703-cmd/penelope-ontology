import { loadDraftFixture } from "@/src/adapters/filesystem/demo-data";
import {
  runApprovedOverlayReplay,
  type OverlayReplayResult,
} from "@/src/application/replay-runner";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import {
  CanonOverlaySchema,
  type CanonOverlay,
} from "@/src/contracts/canon-overlay";
import {
  CreatorDecisionSchema,
  type CreatorDecision,
  type CreatorDecisionResult,
} from "@/src/contracts/creator-decision";
import type { CanonProposal } from "@/src/contracts/proposal";
import type { ReplayCase, ReplayStage } from "@/src/contracts/replay";
import {
  LiveRunRequestSchema,
  RunResultSchema,
  type RunRequest,
  type RunResult,
} from "@/src/contracts/run";
import {
  SimulationSnapshotSchema,
  type SimulationSnapshot,
} from "@/src/contracts/simulation";
import { applyCreatorDecision } from "@/src/domain/canon-overlay";
import { canonicalJson } from "@/src/domain/canonical-json";
import {
  normalizeParticipantIntents,
  validateOutputLineage,
} from "@/src/domain/participants";
import { activeRules } from "@/src/domain/retrieval";
import {
  applySimulationAction,
  type SimulationActionResult,
} from "@/src/domain/simulation";
import { WorldPackSchema, type WorldPack } from "@/src/domain/schemas";
import { evaluateLiveRedSailRunResult } from "@/src/evidence/live-scenario-contract";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import type { NarrativeModel } from "@/src/ports/narrative-model";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

const RED_SAIL_REPLAY_CASE_ID = "replay.red_sail_proposal";
const RED_SAIL_STEP_1_STAGE_ID = "stage.red_sail_step_1";
const RED_SAIL_STEP_2_STAGE_ID = "stage.red_sail_step_2";
const RED_SAIL_STEP_1_DRAFT_ID = "draft.red_sail_step_1";
const RED_SAIL_STEP_2_DRAFT_ID = "draft.red_sail_step_2";
const RED_SAIL_RULE_ID = "rule.creator.red_sail_signal";
const HARBOR_WATCH_VARIABLE_ID = "harbor_watch";
const EXPECTED_SAFETY_CONTROL_COUNT = 4;
const GPT_56_MODEL = /^gpt-5\.6(?:$|[-._])/;

export type LiveCreatorFinalizerFailureReason =
  | "input_invalid"
  | "authority_mismatch"
  | "live_run_invalid"
  | "proposal_mismatch"
  | "decision_not_applied"
  | "regression_failed"
  | "registered_flow_invalid"
  | "transition_failed";

export class LiveCreatorFinalizerError extends Error {
  constructor(readonly reason: LiveCreatorFinalizerFailureReason, message: string) {
    super(message);
    this.name = "LiveCreatorFinalizerError";
  }
}

type FinalizationBase = {
  verifiedRun: RunResult;
  proposal: CanonProposal;
  decision: CreatorDecisionResult;
  finalSnapshot: SimulationSnapshot;
};

export type RejectedLiveCreatorFinalization = FinalizationBase & {
  status: "rejected";
  overlayReplay: null;
  transitionResults: readonly [];
};

export type AppliedLiveCreatorFinalization = FinalizationBase & {
  status: "applied";
  overlayReplay: OverlayReplayResult;
  transitionResults: readonly [SimulationActionResult, SimulationActionResult];
};

export type LiveCreatorFinalizationResult =
  | RejectedLiveCreatorFinalization
  | AppliedLiveCreatorFinalization;

function fail(
  reason: LiveCreatorFinalizerFailureReason,
  message: string,
): never {
  throw new LiveCreatorFinalizerError(reason, message);
}

const parseInput = <T>(
  schema: { parse(input: unknown): T },
  input: unknown,
  label: string,
): T => {
  try {
    return schema.parse(input);
  } catch {
    return fail("input_invalid", `${label} failed schema validation.`);
  }
};

const exact = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right);

const harborWatchValue = (snapshot: SimulationSnapshot): string | null =>
  snapshot.variables.find(({ id }) => id === HARBOR_WATCH_VARIABLE_ID)?.value ?? null;

const assertRegisteredStep = ({
  replayCases,
  stageId,
  draftFixtureId,
}: {
  replayCases: ReadonlyArray<ReplayCase>;
  stageId: string;
  draftFixtureId: string;
}): Extract<ReplayStage, { kind: "transition" }> => {
  const redSailReplay = replayCases.find(({ id }) => id === RED_SAIL_REPLAY_CASE_ID);
  const stage = redSailReplay?.stages.find((candidate) => candidate.stageId === stageId);
  if (!stage || stage.kind !== "transition" || stage.draftFixtureId !== draftFixtureId) {
    fail(
      "registered_flow_invalid",
      `Registered red-sail transition ${stageId} is unavailable or changed.`,
    );
  }
  return stage;
};

/**
 * Finalizes a locally verified live run without recalling the model or writing files.
 *
 * The supplied RunResult is recomputed from the exact live request, World Pack, and
 * captured model outcome before any creator decision is trusted. Only an applied
 * decision that survives all four frozen controls may enter the registered two-step
 * red-sail transition chain.
 */
export const finalizeVerifiedLiveCreatorDecision = async ({
  worldPack: worldPackInput,
  replayCases,
  fixtureModel,
  liveRequest: liveRequestInput,
  verifiedLiveRun: verifiedLiveRunInput,
  exactOverlay: exactOverlayInput,
  exactSnapshot: exactSnapshotInput,
  creatorDecision: creatorDecisionInput,
}: {
  worldPack: WorldPack;
  replayCases: ReadonlyArray<ReplayCase>;
  fixtureModel: NarrativeModel;
  liveRequest: LiveRunRequest;
  verifiedLiveRun: RunResult;
  exactOverlay: CanonOverlay;
  exactSnapshot: SimulationSnapshot;
  creatorDecision: CreatorDecision;
}): Promise<LiveCreatorFinalizationResult> => {
  const worldPack: WorldPack = parseInput(WorldPackSchema, worldPackInput, "The World Pack");
  const liveRequest: LiveRunRequest = parseInput(
    LiveRunRequestSchema,
    liveRequestInput,
    "The live request",
  );
  const verifiedLiveRun: RunResult = parseInput(
    RunResultSchema,
    verifiedLiveRunInput,
    "The live RunResult",
  );
  const exactOverlay: CanonOverlay = parseInput(
    CanonOverlaySchema,
    exactOverlayInput,
    "The exact overlay",
  );
  const exactSnapshot: SimulationSnapshot = parseInput(
    SimulationSnapshotSchema,
    exactSnapshotInput,
    "The exact snapshot",
  );
  const creatorDecision: CreatorDecision = parseInput(
    CreatorDecisionSchema,
    creatorDecisionInput,
    "The creator decision",
  );

  let expectedLiveRequest: LiveRunRequest;
  try {
    expectedLiveRequest = buildLiveEvidenceRunRequest({
      overlay: exactOverlay,
      snapshot: exactSnapshot,
      styleProfileId: exactSnapshot.styleProfileId,
    });
  } catch {
    fail(
      "authority_mismatch",
      "The supplied authority cannot form the preregistered red-sail request.",
    );
  }
  if (!exact(liveRequest, expectedLiveRequest)) {
    fail(
      "authority_mismatch",
      "The live request is not the exact preregistered red-sail request.",
    );
  }

  if (
    !exact(liveRequest.overlay, exactOverlay) ||
    !exact(liveRequest.snapshot, exactSnapshot) ||
    !exact(verifiedLiveRun.currentSnapshot, exactSnapshot) ||
    !exact(verifiedLiveRun.proposedNextSnapshot, exactSnapshot)
  ) {
    fail(
      "authority_mismatch",
      "The live request, result, overlay, and snapshot do not share one exact base authority.",
    );
  }

  const outcome = verifiedLiveRun.modelOutcome;
  if (
    outcome.outcome !== "completed" ||
    outcome.trace.mode !== "live" ||
    !GPT_56_MODEL.test(outcome.trace.requestedModel) ||
    !GPT_56_MODEL.test(outcome.trace.actualModel) ||
    outcome.trace.inputTokens <= 0 ||
    outcome.trace.outputTokens <= 0
  ) {
    fail("live_run_invalid", "The supplied result is not a completed GPT-5.6 live run.");
  }

  const capturedOutcome = outcome;
  const capturedLiveModel: NarrativeModel = {
    async generate() {
      return capturedOutcome;
    },
  };
  const recomputed = await createRunOrchestrator({
    worldPack,
    fixtureModel: capturedLiveModel,
    liveModel: capturedLiveModel,
  })(liveRequest).catch(() =>
    fail(
      "authority_mismatch",
      "The exact request cannot be evaluated against the supplied World Pack authority.",
    ),
  );
  if (!exact(recomputed, verifiedLiveRun)) {
    fail(
      "live_run_invalid",
      "The supplied live RunResult does not equal the deterministic recomputation.",
    );
  }

  const redSailVerdict = evaluateLiveRedSailRunResult(verifiedLiveRun);
  if (!redSailVerdict.ok) {
    fail(
      "live_run_invalid",
      `The live result violates the registered red-sail contract: ${redSailVerdict.issues.join(", ")}.`,
    );
  }

  const proposal = verifiedLiveRun.proposals.find(
    ({ id, proposalHash }) =>
      id === creatorDecision.proposalId && proposalHash === creatorDecision.proposalHash,
  );
  if (!proposal || verifiedLiveRun.proposals.length !== 1) {
    fail(
      "proposal_mismatch",
      "The creator decision must bind the live run's one exact proposal ID and hash.",
    );
  }
  const onlySelectedProposalNeedsApproval =
    verifiedLiveRun.status === "needs_creator_decision" &&
    verifiedLiveRun.transitionCandidate === null &&
    verifiedLiveRun.hardViolations.length > 0 &&
    verifiedLiveRun.hardViolations.every(
      ({ code, evidenceIds }) =>
        code === "unapproved_expansion" &&
        evidenceIds.length === 1 &&
        evidenceIds[0] === proposal.id,
    );
  if (!onlySelectedProposalNeedsApproval) {
    fail(
      "live_run_invalid",
      "Unrelated validation failures or transition candidates cannot enter creator finalization.",
    );
  }

  const decision = applyCreatorDecision({
    worldPack,
    overlay: exactOverlay,
    snapshot: exactSnapshot,
    proposal,
    decision: creatorDecision,
  });

  if (creatorDecision.action === "reject") {
    if (
      decision.status !== "rejected" ||
      !exact(decision.overlay, exactOverlay) ||
      !exact(decision.snapshot, exactSnapshot)
    ) {
      fail("decision_not_applied", "A rejected decision changed creator authority.");
    }
    return {
      status: "rejected",
      verifiedRun: verifiedLiveRun,
      proposal,
      decision,
      overlayReplay: null,
      transitionResults: [],
      finalSnapshot: exactSnapshot,
    };
  }

  if (decision.status !== "applied") {
    fail(
      "decision_not_applied",
      "Accept and display-only edit may continue only after the decision is applied.",
    );
  }

  const overlayReplay = await runApprovedOverlayReplay({
    worldPack,
    replayCases,
    fixtureModel,
    overlay: decision.overlay,
  }).catch(() =>
    fail("regression_failed", "The approved overlay replay could not be completed."),
  );
  if (
    !overlayReplay.passed ||
    overlayReplay.cases.length !== EXPECTED_SAFETY_CONTROL_COUNT ||
    overlayReplay.cases.some(({ passed }) => !passed) ||
    overlayReplay.overlayHash !== decision.overlay.hash
  ) {
    fail(
      "regression_failed",
      "The approved overlay did not pass all four frozen safety controls.",
    );
  }

  const step1Stage = assertRegisteredStep({
    replayCases,
    stageId: RED_SAIL_STEP_1_STAGE_ID,
    draftFixtureId: RED_SAIL_STEP_1_DRAFT_ID,
  });
  const step2Stage = assertRegisteredStep({
    replayCases,
    stageId: RED_SAIL_STEP_2_STAGE_ID,
    draftFixtureId: RED_SAIL_STEP_2_DRAFT_ID,
  });
  const [step1Draft, step2Draft] = await Promise.all([
    loadDraftFixture(step1Stage.draftFixtureId),
    loadDraftFixture(step2Stage.draftFixtureId),
  ]);
  const step1Action = step1Draft.actions[0];
  const step2Action = step2Draft.actions[0];
  if (
    !step1Action ||
    !step2Action ||
    step1Draft.actions.length !== 1 ||
    step2Draft.actions.length !== 1 ||
    step1Action.variableId !== HARBOR_WATCH_VARIABLE_ID ||
    step1Action.from !== "idle" ||
    step1Action.to !== "watching" ||
    step2Action.variableId !== HARBOR_WATCH_VARIABLE_ID ||
    step2Action.from !== "watching" ||
    step2Action.to !== "signal_seen" ||
    !step1Action.evidenceRuleIds.includes(RED_SAIL_RULE_ID) ||
    !step2Action.evidenceRuleIds.includes(RED_SAIL_RULE_ID)
  ) {
    fail("registered_flow_invalid", "The registered red-sail step actions are incomplete.");
  }

  const step1Participants = normalizeParticipantIntents(
    step1Stage.participantIntents,
    worldPack,
  );
  const step2Participants = normalizeParticipantIntents(
    step2Stage.participantIntents,
    worldPack,
  );
  if (
    validateOutputLineage(
      [],
      [step1Action],
      step1Participants.controlledEntityIdsByIntent,
    ).length > 0 ||
    validateOutputLineage(
      [],
      [step2Action],
      step2Participants.controlledEntityIdsByIntent,
    ).length > 0
  ) {
    fail("registered_flow_invalid", "A registered transition action has invalid intent lineage.");
  }

  const scenario = worldPack.simulationScenarios.find(
    ({ id }) => id === decision.snapshot.scenarioId,
  );
  if (!scenario || harborWatchValue(decision.snapshot) !== "idle") {
    fail(
      "registered_flow_invalid",
      "The applied decision is not rebased onto the registered idle harbor-watch state.",
    );
  }
  const approvedRules = new Set(
    activeRules(worldPack, decision.overlay, decision.snapshot).map(({ id }) => id),
  );
  const step1 = applySimulationAction({
    scenario,
    snapshot: decision.snapshot,
    action: step1Action,
    activeRuleIds: approvedRules,
  });
  const step2 = applySimulationAction({
    scenario,
    snapshot: step1.snapshot,
    action: step2Action,
    activeRuleIds: approvedRules,
  });
  const continuousAppliedChain =
    step1.status === "applied" &&
    step2.status === "applied" &&
    step1.violations.length === 0 &&
    step2.violations.length === 0 &&
    step1.transition.fromStateHash === decision.snapshot.stateHash &&
    step1.transition.toStateHash === step1.snapshot.stateHash &&
    step2.transition.fromStateHash === step1.transition.toStateHash &&
    step2.transition.toStateHash === step2.snapshot.stateHash &&
    harborWatchValue(step1.snapshot) === "watching" &&
    harborWatchValue(step2.snapshot) === "signal_seen";
  if (!continuousAppliedChain) {
    fail(
      "transition_failed",
      "The approved decision did not produce the continuous idle-to-signal-seen hash chain.",
    );
  }

  return {
    status: "applied",
    verifiedRun: verifiedLiveRun,
    proposal,
    decision,
    overlayReplay,
    transitionResults: [step1, step2],
    finalSnapshot: step2.snapshot,
  };
};

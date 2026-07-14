import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import {
  CreatorDecisionResultSchema,
  type CreatorDecision,
  type CreatorDecisionResult,
} from "@/src/contracts/creator-decision";
import type { ModelDraft } from "@/src/contracts/model-draft";
import type { CanonProposal } from "@/src/contracts/proposal";
import type { ReplayCase } from "@/src/contracts/replay";
import type {
  FixtureRunRequest,
  RunResult,
} from "@/src/contracts/run";
import { FixtureRunRequestSchema } from "@/src/contracts/run";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import { applyCreatorDecision } from "@/src/domain/canon-overlay";
import {
  canonicalJson,
  sha256Canonical,
} from "@/src/domain/canonical-json";
import type { WorldPack } from "@/src/domain/schemas";
import type { NarrativeModel } from "@/src/ports/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";

export class FixtureCreatorAuthorityError extends Error {
  constructor(
    readonly reason: "registered_base" | "verified_run",
  ) {
    super(
      reason === "registered_base"
        ? "The public fixture decision must start from its registered base authority."
        : "The public fixture decision must reference its verified run authority.",
    );
    this.name = "FixtureCreatorAuthorityError";
  }
}

export class PublicFixtureRunAuthorityError extends Error {
  readonly code = "public_fixture_run_not_registered";

  constructor() {
    super("The public fixture request must match the registered frozen rehearsal.");
    this.name = "PublicFixtureRunAuthorityError";
  }
}

const REGISTERED_REPLAY_CASE_ID = "replay.red_sail_proposal";
const REGISTERED_RUN_STAGE_ID = "stage.red_sail_proposal";
const REGISTERED_OVERLAY_FIXTURE_ID = "overlay.v0";
const REGISTERED_SNAPSHOT_FIXTURE_ID = "snapshot.s0";
const REGISTERED_DRAFT_FIXTURE_ID = "draft.red_sail_proposal";

export const buildRegisteredPublicFixtureRunRequest = ({
  replayCases,
  registeredOverlay,
  registeredSnapshot,
}: {
  replayCases: ReadonlyArray<ReplayCase>;
  registeredOverlay: CanonOverlay;
  registeredSnapshot: SimulationSnapshot;
}): FixtureRunRequest => {
  const replayCase = replayCases.find(({ id }) => id === REGISTERED_REPLAY_CASE_ID);
  const stage = replayCase?.stages.find(
    (candidate) =>
      candidate.kind === "run" && candidate.stageId === REGISTERED_RUN_STAGE_ID,
  );
  if (
    !replayCase ||
    stage?.kind !== "run" ||
    stage.overlayFixtureId !== REGISTERED_OVERLAY_FIXTURE_ID ||
    stage.snapshotFixtureId !== REGISTERED_SNAPSHOT_FIXTURE_ID ||
    stage.draftFixtureId !== REGISTERED_DRAFT_FIXTURE_ID
  ) {
    throw new Error("The registered public fixture rehearsal is unavailable.");
  }

  return FixtureRunRequestSchema.parse({
    modelMode: "fixture",
    draftFixtureId: stage.draftFixtureId,
    overlay: registeredOverlay,
    snapshot: registeredSnapshot,
    styleProfileId: stage.styleProfileId,
    taskType: stage.taskType,
    brief: stage.brief,
    participantIntents: stage.participantIntents,
  });
};

export const assertRegisteredPublicFixtureRunRequest = ({
  replayCases,
  registeredOverlay,
  registeredSnapshot,
  runRequest,
}: {
  replayCases: ReadonlyArray<ReplayCase>;
  registeredOverlay: CanonOverlay;
  registeredSnapshot: SimulationSnapshot;
  runRequest: FixtureRunRequest;
}): FixtureRunRequest => {
  const parsed = FixtureRunRequestSchema.parse(runRequest);
  const registered = buildRegisteredPublicFixtureRunRequest({
    replayCases,
    registeredOverlay,
    registeredSnapshot,
  });
  if (canonicalJson(parsed) !== canonicalJson(registered)) {
    throw new PublicFixtureRunAuthorityError();
  }
  return parsed;
};

export type VerifiedFixtureCreatorDecision = {
  verifiedRun: RunResult;
  proposal: CanonProposal;
  completedDraft: ModelDraft;
  decision: CreatorDecisionResult;
};

export const verifyFixtureCreatorDecision = async ({
  worldPack,
  replayCases,
  registeredOverlay,
  registeredSnapshot,
  runRequest,
  creatorDecision,
  fixtureModel,
}: {
  worldPack: WorldPack;
  replayCases: ReadonlyArray<ReplayCase>;
  registeredOverlay: CanonOverlay;
  registeredSnapshot: SimulationSnapshot;
  runRequest: FixtureRunRequest;
  creatorDecision: CreatorDecision;
  fixtureModel: NarrativeModel;
}): Promise<VerifiedFixtureCreatorDecision> => {
  assertRegisteredPublicFixtureRunRequest({
    replayCases,
    registeredOverlay,
    registeredSnapshot,
    runRequest,
  });
  const registeredBaseAuthorityIsValid =
    sha256Canonical(runRequest.overlay) === sha256Canonical(registeredOverlay) &&
    sha256Canonical(runRequest.snapshot) === sha256Canonical(registeredSnapshot);
  if (!registeredBaseAuthorityIsValid) {
    throw new FixtureCreatorAuthorityError("registered_base");
  }

  const run = createRunOrchestrator({
    worldPack,
    fixtureModel,
    liveModel: fixtureModel,
  });
  const verifiedRun = await run(runRequest);
  const proposal = verifiedRun.proposals.find(
    ({ id, proposalHash }) =>
      id === creatorDecision.proposalId && proposalHash === creatorDecision.proposalHash,
  );
  const completedDraft =
    verifiedRun.modelOutcome.outcome === "completed"
      ? verifiedRun.modelOutcome.draft
      : null;
  const fixtureAuthorityIsValid =
    Boolean(proposal) &&
    Boolean(completedDraft) &&
    verifiedRun.status === "needs_creator_decision" &&
    verifiedRun.modelOutcome.trace.mode === "fixture" &&
    verifiedRun.proposedNextSnapshot.stateHash === verifiedRun.currentSnapshot.stateHash &&
    verifiedRun.hardViolations.length > 0 &&
    verifiedRun.hardViolations.every(
      ({ code, evidenceIds }) =>
        code === "unapproved_expansion" &&
        verifiedRun.proposals.some(({ id }) => evidenceIds.includes(id)),
    );
  if (!fixtureAuthorityIsValid || !proposal || !completedDraft) {
    throw new FixtureCreatorAuthorityError("verified_run");
  }

  const decision = CreatorDecisionResultSchema.parse(
    applyCreatorDecision({
      worldPack,
      overlay: runRequest.overlay,
      snapshot: runRequest.snapshot,
      proposal,
      decision: creatorDecision,
    }),
  );
  return { verifiedRun, proposal, completedDraft, decision };
};

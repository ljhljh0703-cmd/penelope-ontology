import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import {
  CreatorDecisionResultSchema,
  type CreatorDecision,
  type CreatorDecisionResult,
} from "@/src/contracts/creator-decision";
import type { ModelDraft } from "@/src/contracts/model-draft";
import type { CanonProposal } from "@/src/contracts/proposal";
import type {
  FixtureRunRequest,
  RunResult,
} from "@/src/contracts/run";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import { applyCreatorDecision } from "@/src/domain/canon-overlay";
import { sha256Canonical } from "@/src/domain/canonical-json";
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

export type VerifiedFixtureCreatorDecision = {
  verifiedRun: RunResult;
  proposal: CanonProposal;
  completedDraft: ModelDraft;
  decision: CreatorDecisionResult;
};

export const verifyFixtureCreatorDecision = async ({
  worldPack,
  registeredOverlay,
  registeredSnapshot,
  runRequest,
  creatorDecision,
  fixtureModel,
}: {
  worldPack: WorldPack;
  registeredOverlay: CanonOverlay;
  registeredSnapshot: SimulationSnapshot;
  runRequest: FixtureRunRequest;
  creatorDecision: CreatorDecision;
  fixtureModel: NarrativeModel;
}): Promise<VerifiedFixtureCreatorDecision> => {
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

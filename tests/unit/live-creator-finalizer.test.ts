import { describe, expect, it } from "vitest";
import {
  loadDemoBundle,
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import {
  createFixtureNarrativeModel,
  fixtureNarrativeModel,
} from "@/src/adapters/fixtures/narrative-model";
import {
  finalizeVerifiedLiveCreatorDecision,
} from "@/src/application/live-creator-finalizer";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import type { CreatorDecision } from "@/src/contracts/creator-decision";
import type { ModelDraft } from "@/src/contracts/model-draft";
import type { RunRequest, RunResult } from "@/src/contracts/run";
import type { WorldPack } from "@/src/domain/schemas";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import type { NarrativeModel } from "@/src/ports/narrative-model";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

const buildLiveResult = async (
  mutateDraft: (draft: ModelDraft) => ModelDraft = (draft) => draft,
): Promise<{
  worldPack: WorldPack;
  replayCases: Awaited<ReturnType<typeof loadDemoBundle>>["replayCases"];
  overlay: Awaited<ReturnType<typeof loadOverlayFixture>>;
  snapshot: Awaited<ReturnType<typeof loadSnapshotFixture>>;
  liveRequest: LiveRunRequest;
  verifiedLiveRun: RunResult;
}> => {
  const [{ worldPack, replayCases }, overlay, snapshot, baseDraft] = await Promise.all([
    loadDemoBundle(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
    loadDraftFixture("draft.red_sail_proposal"),
  ]);
  const draft = mutateDraft(baseDraft);
  const liveRequest = buildLiveEvidenceRunRequest({
    overlay,
    snapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
  });
  const liveModel: NarrativeModel = {
    async generate() {
      return {
        outcome: "completed",
        draft,
        trace: {
          mode: "live",
          outcome: "completed",
          requestedModel: "gpt-5.6",
          actualModel: "gpt-5.6-2026-07-01",
          responseId: "resp_live_creator_finalizer_test",
          inputTokens: 120,
          outputTokens: 80,
        },
      };
    },
  };
  const verifiedLiveRun = await createRunOrchestrator({
    worldPack,
    fixtureModel: liveModel,
    liveModel,
  })(liveRequest);
  return { worldPack, replayCases, overlay, snapshot, liveRequest, verifiedLiveRun };
};

const decisionFor = (
  run: RunResult,
  action: "accept" | "reject" = "accept",
): CreatorDecision => {
  const proposal = run.proposals[0];
  if (!proposal) throw new Error("Expected one red-sail proposal.");
  return {
    action,
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    baseOverlayId: proposal.baseOverlayId,
    baseOverlayVersion: proposal.baseOverlayVersion,
    baseOverlayHash: proposal.baseOverlayHash,
  };
};

const finalize = async (
  setup: Awaited<ReturnType<typeof buildLiveResult>>,
  creatorDecision: CreatorDecision,
  fixtureModel: NarrativeModel = fixtureNarrativeModel,
) =>
  finalizeVerifiedLiveCreatorDecision({
    worldPack: setup.worldPack,
    replayCases: setup.replayCases,
    fixtureModel,
    liveRequest: setup.liveRequest,
    verifiedLiveRun: setup.verifiedLiveRun,
    exactOverlay: setup.overlay,
    exactSnapshot: setup.snapshot,
    creatorDecision,
  });

describe("verified live creator finalizer", () => {
  it("accepts one exact live proposal, passes four controls, and chains idle to signal_seen", async () => {
    const setup = await buildLiveResult();
    const result = await finalize(setup, decisionFor(setup.verifiedLiveRun));

    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("Expected an applied finalization.");
    expect(result.decision.status).toBe("applied");
    expect(result.decision.overlay.version).toBe(1);
    expect(result.overlayReplay.cases).toHaveLength(4);
    expect(result.overlayReplay.cases.every(({ passed }) => passed)).toBe(true);
    expect(result.transitionResults).toHaveLength(2);
    const [step1, step2] = result.transitionResults;
    expect(step1.snapshot.variables).toContainEqual({ id: "harbor_watch", value: "watching" });
    expect(step2.snapshot.variables).toContainEqual({ id: "harbor_watch", value: "signal_seen" });
    expect(step1.transition.fromStateHash).toBe(result.decision.snapshot.stateHash);
    expect(step2.transition.fromStateHash).toBe(step1.transition.toStateHash);
    expect(result.finalSnapshot.stateHash).toBe(step2.transition.toStateHash);
  });

  it("permits an edit only when it preserves semantic patch authority", async () => {
    const setup = await buildLiveResult();
    const proposal = setup.verifiedLiveRun.proposals[0];
    if (!proposal) throw new Error("Expected one red-sail proposal.");
    const decision: CreatorDecision = {
      action: "edit",
      proposalId: proposal.id,
      proposalHash: proposal.proposalHash,
      baseOverlayId: proposal.baseOverlayId,
      baseOverlayVersion: proposal.baseOverlayVersion,
      baseOverlayHash: proposal.baseOverlayHash,
      patches: proposal.patches.map((patch) =>
        patch.op === "add_rule"
          ? {
              ...patch,
              rule: {
                ...patch.rule,
                displayDescription: "A red sail asks the watch to observe before anyone declares a return.",
              },
            }
          : patch,
      ),
    };

    const result = await finalize(setup, decision);
    expect(result.status).toBe("applied");
    expect(result.decision.status).toBe("applied");
    expect(
      result.decision.overlay.rules.find(({ id }) => id === "rule.creator.red_sail_signal")
        ?.displayDescription,
    ).toContain("observe");
  });

  it("keeps overlay and state unchanged and runs no transitions when rejected", async () => {
    const setup = await buildLiveResult();
    const result = await finalize(setup, decisionFor(setup.verifiedLiveRun, "reject"));

    expect(result.status).toBe("rejected");
    expect(result.decision.status).toBe("rejected");
    expect(result.decision.overlay).toEqual(setup.overlay);
    expect(result.decision.snapshot).toEqual(setup.snapshot);
    expect(result.finalSnapshot).toEqual(setup.snapshot);
    expect(result.overlayReplay).toBeNull();
    expect(result.transitionResults).toEqual([]);
  });

  it("fails closed for exact-authority and proposal-hash mismatches", async () => {
    const setup = await buildLiveResult();
    const approvedOverlay = await loadOverlayFixture("overlay.v1.red-sail");
    await expect(
      finalizeVerifiedLiveCreatorDecision({
        worldPack: setup.worldPack,
        replayCases: setup.replayCases,
        fixtureModel: fixtureNarrativeModel,
        liveRequest: setup.liveRequest,
        verifiedLiveRun: setup.verifiedLiveRun,
        exactOverlay: approvedOverlay,
        exactSnapshot: setup.snapshot,
        creatorDecision: decisionFor(setup.verifiedLiveRun),
      }),
    ).rejects.toMatchObject({
      reason: "authority_mismatch",
    });

    const mismatchedDecision = {
      ...decisionFor(setup.verifiedLiveRun),
      proposalHash: "f".repeat(64),
    } as CreatorDecision;
    await expect(finalize(setup, mismatchedDecision)).rejects.toMatchObject({
      reason: "proposal_mismatch",
    });
  });

  it("fails closed when the live run contains an unrelated validation failure", async () => {
    const setup = await buildLiveResult((draft) => ({
      ...draft,
      utterances: draft.utterances.map((utterance, index) =>
        index === 0
          ? {
              ...utterance,
              assertedClaimIds: ["claim.odyssey.odysseus_at_ogygia"],
              certainty: "certain",
            }
          : utterance,
      ),
    }));
    expect(setup.verifiedLiveRun.hardViolations.some(({ code }) => code !== "unapproved_expansion"))
      .toBe(true);

    await expect(
      finalize(setup, decisionFor(setup.verifiedLiveRun)),
    ).rejects.toMatchObject({
      reason: "live_run_invalid",
    });
  });

  it("rejects a hash-valid proposal whose red-sail semantic mutation changed", async () => {
    const setup = await buildLiveResult((draft) => ({
      ...draft,
      proposals: draft.proposals.map((proposal) => ({
        ...proposal,
        patches: proposal.patches.map((patch) =>
          patch.op === "add_rule"
            ? {
                ...patch,
                rule: {
                  ...patch.rule,
                  description: "A red sail means the traveler has certainly returned.",
                },
              }
            : patch,
        ),
      })),
    }));

    await expect(
      finalize(setup, decisionFor(setup.verifiedLiveRun)),
    ).rejects.toMatchObject({
      reason: "live_run_invalid",
    });
  });

  it("does not return applied canon or transitions when a safety control regresses", async () => {
    const setup = await buildLiveResult();
    const regressingFixtureModel = createFixtureNarrativeModel(() =>
      loadDraftFixture("draft.red_sail_proposal"),
    );

    await expect(
      finalize(
        setup,
        decisionFor(setup.verifiedLiveRun),
        regressingFixtureModel,
      ),
    ).rejects.toMatchObject({
      reason: "regression_failed",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  loadDemoBundle,
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import {
  finalizeVerifiedLiveCreatorDecision,
  type LiveCreatorFinalizationResult,
} from "@/src/application/live-creator-finalizer";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import type { CreatorDecision } from "@/src/contracts/creator-decision";
import type { RunRequest, RunResult } from "@/src/contracts/run";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  buildLiveHarnessEvidence,
  LiveHarnessEvidenceSchema,
} from "@/src/evidence/live-harness-evidence";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import type { NarrativeModel } from "@/src/ports/narrative-model";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

const PRIVATE_DISPLAY_TEXT =
  "A red sail starts a watch; it does not settle who stands aboard.";
const PRIVATE_RESPONSE_ID = "resp_private_live_harness_test";

const makeSetup = async (): Promise<{
  liveRequest: LiveRunRequest;
  verifiedLiveRun: RunResult;
  finalize: (decision: CreatorDecision) => Promise<LiveCreatorFinalizationResult>;
}> => {
  const [{ worldPack, replayCases }, overlay, snapshot, draft] = await Promise.all([
    loadDemoBundle(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
    loadDraftFixture("draft.red_sail_proposal"),
  ]);
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
          responseId: PRIVATE_RESPONSE_ID,
          inputTokens: 400,
          outputTokens: 160,
        },
      };
    },
  };
  const verifiedLiveRun = await createRunOrchestrator({
    worldPack,
    fixtureModel: liveModel,
    liveModel,
  })(liveRequest);

  return {
    liveRequest,
    verifiedLiveRun,
    finalize: (creatorDecision) =>
      finalizeVerifiedLiveCreatorDecision({
        worldPack,
        replayCases,
        fixtureModel: fixtureNarrativeModel,
        liveRequest,
        verifiedLiveRun,
        exactOverlay: overlay,
        exactSnapshot: snapshot,
        creatorDecision,
      }),
  };
};

const decisionFor = (
  result: RunResult,
  action: "accept" | "edit" | "reject",
): CreatorDecision => {
  const proposal = result.proposals[0];
  if (!proposal) throw new Error("Expected one proposal.");
  const authority = {
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    baseOverlayId: proposal.baseOverlayId,
    baseOverlayVersion: proposal.baseOverlayVersion,
    baseOverlayHash: proposal.baseOverlayHash,
  } as const;
  if (action !== "edit") return { ...authority, action };
  return {
    ...authority,
    action,
    patches: proposal.patches.map((patch) =>
      patch.op === "add_rule"
        ? {
            ...patch,
            rule: { ...patch.rule, displayDescription: PRIVATE_DISPLAY_TEXT },
          }
        : patch,
    ),
  };
};

const publicKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(publicKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...publicKeys(child)]);
};

describe("live creator-harness public evidence", () => {
  it("binds acceptance to the live draft, four controls, and the two-link state chain", async () => {
    const setup = await makeSetup();
    const creatorDecision = decisionFor(setup.verifiedLiveRun, "accept");
    const finalization = await setup.finalize(creatorDecision);
    const evidence = buildLiveHarnessEvidence({
      liveRequest: setup.liveRequest,
      verifiedLiveRun: setup.verifiedLiveRun,
      creatorDecision,
      finalization,
    });

    expect(LiveHarnessEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(evidence).toMatchObject({
      finalizationStatus: "applied",
      decision: { action: "accept" },
      baseAuthority: { overlayVersion: 0, turnIndex: 0 },
      finalAuthority: { overlayVersion: 1, turnIndex: 2 },
      replay: { caseCount: 4, passedCaseCount: 4 },
      rawNarrativePublic: false,
      creatorDecisionTextPublic: false,
    });
    expect(evidence.transitions.map(({ fromValue, toValue }) => [fromValue, toValue]))
      .toEqual([
        ["idle", "watching"],
        ["watching", "signal_seen"],
      ]);
    expect(evidence.transitions[0]?.fromStateHash).toBe(evidence.rebasedStateHash);
    expect(evidence.transitions[1]?.fromStateHash).toBe(
      evidence.transitions[0]?.toStateHash,
    );
    expect(evidence.transitions[1]?.toStateHash).toBe(
      evidence.finalAuthority.stateHash,
    );
    expect(evidence.transitionChainSha256).toBe(
      sha256Canonical(evidence.transitions),
    );
  });

  it("hashes a display-only edit while keeping all private text out of public JSON", async () => {
    const setup = await makeSetup();
    const creatorDecision = decisionFor(setup.verifiedLiveRun, "edit");
    const finalization = await setup.finalize(creatorDecision);
    const evidence = buildLiveHarnessEvidence({
      liveRequest: setup.liveRequest,
      verifiedLiveRun: setup.verifiedLiveRun,
      creatorDecision,
      finalization,
    });
    const serialized = JSON.stringify(evidence);
    const keys = new Set(publicKeys(evidence));

    expect(evidence.decision).toEqual({
      action: "edit",
      decisionSha256: sha256Canonical(creatorDecision),
    });
    expect(keys).not.toContain("narrative");
    expect(keys).not.toContain("utterances");
    expect(keys).not.toContain("summary");
    expect(keys).not.toContain("displayDescription");
    expect(keys).not.toContain("responseId");
    expect(keys).not.toContain("path");
    expect(serialized).not.toContain(PRIVATE_DISPLAY_TEXT);
    expect(serialized).not.toContain(PRIVATE_RESPONSE_ID);
    expect(serialized).not.toContain(
      setup.verifiedLiveRun.modelOutcome.outcome === "completed"
        ? setup.verifiedLiveRun.modelOutcome.draft.narrative
        : "unreachable",
    );
  });

  it("proves rejection with unchanged authority and no replay or transition record", async () => {
    const setup = await makeSetup();
    const creatorDecision = decisionFor(setup.verifiedLiveRun, "reject");
    const finalization = await setup.finalize(creatorDecision);
    const evidence = buildLiveHarnessEvidence({
      liveRequest: setup.liveRequest,
      verifiedLiveRun: setup.verifiedLiveRun,
      creatorDecision,
      finalization,
    });

    expect(evidence.finalizationStatus).toBe("rejected");
    expect(evidence.finalAuthority).toEqual(evidence.baseAuthority);
    expect(evidence.rebasedStateHash).toBeNull();
    expect(evidence.replay).toBeNull();
    expect(evidence.transitions).toEqual([]);
    expect(evidence.transitionChainSha256).toBeNull();
    expect(LiveHarnessEvidenceSchema.safeParse(evidence).success).toBe(true);
  });

  it("fails closed for tampered transition semantics, request authority, and public extras", async () => {
    const setup = await makeSetup();
    const creatorDecision = decisionFor(setup.verifiedLiveRun, "accept");
    const finalization = await setup.finalize(creatorDecision);
    if (finalization.status !== "applied") throw new Error("Expected applied result.");

    const tamperedFinalization = structuredClone(finalization);
    tamperedFinalization.transitionResults[1].transition.fromStateHash = "f".repeat(64);
    expect(() =>
      buildLiveHarnessEvidence({
        liveRequest: setup.liveRequest,
        verifiedLiveRun: setup.verifiedLiveRun,
        creatorDecision,
        finalization: tamperedFinalization,
      }),
    ).toThrow(/transition chain|malformed/u);

    const changedRequest = {
      ...setup.liveRequest,
      brief: "A different, unregistered request.",
    };
    expect(() =>
      buildLiveHarnessEvidence({
        liveRequest: changedRequest,
        verifiedLiveRun: setup.verifiedLiveRun,
        creatorDecision,
        finalization,
      }),
    ).toThrow(/preregistered red-sail request/u);

    const valid = buildLiveHarnessEvidence({
      liveRequest: setup.liveRequest,
      verifiedLiveRun: setup.verifiedLiveRun,
      creatorDecision,
      finalization,
    });
    expect(
      LiveHarnessEvidenceSchema.safeParse({
        ...valid,
        narrative: "A private raw draft must not fit this schema.",
      }).success,
    ).toBe(false);
    expect(
      LiveHarnessEvidenceSchema.safeParse({
        ...valid,
        transitions: valid.transitions.map((transition, index) =>
          index === 1
            ? { ...transition, fromStateHash: "e".repeat(64) }
            : transition,
        ),
      }).success,
    ).toBe(false);
  });
});

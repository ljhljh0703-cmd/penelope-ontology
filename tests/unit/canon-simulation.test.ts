import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCanonOverlay, createCanonProposal, applyCreatorDecision } from "@/src/domain/canon-overlay";
import { WorldPackSchema } from "@/src/domain/schemas";
import { applySimulationAction, createInitialSnapshot } from "@/src/domain/simulation";

const pack = WorldPackSchema.parse(
  JSON.parse(readFileSync(resolve("data/world-packs/trojan-returns/world.json"), "utf8")),
);

const overlayV0 = buildCanonOverlay({
  id: "creator_canon",
  version: 0,
  worldPackId: pack.meta.id,
  worldPackVersion: pack.meta.version,
  claims: [],
  rules: [],
});

const proposal = createCanonProposal(
  {
    id: "proposal.red_sail",
    summary: "Use a red sail as the harbor watch signal.",
    patches: [
      {
        op: "add_rule",
        rule: {
          id: "rule.creator.red_sail_signal",
          kind: "world",
          description: "The Ithacan harbor watch treats a red sail as a return signal.",
        },
      },
    ],
  },
  overlayV0,
);

const action = (from: string, to: string) => ({
  actorEntityId: "telemachus",
  authorizingIntentId: "intent.telemachus",
  contributingIntentIds: [] as string[],
  op: "set_variable" as const,
  variableId: "harbor_watch",
  from,
  to,
  evidenceClaimIds: [] as string[],
  evidenceRuleIds: ["rule.creator.red_sail_signal"],
});

describe("creator decision and bounded simulation", () => {
  it("accepts into overlay v1 and rebases the snapshot without consuming a turn", () => {
    const initial = createInitialSnapshot(pack, overlayV0);
    const result = applyCreatorDecision({
      worldPack: pack,
      overlay: overlayV0,
      snapshot: initial,
      proposal,
      decision: {
        action: "accept",
        proposalId: proposal.id,
        proposalHash: proposal.proposalHash,
        baseOverlayId: overlayV0.id,
        baseOverlayVersion: overlayV0.version,
        baseOverlayHash: overlayV0.hash,
      },
    });

    expect(result.status).toBe("applied");
    expect(result.overlay.version).toBe(1);
    expect(result.overlay.rules.map(({ id }) => id)).toEqual([
      "rule.creator.red_sail_signal",
    ]);
    expect(result.snapshot.turnIndex).toBe(initial.turnIndex);
    expect(result.snapshot.variables).toEqual(initial.variables);
    expect(result.snapshot.canonHash).toBe(result.overlay.hash);
    expect(result.snapshot.stateHash).not.toBe(initial.stateHash);
  });

  it("chains exactly two registered transitions after approval", () => {
    const initial = createInitialSnapshot(pack, overlayV0);
    const approved = applyCreatorDecision({
      worldPack: pack,
      overlay: overlayV0,
      snapshot: initial,
      proposal,
      decision: {
        action: "accept",
        proposalId: proposal.id,
        proposalHash: proposal.proposalHash,
        baseOverlayId: overlayV0.id,
        baseOverlayVersion: overlayV0.version,
        baseOverlayHash: overlayV0.hash,
      },
    });
    const scenario = pack.simulationScenarios[0];
    const activeRuleIds = new Set(approved.overlay.rules.map(({ id }) => id));

    const step1 = applySimulationAction({
      scenario,
      snapshot: approved.snapshot,
      action: action("idle", "watching"),
      activeRuleIds,
    });
    const step2 = applySimulationAction({
      scenario,
      snapshot: step1.snapshot,
      action: action("watching", "signal_seen"),
      activeRuleIds,
    });

    expect(step1.status).toBe("applied");
    expect(step1.snapshot.variables).toContainEqual({ id: "harbor_watch", value: "watching" });
    expect(step2.status).toBe("applied");
    expect(step2.snapshot.variables).toContainEqual({ id: "harbor_watch", value: "signal_seen" });
    expect(step1.transition.toStateHash).toBe(step2.transition.fromStateHash);
    expect(step2.snapshot.turnIndex).toBe(2);

    const third = applySimulationAction({
      scenario,
      snapshot: step2.snapshot,
      action: action("signal_seen", "watching"),
      activeRuleIds,
    });
    expect(third.status).toBe("blocked");
    expect(third.snapshot).toEqual(step2.snapshot);
    expect(third.violations.map(({ code }) => code)).toContain("step_limit_exceeded");
  });

  it("blocks direct skips without changing the snapshot", () => {
    const initial = createInitialSnapshot(pack, overlayV0);
    const scenario = pack.simulationScenarios[0];

    const direct = applySimulationAction({
      scenario,
      snapshot: initial,
      action: action("idle", "signal_seen"),
      activeRuleIds: new Set(),
    });
    expect(direct.status).toBe("blocked");
    expect(direct.snapshot).toEqual(initial);
    expect(direct.transition.fromStateHash).toBe(direct.transition.toStateHash);
    expect(direct.violations.map(({ code }) => code)).toContain("state_transition_invalid");
  });

  it("blocks the registered first transition before its creator rule is approved", () => {
    const initial = createInitialSnapshot(pack, overlayV0);
    const result = applySimulationAction({
      scenario: pack.simulationScenarios[0],
      snapshot: initial,
      action: action("idle", "watching"),
      activeRuleIds: new Set(),
    });

    expect(result.status).toBe("blocked");
    expect(result.snapshot).toEqual(initial);
    expect(result.transition.fromStateHash).toBe(result.transition.toStateHash);
    expect(result.violations.map(({ code }) => code)).toContain("unapproved_expansion");
  });

  it("applies an edit only when it preserves the proposal patch authority", () => {
    const initial = createInitialSnapshot(pack, overlayV0);
    const editedDescription = "A red sail asks the Ithacan watch to observe before declaring a return.";
    const result = applyCreatorDecision({
      worldPack: pack,
      overlay: overlayV0,
      snapshot: initial,
      proposal,
      decision: {
        action: "edit",
        proposalId: proposal.id,
        proposalHash: proposal.proposalHash,
        baseOverlayId: overlayV0.id,
        baseOverlayVersion: overlayV0.version,
        baseOverlayHash: overlayV0.hash,
        patches: [
          {
            op: "add_rule",
            rule: {
              id: "rule.creator.red_sail_signal",
              kind: "world",
              description: editedDescription,
            },
          },
        ],
      },
    });

    expect(result.status).toBe("applied");
    expect(result.overlay.rules[0]?.description).toBe(editedDescription);
    expect(result.snapshot.canonHash).toBe(result.overlay.hash);
  });

  it("rejects edited patch retargeting and invalid World Pack references unchanged", () => {
    const initial = createInitialSnapshot(pack, overlayV0);
    const retargeted = applyCreatorDecision({
      worldPack: pack,
      overlay: overlayV0,
      snapshot: initial,
      proposal,
      decision: {
        action: "edit",
        proposalId: proposal.id,
        proposalHash: proposal.proposalHash,
        baseOverlayId: overlayV0.id,
        baseOverlayVersion: overlayV0.version,
        baseOverlayHash: overlayV0.hash,
        patches: [
          {
            op: "add_rule",
            rule: {
              id: "rule.creator.different_target",
              kind: "world",
              description: "This must not ride on another proposal's approval.",
            },
          },
        ],
      },
    });
    expect(retargeted).toEqual({ status: "invalid", overlay: overlayV0, snapshot: initial });

    const invalidProposal = createCanonProposal(
      {
        id: "proposal.invalid_reference",
        summary: "Try to attach a claim to an entity outside the pack.",
        patches: [
          {
            op: "add_claim",
            claim: {
              id: "claim.creator.invalid_reference",
              subjectId: "unknown_character",
              predicate: "waits_at",
              object: { kind: "entity", entityId: "ithaca" },
              temporalScope: "ithaca.odyssey_book_1",
              spatialScope: "ithaca",
              epistemicVisibility: ["all"],
              conflictSetId: null,
              summary: "An invalid claim for the reference gate.",
              sourceIds: ["source.odyssey.1"],
            },
          },
        ],
      },
      overlayV0,
    );
    const invalid = applyCreatorDecision({
      worldPack: pack,
      overlay: overlayV0,
      snapshot: initial,
      proposal: invalidProposal,
      decision: {
        action: "accept",
        proposalId: invalidProposal.id,
        proposalHash: invalidProposal.proposalHash,
        baseOverlayId: overlayV0.id,
        baseOverlayVersion: overlayV0.version,
        baseOverlayHash: overlayV0.hash,
      },
    });
    expect(invalid).toEqual({ status: "invalid", overlay: overlayV0, snapshot: initial });
  });

  it("rejects without changing overlay or snapshot", () => {
    const initial = createInitialSnapshot(pack, overlayV0);
    const result = applyCreatorDecision({
      worldPack: pack,
      overlay: overlayV0,
      snapshot: initial,
      proposal,
      decision: {
        action: "reject",
        proposalId: proposal.id,
        proposalHash: proposal.proposalHash,
        baseOverlayId: overlayV0.id,
        baseOverlayVersion: overlayV0.version,
        baseOverlayHash: overlayV0.hash,
      },
    });
    expect(result).toEqual({ status: "rejected", overlay: overlayV0, snapshot: initial });
  });

  it("rejects stale decisions with byte-identical authorities", () => {
    const initial = createInitialSnapshot(pack, overlayV0);
    const result = applyCreatorDecision({
      worldPack: pack,
      overlay: overlayV0,
      snapshot: initial,
      proposal,
      decision: {
        action: "accept",
        proposalId: proposal.id,
        proposalHash: proposal.proposalHash,
        baseOverlayId: overlayV0.id,
        baseOverlayVersion: 99,
        baseOverlayHash: overlayV0.hash,
      },
    });
    expect(result).toEqual({ status: "stale", overlay: overlayV0, snapshot: initial });
  });
});

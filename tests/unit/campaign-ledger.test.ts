import { describe, expect, it } from "vitest";
import type { CampaignEventInput } from "@/src/contracts/campaign";
import { canonicalJson } from "@/src/domain/canonical-json";
import {
  appendCampaignEvent,
  buildCampaignEventAuthorityHash,
  createCampaignLedger,
  forkCampaignLedger,
  hasValidCampaignLedger,
} from "@/src/domain/campaign";
import { materializeCausalProjection } from "@/src/domain/causal-context";

const hash = (character: string): string => character.repeat(64);

const knownEntityIds = new Set(["npc.guide", "player.hero", "place.harbor"]);
const activeClaimIds = new Set(["claim.harbor.open"]);
const activeRuleIds = new Set(["rule.signal.red_sail"]);
const ontologyAuthorities = {
  activeActionTypeIds: new Set(["action.raise_watch"]),
  activeRelationAxisIds: new Set(["trust"]),
  activeResourceIds: new Set(["supplies"]),
  activeFlagIds: new Set<string>(),
  activeClockIds: new Set<string>(),
  activeDebtKindIds: new Set<string>(),
};
const appendAuthorities = {
  knownEntityIds,
  activeClaimIds,
  activeRuleIds,
  ...ontologyAuthorities,
  authorizedIntentReceipts: new Map<string, string>(),
  activeTriggerReceipts: new Map<string, string>(),
  approvedRulingReceipts: new Map<string, string>(),
};

const createLedger = () =>
  createCampaignLedger({
    campaignId: "campaign.test",
    branchId: "branch.main",
    parentBranchId: null,
    forkedFromEntryHash: null,
    worldPackId: "pack.test",
    worldPackVersion: "1.0.0",
    baseCanonHash: hash("a"),
    baseStateHash: hash("b"),
  });

const firstEvent = (
  baseCursorHash: string,
  overrides: Partial<CampaignEventInput> = {},
): CampaignEventInput => ({
  id: "event.raise_watch",
  baseCursorHash,
  worldTick: 1,
  source: {
    kind: "player",
    actorEntityId: "player.hero",
    authorizingIntentId: "intent.raise_watch",
  },
  actionTypeId: "action.raise_watch",
  targetEntityIds: ["place.harbor", "npc.guide"],
  scope: "location",
  visibility: { scope: "public", entityIds: [] },
  causeEntryHashes: [],
  evidenceClaimIds: ["claim.harbor.open"],
  evidenceRuleIds: ["rule.signal.red_sail"],
  traceIds: ["trace.watch_bell", "trace.red_sail"],
  reversibility: "reversible",
  irreversibleRuling: null,
  effects: [
    {
      effectId: "effect.guide_trust",
      kind: "relation_delta",
      subjectEntityId: "npc.guide",
      objectEntityId: "player.hero",
      axisId: "trust",
      delta: 1,
    },
  ],
  beforeStateHash: hash("b"),
  afterStateHash: hash("b"),
  transitionReceiptHash: null,
  ...overrides,
});

const sourceReceiptsFor = (event: CampaignEventInput) => {
  const authorityHash = buildCampaignEventAuthorityHash(event);
  return event.source.kind === "player"
    ? {
        authorizedIntentReceipts: new Map([
          [event.source.authorizingIntentId, authorityHash],
        ]),
        activeTriggerReceipts: new Map<string, string>(),
      }
    : {
        authorizedIntentReceipts: new Map<string, string>(),
        activeTriggerReceipts: new Map([[event.source.triggerId, authorityHash]]),
      };
};

const append = (ledger = createLedger(), event = firstEvent(ledger.cursor.cursorHash)) =>
  appendCampaignEvent({
    ledger,
    event,
    ...appendAuthorities,
    ...sourceReceiptsFor(event),
  });

describe("campaign causal ledger", () => {
  it("normalizes unordered fields and produces a deterministic append/hash result", () => {
    const ledger = createLedger();
    const left = firstEvent(ledger.cursor.cursorHash);
    const right = firstEvent(ledger.cursor.cursorHash, {
      targetEntityIds: [...left.targetEntityIds].reverse(),
      evidenceClaimIds: [...left.evidenceClaimIds].reverse(),
      evidenceRuleIds: [...left.evidenceRuleIds].reverse(),
      traceIds: [...left.traceIds].reverse(),
      effects: [...left.effects].reverse(),
    });

    const first = append(ledger, left);
    const second = append(structuredClone(ledger), right);

    expect(first.status).toBe("applied");
    expect(second.status).toBe("applied");
    expect(first.entry?.entryHash).toBe(second.entry?.entryHash);
    expect(first.ledger.cursor.cursorHash).toBe(second.ledger.cursor.cursorHash);
    expect(canonicalJson(first.ledger)).toBe(canonicalJson(second.ledger));
    expect(hasValidCampaignLedger(first.ledger)).toBe(true);
    expect(first.ledger.cursor).toMatchObject({
      entryCount: 1,
      currentStateHash: hash("b"),
      headEntryHash: first.entry?.entryHash,
    });
  });

  it("forks the current head immutably with deterministic inherited history", () => {
    const first = append();
    if (first.status !== "applied" || !first.entry) {
      throw new Error("Expected the first synthetic event to apply.");
    }
    const followUp = firstEvent(first.ledger.cursor.cursorHash, {
      id: "event.consume_supplies",
      worldTick: 2,
      source: {
        kind: "player",
        actorEntityId: "player.hero",
        authorizingIntentId: "intent.consume_supplies",
      },
      causeEntryHashes: [first.entry.entryHash],
      effects: [
        {
          effectId: "effect.consume_supplies",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: "supplies",
          delta: -1,
        },
      ],
    });
    const second = appendCampaignEvent({
      ledger: first.ledger,
      event: followUp,
      ...appendAuthorities,
      ...sourceReceiptsFor(followUp),
    });
    if (second.status !== "applied" || !second.entry) {
      throw new Error("Expected the follow-up synthetic event to apply.");
    }

    const parent = second.ledger;
    const parentBefore = canonicalJson(parent);
    const input = {
      ledger: parent,
      childBranchId: "branch.what_if",
      existingBranchIds: new Set(["branch.main", "branch.existing"]),
    };
    const left = forkCampaignLedger(input);
    const right = forkCampaignLedger({ ...input, ledger: structuredClone(parent) });

    expect(canonicalJson(parent)).toBe(parentBefore);
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(left.cursor).toMatchObject({
      branchId: "branch.what_if",
      parentBranchId: "branch.main",
      forkedFromEntryHash: parent.cursor.headEntryHash,
      currentStateHash: parent.cursor.currentStateHash,
      entryCount: parent.cursor.entryCount,
    });
    expect(canonicalJson(left.entries)).toBe(canonicalJson(parent.entries));
    expect(left.entries[1]?.causeEntryHashes).toEqual([parent.entries[0]?.entryHash]);
    expect(hasValidCampaignLedger(left)).toBe(true);

    const parentProjection = materializeCausalProjection(parent);
    const childProjection = materializeCausalProjection(left);
    const {
      branchId: parentProjectionBranch,
      cursorHash: parentProjectionCursor,
      projectionHash: parentProjectionHash,
      ...parentProjectionState
    } = parentProjection;
    const {
      branchId: childProjectionBranch,
      cursorHash: childProjectionCursor,
      projectionHash: childProjectionHash,
      ...childProjectionState
    } = childProjection;
    void parentProjectionBranch;
    void parentProjectionCursor;
    void parentProjectionHash;
    void childProjectionBranch;
    void childProjectionCursor;
    void childProjectionHash;
    expect(childProjectionState).toEqual(parentProjectionState);

    const childEvent = firstEvent(left.cursor.cursorHash, {
      id: "event.child_choice",
      worldTick: 3,
      source: {
        kind: "player",
        actorEntityId: "player.hero",
        authorizingIntentId: "intent.child_choice",
      },
      causeEntryHashes: left.cursor.headEntryHash ? [left.cursor.headEntryHash] : [],
      effects: [
        {
          effectId: "effect.child_choice",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: "supplies",
          delta: 2,
        },
      ],
    });
    const extendedChild = appendCampaignEvent({
      ledger: left,
      event: childEvent,
      ...appendAuthorities,
      ...sourceReceiptsFor(childEvent),
    });
    expect(extendedChild.status).toBe("applied");
    expect(canonicalJson(extendedChild.ledger.entries.slice(0, left.entries.length))).toBe(
      canonicalJson(left.entries),
    );
    expect(hasValidCampaignLedger(extendedChild.ledger)).toBe(true);

    const childBefore = canonicalJson(left);
    const grandchild = forkCampaignLedger({
      ledger: left,
      childBranchId: "branch.what_if.again",
      existingBranchIds: new Set(["branch.main", "branch.what_if"]),
    });
    expect(canonicalJson(left)).toBe(childBefore);
    expect(grandchild.cursor).toMatchObject({
      branchId: "branch.what_if.again",
      parentBranchId: "branch.what_if",
      forkedFromEntryHash: left.cursor.headEntryHash,
    });
    expect(canonicalJson(grandchild.entries)).toBe(canonicalJson(left.entries));
    expect(hasValidCampaignLedger(grandchild)).toBe(true);
  });

  it("rejects same, duplicate, and invalid campaign-ledger forks", () => {
    const parent = append().ledger;

    expect(() =>
      forkCampaignLedger({
        ledger: parent,
        childBranchId: "branch.main",
        existingBranchIds: new Set(),
      }),
    ).toThrow("new branch identifier");
    expect(() =>
      forkCampaignLedger({
        ledger: parent,
        childBranchId: "branch.existing",
        existingBranchIds: new Set(["branch.existing"]),
      }),
    ).toThrow("already exists");

    const tampered = structuredClone(parent);
    const relation = tampered.entries[0]?.effects.find(
      (effect) => effect.kind === "relation_delta",
    );
    if (!relation || relation.kind !== "relation_delta") {
      throw new Error("The synthetic fixture must contain a relation delta.");
    }
    relation.delta = 9;
    const tamperedBefore = canonicalJson(tampered);
    expect(() =>
      forkCampaignLedger({
        ledger: tampered,
        childBranchId: "branch.invalid_parent",
        existingBranchIds: new Set(),
      }),
    ).toThrow("invalid campaign ledger");
    expect(canonicalJson(tampered)).toBe(tamperedBefore);
  });

  it("returns a byte-identical ledger when an event is blocked", () => {
    const ledger = createLedger();
    const before = canonicalJson(ledger);
    const result = append(
      ledger,
      firstEvent(hash("d"), {
        evidenceRuleIds: ["rule.inactive"],
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.entry).toBeNull();
    expect(result.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["stale_cursor", "evidence_inactive"]),
    );
    expect(result.ledger).toBe(ledger);
    expect(canonicalJson(result.ledger)).toBe(before);
  });

  it("detects entry tampering and refuses to extend the corrupted chain", () => {
    const applied = append();
    expect(applied.status).toBe("applied");

    const tampered = structuredClone(applied.ledger);
    const relation = tampered.entries[0]?.effects.find(
      (effect) => effect.kind === "relation_delta",
    );
    if (!relation || relation.kind !== "relation_delta") {
      throw new Error("The synthetic fixture must contain a relation delta.");
    }
    relation.delta = 9;

    expect(hasValidCampaignLedger(tampered)).toBe(false);
    const before = canonicalJson(tampered);
    const result = appendCampaignEvent({
      ledger: tampered,
      event: {
        ...firstEvent(tampered.cursor.cursorHash),
        id: "event.follow_up",
        worldTick: 2,
        beforeStateHash: hash("b"),
        afterStateHash: hash("b"),
        causeEntryHashes: [tampered.entries[0]!.entryHash],
        effects: [
          {
            effectId: "effect.supplies",
            kind: "resource_delta",
            entityId: "player.hero",
            resourceId: "supplies",
            delta: -1,
          },
        ],
      },
      ...appendAuthorities,
    });

    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain("ledger_hash_invalid");
    expect(result.entry).toBeNull();
    expect(canonicalJson(result.ledger)).toBe(before);
  });

  it("fails closed when a cause points outside the current branch", () => {
    const ledger = createLedger();
    const result = append(
      ledger,
      firstEvent(ledger.cursor.cursorHash, {
        causeEntryHashes: [hash("d")],
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code: "cause_unknown", evidenceIds: [hash("d")] }),
    );
    expect(result.ledger).toBe(ledger);
  });

  it("rejects forged intent, inactive trigger, unruled irreversible, and unbound state", () => {
    const ledger = createLedger();
    const forgedIntent = appendCampaignEvent({
      ledger,
      event: firstEvent(ledger.cursor.cursorHash),
      ...appendAuthorities,
      authorizedIntentReceipts: new Map(),
    });
    const inactiveTrigger = appendCampaignEvent({
      ledger,
      event: firstEvent(ledger.cursor.cursorHash, {
        id: "event.npc_untriggered",
        source: {
          kind: "npc",
          actorEntityId: "npc.guide",
          triggerId: "trigger.unknown",
        },
      }),
      ...appendAuthorities,
    });
    const unruledIrreversible = appendCampaignEvent({
      ledger,
      event: firstEvent(ledger.cursor.cursorHash, {
        id: "event.irreversible_unruled",
        reversibility: "irreversible",
        irreversibleRuling: null,
      }),
      ...appendAuthorities,
      ...sourceReceiptsFor(
        firstEvent(ledger.cursor.cursorHash, {
          id: "event.irreversible_unruled",
          reversibility: "irreversible",
          irreversibleRuling: null,
        }),
      ),
    });
    const arbitraryStateEvent = firstEvent(ledger.cursor.cursorHash, {
        id: "event.arbitrary_state",
        effects: [
          {
            effectId: "effect.arbitrary_state",
            kind: "state_transition",
            variableId: "harbor_watch",
            from: "idle",
            to: "watching",
          },
        ],
        beforeStateHash: hash("b"),
        afterStateHash: hash("c"),
        transitionReceiptHash: hash("d"),
      });
    const arbitraryState = appendCampaignEvent({
      ledger,
      event: arbitraryStateEvent,
      ...appendAuthorities,
      ...sourceReceiptsFor(arbitraryStateEvent),
    });

    expect(forgedIntent.violations.map(({ code }) => code)).toContain(
      "source_authority_invalid",
    );
    expect(inactiveTrigger.violations.map(({ code }) => code)).toContain(
      "source_authority_invalid",
    );
    expect(unruledIrreversible.violations.map(({ code }) => code)).toContain(
      "ruling_invalid",
    );
    expect(arbitraryState.violations.map(({ code }) => code)).toContain(
      "transition_receipt_invalid",
    );
    for (const result of [
      forgedIntent,
      inactiveTrigger,
      unruledIrreversible,
      arbitraryState,
    ]) {
      expect(result.status).toBe("blocked");
      expect(result.ledger).toBe(ledger);
    }
  });

  it("applies an irreversible consequence only with an approved GM ruling receipt", () => {
    const ledger = createLedger();
    const event = firstEvent(ledger.cursor.cursorHash, {
      id: "event.irreversible_ruled",
      reversibility: "irreversible",
      irreversibleRuling: {
        kind: "gm_approval",
        approvalId: "approval.irreversible_ruled",
      },
    });
    const result = appendCampaignEvent({
      ledger,
      event,
      ...appendAuthorities,
      ...sourceReceiptsFor(event),
      approvedRulingReceipts: new Map([
        ["approval.irreversible_ruled", buildCampaignEventAuthorityHash(event)],
      ]),
    });

    expect(result.status).toBe("applied");
    expect(result.entry?.reversibility).toBe("irreversible");
  });

  it("accepts an irreversible rule only through its exact event-bound receipt", () => {
    const ledger = createLedger();
    const event = firstEvent(ledger.cursor.cursorHash, {
      id: "event.irreversible_rule",
      reversibility: "irreversible",
      irreversibleRuling: {
        kind: "rule",
        ruleId: "rule.signal.red_sail",
        receiptId: "receipt.rule.irreversible_rule",
      },
    });
    const authorityHash = buildCampaignEventAuthorityHash(event);
    const result = appendCampaignEvent({
      ledger,
      event,
      ...appendAuthorities,
      ...sourceReceiptsFor(event),
      approvedRulingReceipts: new Map([
        ["receipt.rule.irreversible_rule", authorityHash],
      ]),
    });

    expect(result.status).toBe("applied");
    expect(result.entry?.irreversibleRuling).toEqual(event.irreversibleRuling);
  });

  it("binds an NPC trigger receipt to the exact actor, action, and effects", () => {
    const ledger = createLedger();
    const authorized = firstEvent(ledger.cursor.cursorHash, {
      id: "event.npc_authorized",
      source: {
        kind: "npc",
        actorEntityId: "npc.guide",
        triggerId: "trigger.npc_once",
      },
    });
    const forged = {
      ...authorized,
      id: "event.npc_forged",
      source: {
        kind: "npc" as const,
        actorEntityId: "player.hero",
        triggerId: "trigger.npc_once",
      },
    };
    const result = appendCampaignEvent({
      ledger,
      event: forged,
      ...appendAuthorities,
      activeTriggerReceipts: new Map([
        ["trigger.npc_once", buildCampaignEventAuthorityHash(authorized)],
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain(
      "source_authority_invalid",
    );
    expect(result.ledger).toBe(ledger);
  });

  it("rejects effect-id reuse and backward world time", () => {
    const first = append();
    if (first.status !== "applied" || !first.entry) {
      throw new Error("Expected the first synthetic event to apply.");
    }
    const event = firstEvent(first.ledger.cursor.cursorHash, {
      id: "event.backward_reuse",
      worldTick: 0,
      causeEntryHashes: [first.entry.entryHash],
      beforeStateHash: hash("b"),
      afterStateHash: hash("b"),
      effects: [
        {
          effectId: "effect.guide_trust",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: "supplies",
          delta: -1,
        },
      ],
    });
    const result = appendCampaignEvent({
      ledger: first.ledger,
      event,
      ...appendAuthorities,
      ...sourceReceiptsFor(event),
    });

    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["effect_duplicate", "world_tick_regression"]),
    );
    expect(result.ledger).toBe(first.ledger);
  });

  it("binds one-shot source and ruling receipts to the exact event", () => {
    const ledger = createLedger();
    const first = firstEvent(ledger.cursor.cursorHash, {
      id: "event.receipt_one",
      source: {
        kind: "player",
        actorEntityId: "player.hero",
        authorizingIntentId: "intent.once",
      },
      reversibility: "irreversible",
      irreversibleRuling: {
        kind: "gm_approval",
        approvalId: "approval.once",
      },
    });
    const firstHash = buildCampaignEventAuthorityHash(first);
    const applied = appendCampaignEvent({
      ledger,
      event: first,
      ...appendAuthorities,
      authorizedIntentReceipts: new Map([["intent.once", firstHash]]),
      approvedRulingReceipts: new Map([["approval.once", firstHash]]),
    });
    expect(applied.status).toBe("applied");

    const replay = firstEvent(applied.ledger.cursor.cursorHash, {
      id: "event.receipt_two",
      worldTick: 2,
      source: {
        kind: "player",
        actorEntityId: "player.hero",
        authorizingIntentId: "intent.once",
      },
      reversibility: "irreversible",
      irreversibleRuling: {
        kind: "gm_approval",
        approvalId: "approval.once",
      },
    });
    const replayHash = buildCampaignEventAuthorityHash(replay);
    const blocked = appendCampaignEvent({
      ledger: applied.ledger,
      event: replay,
      ...appendAuthorities,
      authorizedIntentReceipts: new Map([["intent.once", replayHash]]),
      approvedRulingReceipts: new Map([["approval.once", replayHash]]),
    });

    expect(blocked.status).toBe("blocked");
    expect(blocked.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["source_authority_invalid", "ruling_invalid"]),
    );
    expect(blocked.ledger).toBe(applied.ledger);
  });

  it("rejects effect dimensions outside the active campaign ontology", () => {
    const ledger = createLedger();
    const event = firstEvent(ledger.cursor.cursorHash, {
      id: "event.invented_resource",
      effects: [
        {
          effectId: "effect.invented_resource",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: "resource.unregistered_gold",
          delta: 100,
        },
      ],
    });
    const result = appendCampaignEvent({
      ledger,
      event,
      ...appendAuthorities,
      ...sourceReceiptsFor(event),
    });

    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain("ontology_inactive");
    expect(result.ledger).toBe(ledger);
  });
});

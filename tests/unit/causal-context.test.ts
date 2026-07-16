import { describe, expect, it } from "vitest";
import { prepareCampaignTurn } from "@/src/application/campaign-turn";
import type {
  CampaignEventInput,
  CampaignLedger,
  CausalEffect,
} from "@/src/contracts/campaign";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import {
  buildCausalPromptCacheKey,
  buildCausalWorkingSet,
  materializeCausalProjection,
  serializeCompactCausalContext,
} from "@/src/domain/causal-context";
import {
  appendCampaignEvent,
  buildCampaignEventAuthorityHash,
  createCampaignLedger,
} from "@/src/domain/campaign";
import { applySimulationAction, buildSimulationSnapshot } from "@/src/domain/simulation";

const hash = (character: string): string => character.repeat(64);

const knownEntityIds = new Set([
  "npc.guide",
  "npc.rival",
  "player.hero",
  "place.harbor",
]);
const activeClaimIds = new Set(["claim.harbor.open", "claim.signal.seen"]);
const activeRuleIds = new Set(["rule.signal.red_sail"]);
const inertEventAuthorities = {
  activeActionTypeIds: new Set<string>(),
  activeRelationAxisIds: new Set<string>(),
  activeResourceIds: new Set<string>(),
  activeFlagIds: new Set<string>(),
  activeClockIds: new Set<string>(),
  activeDebtKindIds: new Set<string>(),
  authorizedIntentReceipts: new Map<string, string>(),
  activeTriggerReceipts: new Map<string, string>(),
  approvedRulingReceipts: new Map<string, string>(),
};

const emptyLedger = (baseStateHash = hash("b")): CampaignLedger =>
  createCampaignLedger({
    campaignId: "campaign.context",
    branchId: "branch.main",
    parentBranchId: null,
    forkedFromEntryHash: null,
    worldPackId: "pack.test",
    worldPackVersion: "1.0.0",
    baseCanonHash: hash("a"),
    baseStateHash,
  });

const eventFor = (
  ledger: CampaignLedger,
  {
    id,
    worldTick,
    visibility = { scope: "public", entityIds: [] } as const,
    effects,
    causes = [],
    actorEntityId = "player.hero",
    targetEntityIds = ["npc.guide"],
    traceIds = [],
    afterStateHash,
    transitionReceiptHash = null,
    evidenceClaimIds = [],
    evidenceRuleIds = [],
  }: {
    id: string;
    worldTick: number;
    visibility?: CampaignEventInput["visibility"];
    effects: CausalEffect[];
    causes?: string[];
    actorEntityId?: string;
    targetEntityIds?: string[];
    traceIds?: string[];
    afterStateHash?: string;
    transitionReceiptHash?: string | null;
    evidenceClaimIds?: string[];
    evidenceRuleIds?: string[];
  },
): CampaignEventInput => ({
  id,
  baseCursorHash: ledger.cursor.cursorHash,
  worldTick,
  source: {
    kind: "player",
    actorEntityId,
    authorizingIntentId: `intent.${id}`,
  },
  actionTypeId: `action.${id}`,
  targetEntityIds,
  scope: "scene",
  visibility,
  causeEntryHashes: causes,
  evidenceClaimIds,
  evidenceRuleIds,
  traceIds,
  reversibility: "reversible",
  irreversibleRuling: null,
  effects,
  beforeStateHash: ledger.cursor.currentStateHash,
  afterStateHash: afterStateHash ?? ledger.cursor.currentStateHash,
  transitionReceiptHash,
});

const eventAuthoritiesFor = (event: CampaignEventInput) => {
  const authorityHash = buildCampaignEventAuthorityHash(event);
  return {
    activeActionTypeIds: new Set([event.actionTypeId]),
    activeRelationAxisIds: new Set(
      event.effects.flatMap((effect) =>
        effect.kind === "relation_delta" ? [effect.axisId] : [],
      ),
    ),
    activeResourceIds: new Set(
      event.effects.flatMap((effect) =>
        effect.kind === "resource_delta" ? [effect.resourceId] : [],
      ),
    ),
    activeFlagIds: new Set(
      event.effects.flatMap((effect) =>
        effect.kind === "flag_set" ? [effect.flagId] : [],
      ),
    ),
    activeClockIds: new Set(
      event.effects.flatMap((effect) =>
        effect.kind === "clock_delta" ? [effect.clockId] : [],
      ),
    ),
    activeDebtKindIds: new Set(
      event.effects.flatMap((effect) =>
        effect.kind === "debt_open" ? [effect.debtKindId] : [],
      ),
    ),
    authorizedIntentReceipts:
      event.source.kind === "player"
        ? new Map([[event.source.authorizingIntentId, authorityHash]])
        : new Map<string, string>(),
    activeTriggerReceipts:
      event.source.kind === "player"
        ? new Map<string, string>()
        : new Map([[event.source.triggerId, authorityHash]]),
    approvedRulingReceipts: new Map<string, string>(),
  };
};

const append = (
  ledger: CampaignLedger,
  event: CampaignEventInput,
): { ledger: CampaignLedger; entryHash: string } => {
  const result = appendCampaignEvent({
    ledger,
    event,
    knownEntityIds,
    activeClaimIds,
    activeRuleIds,
    ...eventAuthoritiesFor(event),
  });
  if (result.status !== "applied" || !result.entry) {
    throw new Error(
      `Synthetic causal event was blocked: ${result.violations
        .map(({ code }) => code)
        .join(",")}`,
    );
  }
  return { ledger: result.ledger, entryHash: result.entry.entryHash };
};

const buildReducerLedger = (): CampaignLedger => {
  let ledger = emptyLedger();
  const opened = append(
    ledger,
    eventFor(ledger, {
      id: "event.public_open",
      worldTick: 1,
      targetEntityIds: ["npc.guide", "player.hero"],
      traceIds: ["trace.public_bell"],
      effects: [
        {
          effectId: "effect.relation.open",
          kind: "relation_delta",
          subjectEntityId: "npc.guide",
          objectEntityId: "player.hero",
          axisId: "trust",
          delta: 2,
        },
        {
          effectId: "effect.resource.open",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: "supplies",
          delta: 3,
        },
        {
          effectId: "effect.knowledge.open",
          kind: "knowledge_grant",
          entityId: "player.hero",
          claimId: "claim.signal.seen",
        },
        {
          effectId: "effect.flag.open",
          kind: "flag_set",
          entityId: "player.hero",
          flagId: "watch_ready",
          value: true,
        },
        {
          effectId: "effect.clock.open",
          kind: "clock_delta",
          clockId: "clock.ritual",
          delta: 1,
        },
        {
          effectId: "effect.debt.open",
          kind: "debt_open",
          debtorEntityId: "player.hero",
          creditorEntityId: "npc.guide",
          debtKindId: "debt.rescue",
          weight: 4,
        },
      ],
    }),
  );
  ledger = opened.ledger;

  const hidden = append(
    ledger,
    eventFor(ledger, {
      id: "event.facilitator_adjustment",
      worldTick: 2,
      visibility: { scope: "facilitator", entityIds: [] },
      causes: [opened.entryHash],
      actorEntityId: "npc.rival",
      targetEntityIds: ["player.hero"],
      traceIds: ["trace.hidden_note"],
      effects: [
        {
          effectId: "effect.relation.hidden",
          kind: "relation_delta",
          subjectEntityId: "npc.guide",
          objectEntityId: "player.hero",
          axisId: "trust",
          delta: -1,
        },
        {
          effectId: "effect.resource.hidden",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: "supplies",
          delta: -1,
        },
        {
          effectId: "effect.clock.hidden",
          kind: "clock_delta",
          clockId: "clock.ritual",
          delta: 2,
        },
        {
          effectId: "effect.debt.resolve",
          kind: "debt_resolve",
          debtEffectId: "effect.debt.open",
        },
      ],
    }),
  );
  ledger = hidden.ledger;

  return append(
    ledger,
    eventFor(ledger, {
      id: "event.public_consequence",
      worldTick: 3,
      causes: [hidden.entryHash],
      targetEntityIds: ["player.hero"],
      traceIds: ["trace.public_aftermath"],
      effects: [
        {
          effectId: "effect.flag.consequence",
          kind: "flag_set",
          entityId: "player.hero",
          flagId: "watch_ready",
          value: false,
        },
      ],
    }),
  ).ledger;
};

describe("causal context projection", () => {
  it("materializes deterministic reducers and resolves an opened debt", () => {
    const ledger = buildReducerLedger();
    const first = materializeCausalProjection(ledger);
    const second = materializeCausalProjection(structuredClone(ledger));
    const { projectionHash, ...projectionPayload } = first;

    expect(second).toEqual(first);
    expect(projectionHash).toBe(sha256Canonical(projectionPayload));
    expect(first.relations).toContainEqual(
      expect.objectContaining({
        subjectEntityId: "npc.guide",
        objectEntityId: "player.hero",
        axisId: "trust",
        value: 1,
      }),
    );
    expect(first.resources).toContainEqual(
      expect.objectContaining({
        entityId: "player.hero",
        resourceId: "supplies",
        value: 2,
      }),
    );
    expect(first.knowledge).toContainEqual(
      expect.objectContaining({
        entityId: "player.hero",
        claimId: "claim.signal.seen",
      }),
    );
    expect(first.flags).toContainEqual(
      expect.objectContaining({
        entityId: "player.hero",
        flagId: "watch_ready",
        value: false,
      }),
    );
    expect(first.clocks).toContainEqual(
      expect.objectContaining({ clockId: "clock.ritual", value: 3 }),
    );
    expect(first.openDebts).toEqual([]);
  });

  it("includes visible causal ancestors and preserves chronological ordering", () => {
    let ledger = emptyLedger();
    const first = append(
      ledger,
      eventFor(ledger, {
        id: "event.cause_one",
        worldTick: 1,
        effects: [
          {
            effectId: "effect.cause_one",
            kind: "flag_set",
            entityId: "player.hero",
            flagId: "first_cause",
            value: true,
          },
        ],
      }),
    );
    ledger = first.ledger;
    const second = append(
      ledger,
      eventFor(ledger, {
        id: "event.cause_two",
        worldTick: 2,
        causes: [first.entryHash],
        effects: [
          {
            effectId: "effect.cause_two",
            kind: "flag_set",
            entityId: "player.hero",
            flagId: "second_cause",
            value: true,
          },
        ],
      }),
    );
    ledger = second.ledger;
    ledger = append(
      ledger,
      eventFor(ledger, {
        id: "event.visible_result",
        worldTick: 3,
        causes: [second.entryHash],
        effects: [
          {
            effectId: "effect.visible_result",
            kind: "resource_delta",
            entityId: "player.hero",
            resourceId: "resolve",
            delta: 1,
          },
        ],
      }),
    ).ledger;

    const workingSet = buildCausalWorkingSet({
      ledger,
      focalEntityIds: ["player.hero"],
      viewerEntityIds: ["player.hero"],
      audience: "characters",
      budget: { maxEvents: 3, causeDepth: 2 },
    });

    expect(workingSet.events.map(({ id }) => id)).toEqual([
      "event.cause_one",
      "event.cause_two",
      "event.visible_result",
    ]);
    expect(workingSet.events[2]?.causeEventIds).toEqual(["event.cause_two"]);
    expect(workingSet.truncated).toBe(false);
  });

  it("enforces event budgets deterministically", () => {
    let ledger = emptyLedger();
    for (let index = 0; index < 5; index += 1) {
      ledger = append(
        ledger,
        eventFor(ledger, {
          id: `event.budget_${index}`,
          worldTick: index,
          effects: [
            {
              effectId: `effect.budget_${index}`,
              kind: "resource_delta",
              entityId: "player.hero",
              resourceId: `resource.${index}`,
              delta: 1,
            },
          ],
        }),
      ).ledger;
    }

    const input = {
      ledger,
      focalEntityIds: ["player.hero"],
      viewerEntityIds: ["player.hero"],
      audience: "characters" as const,
      budget: { maxEvents: 2 },
    };
    const first = buildCausalWorkingSet(input);
    const second = buildCausalWorkingSet(structuredClone(input));

    expect(first.events).toHaveLength(2);
    expect(first.truncated).toBe(true);
    expect(second).toEqual(first);
    expect(() =>
      buildCausalWorkingSet({ ...input, budget: { maxEvents: 9 } }),
    ).toThrow("0 through 8");
  });

  it("shows facilitator-only effects to the facilitator without leaking them to characters", () => {
    const ledger = buildReducerLedger();
    const facilitator = buildCausalWorkingSet({
      ledger,
      focalEntityIds: ["player.hero"],
      viewerEntityIds: [],
      audience: "facilitator",
    });
    const character = buildCausalWorkingSet({
      ledger,
      focalEntityIds: ["player.hero"],
      viewerEntityIds: ["player.hero"],
      audience: "characters",
    });

    expect(facilitator.events.map(({ id }) => id)).toContain(
      "event.facilitator_adjustment",
    );
    expect(facilitator.relations).toContainEqual(
      expect.objectContaining({ value: 1 }),
    );
    expect(facilitator.resources).toContainEqual(
      expect.objectContaining({ resourceId: "supplies", value: 2 }),
    );
    expect(facilitator.openDebts).toEqual([]);

    expect(character.events.map(({ id }) => id)).not.toContain(
      "event.facilitator_adjustment",
    );
    expect(character.events.flatMap(({ causeEventIds }) => causeEventIds)).not.toContain(
      "event.facilitator_adjustment",
    );
    expect(character.events.flatMap(({ traceIds }) => traceIds)).not.toContain(
      "trace.hidden_note",
    );
    expect(character.relations).toContainEqual(
      expect.objectContaining({ value: 2 }),
    );
    expect(character.resources).toContainEqual(
      expect.objectContaining({ resourceId: "supplies", value: 3 }),
    );
    expect(character.openDebts).toContainEqual(
      expect.objectContaining({ debtEffectId: "effect.debt.open" }),
    );
  });

  it("separates scene relevance from the participant authorized to see a private event", () => {
    const initial = emptyLedger();
    const ledger = append(
      initial,
      eventFor(initial, {
        id: "event.rival_private_move",
        worldTick: 1,
        visibility: { scope: "entities", entityIds: ["npc.rival"] },
        actorEntityId: "npc.rival",
        targetEntityIds: ["player.hero"],
        effects: [
          {
            effectId: "effect.rival_private_move",
            kind: "flag_set",
            entityId: "player.hero",
            flagId: "secretly_marked",
            value: true,
          },
        ],
      }),
    ).ledger;
    const heroView = buildCausalWorkingSet({
      ledger,
      focalEntityIds: ["npc.rival", "player.hero"],
      viewerEntityIds: ["player.hero"],
      audience: "characters",
    });
    const rivalView = buildCausalWorkingSet({
      ledger,
      focalEntityIds: ["npc.rival", "player.hero"],
      viewerEntityIds: ["npc.rival"],
      audience: "characters",
    });

    expect(heroView.events).toEqual([]);
    expect(heroView.flags).toEqual([]);
    expect(rivalView.events.map(({ id }) => id)).toEqual(["event.rival_private_move"]);
    expect(rivalView.flags).toContainEqual(
      expect.objectContaining({ entityId: "player.hero", flagId: "secretly_marked" }),
    );
  });

  it("serializes the same compact context deterministically and omits hidden identifiers", () => {
    const ledger = buildReducerLedger();
    const character = buildCausalWorkingSet({
      ledger,
      focalEntityIds: ["player.hero"],
      viewerEntityIds: ["player.hero"],
      audience: "characters",
    });

    const first = serializeCompactCausalContext(character);
    const second = serializeCompactCausalContext(structuredClone(character));

    expect(second).toBe(first);
    for (let index = 0; index < 100; index += 1) {
      expect(serializeCompactCausalContext(structuredClone(character))).toBe(first);
    }
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThan(canonicalJson(character).length);
    expect(first).toContain("event.public_open");
    expect(first).toContain("trace.public_bell");
    expect(first).not.toContain("event.facilitator_adjustment");
    expect(first).not.toContain("trace.hidden_note");
  });

  it("enforces the final compact-context byte ceiling", () => {
    const ledger = buildReducerLedger();
    const inflated = buildCausalWorkingSet({
      ledger,
      focalEntityIds: ["player.hero"],
      viewerEntityIds: ["player.hero"],
      audience: "characters",
    });
    const longId = (prefix: string, index: number) =>
      `${prefix}.${index}.${"x".repeat(100)}`;
    const debtEffects = Array.from({ length: 32 }, (_, index) => ({
      effectId: longId("effect.debt", index),
      kind: "debt_open" as const,
      debtorEntityId: longId("entity.debtor", index),
      creditorEntityId: longId("entity.creditor", index),
      debtKindId: longId("debt.kind", index),
      weight: 1,
    }));
    inflated.events[0]!.effects = debtEffects;
    inflated.events[0]!.effectKinds = ["debt_open"];
    inflated.openDebts = debtEffects.slice(0, 16).map((effect) => ({
      debtEffectId: effect.effectId,
      debtorEntityId: effect.debtorEntityId,
      creditorEntityId: effect.creditorEntityId,
      debtKindId: effect.debtKindId,
      weight: effect.weight,
      openedByEntryHash: inflated.events[0]!.entryHash,
    }));

    expect(() => serializeCompactCausalContext(inflated)).toThrow(
      "hard byte budget",
    );
  });

  it("derives the cache key only from stable prompt-prefix authorities", () => {
    const identity = {
      worldPackId: "pack.test",
      worldPackVersion: "1.0.0",
      approvedOverlayHash: hash("a"),
      styleProfileId: "style.mythic",
      responseSchemaVersion: "1.0.0",
    };
    const first = buildCausalPromptCacheKey(identity);
    const second = buildCausalPromptCacheKey(structuredClone(identity));

    expect(first).toBe(second);
    expect(first).toMatch(/^penelope:[a-f0-9]{64}$/);
    expect(
      buildCausalPromptCacheKey({ ...identity, branchHead: hash("b") } as typeof identity),
    ).toBe(first);
    expect(
      buildCausalPromptCacheKey({ ...identity, styleProfileId: "style.plain" }),
    ).not.toBe(first);
  });

  it("derives character visibility from participant control before applying an event", () => {
    const ledger = emptyLedger();
    const event = eventFor(ledger, {
      id: "event.viewer_gate",
      worldTick: 1,
      effects: [
        {
          effectId: "effect.viewer_gate",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: "resolve",
          delta: 1,
        },
      ],
    });
    const result = prepareCampaignTurn({
      ledger,
      event,
      knownEntityIds,
      activeClaimIds,
      activeRuleIds,
      ...inertEventAuthorities,
      focalEntityIds: ["player.hero"],
      viewer: { kind: "participant", participantId: "participant.intruder" },
      verifiedParticipantControl: new Map([
        ["participant.hero", new Set(["player.hero"])],
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain(
      "viewer_authority_invalid",
    );
    expect(result.ledger).toBe(ledger);
  });

  it("rejects an oversized causal identifier before it can change the ledger", () => {
    const ledger = emptyLedger();
    const event = eventFor(ledger, {
      id: "event.context_overflow",
      worldTick: 1,
      effects: [
        {
          effectId: "effect.context_overflow",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: `resource.${"x".repeat(20_000)}`,
          delta: 1,
        },
      ],
    });
    const result = prepareCampaignTurn({
      ledger,
      event,
      knownEntityIds,
      activeClaimIds,
      activeRuleIds,
      ...inertEventAuthorities,
      focalEntityIds: ["player.hero"],
      viewer: { kind: "participant", participantId: "participant.hero" },
      verifiedParticipantControl: new Map([
        ["participant.hero", new Set(["player.hero"])],
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain("event_input_invalid");
    expect(result.ledger).toBe(ledger);
  });

  it("returns a typed failure for a malformed event without changing the ledger", () => {
    const ledger = emptyLedger();
    const validEvent = eventFor(ledger, {
      id: "event.invalid_input",
      worldTick: 1,
      effects: [
        {
          effectId: "effect.invalid_input",
          kind: "resource_delta",
          entityId: "player.hero",
          resourceId: "resolve",
          delta: 1,
        },
      ],
    });
    const result = prepareCampaignTurn({
      ledger,
      event: {
        ...validEvent,
        targetEntityIds: ["npc.guide", "npc.guide"],
      },
      knownEntityIds,
      activeClaimIds,
      activeRuleIds,
      ...eventAuthoritiesFor(validEvent),
      focalEntityIds: ["player.hero"],
      viewer: { kind: "participant", participantId: "participant.hero" },
      verifiedParticipantControl: new Map([
        ["participant.hero", new Set(["player.hero"])],
      ]),
    });

    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain("event_input_invalid");
    expect(result.ledger).toBe(ledger);
  });

  it("carries an applied player consequence into the next narrative context", () => {
    const scenario = {
      id: "scenario.test",
      worldPackId: "pack.test",
      worldPackVersion: "1.0.0",
      baseStateId: "state.test",
      maxSteps: 2,
      variables: [
        {
          id: "harbor_watch",
          initialValue: "idle",
          values: ["idle", "watching"],
          transitions: [
            {
              from: "idle",
              to: "watching",
              requiredRuleIds: ["rule.signal.red_sail"],
            },
          ],
        },
      ],
    };
    const snapshot = buildSimulationSnapshot({
      scenarioId: scenario.id,
      turnIndex: 0,
      canonProfileId: "canon.test",
      styleProfileId: "style.test",
      baseStateId: scenario.baseStateId,
      worldPackVersion: scenario.worldPackVersion,
      overlayId: "creator_canon",
      overlayVersion: 0,
      canonHash: hash("a"),
      presentEntityIds: ["npc.guide", "player.hero"],
      deceasedEntityIds: [],
      variables: [{ id: "harbor_watch", value: "idle" }],
    });
    const action = {
      actorEntityId: "player.hero",
      authorizingIntentId: "intent.event.player_consequence",
      contributingIntentIds: [],
      op: "set_variable" as const,
      variableId: "harbor_watch",
      from: "idle",
      to: "watching",
      evidenceClaimIds: [],
      evidenceRuleIds: ["rule.signal.red_sail"],
    };
    const resolution = applySimulationAction({
      scenario,
      snapshot,
      action,
      activeRuleIds,
    });
    expect(resolution.status).toBe("applied");
    const ledger = emptyLedger(snapshot.stateHash);
    const event = eventFor(ledger, {
      id: "event.player_consequence",
      worldTick: 1,
      afterStateHash: resolution.snapshot.stateHash,
      transitionReceiptHash: sha256Canonical(resolution.transition),
      evidenceRuleIds: ["rule.signal.red_sail"],
      effects: [
        {
          effectId: "effect.watch_state",
          kind: "state_transition",
          variableId: "harbor_watch",
          from: "idle",
          to: "watching",
        },
        {
          effectId: "effect.player_consequence",
          kind: "relation_delta",
          subjectEntityId: "npc.guide",
          objectEntityId: "player.hero",
          axisId: "trust",
          delta: -2,
        },
      ],
    });
    const result = prepareCampaignTurn({
      ledger,
      event,
      knownEntityIds,
      activeClaimIds,
      activeRuleIds,
      ...eventAuthoritiesFor(event),
      transitionAuthority: { scenario, snapshot, action },
      budget: { maxEvents: 0, maxEventEffects: 0 },
      focalEntityIds: ["player.hero"],
      viewer: { kind: "participant", participantId: "participant.hero" },
      verifiedParticipantControl: new Map([
        ["participant.hero", new Set(["player.hero"])],
      ]),
    });

    expect(result.status).toBe("applied");
    if (result.status !== "applied") throw new Error("Expected an applied turn.");
    expect(result.nextNarrativeContext).toContain("event.player_consequence");
    expect(result.nextNarrativeContext).toContain(
      '["npc.guide","player.hero","trust",-2]',
    );
    expect(result.nextNarrativeContext).toContain(
      '["r","effect.player_consequence","npc.guide","player.hero","trust",-2]',
    );
    expect(result.nextNarrativeContext).toContain(
      '["s","effect.watch_state","harbor_watch","idle","watching"]',
    );
    expect(result.nextNarrativeContext).toContain('["harbor_watch","watching"]');
    expect(result.ledger.cursor.baseCanonHash).toBe(ledger.cursor.baseCanonHash);

    const wrongLedger = createCampaignLedger({
      campaignId: "campaign.wrong_pack",
      branchId: "branch.main",
      parentBranchId: null,
      forkedFromEntryHash: null,
      worldPackId: "pack.other",
      worldPackVersion: "9.9.9",
      baseCanonHash: hash("a"),
      baseStateHash: snapshot.stateHash,
    });
    const wrongPackEvent = eventFor(wrongLedger, {
      id: "event.wrong_pack_transition",
      worldTick: 1,
      afterStateHash: resolution.snapshot.stateHash,
      transitionReceiptHash: sha256Canonical(resolution.transition),
      evidenceRuleIds: ["rule.signal.red_sail"],
      effects: [
        {
          effectId: "effect.wrong_pack_transition",
          kind: "state_transition",
          variableId: "harbor_watch",
          from: "idle",
          to: "watching",
        },
      ],
    });
    const wrongPackResult = prepareCampaignTurn({
      ledger: wrongLedger,
      event: wrongPackEvent,
      knownEntityIds,
      activeClaimIds,
      activeRuleIds,
      ...eventAuthoritiesFor(wrongPackEvent),
      transitionAuthority: { scenario, snapshot, action },
      focalEntityIds: ["player.hero"],
      viewer: { kind: "participant", participantId: "participant.hero" },
      verifiedParticipantControl: new Map([
        ["participant.hero", new Set(["player.hero"])],
      ]),
    });

    expect(wrongPackResult.status).toBe("blocked");
    expect(wrongPackResult.violations.map(({ code }) => code)).toContain(
      "transition_receipt_invalid",
    );
    expect(wrongPackResult.ledger).toBe(wrongLedger);
  });
});

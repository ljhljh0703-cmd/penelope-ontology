import { describe, expect, it } from "vitest";
import type {
  WorldCreatorReceipt,
  WorldEvent,
  WorldSessionView,
} from "@/components/world/api-types";
import {
  compareWorldLines,
  deriveWorldPulse,
  type WorldPulseCheckpoint,
} from "@/components/world/world-delta";

const event = (
  ruleId: string,
  summary: string,
  effects: WorldEvent["effects"],
): WorldEvent => ({
  eventId: `event.${ruleId}`,
  source: {
    kind: "npc",
    actorEntityId: "entity.eurycleia",
    reactionRuleId: ruleId,
  },
  actionId: "action.eurycleia.react",
  summary,
  effects,
  visibleToEntityIds: ["entity.penelope"],
});

const receipt = ({
  eurycleiaKnowledge = [] as string[],
  melanthoZone = "zone.inner_corridor",
  identityExposure = 0,
  suspicion = 0,
  events = [] as WorldEvent[],
}: {
  eurycleiaKnowledge?: string[];
  melanthoZone?: string;
  identityExposure?: number;
  suspicion?: number;
  events?: WorldEvent[];
} = {}): WorldCreatorReceipt => ({
  actors: [
    {
      entityId: "entity.eurycleia",
      creatorName: "Eurycleia",
      participantLabel: "Eurycleia",
      simulationRole: "npc",
      zoneId: "zone.great_hall_hearth",
      agendaState: "active",
      agendaDesire: "Protect the household master she recognizes.",
      agendaAvoids: "An uncontrolled disclosure.",
      knownPremiseIds: eurycleiaKnowledge,
    },
    {
      entityId: "entity.melantho",
      creatorName: "Melantho",
      participantLabel: "Melantho",
      simulationRole: "npc",
      zoneId: melanthoZone,
      agendaState: "active",
      agendaDesire: "Find a reportable irregularity.",
      agendaAvoids: "A confrontation without evidence.",
      knownPremiseIds: [],
    },
  ],
  flags: [],
  clocks: [
    {
      id: "clock.identity_exposure",
      label: "Identity exposure",
      value: identityExposure,
      maxValue: 4,
    },
    {
      id: "clock.suitor_suspicion",
      label: "Suitor suspicion",
      value: suspicion,
      maxValue: 3,
    },
  ],
  ruleReview: {
    sourceGroundedIds: ["reaction.eurycleia.recognize_scar"],
    creatorApprovedNotSourceCanonIds: ["reaction.melantho.notice_exclusion"],
    creatorReviewRequiredIds: [],
  },
  behindCurtainPremises: [],
  behindCurtainRisks: [],
  events,
  creatorDirections: [],
  ledgerHeadHash: null,
  receiptHash: null,
  narrationDecisionProof: null,
});

const view = ({
  sessionId,
  parentCheckpointId = null,
  ending = null,
}: {
  sessionId: string;
  parentCheckpointId?: string | null;
  ending?: WorldSessionView["ending"];
}): WorldSessionView =>
  ({
    sessionId,
    parentCheckpointId,
    scenarioId: "scenario.odyssey_book_19.night_of_the_scar",
    ending,
  }) as WorldSessionView;

const checkpoint = (
  sequence: number,
  sessionId: string,
  creatorReceipt: WorldCreatorReceipt,
  options: {
    parentCheckpointId?: string | null;
    ending?: WorldSessionView["ending"];
  } = {},
): WorldPulseCheckpoint => ({
  sequence,
  view: view({ sessionId, ...options }),
  creatorReceipt,
});

describe("World Pulse derived view", () => {
  it("turns only resolved receipt changes into readable knowledge, movement, clock, ending, and provenance deltas", () => {
    const opening = checkpoint(1, "checkpoint.opening", receipt());
    const after = checkpoint(
      2,
      "checkpoint.after_exclusion",
      receipt({
        eurycleiaKnowledge: ["premise.stranger_identity"],
        melanthoZone: "zone.washing_store",
        identityExposure: 1,
        suspicion: 1,
        events: [
          event(
            "reaction.eurycleia.recognize_scar",
            "Eurycleia recognizes the scar.",
            [
              {
                kind: "grant_knowledge",
                entityId: "entity.eurycleia",
                premiseId: "premise.stranger_identity",
              },
              { kind: "advance_clock", clockId: "clock.identity_exposure", delta: 1 },
            ],
          ),
          event(
            "reaction.melantho.notice_exclusion",
            "Melantho leaves to investigate the exclusion.",
            [
              {
                kind: "move_actor",
                entityId: "entity.melantho",
                toZoneId: "zone.washing_store",
              },
              { kind: "advance_clock", clockId: "clock.suitor_suspicion", delta: 1 },
            ],
          ),
        ],
      }),
      {
        parentCheckpointId: "checkpoint.opening",
        ending: {
          id: "ending.plan_compromised",
          kind: "plan_compromised",
          summary: "The hidden plan is now exposed to a hostile observer.",
        },
      },
    );

    const pulse = deriveWorldPulse(opening, after);

    expect(pulse.knowledge).toEqual([
      expect.objectContaining({
        actorId: "entity.eurycleia",
        gainedPremiseIds: ["premise.stranger_identity"],
      }),
    ]);
    expect(pulse.movements).toEqual([
      expect.objectContaining({
        actorId: "entity.melantho",
        fromZoneId: "zone.inner_corridor",
        toZoneId: "zone.washing_store",
        offstage: true,
      }),
    ]);
    expect(pulse.clocks).toEqual([
      expect.objectContaining({ clockId: "clock.identity_exposure", delta: 1 }),
      expect.objectContaining({ clockId: "clock.suitor_suspicion", delta: 1 }),
    ]);
    expect(pulse.ending).toMatchObject({
      changed: true,
      afterKind: "plan_compromised",
    });
    expect(pulse.causalRules).toEqual([
      expect.objectContaining({
        ruleId: "reaction.eurycleia.recognize_scar",
        category: "source_grounded",
      }),
      expect.objectContaining({
        ruleId: "reaction.melantho.notice_exclusion",
        category: "creator_approved_if",
      }),
    ]);
    expect(pulse.summary).toBe(
      "World Pulse: 1 knowledge change, 1 movement, 2 clock shifts, ending changed.",
    );
  });

  it("compares sibling outcomes by their shared parent and reports only state differences", () => {
    const parentCheckpointId = "checkpoint.opening";
    const canon = checkpoint(
      2,
      "checkpoint.canon",
      receipt({
        eurycleiaKnowledge: ["premise.stranger_identity"],
        identityExposure: 1,
        events: [
          event(
            "reaction.eurycleia.recognize_scar",
            "Eurycleia recognizes the scar.",
            [
              {
                kind: "grant_knowledge",
                entityId: "entity.eurycleia",
                premiseId: "premise.stranger_identity",
              },
            ],
          ),
        ],
      }),
      {
        parentCheckpointId,
        ending: {
          id: "ending.canon_contained",
          kind: "canon_contained",
          summary: "The secret remains contained.",
        },
      },
    );
    const ifLine = checkpoint(
      3,
      "checkpoint.if",
      receipt({
        eurycleiaKnowledge: ["premise.stranger_identity"],
        melanthoZone: "zone.washing_store",
        identityExposure: 3,
        suspicion: 1,
        events: [
          event(
            "reaction.melantho.notice_exclusion",
            "Melantho leaves to investigate the exclusion.",
            [
              {
                kind: "move_actor",
                entityId: "entity.melantho",
                toZoneId: "zone.washing_store",
              },
            ],
          ),
        ],
      }),
      {
        parentCheckpointId,
        ending: {
          id: "ending.plan_compromised",
          kind: "plan_compromised",
          summary: "The plan is compromised.",
        },
      },
    );

    const comparison = compareWorldLines(canon, ifLine);

    expect(comparison).toMatchObject({
      compatible: true,
      mode: "same_parent",
      sharedParentCheckpointId: parentCheckpointId,
    });
    expect(comparison.movements).toEqual([
      expect.objectContaining({ actorId: "entity.melantho", toZoneId: "zone.washing_store" }),
    ]);
    expect(comparison.clocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ clockId: "clock.identity_exposure", delta: 2 }),
        expect.objectContaining({ clockId: "clock.suitor_suspicion", delta: 1 }),
      ]),
    );
    expect(comparison.ending).toMatchObject({
      changed: true,
      beforeKind: "canon_contained",
      afterKind: "plan_compromised",
    });
    expect(comparison.causalRules).toEqual([
      expect.objectContaining({
        ruleId: "reaction.eurycleia.recognize_scar",
        category: "source_grounded",
      }),
      expect.objectContaining({
        ruleId: "reaction.melantho.notice_exclusion",
        category: "creator_approved_if",
      }),
    ]);
  });

  it("fails closed for different scenario identifiers and does not invent a comparison", () => {
    const left = checkpoint(1, "checkpoint.left", receipt());
    const right = checkpoint(1, "checkpoint.right", receipt());
    right.view = { ...right.view, scenarioId: "scenario.other" };

    const comparison = compareWorldLines(left, right);

    expect(comparison).toMatchObject({ compatible: false, mode: "incompatible" });
    expect(comparison.knowledge).toEqual([]);
    expect(comparison.movements).toEqual([]);
    expect(comparison.clocks).toEqual([]);
    expect(comparison.causalRules).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import {
  buildWorldSimulationState,
  createWorldSimulationSession,
  focalPremiseIds,
  forkWorldSimulationSession,
  hasValidWorldSimulationSession,
  resolveWorldAction,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";

const scenario = getOdysseyBook19WorldSimulation();

const run = (inputs: string[]) => {
  let session = createWorldSimulationSession({ scenario });
  for (const input of inputs) {
    session = runWorldSimulationTurn({ scenario, session, input }).session;
  }
  return session;
};

describe("world-first Odyssey runtime", () => {
  it("starts from private source-grounded knowledge instead of a story fixture", () => {
    const session = createWorldSimulationSession({ scenario });

    expect(JSON.stringify(scenario)).not.toContain("fixtureTurns");
    expect(focalPremiseIds(session, "entity.penelope")).not.toContain(
      "premise.stranger_identity",
    );
    expect(focalPremiseIds(session, "entity.odysseus")).toContain(
      "premise.stranger_identity",
    );
    expect(hasValidWorldSimulationSession(session, scenario)).toBe(true);
  });

  it("resolves a compositional free-text action without exact sentence matching", () => {
    const action = resolveWorldAction({
      scenario,
      input: "Please bring the basin, then let Eurycleia wash the stranger's feet.",
    });

    expect(action).toMatchObject({
      status: "accepted",
      actionId: "action.penelope.order_washing",
      actorEntityId: "entity.penelope",
      targetEntityId: "entity.eurycleia",
    });
  });

  it("does not turn a negated or partial-word intent into an action", () => {
    expect(
      resolveWorldAction({
        scenario,
        input: "I refuse to order washing. Keep the basin away.",
      }),
    ).toMatchObject({ status: "unsupported", actionId: null });
    expect(
      resolveWorldAction({
        scenario,
        input: "This confrontation is only a possibility, not my action.",
      }),
    ).toMatchObject({ status: "unsupported", actionId: null });
  });

  it("can select a positive action after rejecting a different negated one", () => {
    expect(
      resolveWorldAction({
        scenario,
        input: "Do not order washing; observe without intervening instead.",
      }),
    ).toMatchObject({
      status: "accepted",
      actionId: "action.penelope.observe",
    });
  });

  it("rejects two positive world actions packed into one turn", () => {
    expect(
      resolveWorldAction({
        scenario,
        input: "Bring the basin, then dismiss Melantho from the room.",
      }),
    ).toMatchObject({ status: "unsupported", actionId: null });
  });

  it("does not launder an impossible input through a safe successful branch", () => {
    const session = createWorldSimulationSession({ scenario });
    const result = runWorldSimulationTurn({
      scenario,
      session,
      input: "Command Zeus to erase every suitor from the palace now.",
    });

    expect(result.receipt.action.status).toBe("unsupported");
    expect(result.receipt.firedReactionRuleIds).toEqual([]);
    expect(result.session.state.turn).toBe(1);
    expect(result.session.state.flags).toEqual(session.state.flags);
    expect(result.session.state.clocks).toEqual(session.state.clocks);
    expect(result.session.state.stateHash).not.toBe(session.state.stateHash);
  });

  it("advances an NPC agenda when Penelope waits", () => {
    const session = createWorldSimulationSession({ scenario });
    const result = runWorldSimulationTurn({ scenario, session, input: "wait" });

    expect(result.receipt.firedReactionRuleIds).toContain(
      "reaction.melantho.approach_on_observe",
    );
    expect(
      result.session.state.actors.find(({ entityId }) => entityId === "entity.melantho")
        ?.zoneId,
    ).toBe("zone.great_hall_hearth");
    expect(
      result.session.state.clocks.find(({ id }) => id === "clock.suitor_suspicion")
        ?.value,
    ).toBe(1);
  });

  it("reaches three materially different endings from action order, not branch prose", () => {
    const canon = run(["bring the basin", "observe"]);
    const controlled = run(["bring the basin", "confront Odysseus"]);
    const compromised = run(["dismiss Melantho", "bring the basin"]);

    expect(canon.state.endingId).toBe("ending.canon_contained");
    expect(controlled.state.endingId).toBe("ending.controlled_discovery");
    expect(compromised.state.endingId).toBe("ending.plan_compromised");
    expect(new Set([canon.state.stateHash, controlled.state.stateHash, compromised.state.stateHash]))
      .toHaveLength(3);
  });

  it("keeps Eurycleia's recognition private until a later observable disclosure", () => {
    const recognized = run(["bring the basin"]);

    expect(focalPremiseIds(recognized, "entity.eurycleia")).toContain(
      "premise.stranger_identity",
    );
    expect(focalPremiseIds(recognized, "entity.penelope")).not.toContain(
      "premise.stranger_identity",
    );

    const disclosed = runWorldSimulationTurn({
      scenario,
      session: recognized,
      input: "confront Odysseus",
    }).session;
    expect(focalPremiseIds(disclosed, "entity.penelope")).toContain(
      "premise.stranger_identity",
    );
  });

  it("makes the same confrontation produce different consequences in different states", () => {
    const initial = createWorldSimulationSession({ scenario });
    const premature = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "confront Odysseus",
    });
    const recognized = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    }).session;
    const grounded = runWorldSimulationTurn({
      scenario,
      session: recognized,
      input: "confront Odysseus",
    });

    expect(premature.receipt.firedReactionRuleIds).not.toContain(
      "reaction.eurycleia.controlled_disclosure",
    );
    expect(grounded.receipt.firedReactionRuleIds).toContain(
      "reaction.eurycleia.controlled_disclosure",
    );
    expect(premature.session.state.endingId).toBeNull();
    expect(grounded.session.state.endingId).toBe("ending.controlled_discovery");
  });

  it("forks counterfactuals with an identical prefix and divergent suffix", () => {
    const root = createWorldSimulationSession({ scenario });
    const afterRecognition = runWorldSimulationTurn({
      scenario,
      session: root,
      input: "bring the basin",
    }).session;
    const child = forkWorldSimulationSession({
      scenario,
      session: afterRecognition,
      childBranchId: "branch.controlled_if",
      existingBranchIds: new Set(["branch.canon"]),
    });
    const parentEnding = runWorldSimulationTurn({
      scenario,
      session: afterRecognition,
      input: "observe",
    }).session;
    const childEnding = runWorldSimulationTurn({
      scenario,
      session: child,
      input: "confront Odysseus",
    }).session;

    expect(child.turns[0]).toEqual(afterRecognition.turns[0]);
    expect(child.cursor).toMatchObject({
      branchId: "branch.controlled_if",
      parentBranchId: "branch.canon",
      forkedFromReceiptHash: afterRecognition.turns[0]?.receiptHash,
    });
    expect(parentEnding.state.endingId).toBe("ending.canon_contained");
    expect(childEnding.state.endingId).toBe("ending.controlled_discovery");
    expect(parentEnding.turns[0]?.receiptHash).toBe(childEnding.turns[0]?.receiptHash);
    expect(parentEnding.turns[1]?.receiptHash).not.toBe(childEnding.turns[1]?.receiptHash);
    expect(hasValidWorldSimulationSession(parentEnding, scenario)).toBe(true);
    expect(hasValidWorldSimulationSession(childEnding, scenario)).toBe(true);
  });

  it("records NPC reactions as causal children of the participant event", () => {
    const session = run(["bring the basin"]);
    const playerEntry = session.ledger.entries.find(
      ({ source }) => source.kind === "player",
    );
    const npcEntries = session.ledger.entries.filter(({ source }) => source.kind === "npc");

    expect(playerEntry).toBeDefined();
    expect(npcEntries).toHaveLength(2);
    expect(npcEntries.every(({ causeEntryHashes }) =>
      causeEntryHashes.includes(playerEntry!.entryHash),
    )).toBe(true);
    expect(npcEntries[1]?.causeEntryHashes).toContain(npcEntries[0]?.entryHash);
    expect(playerEntry?.targetEntityIds).toEqual(["entity.eurycleia"]);
  });

  it("rejects forged fork ancestry and world state that diverges from ledger effects", () => {
    const recognized = run(["bring the basin"]);
    const child = forkWorldSimulationSession({
      scenario,
      session: recognized,
      childBranchId: "branch.forgery_probe",
      existingBranchIds: new Set(["branch.canon"]),
    });
    const forgedFork = structuredClone(child);
    forgedFork.cursor.forkedFromReceiptHash = "a".repeat(64);
    expect(hasValidWorldSimulationSession(forgedFork, scenario)).toBe(false);

    const { stateHash: ignoredStateHash, ...recognizedStatePayload } =
      recognized.state;
    void ignoredStateHash;
    const tamperedState = buildWorldSimulationState({
      ...recognizedStatePayload,
      knowledge: recognized.state.knowledge.map((entry) =>
        entry.entityId === "entity.eurycleia"
          ? {
              ...entry,
              premiseIds: entry.premiseIds.filter(
                (id) => id !== "premise.stranger_identity",
              ),
            }
          : entry,
      ),
    });
    const tamperedReceipt = {
      ...recognized.turns[0]!,
      afterStateHash: tamperedState.stateHash,
    };
    const { receiptHash: ignoredReceiptHash, ...tamperedPayload } = tamperedReceipt;
    void ignoredReceiptHash;
    const tampered = {
      ...recognized,
      state: tamperedState,
      turns: [
        {
          ...tamperedReceipt,
          receiptHash: sha256Canonical(tamperedPayload),
        },
      ],
    };
    expect(hasValidWorldSimulationSession(tampered, scenario)).toBe(false);
  });

  it("does not schedule reactions for an NPC whose agenda is already satisfied", () => {
    const closedAgendaScenario = getOdysseyBook19WorldSimulation();
    const melantho = closedAgendaScenario.actors.find(
      ({ id }) => id === "entity.melantho",
    );
    if (!melantho) throw new Error("Missing Melantho fixture actor.");
    melantho.agenda.state = "satisfied";
    const session = createWorldSimulationSession({
      scenario: closedAgendaScenario,
    });
    const result = runWorldSimulationTurn({
      scenario: closedAgendaScenario,
      session,
      input: "wait",
    });

    expect(result.receipt.firedReactionRuleIds).not.toContain(
      "reaction.melantho.approach_on_observe",
    );
  });

  it("is byte-stable for fixed authority IDs and an accepted action sequence", () => {
    expect(canonicalJson(run(["bring the basin", "confront Odysseus"]))).toBe(
      canonicalJson(run(["bring the basin", "confront Odysseus"])),
    );
  });

  it("forces a bounded timeout after six unsupported turns", () => {
    const session = run([
      "summon an impossible dragon one",
      "summon an impossible dragon two",
      "summon an impossible dragon three",
      "summon an impossible dragon four",
      "summon an impossible dragon five",
      "summon an impossible dragon six",
    ]);

    expect(session.state.turn).toBe(6);
    expect(session.state.status).toBe("complete");
    expect(session.state.endingId).toBe("ending.timeout");
  });
});

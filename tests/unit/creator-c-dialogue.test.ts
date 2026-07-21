import { describe, expect, it } from "vitest";
import { getOdysseyBook19WorldPack } from "@/src/adapters/world-packs/odyssey-book19";
import type { CreatorTacitKnowledgeAnswer } from "@/src/contracts/creator-c-dialogue";
import {
  assessCreatorDirection,
  registeredCreatorActionInput,
} from "@/src/domain/creator-c-dialogue";
import { createWorldSimulationSession } from "@/src/domain/world-runtime";

const pack = getOdysseyBook19WorldPack();
const scenario = pack.scenario;
const session = createWorldSimulationSession({ scenario });
const baseSessionId = crypto.randomUUID();

const completeAnswers: CreatorTacitKnowledgeAnswer[] = [
  {
    questionId: "desired_outcome",
    answer: "Keep the interview private while Penelope tests the stranger.",
  },
  {
    questionId: "character_motive",
    answer: "Penelope suspects the household is listening and needs room to judge safely.",
  },
  {
    questionId: "accepted_cost",
    answer: "Melantho may feel excluded and become more suspicious.",
  },
];

describe("creator C tacit-knowledge dialogue", () => {
  it("asks one missing intent question without advancing the world", () => {
    const before = structuredClone(session);
    const result = assessCreatorDirection({
      pack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: [],
      forkBeforeAction: false,
    });

    expect(result).toMatchObject({
      kind: "creator_clarification",
      stateChanged: false,
      progress: { answered: 0, total: 3 },
      question: { questionId: "desired_outcome" },
    });
    expect(session).toEqual(before);
  });

  it("does not ask an answered axis again", () => {
    const result = assessCreatorDirection({
      pack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: completeAnswers.slice(0, 1),
      forkBeforeAction: false,
    });

    expect(result).toMatchObject({
      kind: "creator_clarification",
      progress: { answered: 1, total: 3 },
      question: { questionId: "character_motive" },
    });
  });

  it("turns complete tacit knowledge into an inspectable non-suggested action", () => {
    const result = assessCreatorDirection({
      pack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: completeAnswers,
      forkBeforeAction: false,
    });

    expect(result).toMatchObject({
      kind: "creator_confirmation",
      stateChanged: false,
      proposal: {
        registeredActionId: "action.penelope.clear_room",
        canonicalExecution: {
          verb: "clear the room",
          targetEntityId: "entity.melantho",
          targetZoneId: null,
        },
        desiredOutcome: completeAnswers[0]?.answer,
        characterMotive: completeAnswers[1]?.answer,
        acceptedCost: completeAnswers[2]?.answer,
        turnCost: 1,
      },
    });
    if (result.kind !== "creator_confirmation") throw new Error("Expected confirmation.");
    expect(result.praise).toMatch(/privacy|exclusion|Melantho/iu);
    expect(result.proposal.worldCompatibleExecution).toMatch(/Penelope|world/iu);
    expect(result.proposal.mappingBasis.join(" ")).toMatch(/melantho|leave|private/iu);
  });

  it("binds a stable canonical execution instead of the first alias position", () => {
    const reorderedPack = structuredClone(pack);
    const clearRoom = reorderedPack.scenario.actions.find(
      ({ id }) => id === "action.penelope.clear_room",
    );
    if (!clearRoom) throw new Error("Missing clear-room action.");
    clearRoom.verbAliases.reverse();

    const baseline = assessCreatorDirection({
      pack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: completeAnswers,
      forkBeforeAction: false,
    });
    const reordered = assessCreatorDirection({
      pack: reorderedPack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: completeAnswers,
      forkBeforeAction: false,
    });

    expect(baseline.kind).toBe("creator_confirmation");
    expect(reordered.kind).toBe("creator_confirmation");
    if (baseline.kind !== "creator_confirmation" || reordered.kind !== "creator_confirmation") {
      throw new Error("Expected two creator proposals.");
    }
    expect(reordered.proposal.canonicalExecution).toEqual(
      baseline.proposal.canonicalExecution,
    );
    expect(reordered.proposal.proposalHash).toBe(baseline.proposal.proposalHash);
  });

  it("blocks a creator proposal when a registered action has more than one entity target", () => {
    const ambiguousPack = structuredClone(pack);
    const clearRoom = ambiguousPack.scenario.actions.find(
      ({ id }) => id === "action.penelope.clear_room",
    );
    if (!clearRoom) throw new Error("Missing clear-room action.");
    clearRoom.allowedTargetEntityIds = ["entity.melantho", "entity.odysseus"];

    const result = assessCreatorDirection({
      pack: ambiguousPack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: completeAnswers,
      forkBeforeAction: false,
    });

    expect(result).toMatchObject({ kind: "creator_blocked", stateChanged: false });
    if (result.kind !== "creator_blocked") throw new Error("Expected target boundary.");
    expect(result.boundary).toMatch(/more than one.*target|target.*one/iu);
  });

  it("binds the one entity target the creator explicitly names among multiple registered targets", () => {
    const explicitPack = structuredClone(pack);
    const clearRoom = explicitPack.scenario.actions.find(
      ({ id }) => id === "action.penelope.clear_room",
    );
    if (!clearRoom) throw new Error("Missing clear-room action.");
    clearRoom.allowedTargetEntityIds = ["entity.melantho", "entity.odysseus"];

    const result = assessCreatorDirection({
      pack: explicitPack,
      session,
      baseSessionId,
      originalAction: "Penelope sends Melantho away to make the interview private.",
      answers: completeAnswers,
      forkBeforeAction: false,
    });

    expect(result).toMatchObject({
      kind: "creator_confirmation",
      proposal: {
        canonicalExecution: {
          targetEntityId: "entity.melantho",
          targetZoneId: null,
        },
      },
    });
  });

  it("blocks a creator proposal when a registered action has more than one zone target", () => {
    const ambiguousPack = structuredClone(pack);
    const clearRoom = ambiguousPack.scenario.actions.find(
      ({ id }) => id === "action.penelope.clear_room",
    );
    if (!clearRoom) throw new Error("Missing clear-room action.");
    clearRoom.targetMode = "zone";
    clearRoom.allowedTargetEntityIds = [];
    clearRoom.allowedZoneIds = ambiguousPack.scenario.zones.slice(0, 2).map(({ id }) => id);

    const result = assessCreatorDirection({
      pack: ambiguousPack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: completeAnswers,
      forkBeforeAction: false,
    });

    expect(result).toMatchObject({ kind: "creator_blocked", stateChanged: false });
    if (result.kind !== "creator_blocked") throw new Error("Expected zone boundary.");
    expect(result.boundary).toMatch(/more than one.*zone|zone.*one/iu);
  });

  it("executes only the hash-bound canonical authority, not another valid alias", () => {
    expect(() =>
      registeredCreatorActionInput({
        pack,
        actionId: "action.penelope.clear_room",
        canonicalExecution: {
          verb: "dismiss melantho",
          targetEntityId: "entity.melantho",
          targetZoneId: null,
        },
      }),
    ).toThrow(/canonical creator execution/i);
  });

  it("produces the same proposal hash for the same world and creator intent", () => {
    const input = {
      pack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: completeAnswers,
      forkBeforeAction: false,
    } as const;
    const first = assessCreatorDirection(input);
    const second = assessCreatorDirection(input);

    expect(first).toEqual(second);
    expect(first.kind).toBe("creator_confirmation");
  });

  it("does not silently turn an NPC-authored move into Penelope's action", () => {
    const result = assessCreatorDirection({
      pack,
      session,
      baseSessionId,
      originalAction: "Eurycleia tells Penelope immediately that the stranger is Odysseus.",
      answers: completeAnswers,
      forkBeforeAction: false,
    });

    expect(result).toMatchObject({
      kind: "creator_blocked",
      stateChanged: false,
    });
    if (result.kind !== "creator_blocked") throw new Error("Expected actor boundary.");
    expect(result.boundary).toMatch(/Penelope|Eurycleia|NPC/iu);
  });

  it("recognizes public aliases when an NPC is made the acting author", () => {
    const result = assessCreatorDirection({
      pack,
      session,
      baseSessionId,
      originalAction: "I want Odysseus to reveal himself to Penelope now.",
      answers: completeAnswers,
      forkBeforeAction: false,
    });

    expect(result.kind).toBe("creator_blocked");
    if (result.kind !== "creator_blocked") throw new Error("Expected actor boundary.");
    expect(result.boundary).toMatch(/stranger|NPC/iu);
  });

  it("binds the mainline or IF choice into the proposal hash", () => {
    const shared = {
      pack,
      session,
      baseSessionId,
      originalAction: "Penelope asks Melantho to leave before she questions the stranger.",
      answers: completeAnswers,
    } as const;
    const mainline = assessCreatorDirection({ ...shared, forkBeforeAction: false });
    const fork = assessCreatorDirection({ ...shared, forkBeforeAction: true });

    expect(mainline.kind).toBe("creator_confirmation");
    expect(fork.kind).toBe("creator_confirmation");
    if (mainline.kind !== "creator_confirmation" || fork.kind !== "creator_confirmation") {
      throw new Error("Expected two creator proposals.");
    }
    expect(mainline.proposal.proposalHash).not.toBe(fork.proposal.proposalHash);
    expect(fork.proposal.forkBeforeAction).toBe(true);
  });

  it("separates an unsupported magical mechanism from the creator's valid aim", () => {
    const magicalAnswers: CreatorTacitKnowledgeAnswer[] = [
      {
        questionId: "desired_outcome",
        answer: "Give Penelope certainty without relying on the stranger's words.",
      },
      {
        questionId: "character_motive",
        answer: "She cannot risk trusting a practiced liar while the suitors control the hall.",
      },
      {
        questionId: "accepted_cost",
        answer: "Using the proof may expose her suspicion to the household.",
      },
    ];
    const result = assessCreatorDirection({
      pack,
      session,
      baseSessionId,
      originalAction: "Penelope uses a hidden magical mirror to see through the disguise.",
      answers: magicalAnswers,
      forkBeforeAction: false,
    });

    expect(result).toMatchObject({
      kind: "creator_expansion_required",
      stateChanged: false,
      preservedIntent: magicalAnswers[0]?.answer,
    });
    if (result.kind !== "creator_expansion_required") {
      throw new Error("Expected explicit world expansion boundary.");
    }
    expect(result.missingWorldSupport).toMatch(/mirror|magic|current world/iu);
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});

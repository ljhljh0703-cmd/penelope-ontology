import { describe, expect, it } from "vitest";
import { fixtureWorldNarrator } from "@/src/adapters/fixtures/world-narrator";
import {
  WorldNarrationRequestSchema,
  WorldNarrationRestrictedConceptSchema,
  WorldNarrationSchema,
  countEnglishSceneWords,
  validateWorldNarration,
  type WorldNarration,
  type WorldNarrationRequest,
} from "@/src/contracts/world-narrator";

const identityRestriction = WorldNarrationRestrictedConceptSchema.parse({
  conceptId: "concept.stranger_identity",
  unlockFactId: "fact.odysseus_identity",
  forbiddenTerms: [
    "disguised Odysseus",
    "Odysseus in disguise",
    "Ulysses himself",
  ],
  equivalences: [
    {
      subjectTerms: [
        "the stranger",
        "the beggar",
        "the guest",
        "the wanderer",
      ],
      relationTerms: [
        "is",
        "was",
        "really",
        "true identity",
        "none other than",
      ],
      objectTerms: [
        "Odysseus",
        "Ulysses",
        "Laertiades",
        "the king of Ithaca",
      ],
      maxTokenDistance: 20,
    },
  ],
});

const request: WorldNarrationRequest = WorldNarrationRequestSchema.parse({
  focalEntityId: "penelope",
  observableFacts: [
    {
      factId: "fact.basin_at_hearth",
      summary: "A washing basin stands beside the hearth where Penelope can see it.",
    },
  ],
  focalKnowledge: [
    {
      factId: "fact.stranger_claimed_guest_memory",
      summary: "The stranger supplied a precise memory of clothing once worn by Odysseus.",
    },
  ],
  resolvedEvents: [
    {
      eventId: "event.player.orders_washing",
      source: "player",
      summary: "Penelope asks Eurycleia to wash the stranger's feet.",
    },
    {
      eventId: "event.npc.recognizes_scar",
      source: "npc",
      summary: "Eurycleia recognizes the old scar and catches her breath.",
    },
    {
      eventId: "event.world.suspicion_rises",
      source: "world",
      summary: "The sudden silence increases the risk of notice in the hall.",
    },
  ],
  previousVisibleSceneSummary:
    "Penelope questioned the stranger and found that his account matched details she remembered.",
  styleConstraints: [
    {
      constraintId: "style.concrete_pressure",
      ownership: "creator_owned_original",
      instruction: "Use concrete action and restrained dialogue instead of explanatory riddles.",
    },
  ],
  nextActionCandidates: [
    {
      actionId: "action.dismiss_melantho",
      actorEntityId: "penelope",
      actionTypeId: "dismiss_present_npc",
      label: "Dismiss Melantho",
      intent: "Send Melantho out before asking Eurycleia what she recognized.",
    },
    {
      actionId: "action.watch_in_silence",
      actorEntityId: "penelope",
      actionTypeId: "observe_without_intervening",
      label: "Watch in silence",
      intent: "Say nothing and watch how the stranger and Eurycleia respond.",
    },
  ],
});

const completeFixture = async (): Promise<WorldNarration> => {
  const outcome = await fixtureWorldNarrator.narrate(request);
  expect(outcome.outcome).toBe("completed");
  if (outcome.outcome !== "completed") throw new Error(outcome.error.message);
  return outcome.narration;
};

const replaceProse = (
  narration: WorldNarration,
  text: string,
): WorldNarration => ({
  ...narration,
  prose: text,
  segments: [
    {
      segmentId: "world_segment_replacement",
      text,
      grounding: narration.grounding,
    },
  ],
});

describe("world narrator boundary", () => {
  it("builds a deterministic 120-180 word scene only from resolved input", async () => {
    const first = await fixtureWorldNarrator.narrate(request);
    const second = await fixtureWorldNarrator.narrate(structuredClone(request));

    expect(first).toEqual(second);
    expect(first.outcome).toBe("completed");
    if (first.outcome !== "completed") throw new Error(first.error.message);
    expect(first.trace).toEqual({
      provenance: "fixture",
      adapterId: "world_narrator_fixture_v1",
    });
    expect(countEnglishSceneWords(first.narration.prose)).toBeGreaterThanOrEqual(120);
    expect(countEnglishSceneWords(first.narration.prose)).toBeLessThanOrEqual(180);
    expect(first.narration.nextActions).toEqual(request.nextActionCandidates);
    expect(first.narration.grounding.eventIds).toEqual(
      request.resolvedEvents.map(({ eventId }) => eventId),
    );
    expect(first.narration.prose).not.toContain("branch");
  });

  it("keeps a sparse but valid resolved turn inside the same word boundary", async () => {
    const sparseRequest = WorldNarrationRequestSchema.parse({
      ...request,
      observableFacts: [{ factId: "fact.lamp", summary: "A lamp burns." }],
      focalKnowledge: [],
      resolvedEvents: [
        { eventId: "event.player.waits", source: "player", summary: "She waits." },
      ],
      previousVisibleSceneSummary: null,
      nextActionCandidates: [],
    });

    const outcome = await fixtureWorldNarrator.narrate(sparseRequest);
    expect(outcome.outcome).toBe("completed");
    if (outcome.outcome !== "completed") throw new Error(outcome.error.message);
    expect(countEnglishSceneWords(outcome.narration.prose)).toBeGreaterThanOrEqual(120);
    expect(countEnglishSceneWords(outcome.narration.prose)).toBeLessThanOrEqual(180);
  });

  it("keeps hidden facts outside the model request and rejects phrase leakage afterward", async () => {
    expect(
      WorldNarrationRequestSchema.safeParse({
        ...request,
        hiddenFacts: [{ factId: "fact.odysseus_identity", summary: "Hidden" }],
      }).success,
    ).toBe(false);

    const narration = await completeFixture();
    const leakedText = `${narration.segments.at(-1)!.text} Odysseus is the disguised stranger.`;
    const leakedSegments = narration.segments.map((segment, index) =>
      index === narration.segments.length - 1
        ? { ...segment, text: leakedText }
        : segment,
    );
    const leaked = {
      ...narration,
      segments: leakedSegments,
      prose: leakedSegments.map(({ text }) => text).join("\n\n"),
    };

    expect(
      validateWorldNarration({
        request,
        narration: leaked,
        withheldFacts: [
          {
            factId: "fact.odysseus_identity",
            forbiddenPhrases: ["Odysseus is the disguised stranger"],
          },
        ],
      }),
    ).toMatchObject({ ok: false, code: "hidden_fact_leak" });
  });

  it.each([
    "The stranger before her was really Ulysses.",
    "The beggar was none other than Laertiades.",
    "The guest's true identity was the king of Ithaca.",
    "Odysseus in disguise watched her from the hearth.",
  ])("blocks a withheld identity equivalence: %s", async (leak) => {
    const narration = await completeFixture();
    const leakedText = `${narration.segments.at(-1)!.text} ${leak}`;
    const leakedSegments = narration.segments.map((segment, index) =>
      index === narration.segments.length - 1
        ? { ...segment, text: leakedText }
        : segment,
    );
    const leaked = {
      ...narration,
      segments: leakedSegments,
      prose: leakedSegments.map(({ text }) => text).join("\n\n"),
    };

    expect(
      validateWorldNarration({
        request,
        narration: leaked,
        restrictedConcepts: [identityRestriction],
      }),
    ).toMatchObject({ ok: false, code: "restricted_concept_leak" });
  });

  it("unlocks the restricted identity concept only through focal knowledge", async () => {
    const narration = await completeFixture();
    const leakedText = `${narration.segments.at(-1)!.text} The stranger was really Odysseus.`;
    const leakedSegments = narration.segments.map((segment, index) =>
      index === narration.segments.length - 1
        ? { ...segment, text: leakedText }
        : segment,
    );
    const revealed = {
      ...narration,
      segments: leakedSegments,
      prose: leakedSegments.map(({ text }) => text).join("\n\n"),
    };
    const unlockedRequest = WorldNarrationRequestSchema.parse({
      ...request,
      focalKnowledge: [
        ...request.focalKnowledge,
        {
          factId: "fact.odysseus_identity",
          summary: "Penelope now knows that the stranger is Odysseus.",
        },
      ],
    });

    expect(
      validateWorldNarration({
        request: unlockedRequest,
        narration: revealed,
        restrictedConcepts: [identityRestriction],
      }),
    ).toMatchObject({ ok: true });
  });

  it("rejects unknown event IDs even when segment and top-level grounding agree", async () => {
    const narration = await completeFixture();
    const forgedEventId = "event.hidden.identity_reveal";
    const forgedSegments = narration.segments.map((segment) =>
      segment.segmentId === "world_segment_resolved_events"
        ? {
            ...segment,
            grounding: {
              ...segment.grounding,
              eventIds: [...segment.grounding.eventIds, forgedEventId],
            },
          }
        : segment,
    );
    const forged = {
      ...narration,
      segments: forgedSegments,
      grounding: {
        ...narration.grounding,
        eventIds: [...narration.grounding.eventIds, forgedEventId],
      },
    };

    expect(validateWorldNarration({ request, narration: forged })).toMatchObject({
      ok: false,
      code: "event_not_supplied",
    });
  });

  it("accepts equivalent top-level grounding in a different order", async () => {
    const narration = await completeFixture();
    const reordered = {
      ...narration,
      grounding: {
        factIds: [...narration.grounding.factIds].reverse(),
        eventIds: [...narration.grounding.eventIds].reverse(),
      },
    };

    expect(validateWorldNarration({ request, narration: reordered })).toMatchObject({
      ok: true,
    });
  });

  it("rejects any mutation of runtime-supplied next actions", async () => {
    const narration = await completeFixture();
    const mutated = {
      ...narration,
      nextActions: narration.nextActions.map((action, index) =>
        index === 0 ? { ...action, label: "Confront the stranger" } : action,
      ),
    };

    expect(validateWorldNarration({ request, narration: mutated })).toMatchObject({
      ok: false,
      code: "next_actions_mutated",
    });
  });

  it("rejects outputs that add canon, effects, or knowledge fields", async () => {
    const narration = await completeFixture();
    expect(
      WorldNarrationSchema.safeParse({
        ...narration,
        effects: [{ kind: "knowledge_grant" }],
      }).success,
    ).toBe(false);
    expect(
      WorldNarrationSchema.safeParse({ ...narration, canon: { changed: true } }).success,
    ).toBe(false);
    expect(
      WorldNarrationSchema.safeParse({ ...narration, knowledge: ["secret"] }).success,
    ).toBe(false);
  });

  it("fails closed below 120 and above 180 English words", async () => {
    const narration = await completeFixture();
    const tooShort = replaceProse(
      narration,
      Array.from({ length: 119 }, (_, index) => `word${index}`).join(" "),
    );
    const tooLong = replaceProse(
      narration,
      Array.from({ length: 181 }, (_, index) => `word${index}`).join(" "),
    );

    expect(WorldNarrationSchema.safeParse(tooShort).success).toBe(false);
    expect(WorldNarrationSchema.safeParse(tooLong).success).toBe(false);
  });
});

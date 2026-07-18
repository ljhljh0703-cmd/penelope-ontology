import { describe, expect, it } from "vitest";
import {
  ODYSSEY_BOOK_19_WORLD_SIMULATION,
  getOdysseyBook19WorldSimulation,
} from "@/src/adapters/fixtures/odyssey-world-simulation";
import {
  MAX_REACTIONS_PER_TURN,
  MAX_WORLD_SIMULATION_TURNS,
  WorldSimulationScenarioSchema,
} from "@/src/contracts/world-simulation";
import {
  activeWorldSimulationRuleIds,
  buildCreatorRuleApprovalSubjectFingerprint,
  createWorldSimulationSession,
  fingerprintCreatorRuleApprovalReceiptPayload,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";

const mutableFixture = (): Record<string, unknown> =>
  structuredClone(ODYSSEY_BOOK_19_WORLD_SIMULATION) as unknown as Record<
    string,
    unknown
  >;

const runSequence = (inputs: string[]) => {
  let session = createWorldSimulationSession({
    scenario: ODYSSEY_BOOK_19_WORLD_SIMULATION,
  });
  const receipts = [];
  for (const input of inputs) {
    const result = runWorldSimulationTurn({
      scenario: ODYSSEY_BOOK_19_WORLD_SIMULATION,
      session,
      input,
    });
    session = result.session;
    receipts.push(result.receipt);
  }
  return { session, receipts };
};

const flagValue = (
  session: ReturnType<typeof createWorldSimulationSession>,
  flagId: string,
): boolean | undefined =>
  session.state.flags.find(({ id }) => id === flagId)?.value;

describe("Odyssey Book 19 world simulation", () => {
  it("locks one bounded Penelope session with three connected zones and four actors", () => {
    const scenario = WorldSimulationScenarioSchema.parse(
      ODYSSEY_BOOK_19_WORLD_SIMULATION,
    );

    expect(scenario.focalParticipantEntityId).toBe("entity.penelope");
    expect(scenario.maxTurns).toBe(MAX_WORLD_SIMULATION_TURNS);
    expect(scenario.maxReactionsPerTurn).toBe(MAX_REACTIONS_PER_TURN);
    expect(scenario.zones).toHaveLength(3);
    expect(scenario.actors.map(({ id }) => id)).toEqual([
      "entity.penelope",
      "entity.odysseus",
      "entity.eurycleia",
      "entity.melantho",
    ]);
    expect(
      scenario.zones.every((zone) =>
        zone.connectedZoneIds.every((peerId) =>
          scenario.zones
            .find(({ id }) => id === peerId)
            ?.connectedZoneIds.includes(zone.id),
        ),
      ),
    ).toBe(true);
  });

  it("keeps every canonical premise source- or creator-grounded and public-safe", () => {
    for (const premise of ODYSSEY_BOOK_19_WORLD_SIMULATION.premises) {
      expect(premise.textForm).toBe("original_summary");
      expect(premise.summary).not.toMatch(/[“”"]/u);
      expect(premise.meaning.length).toBeGreaterThan(11);
      expect(premise.recognizerEntityIds.length).toBeGreaterThan(0);
      expect(premise.stakes.length).toBeGreaterThan(0);
      if (premise.origin.kind === "source") {
        expect(premise.approvalState).toBe("source_verified");
        expect(premise.origin.sourceLocatorIds.length).toBeGreaterThan(0);
      } else {
        expect(premise.approvalState).toBe("creator_approved");
        expect(premise.origin.creatorDecisionId.length).toBeGreaterThan(0);
      }
    }

    expect(
      new Set(
        ODYSSEY_BOOK_19_WORLD_SIMULATION.sourceLocators.map(({ book }) => book),
      ),
    ).toEqual(new Set(["19", "23"]));
    expect(
      ODYSSEY_BOOK_19_WORLD_SIMULATION.sourceLocators.every(
        ({ usage }) => usage === "original_summary_only",
      ),
    ).toBe(true);
    expect(
      ODYSSEY_BOOK_19_WORLD_SIMULATION.sourceLocators.every(
        ({ sourceStatus, checkedAt, evidenceSummary }) =>
          sourceStatus === "primary_source_checked" &&
          checkedAt === "2026-07-17" &&
          evidenceSummary.length > 11,
      ),
    ).toBe(true);
  });

  it("keeps proposal origin while binding D6 approval outside source canon", () => {
    const rules = [
      ...ODYSSEY_BOOK_19_WORLD_SIMULATION.reactionRules,
      ...ODYSSEY_BOOK_19_WORLD_SIMULATION.endingRules,
    ];
    const sourceGrounded = rules.filter(
      ({ provenance }) => provenance.basis === "source_derived",
    );
    const reviewCandidates = rules.filter(
      ({ provenance }) => provenance.basis === "agent_proposed",
    );

    expect(sourceGrounded).toHaveLength(4);
    expect(
      sourceGrounded.every(
        ({ provenance }) =>
          provenance.reviewState === "source_grounded" &&
          provenance.canonStatus === "source_canon" &&
          provenance.premiseIds.length > 0,
      ),
    ).toBe(true);
    expect(reviewCandidates).toHaveLength(7);
    expect(
      reviewCandidates.every(
        ({ provenance }) =>
          provenance.reviewState === "creator_approved" &&
          provenance.canonStatus === "not_source_canon" &&
          provenance.creatorApprovalReceiptId !== null &&
          provenance.creatorDecisionId !== null,
      ),
    ).toBe(true);

    const [receipt] =
      ODYSSEY_BOOK_19_WORLD_SIMULATION.creatorRuleApprovalReceipts;
    expect(receipt?.decisions).toHaveLength(5);
    expect(receipt?.decisions.flatMap(({ ruleIds }) => ruleIds)).toHaveLength(7);
    expect(
      new Set(receipt?.decisions.flatMap(({ ruleIds }) => ruleIds)),
    ).toEqual(new Set(reviewCandidates.map(({ id }) => id)));
    expect(
      receipt?.decisions.find(({ decisionId }) => decisionId === "decision.d6-4"),
    ).toMatchObject({ action: "approve_as_creator_authored_if" });
    expect(
      ODYSSEY_BOOK_19_WORLD_SIMULATION.narrationSpeechDirectives,
    ).toEqual([
      expect.objectContaining({
        id: "speech.eurycleia.controlled_disclosure",
        reactionRuleId: "reaction.eurycleia.controlled_disclosure",
        speakerEntityId: "entity.eurycleia",
        speechAct: "answer",
        creatorApprovalReceiptId: "receipt.d6.night_of_the_scar",
        creatorDecisionId: "decision.d6-4",
      }),
    ]);
  });

  it("activates D6 rules only through the exact trusted creator receipt", () => {
    const scenario = ODYSSEY_BOOK_19_WORLD_SIMULATION;
    const [receipt] = scenario.creatorRuleApprovalReceipts;
    const [trusted] =
      scenario.creatorRuleApprovalAuthorityRegistry.trustedReceipts;
    expect(receipt).toBeDefined();
    expect(trusted).toBeDefined();
    expect(receipt?.binding.subjectFingerprint).toBe(
      buildCreatorRuleApprovalSubjectFingerprint({
        scenario,
        receiptId: receipt!.binding.receiptId,
      }),
    );
    expect(trusted?.payloadFingerprint).toBe(
      fingerprintCreatorRuleApprovalReceiptPayload(receipt!),
    );
    expect(activeWorldSimulationRuleIds(scenario)).toEqual(
      new Set([
        ...scenario.reactionRules.map(({ id }) => id),
        ...scenario.endingRules.map(({ id }) => id),
      ]),
    );
  });

  it.each(["missing", "subject", "payload", "issuer", "rule", "speech"] as const)(
    "fails D6 rule activation closed for %s approval tampering",
    (tamper) => {
      const scenario = structuredClone(ODYSSEY_BOOK_19_WORLD_SIMULATION);
      const registry = scenario.creatorRuleApprovalAuthorityRegistry;
      const trusted = registry.trustedReceipts[0]!;

      if (tamper === "missing") registry.trustedReceipts = [];
      if (tamper === "subject") trusted.subjectFingerprint = "0".repeat(64);
      if (tamper === "payload") trusted.payloadFingerprint = "0".repeat(64);
      if (tamper === "issuer") trusted.issuerAuthorityId = "creator.untrusted";
      if (tamper === "rule") {
        const proposed = scenario.reactionRules.find(
          ({ provenance }) => provenance.basis === "agent_proposed",
        )!;
        proposed.summary = `${proposed.summary} Changed after approval.`;
      }
      if (tamper === "speech") {
        scenario.narrationSpeechDirectives[0]!.plainIntent =
          "Invent an unapproved future promise for Eurycleia.";
      }

      const active = activeWorldSimulationRuleIds(scenario);
      const sourceIds = [
        ...scenario.reactionRules,
        ...scenario.endingRules,
      ]
        .filter(({ provenance }) => provenance.basis === "source_derived")
        .map(({ id }) => id);
      const proposedIds = [
        ...scenario.reactionRules,
        ...scenario.endingRules,
      ]
        .filter(({ provenance }) => provenance.basis === "agent_proposed")
        .map(({ id }) => id);

      expect(sourceIds.every((id) => active.has(id))).toBe(true);
      expect(proposedIds.every((id) => !active.has(id))).toBe(true);
    },
  );

  it.each(["unknown_rule", "wrong_speaker", "duplicate_rule"] as const)(
    "rejects an invalid narration speech directive: %s",
    (tamper) => {
      const fixture = structuredClone(ODYSSEY_BOOK_19_WORLD_SIMULATION);
      const directive = fixture.narrationSpeechDirectives[0]!;
      if (tamper === "unknown_rule") {
        directive.reactionRuleId = "reaction.unknown";
      }
      if (tamper === "wrong_speaker") {
        directive.speakerEntityId = "entity.melantho";
      }
      if (tamper === "duplicate_rule") {
        fixture.narrationSpeechDirectives.push({
          ...directive,
          id: "speech.eurycleia.controlled_disclosure_duplicate",
        });
      }

      expect(WorldSimulationScenarioSchema.safeParse(fixture).success).toBe(
        false,
      );
    },
  );

  it.each(["origin", "meaning", "recognizerEntityIds", "stakes", "approvalState"])(
    "rejects a canonical premise without %s",
    (field) => {
      const fixture = mutableFixture();
      const premises = fixture.premises as Array<Record<string, unknown>>;
      delete premises[0]?.[field];

      const result = WorldSimulationScenarioSchema.safeParse(fixture);
      expect(result.success).toBe(false);
    },
  );

  it("rejects approval that does not match the premise origin authority", () => {
    const fixture = mutableFixture();
    const premises = fixture.premises as Array<Record<string, unknown>>;
    premises[0] = { ...premises[0], approvalState: "creator_approved" };

    const result = WorldSimulationScenarioSchema.safeParse(fixture);
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(({ message }) =>
        message.includes("source-origin premise must be source_verified"),
      ),
    ).toBe(true);
  });

  it("separates initial private knowledge from knowledge granted by reactions", () => {
    const scenario = ODYSSEY_BOOK_19_WORLD_SIMULATION;
    const knowsIdentityAtStart = scenario.initialPrivateKnowledge
      .filter(({ premiseIds }) => premiseIds.includes("premise.stranger_identity"))
      .map(({ entityId }) => entityId);

    expect(knowsIdentityAtStart).toEqual(["entity.odysseus"]);
    expect(
      scenario.reactionRules.some(({ effects }) =>
        effects.some(
          (effect) =>
            effect.kind === "grant_knowledge" &&
            effect.entityId === "entity.eurycleia" &&
            effect.premiseId === "premise.stranger_identity",
        ),
      ),
    ).toBe(true);
    expect(
      scenario.reactionRules.some(({ effects }) =>
        effects.some(
          (effect) =>
            effect.kind === "grant_knowledge" &&
            effect.entityId === "entity.penelope" &&
            effect.premiseId === "premise.stranger_identity",
        ),
      ),
    ).toBe(true);
  });

  it("keeps creator actor names separate from focal-facing labels before recognition", () => {
    const actors = ODYSSEY_BOOK_19_WORLD_SIMULATION.actors;
    expect(
      Object.fromEntries(actors.map(({ id, participantLabel }) => [id, participantLabel])),
    ).toEqual({
      "entity.penelope": "Penelope",
      "entity.odysseus": "the stranger",
      "entity.eurycleia": "Eurycleia",
      "entity.melantho": "Melantho",
    });

    const disguisedActor = actors.find(({ id }) => id === "entity.odysseus");
    expect(disguisedActor?.name).toBe("Disguised Odysseus");
    expect(disguisedActor?.participantLabel).not.toMatch(/odysseus/iu);
    expect(disguisedActor?.publicDescription).not.toMatch(/odysseus/iu);
  });

  it("separates facilitator reaction truth from focal-observable narration", () => {
    const recognition = ODYSSEY_BOOK_19_WORLD_SIMULATION.reactionRules.find(
      ({ id }) => id === "reaction.eurycleia.recognize_scar",
    );

    expect(recognition?.summary).toMatch(/Odysseus|identity/iu);
    expect(recognition?.observableSummary).toBeTruthy();
    expect(recognition?.observableSummary).not.toMatch(/Odysseus|identity/iu);
    expect(
      ODYSSEY_BOOK_19_WORLD_SIMULATION.reactionRules.every(
        (rule) => "observableSummary" in rule,
      ),
    ).toBe(true);
  });

  it("provides bounded compositional actions instead of sentence-matched branches", () => {
    const aliases = ODYSSEY_BOOK_19_WORLD_SIMULATION.actions.flatMap(
      ({ verbAliases }) => verbAliases,
    );

    expect(new Set(aliases).size).toBe(aliases.length);
    expect(aliases.every((alias) => /^[a-z]+(?: [a-z]+){0,3}$/u.test(alias))).toBe(
      true,
    );
    expect(
      ODYSSEY_BOOK_19_WORLD_SIMULATION.actions.every(
        ({ verbAliases }) => verbAliases.length > 0 && verbAliases.length <= 8,
      ),
    ).toBe(true);
  });

  it("bounds NPC reactions and provides all four terminal outcomes", () => {
    expect(
      ODYSSEY_BOOK_19_WORLD_SIMULATION.reactionRules.every(
        ({ conditions, effects }) =>
          conditions.length > 0 &&
          conditions.length <= 4 &&
          effects.length > 0 &&
          effects.length <= 4,
      ),
    ).toBe(true);
    expect(
      ODYSSEY_BOOK_19_WORLD_SIMULATION.endingRules.map(({ kind }) => kind),
    ).toEqual([
      "canon_contained",
      "controlled_discovery",
      "plan_compromised",
      "timeout",
    ]);
  });

  it("keeps scar recognition open through turn one and reaches canon containment on turn two", () => {
    const { session, receipts } = runSequence(["order washing", "observe"]);

    expect(receipts[0]?.endingId).toBeNull();
    expect(receipts[0]?.firedReactionRuleIds).toEqual([
      "reaction.eurycleia.recognize_scar",
      "reaction.odysseus.contain_recognition",
    ]);
    expect(receipts[1]?.firedReactionRuleIds).toContain(
      "reaction.melantho.approach_on_observe",
    );
    expect(session.state.endingId).toBe("ending.canon_contained");
    expect(
      session.state.actors.find(({ entityId }) => entityId === "entity.melantho")
        ?.zoneId,
    ).toBe("zone.great_hall_hearth");
    expect(
      session.state.clocks.find(({ id }) => id === "clock.suitor_suspicion")
        ?.value,
    ).toBe(1);
  });

  it("reaches a controlled two-turn discovery after sourced recognition", () => {
    const { session, receipts } = runSequence([
      "order washing",
      "confront Odysseus",
    ]);

    expect(receipts[0]?.endingId).toBeNull();
    expect(receipts[1]?.firedReactionRuleIds).toContain(
      "reaction.eurycleia.controlled_disclosure",
    );
    expect(session.state.endingId).toBe("ending.controlled_discovery");
    expect(
      session.state.knowledge
        .find(({ entityId }) => entityId === "entity.penelope")
        ?.premiseIds,
    ).toContain("premise.stranger_identity");
  });

  it("makes dismissal followed by scar exposure compromise the plan", () => {
    const { session, receipts } = runSequence([
      "dismiss Melantho",
      "order washing",
    ]);

    expect(receipts[0]?.firedReactionRuleIds).toContain(
      "reaction.melantho.notice_exclusion",
    );
    expect(flagValue(session, "flag.melantho_alerted")).toBe(true);
    expect(receipts[1]?.firedReactionRuleIds).toContain(
      "reaction.melantho.compromise_plan",
    );
    expect(receipts[1]?.firedReactionRuleIds).not.toContain(
      "reaction.odysseus.contain_recognition",
    );
    expect(session.state.endingId).toBe("ending.plan_compromised");
    expect(flagValue(session, "flag.secret_contained")).toBe(false);
  });

  it("gives testimony testing an observable NPC response", () => {
    const { session, receipts } = runSequence(["test testimony"]);

    expect(receipts[0]?.firedReactionRuleIds).toContain(
      "reaction.odysseus.answer_testimony",
    );
    expect(flagValue(session, "flag.testimony_tested")).toBe(true);
    expect(session.state.status).toBe("active");
  });

  it("contains no graph database or embedding surface", () => {
    const serialized = JSON.stringify(ODYSSEY_BOOK_19_WORLD_SIMULATION);
    expect(serialized).not.toMatch(/graph(?:db| database)|embedding/iu);
  });

  it("returns a clone instead of mutable shared fixture state", () => {
    const first = getOdysseyBook19WorldSimulation();
    const second = getOdysseyBook19WorldSimulation();
    first.initialFlags[0]!.value = true;

    expect(second.initialFlags[0]?.value).toBe(false);
    expect(ODYSSEY_BOOK_19_WORLD_SIMULATION.initialFlags[0]?.value).toBe(false);
  });
});

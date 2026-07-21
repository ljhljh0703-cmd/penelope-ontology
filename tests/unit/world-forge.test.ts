import { describe, expect, it } from "vitest";
import {
  WorldForgeCompileRequestSchema,
  WorldForgeDraftSchema,
  type WorldForgeDraft,
} from "@/src/contracts/world-forge";
import { compileWorldForgeDraft } from "@/src/application/world-forge-service";
import { runWorldSessionNarrationPipeline } from "@/src/application/world-simulation-service";
import {
  fixtureNarrationCritic,
  fixtureNarrationRenderer,
} from "@/src/adapters/fixtures/world-narrator";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { PenelopeEnglishStyleProfileSchema } from "@/src/contracts/world-narrator";
import { sealPenelopeWorldPack } from "@/src/contracts/penelope-world-pack";
import {
  createWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";

const approved = <Value extends string>(value: Value) => ({
  value,
  origin: "creator_stated" as const,
  approval: "creator_approved" as const,
});

const draft = (): WorldForgeDraft =>
  WorldForgeDraftSchema.parse({
    format: "penelope_world_forge_draft",
    schemaVersion: 2,
    draftId: "forge.lantern_ledger.browser_test",
    approvedOn: "2026-07-21",
    seedText: approved(
      "A harbor archivist finds a ledger that predicts which beacon will fail. The keeper knows the ledger is accurate, but revealing that fact could expose the rescue route.",
    ),
    title: approved("The Last Beacon Ledger"),
    focalCharacterName: approved("Elian"),
    counterpartName: approved("Mira"),
    locationName: approved("North Beacon Archive"),
    immutableFact: approved(
      "The ledger can predict a beacon failure, but it cannot change the failure by itself.",
    ),
    focalDesire: approved(
      "Elian wants the rescue route before the north beacon loses its final light.",
    ),
    counterpartDesire: approved(
      "Mira wants to protect the route from anyone who will treat it as disposable knowledge.",
    ),
    stakes: approved(
      "If they fail to agree, the rescue boat will enter the harbor without a working signal.",
    ),
    knowledgeAsymmetry: approved(
      "Mira knows the ledger has never made a false prediction, while Elian does not.",
    ),
    forbiddenDevelopment: approved(
      "No character may erase the ledger's prediction or create a new beacon without paying a declared cost.",
    ),
    endingCondition: approved(
      "The scene ends when Elian earns the route or accepts a different obligation before the light fails.",
    ),
    acceptedCost: approved(
      "Elian may owe Mira a future rescue that takes priority over his own assignment.",
    ),
    recommendedAction: approved("Offer Mira custody of the ledger"),
    recommendedConsequence: approved(
      "Mira shares the rescue route because Elian makes her safeguard part of the agreement.",
    ),
    alternativeAction: approved("Seal the ledger and ask for one signal only"),
    alternativeConsequence: approved(
      "Mira gives one temporary signal, but Elian leaves without the route and owes her another negotiation.",
    ),
    relationshipLabel: approved("trusts cautiously"),
    relationshipAxis: approved("trust"),
    relationshipPressure: approved(
      "Elian strengthens the bond by accepting custody terms and damages it by treating Mira's warning as disposable.",
    ),
    sceneTwo: approved(
      "The failing beacon forces Elian to choose whether Mira's custody terms matter more than immediate speed.",
    ),
    sceneThree: approved(
      "The ledger identifies a second failure and reveals that the safe route depends on Mira's withheld signal.",
    ),
    sceneFour: approved(
      "The rescue boat enters the outer harbor while Elian's earlier promise returns as a debt he must honor.",
    ),
    sceneFive: approved(
      "Elian and Mira face the darkened beacon together and the accumulated trust determines which route survives.",
    ),
  });

describe("Penelope World Forge", () => {
  it("rejects seeds outside the two-to-three sentence intake contract", () => {
    expect(() =>
      WorldForgeDraftSchema.parse({
        ...draft(),
        seedText: approved("Only one sentence is present."),
      }),
    ).toThrow(/two or three sentences/iu);
  });

  it("refuses to compile any fact that the creator has not approved", () => {
    const pending = {
      ...draft(),
      knowledgeAsymmetry: {
        ...draft().knowledgeAsymmetry,
        origin: "model_proposed" as const,
        approval: "pending" as const,
      },
    };

    expect(() =>
      WorldForgeCompileRequestSchema.parse({ draft: pending }),
    ).toThrow(/knowledgeAsymmetry.*creator-approved/isu);
  });

  it("compiles the same approved draft to the same sealed world-pack digest", () => {
    const first = compileWorldForgeDraft({ draft: draft() });
    const second = compileWorldForgeDraft({ draft: draft() });

    expect(first.definitionDigest).toBe(second.definitionDigest);
    expect(first.definition.packId).toBe(second.definition.packId);
    expect(first.definition.provenance).toMatchObject({
      kind: "creator_owned",
      sourceStatus: "creator_attested",
    });
    expect(first.definition.scenario.title).toBe("The Last Beacon Ledger");
    expect(first.approvedFacts).toHaveLength(24);
    expect(first.definition.packVersion).toBe("2.0.0");
    expect(first.definition.scenario.episodeBlueprint?.scenes).toHaveLength(5);
    expect(first.definition.worldCodex?.relationships).toHaveLength(1);
    expect(first.approvedFacts.every(({ approval }) => approval === "creator_approved")).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/Odysseus|Ithaca|Dorothy|Wizard/iu);
  });

  it("preserves the creator's distinct A and B consequences through the generic runtime", () => {
    const compiled = compileWorldForgeDraft({ draft: draft() });
    const scenario = compiled.definition.scenario;
    const recommendedSession = createWorldSimulationSession({ scenario });
    const alternativeSession = createWorldSimulationSession({ scenario });

    const runFive = (input: string, initial: typeof recommendedSession) => {
      let current = initial;
      let result: ReturnType<typeof runWorldSimulationTurn> | null = null;
      for (let turn = 0; turn < 5; turn += 1) {
        result = runWorldSimulationTurn({ scenario, session: current, input });
        current = result.session;
      }
      return result!;
    };
    const recommended = runFive(
      draft().recommendedAction.value,
      recommendedSession,
    );
    const alternative = runFive(
      draft().alternativeAction.value,
      alternativeSession,
    );

    expect(recommended.receipt.endingId).toContain("recommended");
    expect(alternative.receipt.endingId).toContain("alternative");
    expect(recommended.receipt.firedReactionRuleIds).not.toEqual(
      alternative.receipt.firedReactionRuleIds,
    );
    expect(recommended.session.state.stateHash).not.toBe(
      alternative.session.state.stateHash,
    );
    expect(recommended.session.state.episode?.sceneIndex).toBe(4);
    expect(recommended.session.state.relationships?.[0]?.level).toBe(2);
    expect(alternative.session.state.relationships?.[0]?.level).toBe(-2);
  });

  it("opens the forged pack through the existing narration pipeline", async () => {
    const compiled = compileWorldForgeDraft({ draft: draft() });
    const worldPack = sealPenelopeWorldPack(compiled.definition);
    const session = createWorldSimulationSession({ scenario: worldPack.scenario });
    const narrated = await runWorldSessionNarrationPipeline({
      scenario: worldPack.scenario,
      worldPack,
      session,
      receipt: null,
      styleProfile: PenelopeEnglishStyleProfileSchema.parse(styleProfileJson),
      renderer: fixtureNarrationRenderer,
      critic: fixtureNarrationCritic,
    });

    expect(narrated.outcome, JSON.stringify(narrated, null, 2)).toBe("accepted");

    const turn = runWorldSimulationTurn({
      scenario: worldPack.scenario,
      session,
      input: draft().recommendedAction.value,
    });
    const turnNarration = await runWorldSessionNarrationPipeline({
      scenario: worldPack.scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile: PenelopeEnglishStyleProfileSchema.parse(styleProfileJson),
      renderer: fixtureNarrationRenderer,
      critic: fixtureNarrationCritic,
    });
    expect(
      turnNarration.outcome,
      JSON.stringify(turnNarration, null, 2),
    ).toBe("accepted");
  });
});

import { describe, expect, it } from "vitest";
import {
  OZ_DISCOVERY_WORLD_PACK,
  getOzDiscoveryWorldPack,
} from "@/src/adapters/world-packs/oz-discovery";
import {
  PenelopeWorldPackV1Schema,
  scenarioFromWorldPack,
} from "@/src/contracts/penelope-world-pack";
import {
  createWorldSimulationSession,
  resolveWorldAction,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";

const scenario = () => scenarioFromWorldPack(getOzDiscoveryWorldPack());

describe("Oz discovery world pack", () => {
  it("seals a public-domain Chapter XV pack with original-source provenance", () => {
    const parsed = PenelopeWorldPackV1Schema.parse(OZ_DISCOVERY_WORLD_PACK);

    expect(parsed.packId).toBe("pack.oz.discovery_of_the_wizard");
    expect(parsed.scenario.maxTurns).toBe(2);
    expect(parsed.provenance).toMatchObject({
      kind: "public_domain",
      sourceStatus: "source_checked",
    });
    expect(parsed.scenario.sourceLocators[0]?.book).toContain("Chapter XV");
  });

  it("keeps the book's silver shoes separate from later ruby-shoes imagery", () => {
    const pack = getOzDiscoveryWorldPack();
    const mechanism = pack.creatorInput.unsupportedMechanisms.find(({ cueTerms }) =>
      cueTerms.includes("ruby slippers"),
    );

    expect(mechanism?.explanation).toContain("silver shoes");
    expect(resolveWorldAction({ scenario: scenario(), input: "use ruby slippers" }).status).toBe(
      "unsupported",
    );
  });

  it("reaches the source route when the Lion's roar leaves Toto free to topple the screen", () => {
    const world = scenario();
    const initial = createWorldSimulationSession({ scenario: world });
    const result = runWorldSimulationTurn({
      scenario: world,
      session: initial,
      input: "ask Lion to roar",
    });

    expect(result.receipt.endingId).toBe("ending.humbug_exposed");
    expect(result.receipt.firedReactionRuleIds).toEqual([
      "reaction.toto.topple_screen",
      "reaction.wizard.admit_deception",
    ]);
    expect(result.session.state.status).toBe("complete");
  });

  it("keeps a creator-approved IF explicit: restraining Toto preserves the illusion and its cost", () => {
    const world = scenario();
    const initial = createWorldSimulationSession({ scenario: world });
    const held = runWorldSimulationTurn({
      scenario: world,
      session: initial,
      input: "keep Toto close",
    });
    const result = runWorldSimulationTurn({
      scenario: world,
      session: held.session,
      input: "ask Lion to roar",
    });

    expect(held.receipt.firedReactionRuleIds).toEqual(["reaction.toto.accept_restraint"]);
    expect(result.receipt.endingId).toBe("ending.illusion_holds");
    expect(result.session.state.flags).toEqual(
      expect.arrayContaining([
        { id: "flag.toto_restrained", value: true },
        { id: "flag.illusion_holds", value: true },
        { id: "flag.wizard_exposed", value: false },
      ]),
    );
  });

  it("makes the public-pressure alternate route a distinct causal ending", () => {
    const world = scenario();
    const initial = createWorldSimulationSession({ scenario: world });
    const pressured = runWorldSimulationTurn({
      scenario: world,
      session: initial,
      input: "compare appearances with the Voice",
    });
    const result = runWorldSimulationTurn({
      scenario: world,
      session: pressured.session,
      input: "ask Lion to roar",
    });

    expect(pressured.session.state.status).toBe("active");
    expect(result.receipt.endingId).toBe("ending.public_pressure_exposure");
  });
});

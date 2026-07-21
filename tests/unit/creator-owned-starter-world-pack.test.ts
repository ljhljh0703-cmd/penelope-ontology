import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PenelopeWorldPackDefinitionSchema,
  sealPenelopeWorldPack,
} from "@/src/contracts/penelope-world-pack";
import {
  createWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";

const samplePath = resolve("examples/world-packs/creator-owned-starter.json");

const readSample = () =>
  JSON.parse(readFileSync(samplePath, "utf8")) as unknown;

describe("creator-owned starter world pack", () => {
  it("seals a compact creator-attested definition with no borrowed-world identifiers", () => {
    const raw = readSample() as Record<string, unknown>;
    const rawText = JSON.stringify(raw).toLocaleLowerCase("en-US");
    const definition = PenelopeWorldPackDefinitionSchema.parse(raw);
    const sealed = sealPenelopeWorldPack(definition);

    expect(statSync(samplePath).size).toBeLessThanOrEqual(262_144);
    expect(raw).not.toHaveProperty("definitionDigest");
    expect(definition.provenance).toMatchObject({
      kind: "creator_owned",
      sourceStatus: "creator_attested",
      sourceUrl: null,
    });
    expect(definition.identityPolicy.creatorMayInspectHiddenState).toBe(true);
    expect(definition.scenario.maxTurns).toBe(2);
    expect(definition.scenario.zones).toHaveLength(1);
    expect(
      definition.creatorInput.recommendedActionPolicies.every(
        ({ actionIds }) => new Set(actionIds).size >= 2,
      ),
    ).toBe(true);
    expect(rawText).not.toMatch(/\b(?:odyssey|oz|ithaca|trojan)\b/u);
    expect(sealed.definitionDigest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("runs the sample through the generic runtime without a registered-world adapter", () => {
    const pack = sealPenelopeWorldPack(
      PenelopeWorldPackDefinitionSchema.parse(readSample()),
    );
    const session = createWorldSimulationSession({ scenario: pack.scenario });
    const result = runWorldSimulationTurn({
      scenario: pack.scenario,
      session,
      input: "offer the lantern to Mira",
    });

    expect(result.receipt.action).toMatchObject({
      status: "accepted",
      actionId: "action.elian.offer_lantern",
      actorEntityId: "entity.elian",
      targetEntityId: "entity.mira",
    });
    expect(result.receipt.firedReactionRuleIds).toEqual(["reaction.mira.share_route"]);
    expect(result.receipt.endingId).toBe("ending.route_shared");
    expect(result.session.state.status).toBe("complete");
  });
});

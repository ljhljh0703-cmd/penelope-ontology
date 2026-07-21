import { describe, expect, it } from "vitest";
import { ODYSSEY_BOOK_19_WORLD_SIMULATION } from "@/src/adapters/fixtures/odyssey-world-simulation";
import { WorldSimulationScenarioSchema } from "@/src/contracts/world-simulation";

const portableFixture = () => structuredClone(ODYSSEY_BOOK_19_WORLD_SIMULATION);

const replaceZoneIds = (value: unknown, zoneIds: ReadonlySet<string>): unknown => {
  if (typeof value === "string") {
    return zoneIds.has(value) ? "zone.single_room" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceZoneIds(item, zoneIds));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceZoneIds(item, zoneIds)]),
    );
  }
  return value;
};

const keepOnlyTimeoutEnding = () => {
  const scenario = portableFixture();
  const timeout = scenario.endingRules.find(({ kind }) => kind === "timeout")!;
  scenario.endingRules = [timeout];

  const retainedRuleIds = new Set([
    ...scenario.reactionRules.map(({ id }) => id),
    timeout.id,
  ]);
  scenario.creatorRuleApprovalReceipts = scenario.creatorRuleApprovalReceipts
    .map((receipt) => ({
      ...receipt,
      decisions: receipt.decisions
        .map((decision) => ({
          ...decision,
          ruleIds: decision.ruleIds.filter((ruleId) => retainedRuleIds.has(ruleId)),
        }))
        .filter(({ ruleIds }) => ruleIds.length > 0),
    }))
    .filter(({ decisions }) => decisions.length > 0);

  return scenario;
};

describe("portable world simulation contracts", () => {
  it("accepts one creator or source locator with generic work and book labels", () => {
    const scenario = portableFixture();
    const [source] = scenario.sourceLocators;
    scenario.sourceLocators = [
      {
        ...source!,
        work: "The Lantern Archive",
        book: "Draft 4 · Arrival at the Glass Marsh",
      },
    ];
    scenario.premises = scenario.premises.map((premise) =>
      premise.origin.kind === "source"
        ? {
            ...premise,
            origin: {
              ...premise.origin,
              sourceLocatorIds: [source!.id],
            },
          }
        : premise,
    );

    const parsed = WorldSimulationScenarioSchema.parse(scenario);

    expect(parsed.sourceLocators).toHaveLength(1);
    expect(parsed.sourceLocators[0]).toMatchObject({
      work: "The Lantern Archive",
      book: "Draft 4 · Arrival at the Glass Marsh",
      url: source!.url,
      sourceStatus: source!.sourceStatus,
      evidenceSummary: source!.evidenceSummary,
    });
  });

  it("accepts a private creator-attested source without forcing a public URL", () => {
    const scenario = portableFixture();
    const [source] = scenario.sourceLocators;
    scenario.sourceLocators = [
      {
        ...source!,
        work: "Creator-owned world bible",
        book: "Version 3 · hidden-island chapter",
        url: null,
        sourceStatus: "creator_source_attested",
      },
    ];
    scenario.premises = scenario.premises.map((premise) =>
      premise.origin.kind === "source"
        ? {
            ...premise,
            origin: { ...premise.origin, sourceLocatorIds: [source!.id] },
          }
        : premise,
    );

    expect(WorldSimulationScenarioSchema.parse(scenario).sourceLocators[0]).toMatchObject({
      url: null,
      sourceStatus: "creator_source_attested",
    });

    const unverifiedPublic = structuredClone(scenario);
    unverifiedPublic.sourceLocators[0]!.sourceStatus = "primary_source_checked";
    expect(WorldSimulationScenarioSchema.safeParse(unverifiedPublic).success).toBe(false);
  });

  it("accepts a one-zone scene with no topology edge while preserving every zone reference", () => {
    const scenario = portableFixture();
    const originalZoneIds = new Set(scenario.zones.map(({ id }) => id));
    const retargeted = replaceZoneIds(scenario, originalZoneIds) as typeof scenario;
    const [singleZone] = retargeted.zones;
    retargeted.zones = [
      {
        ...singleZone!,
        id: "zone.single_room",
        connectedZoneIds: [],
      },
    ];

    const parsed = WorldSimulationScenarioSchema.parse(retargeted);

    expect(parsed.zones).toEqual([
      expect.objectContaining({ id: "zone.single_room", connectedZoneIds: [] }),
    ]);
    expect(parsed.actors.every(({ currentZoneId }) => currentZoneId === "zone.single_room")).toBe(
      true,
    );
  });

  it("keeps unknown and asymmetric topology references fail-closed", () => {
    const unknown = portableFixture();
    unknown.zones[0]!.connectedZoneIds = ["zone.unknown"];
    expect(WorldSimulationScenarioSchema.safeParse(unknown).success).toBe(false);

    const asymmetric = portableFixture();
    asymmetric.zones[0]!.connectedZoneIds = [asymmetric.zones[1]!.id];
    asymmetric.zones[1]!.connectedZoneIds = [asymmetric.zones[2]!.id];
    expect(WorldSimulationScenarioSchema.safeParse(asymmetric).success).toBe(false);
  });

  it("allows pack-specific terminal identifiers but reserves exactly one timeout ending", () => {
    const scenario = portableFixture();
    scenario.endingRules[0]!.kind = "secret_kept";
    scenario.endingRules[1]!.kind = "truth_shared";
    scenario.endingRules[2]!.kind = "plan_unraveled";

    const parsed = WorldSimulationScenarioSchema.parse(scenario);
    expect(parsed.endingRules.map(({ kind }) => kind)).toEqual([
      "secret_kept",
      "truth_shared",
      "plan_unraveled",
      "timeout",
    ]);

    const missingTimeout = structuredClone(scenario);
    missingTimeout.endingRules[3]!.kind = "unfinished";
    expect(WorldSimulationScenarioSchema.safeParse(missingTimeout).success).toBe(false);

    const duplicateTimeout = structuredClone(scenario);
    duplicateTimeout.endingRules[0]!.kind = "timeout";
    expect(WorldSimulationScenarioSchema.safeParse(duplicateTimeout).success).toBe(false);
  });

  it("allows one through six endings and keeps the timeout tied to maxTurns", () => {
    const oneEnding = keepOnlyTimeoutEnding();
    expect(WorldSimulationScenarioSchema.safeParse(oneEnding).success).toBe(true);

    const sixEndings = portableFixture();
    for (const [id, kind] of [
      ["ending.first_alternative", "first_alternative"],
      ["ending.second_alternative", "second_alternative"],
    ] as const) {
      sixEndings.endingRules.push({
        id,
        kind,
        priority: 10,
        summary: "A source-grounded alternative closes the short rehearsal without bypassing its declared causal conditions.",
        provenance: {
          basis: "source_derived",
          premiseIds: ["premise.scar_recognition"],
          reviewState: "source_grounded",
          canonStatus: "source_canon",
          creatorApprovalReceiptId: null,
          creatorDecisionId: null,
        },
        conditions: [{ kind: "turn_at_least", turn: 1 }],
        terminal: true,
      });
    }
    expect(WorldSimulationScenarioSchema.safeParse(sixEndings).success).toBe(true);

    const sevenEndings = structuredClone(sixEndings);
    sevenEndings.endingRules.push({
      ...sevenEndings.endingRules[4]!,
      id: "ending.third_alternative",
      kind: "third_alternative",
    });
    expect(WorldSimulationScenarioSchema.safeParse(sevenEndings).success).toBe(false);

    const invalidTimeout = keepOnlyTimeoutEnding();
    invalidTimeout.endingRules[0]!.conditions = [{ kind: "turn_at_least", turn: 5 }];
    expect(WorldSimulationScenarioSchema.safeParse(invalidTimeout).success).toBe(false);
  });
});

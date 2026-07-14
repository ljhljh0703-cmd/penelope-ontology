import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldPackSchema } from "@/src/domain/schemas";

const readWorldPack = () =>
  JSON.parse(
    readFileSync(resolve("data/world-packs/trojan-returns/world.json"), "utf8"),
  ) as unknown;

describe("WorldPackSchema", () => {
  it("accepts the public-safe demo pack", () => {
    const result = WorldPackSchema.safeParse(readWorldPack());
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it("uses one stable creator layer and keeps canon versions out of fixed states", () => {
    const pack = WorldPackSchema.parse(readWorldPack());
    expect(pack.layers.some(({ id }) => id === "creator_canon")).toBe(true);
    expect(pack.layers.some(({ id }) => id === "creator_canon.v0")).toBe(false);
    expect(pack.states.every((state) => !("canonVersion" in state))).toBe(true);
    expect(pack.styleProfiles[0].constraints.length).toBeGreaterThan(0);
    expect(pack.simulationScenarios.find(({ id }) => id === "scenario.harbor_watch")?.maxSteps).toBe(2);
  });

  it("rejects dangling claim entity references", () => {
    const fixture = readWorldPack() as Record<string, unknown>;
    const claims = fixture.claims as Array<Record<string, unknown>>;
    claims[0] = { ...claims[0], subjectId: "not_in_pack" };

    const result = WorldPackSchema.safeParse(fixture);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some(({ message }) => message.includes("unknown subject"))).toBe(true);
  });

  it.each([
    ["event source", (fixture: Record<string, unknown>) => {
      const events = fixture.events as Array<Record<string, unknown>>;
      events[0] = { ...events[0], sourceIds: ["source.missing"] };
    }, "unknown source"],
    ["rule layer", (fixture: Record<string, unknown>) => {
      const rules = fixture.rules as Array<Record<string, unknown>>;
      rules.push({
        id: "rule.test",
        kind: "world",
        description: "Invalid test rule.",
        layerId: "layer.missing",
        status: "active",
      });
    }, "unknown layer"],
    ["spatial scope", (fixture: Record<string, unknown>) => {
      const claims = fixture.claims as Array<Record<string, unknown>>;
      claims[0] = { ...claims[0], spatialScope: "place.missing" };
    }, "unknown spatial scope"],
    ["conflict resolution", (fixture: Record<string, unknown>) => {
      const profiles = fixture.canonProfiles as Array<Record<string, unknown>>;
      profiles[1] = {
        ...profiles[1],
        conflictResolutions: { "conflict.helen_wartime_location": "claim.missing" },
      };
    }, "selects invalid claim"],
    ["duplicate replay ID", (fixture: Record<string, unknown>) => {
      const replayCaseIds = fixture.replayCaseIds as string[];
      replayCaseIds.push(replayCaseIds[0]);
    }, "Duplicate replay case id"],
  ])("rejects invalid %s references", (_label, mutate, expectedMessage) => {
    const fixture = readWorldPack() as Record<string, unknown>;
    mutate(fixture);
    const result = WorldPackSchema.safeParse(fixture);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some(({ message }) => message.includes(expectedMessage))).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FixtureRegistrySchema } from "@/src/contracts/fixture-registry";
import { ReplayCaseSetSchema } from "@/src/contracts/replay";
import {
  validateReplayCaseReferences,
  type ReplayFixtureIndex,
} from "@/src/domain/replay-cases";
import { WorldPackSchema } from "@/src/domain/schemas";

const dataRoot = "data/world-packs/trojan-returns";
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(dataRoot, path), "utf8")) as unknown;

const load = () => {
  const pack = WorldPackSchema.parse(readJson("world.json"));
  const cases = ReplayCaseSetSchema.parse(readJson("replay-cases.json"));
  const registry = FixtureRegistrySchema.parse(readJson("fixture-registry.json"));
  const index: ReplayFixtureIndex = {
    draftFixtureIds: new Set(registry.drafts.map(({ id }) => id)),
    overlayFixtureIds: new Set(registry.overlays.map(({ id }) => id)),
    snapshotFixtureIds: new Set(registry.snapshots.map(({ id }) => id)),
  };
  return { pack, cases, registry, index };
};

describe("replay case contract", () => {
  it("matches every structured replay reference to the World Pack and registry", () => {
    const { pack, cases, index } = load();
    expect(validateReplayCaseReferences(pack, cases, index)).toEqual([]);
  });

  it("locks the proposal, decision/rebase, Step 1, Step 2 sequence", () => {
    const { cases } = load();
    const redSail = cases.find(({ id }) => id === "replay.red_sail_proposal");
    expect(redSail?.stages.map(({ kind }) => kind)).toEqual([
      "run",
      "decision",
      "transition",
      "transition",
    ]);
    const transitions = redSail?.stages.filter((stage) => stage.kind === "transition") ?? [];
    expect(transitions[0]?.expected.toStateHash).toBe(transitions[1]?.expected.fromStateHash);
    expect(transitions[1]?.expected.turnIndex).toBe(2);
  });

  it("rejects duplicate case IDs and a decision before its proposal", () => {
    const { cases } = load();
    expect(ReplayCaseSetSchema.safeParse([...cases, cases[0]]).success).toBe(false);

    const mutated = structuredClone(cases);
    const redSail = mutated.find(({ id }) => id === "replay.red_sail_proposal");
    if (!redSail) throw new Error("missing red sail case");
    const decision = redSail.stages[1];
    redSail.stages = [decision, ...redSail.stages.filter((_, index) => index !== 1)];
    expect(ReplayCaseSetSchema.safeParse(mutated).success).toBe(false);
  });

  it("reports dangling structured fixture references", () => {
    const { pack, cases, index } = load();
    const mutated = structuredClone(cases);
    const firstStage = mutated[0].stages[0];
    if (firstStage.kind !== "run") throw new Error("first replay stage must be a run");
    firstStage.draftFixtureId = "draft.missing";
    expect(validateReplayCaseReferences(pack, mutated, index)).toContain(
      "Replay replay.grounded_penelope references unknown draft fixture draft.missing",
    );
  });
});

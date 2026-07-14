import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ReplayCaseSetSchema,
  validateReplayCaseReferences,
} from "@/src/domain/replay-cases";
import { WorldPackSchema } from "@/src/domain/schemas";

const readJson = (path: string) => JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;

describe("replay case contract", () => {
  it("matches every replay fixture to the World Pack declaration", () => {
    const pack = WorldPackSchema.parse(
      readJson("data/world-packs/trojan-returns/world.json"),
    );
    const cases = ReplayCaseSetSchema.parse(
      readJson("data/world-packs/trojan-returns/replay-cases.json"),
    );

    expect(validateReplayCaseReferences(pack, cases)).toEqual([]);
  });

  it("rejects duplicate fixture IDs", () => {
    const input = readJson(
      "data/world-packs/trojan-returns/replay-cases.json",
    ) as Array<Record<string, unknown>>;
    input.push({ ...input[0] });
    expect(ReplayCaseSetSchema.safeParse(input).success).toBe(false);
  });

  it("reports undeclared and dangling fixture references", () => {
    const pack = WorldPackSchema.parse(
      readJson("data/world-packs/trojan-returns/world.json"),
    );
    const cases = ReplayCaseSetSchema.parse(
      readJson("data/world-packs/trojan-returns/replay-cases.json"),
    );
    const mutated = [
      ...cases.slice(1),
      { ...cases[0], id: "replay.extra", stateId: "state.missing" },
    ];

    expect(validateReplayCaseReferences(pack, mutated)).toEqual([
      "Replay fixture replay.extra is not declared by the World Pack",
      "Replay replay.extra has unknown state state.missing",
      "World Pack declares missing replay fixture replay.grounded_penelope",
    ]);
  });
});

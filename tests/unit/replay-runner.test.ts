import { describe, expect, it } from "vitest";
import { loadDemoBundle } from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { runFrozenReplay } from "@/src/application/replay-runner";

describe("frozen replay", () => {
  it("reproduces every declared run, decision, rebase, and transition", async () => {
    const { worldPack, replayCases } = await loadDemoBundle();
    const results = await runFrozenReplay({
      worldPack,
      replayCases,
      fixtureModel: fixtureNarrativeModel,
    });

    expect(results).toHaveLength(worldPack.replayCaseIds.length);
    expect(results.every(({ passed }) => passed)).toBe(true);
    expect(results.flatMap(({ stages }) => stages)).toHaveLength(8);
    expect(
      results
        .find(({ id }) => id === "replay.red_sail_proposal")
        ?.stages.map(({ kind }) => kind),
    ).toEqual(["run", "decision", "transition", "transition"]);
  });
});

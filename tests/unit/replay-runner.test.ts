import { describe, expect, it } from "vitest";
import { loadDemoBundle, loadOverlayFixture } from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import {
  runApprovedOverlayReplay,
  runFrozenReplay,
} from "@/src/application/replay-runner";
import { buildCanonOverlay, overlayPayload } from "@/src/domain/canon-overlay";

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

  it("reruns run-only safety controls against the exact approved or edited overlay", async () => {
    const [{ worldPack, replayCases }, approved] = await Promise.all([
      loadDemoBundle(),
      loadOverlayFixture("overlay.v1.red-sail"),
    ]);
    const edited = buildCanonOverlay({
      ...overlayPayload(approved),
      rules: approved.rules.map((rule) =>
        rule.id === "rule.creator.red_sail_signal"
          ? {
              ...rule,
              displayDescription: "An edited red sail asks the harbor watch to observe.",
            }
          : rule,
      ),
    });

    for (const overlay of [approved, edited]) {
      const result = await runApprovedOverlayReplay({
        worldPack,
        replayCases,
        fixtureModel: fixtureNarrativeModel,
        overlay,
      });
      expect(result.overlayHash).toBe(overlay.hash);
      expect(result.overlayVersion).toBe(1);
      expect(result.cases).toHaveLength(4);
      expect(result.passed).toBe(true);
      expect(result.cases.every(({ passed }) => passed)).toBe(true);
      expect(result.cases.some(({ id }) => id === "replay.red_sail_proposal")).toBe(false);
    }
    expect(edited.hash).not.toBe(approved.hash);
    const approvedRule = approved.rules.find(({ id }) => id === "rule.creator.red_sail_signal");
    const editedRule = edited.rules.find(({ id }) => id === "rule.creator.red_sail_signal");
    expect(editedRule?.description).toBe(approvedRule?.description);
    expect(editedRule?.displayDescription).toBe(
      "An edited red sail asks the harbor watch to observe.",
    );
  });
});

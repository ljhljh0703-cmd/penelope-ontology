import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import {
  StoryScenarioSchema,
  type StoryScenario,
} from "@/src/contracts/story";

export const RED_SAIL_STORY_SCENARIO_PATH = path.join(
  process.cwd(),
  "data",
  "story-slices",
  "ithaca-red-sail-v1",
  "story-scenario.json",
);

export const loadRedSailStoryScenario = async (): Promise<StoryScenario> =>
  StoryScenarioSchema.parse(
    JSON.parse(await readFile(RED_SAIL_STORY_SCENARIO_PATH, "utf8")) as unknown,
  );

export const loadRedSailStoryBundle = async () => {
  const [scenario, worldPack, overlay, snapshot] = await Promise.all([
    loadRedSailStoryScenario(),
    loadDemoWorldPack(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
  ]);

  if (
    scenario.worldPackId !== worldPack.meta.id ||
    scenario.worldPackVersion !== worldPack.meta.version ||
    scenario.baseCanonHash !== overlay.hash ||
    scenario.baseStateHash !== snapshot.stateHash
  ) {
    throw new Error("The story scenario is not bound to the loaded demo authority.");
  }

  return { scenario, worldPack, overlay, snapshot };
};

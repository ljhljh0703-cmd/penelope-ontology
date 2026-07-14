import { readFile } from "node:fs/promises";
import path from "node:path";
import { CanonOverlaySchema, type CanonOverlay } from "@/src/contracts/canon-overlay";
import {
  FixtureRegistrySchema,
  type FixtureRegistry,
} from "@/src/contracts/fixture-registry";
import { ModelDraftSchema, type ModelDraft } from "@/src/contracts/model-draft";
import { ReplayCaseSetSchema, type ReplayCase } from "@/src/contracts/replay";
import {
  SimulationSnapshotSchema,
  type SimulationSnapshot,
} from "@/src/contracts/simulation";
import { WorldPackSchema, type WorldPack } from "@/src/domain/schemas";

export const DEMO_PACK_DIRECTORY = path.join(
  process.cwd(),
  "data",
  "world-packs",
  "trojan-returns",
);

const readJson = async (filePath: string): Promise<unknown> => {
  const source = await readFile(filePath, "utf8");
  return JSON.parse(source) as unknown;
};

const registryPathFor = (
  registry: FixtureRegistry,
  collection: keyof FixtureRegistry,
  id: string,
): string => {
  const reference = registry[collection].find((candidate) => candidate.id === id);
  if (!reference) throw new Error(`Unknown ${collection} fixture: ${id}`);

  const resolved = path.resolve(DEMO_PACK_DIRECTORY, reference.path);
  const root = `${path.resolve(DEMO_PACK_DIRECTORY)}${path.sep}`;
  if (!resolved.startsWith(root)) {
    throw new Error(`Fixture path escapes the demo pack: ${reference.path}`);
  }
  return resolved;
};

export const loadFixtureRegistry = async (): Promise<FixtureRegistry> =>
  FixtureRegistrySchema.parse(
    await readJson(path.join(DEMO_PACK_DIRECTORY, "fixture-registry.json")),
  );

export const loadDemoWorldPack = async (): Promise<WorldPack> =>
  WorldPackSchema.parse(await readJson(path.join(DEMO_PACK_DIRECTORY, "world.json")));

export const loadDraftFixture = async (id: string): Promise<ModelDraft> => {
  const registry = await loadFixtureRegistry();
  return ModelDraftSchema.parse(await readJson(registryPathFor(registry, "drafts", id)));
};

export const loadOverlayFixture = async (id: string): Promise<CanonOverlay> => {
  const registry = await loadFixtureRegistry();
  return CanonOverlaySchema.parse(await readJson(registryPathFor(registry, "overlays", id)));
};

export const loadSnapshotFixture = async (id: string): Promise<SimulationSnapshot> => {
  const registry = await loadFixtureRegistry();
  return SimulationSnapshotSchema.parse(
    await readJson(registryPathFor(registry, "snapshots", id)),
  );
};

export const loadReplayCases = async (): Promise<ReplayCase[]> =>
  ReplayCaseSetSchema.parse(
    await readJson(path.join(DEMO_PACK_DIRECTORY, "replay-cases.json")),
  );

export const loadDemoBundle = async () => {
  const [worldPack, registry, replayCases] = await Promise.all([
    loadDemoWorldPack(),
    loadFixtureRegistry(),
    loadReplayCases(),
  ]);
  return { worldPack, registry, replayCases };
};

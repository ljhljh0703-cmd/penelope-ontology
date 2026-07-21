import {
  PenelopeWorldPackV1Schema,
  WorldPackSessionBindingSchema,
  doesSessionBindingMatchWorldPack,
  type PenelopeWorldPackV1,
  type WorldPackSessionBinding,
} from "@/src/contracts/penelope-world-pack";
import { getOdysseyBook19WorldPack } from "@/src/adapters/world-packs/odyssey-book19";
import { getOzDiscoveryWorldPack } from "@/src/adapters/world-packs/oz-discovery";

/**
 * The only world packs that a public session may resolve.  A registered getter
 * must return a sealed pack; its data is never mutated or merged at runtime.
 */
type RegisteredWorldPack = {
  getPack: () => PenelopeWorldPackV1;
};

export type WorldPackRegistrySummary = Readonly<{
  packId: string;
  packVersion: string;
  availability: "registered";
  publicTitle: string;
  publicSubtitle: string;
  hook: string;
  demoOrder: number;
}>;

const registeredWorldPacks: readonly RegisteredWorldPack[] = [
  { getPack: getOdysseyBook19WorldPack },
  { getPack: getOzDiscoveryWorldPack },
] as const;

const detachedSealedPack = (packInput: unknown): PenelopeWorldPackV1 =>
  structuredClone(PenelopeWorldPackV1Schema.parse(packInput));

const sealedRegistryEntries = registeredWorldPacks.map(({ getPack }) => {
  const pack = detachedSealedPack(getPack());
  return {
    packId: pack.packId,
    scenarioId: pack.scenario.id,
    demoOrder: pack.presentation.demoOrder,
    getPack,
  } as const;
});

const assertUniqueRegistryValues = <Value extends string | number>(
  values: readonly Value[],
  label: string,
): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`World pack registry has duplicate ${label} values.`);
  }
};

assertUniqueRegistryValues(
  sealedRegistryEntries.map(({ packId }) => packId),
  "packId",
);
assertUniqueRegistryValues(
  sealedRegistryEntries.map(({ scenarioId }) => scenarioId),
  "scenario id",
);
assertUniqueRegistryValues(
  sealedRegistryEntries.map(({ demoOrder }) => demoOrder),
  "demo order",
);

const entryForPackId = (packId: string) =>
  sealedRegistryEntries.find((entry) => entry.packId === packId) ?? null;

export const hasRegisteredWorldPackId = (packId: string): boolean =>
  entryForPackId(packId) !== null;

const entryForScenarioId = (scenarioId: string) =>
  sealedRegistryEntries.find((entry) => entry.scenarioId === scenarioId) ?? null;

const resolveEntryPack = (entry: (typeof sealedRegistryEntries)[number]): PenelopeWorldPackV1 =>
  detachedSealedPack(entry.getPack());

/**
 * A deliberately small public index.  It excludes sources, rules, hidden
 * knowledge, and render text, so a selector cannot accidentally receive the
 * internal pack definition.
 */
export const listWorldPacks = (): readonly WorldPackRegistrySummary[] =>
  sealedRegistryEntries
    .map(({ getPack }) => {
      const pack = detachedSealedPack(getPack());
      return {
        packId: pack.packId,
        packVersion: pack.packVersion,
        availability: "registered" as const,
        publicTitle: pack.presentation.publicTitle,
        publicSubtitle: pack.presentation.publicSubtitle,
        hook: pack.presentation.hook,
        demoOrder: pack.presentation.demoOrder,
      } as const;
    })
    .sort((left, right) => left.demoOrder - right.demoOrder)
    .map((summary) => structuredClone(summary));

export const getDefaultWorldPack = (): PenelopeWorldPackV1 => {
  const entry = [...sealedRegistryEntries].sort(
    (left, right) => left.demoOrder - right.demoOrder,
  )[0];
  if (!entry) throw new Error("World pack registry has no default pack.");
  return resolveEntryPack(entry);
};

export const getWorldPackById = (packId: string): PenelopeWorldPackV1 => {
  const entry = entryForPackId(packId);
  if (!entry) throw new Error(`Unknown world pack: ${packId}`);
  return resolveEntryPack(entry);
};

export const getWorldPackByScenarioId = (
  scenarioId: string,
): PenelopeWorldPackV1 => {
  const entry = entryForScenarioId(scenarioId);
  if (!entry) throw new Error(`Unknown world scenario: ${scenarioId}`);
  return resolveEntryPack(entry);
};

/** Exact identity check for presentation only; it never supplies runtime rules. */
export const isRegisteredWorldPack = (pack: PenelopeWorldPackV1): boolean => {
  const entry = entryForPackId(pack.packId);
  if (!entry) return false;
  const registered = resolveEntryPack(entry);
  return (
    registered.packVersion === pack.packVersion &&
    registered.definitionDigest === pack.definitionDigest
  );
};

/**
 * Every stored session carries all three immutable pack fields. Missing or
 * cross-pack bindings fail closed before runtime rules can be used.
 */
export const assertWorldPackSessionBinding = (
  pack: PenelopeWorldPackV1,
  binding: WorldPackSessionBinding,
): PenelopeWorldPackV1 => {
  const resolvedPack = detachedSealedPack(pack);
  const parsedBinding = WorldPackSessionBindingSchema.parse(binding);

  if (!doesSessionBindingMatchWorldPack(parsedBinding, resolvedPack)) {
    throw new Error(
      "World pack session binding does not match the resolved sealed pack.",
    );
  }
  return resolvedPack;
};

import { describe, expect, it } from "vitest";
import { bindSessionToWorldPack } from "@/src/contracts/penelope-world-pack";
import {
  assertWorldPackSessionBinding,
  getDefaultWorldPack,
  getWorldPackById,
  getWorldPackByScenarioId,
  listWorldPacks,
} from "@/src/adapters/world-packs/registry";

describe("world pack registry", () => {
  it("exposes an ordered public-safe index for both registered packs", () => {
    expect(listWorldPacks()).toEqual([
      {
        packId: "pack.odyssey_book_19.night_of_the_scar",
        packVersion: "1.0.0",
        availability: "registered",
        publicTitle: "The Night of the Scar",
        publicSubtitle: "A bounded Odyssey simulation · Book 19",
        hook: "The myth, then the IF",
        demoOrder: 1,
      },
      {
        packId: "pack.oz.discovery_of_the_wizard",
        packVersion: "1.0.0",
        availability: "registered",
        publicTitle: "Behind the Green Screen",
        publicSubtitle: "A two-turn Oz rehearsal",
        hook:
          "Four travelers have seen four different rulers. One small disruption can decide whether the illusion survives.",
        demoOrder: 2,
      },
    ]);
  });

  it("returns detached sealed packs by default, pack id, and scenario id", () => {
    const defaultPack = getDefaultWorldPack();
    const odyssey = getWorldPackById(defaultPack.packId);
    const oz = getWorldPackByScenarioId("scenario.oz.chapter_15.discovery");

    expect(defaultPack.packId).toBe("pack.odyssey_book_19.night_of_the_scar");
    expect(odyssey).toEqual(defaultPack);
    expect(oz.packId).toBe("pack.oz.discovery_of_the_wizard");

    defaultPack.presentation.publicTitle = "Mutated local copy";
    expect(getDefaultWorldPack().presentation.publicTitle).toBe("The Night of the Scar");
  });

  it("rejects unknown pack and scenario identifiers", () => {
    expect(() => getWorldPackById("pack.unknown")).toThrow("Unknown world pack");
    expect(() => getWorldPackByScenarioId("scenario.unknown")).toThrow(
      "Unknown world scenario",
    );
  });

  it("requires an exact binding and rejects every cross-pack binding", () => {
    const odyssey = getWorldPackById("pack.odyssey_book_19.night_of_the_scar");
    const oz = getWorldPackById("pack.oz.discovery_of_the_wizard");

    expect(() => assertWorldPackSessionBinding(oz, bindSessionToWorldPack(odyssey))).toThrow(
      "World pack session binding does not match",
    );
    expect(assertWorldPackSessionBinding(oz, bindSessionToWorldPack(oz))).toEqual(oz);
  });
});

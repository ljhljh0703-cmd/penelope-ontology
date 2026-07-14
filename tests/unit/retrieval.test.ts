import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";
import { canonicalJson } from "@/src/domain/canonical-json";
import { retrieveEvidence } from "@/src/domain/retrieval";
import { WorldPackSchema } from "@/src/domain/schemas";

const read = (path: string) => JSON.parse(readFileSync(resolve(path), "utf8"));
const pack = WorldPackSchema.parse(read("data/world-packs/trojan-returns/world.json"));
const overlay = CanonOverlaySchema.parse(
  read("data/world-packs/trojan-returns/overlays/overlay.v0.json"),
);
const snapshot = SimulationSnapshotSchema.parse(
  read("data/world-packs/trojan-returns/snapshots/s0.json"),
);
const participantIntents = [
  {
    intentId: "intent.penelope",
    participantId: "participant.a",
    controlledEntityIds: ["penelope"],
    intent: "Ask about Odysseus without claiming his exact location.",
  },
  {
    intentId: "intent.telemachus",
    participantId: "participant.b",
    controlledEntityIds: ["telemachus"],
    intent: "Organize the harbor watch.",
  },
];

describe("deterministic character-scoped retrieval", () => {
  it("never exposes the Ogygia exact-location claim to Penelope", () => {
    const evidence = retrieveEvidence({
      pack,
      overlay,
      snapshot,
      participantIntents,
      brief: "Prepare a restrained Ithacan exchange.",
    });
    const penelope = evidence.characterViews.find(
      ({ characterId }) => characterId === "penelope",
    );
    expect(penelope?.knownClaimIds).not.toContain("claim.odyssey.odysseus_at_ogygia");
    expect(penelope?.uncertainClaimIds).not.toContain("claim.odyssey.odysseus_at_ogygia");
    expect(penelope?.context).not.toContain("Ogygia");
  });

  it("is byte-stable across repeated runs", () => {
    const inputs = {
      pack,
      overlay,
      snapshot,
      participantIntents,
      brief: "Prepare a restrained Ithacan exchange.",
    };
    const first = canonicalJson(retrieveEvidence(inputs));
    for (let index = 0; index < 100; index += 1) {
      expect(canonicalJson(retrieveEvidence(inputs))).toBe(first);
    }
  });
});

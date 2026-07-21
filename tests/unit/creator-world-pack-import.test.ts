import { beforeEach, describe, expect, it } from "vitest";
import { getOdysseyBook19WorldPack } from "@/src/adapters/world-packs/odyssey-book19";
import {
  loadWorldSessionCheckpoint,
  resetWorldSessionStoreForTests,
  resolveWorldPackForCheckpoint,
  saveWorldSessionCheckpoint,
} from "@/src/application/world-session-store";
import {
  MAX_WORLD_SESSION_REQUEST_BYTES,
  StartWorldSessionApiRequestSchema,
} from "@/src/contracts/world-api";
import {
  bindSessionToWorldPack,
  sealPenelopeWorldPack,
  type PenelopeWorldPackDefinition,
} from "@/src/contracts/penelope-world-pack";
import { createWorldSimulationSession } from "@/src/domain/world-runtime";

const CREATOR_TOKEN = "creator-pack-import-test-token";
const CREATED_AT_MS = 1_000_000;

const definitionFrom = (
  pack: ReturnType<typeof getOdysseyBook19WorldPack>,
): PenelopeWorldPackDefinition => {
  const { definitionDigest, ...definition } = pack;
  void definitionDigest;
  return definition;
};

describe("creator world-pack imports", () => {
  beforeEach(() => resetWorldSessionStoreForTests());

  it("accepts one registered or session-private definition authority, never both", () => {
    const pack = getOdysseyBook19WorldPack();

    expect(MAX_WORLD_SESSION_REQUEST_BYTES).toBe(262_144);
    expect(
      StartWorldSessionApiRequestSchema.parse({
        transport: "fixture",
        creatorPackDefinition: definitionFrom(pack),
      }).creatorPackDefinition?.packId,
    ).toBe(pack.packId);
    expect(
      StartWorldSessionApiRequestSchema.safeParse({
        transport: "fixture",
        packId: pack.packId,
        creatorPackDefinition: definitionFrom(pack),
      }).success,
    ).toBe(false);
  });

  it("keeps a sealed creator pack server-side while returning only its binding", () => {
    const pack = getOdysseyBook19WorldPack();
    const session = createWorldSimulationSession({ scenario: pack.scenario });

    expect(() =>
      saveWorldSessionCheckpoint({
        session,
        transport: "fixture",
        parentCheckpointId: null,
        previousVisibleSceneSummary: null,
        creatorAccessToken: CREATOR_TOKEN,
        worldPackBinding: bindSessionToWorldPack(pack),
        nowMs: CREATED_AT_MS,
        idFactory: () => "11111111-1111-4111-8111-111111111111",
      }),
    ).toThrow(/sealed world pack and its immutable binding/u);

    const checkpoint = saveWorldSessionCheckpoint({
      session,
      transport: "fixture",
      parentCheckpointId: null,
      previousVisibleSceneSummary: null,
      creatorAccessToken: CREATOR_TOKEN,
      worldPackBinding: bindSessionToWorldPack(pack),
      resolvedWorldPack: pack,
      nowMs: CREATED_AT_MS,
      idFactory: () => "22222222-2222-4222-8222-222222222222",
    });
    const publicCheckpoint = loadWorldSessionCheckpoint(
      checkpoint.sessionId,
      CREATED_AT_MS + 1,
    );

    expect(publicCheckpoint?.worldPackBinding).toEqual(bindSessionToWorldPack(pack));
    expect(JSON.stringify(publicCheckpoint)).not.toContain("renderPolicy");
    expect(JSON.stringify(publicCheckpoint)).not.toContain("creatorInput");

    const resolved = resolveWorldPackForCheckpoint(
      checkpoint.sessionId,
      CREATED_AT_MS + 1,
    );
    expect(resolved?.definitionDigest).toBe(pack.definitionDigest);
    if (!resolved) throw new Error("Expected a sealed pack.");
    resolved.presentation.publicTitle = "tampered detached copy";
    expect(
      resolveWorldPackForCheckpoint(checkpoint, CREATED_AT_MS + 1)?.presentation
        .publicTitle,
    ).toBe(pack.presentation.publicTitle);
  });

  it("inherits the root pack for child checkpoints and fails closed on a switch", () => {
    const pack = getOdysseyBook19WorldPack();
    const sameScenarioDifferentPackDefinition = definitionFrom(pack);
    sameScenarioDifferentPackDefinition.packId = "pack.creator.same_scenario_test";
    sameScenarioDifferentPackDefinition.presentation = {
      ...sameScenarioDifferentPackDefinition.presentation,
      publicTitle: "Same Scenario, Separate Authority",
      demoOrder: 3,
    };
    const otherPack = sealPenelopeWorldPack(sameScenarioDifferentPackDefinition);
    expect(otherPack.scenario.id).toBe(pack.scenario.id);
    expect(otherPack.definitionDigest).not.toBe(pack.definitionDigest);
    const session = createWorldSimulationSession({ scenario: pack.scenario });
    const root = saveWorldSessionCheckpoint({
      session,
      transport: "fixture",
      parentCheckpointId: null,
      previousVisibleSceneSummary: null,
      creatorAccessToken: CREATOR_TOKEN,
      worldPackBinding: bindSessionToWorldPack(pack),
      resolvedWorldPack: pack,
      nowMs: CREATED_AT_MS,
      idFactory: () => "33333333-3333-4333-8333-333333333333",
    });

    const child = saveWorldSessionCheckpoint({
      session,
      transport: "fixture",
      parentCheckpointId: root.sessionId,
      previousVisibleSceneSummary: null,
      nowMs: CREATED_AT_MS + 1,
      idFactory: () => "44444444-4444-4444-8444-444444444444",
    });
    expect(child.worldPackBinding).toEqual(bindSessionToWorldPack(pack));
    expect(
      resolveWorldPackForCheckpoint(child, CREATED_AT_MS + 1)?.packId,
    ).toBe(pack.packId);

    expect(() =>
      saveWorldSessionCheckpoint({
        session,
        transport: "fixture",
        parentCheckpointId: root.sessionId,
        previousVisibleSceneSummary: null,
        worldPackBinding: bindSessionToWorldPack(otherPack),
        resolvedWorldPack: otherPack,
        nowMs: CREATED_AT_MS + 2,
        idFactory: () => "55555555-5555-4555-8555-555555555555",
      }),
    ).toThrow(/cannot switch/u);
  });
});

import { describe, expect, it } from "vitest";
import { getOdysseyBook19WorldPack } from "@/src/adapters/world-packs/odyssey-book19";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import { buildWorldCreatorReceipt } from "@/src/application/world-simulation-service";
import {
  createWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";
import { buildWorldCodexProjection } from "@/components/world/world-codex";
import type { WorldSessionView } from "@/components/world/api-types";
import { sealPenelopeWorldPack } from "@/src/contracts/penelope-world-pack";
import { compileWorldForgeDraft } from "@/src/application/world-forge-service";
import { WorldForgeDraftSchema } from "@/src/contracts/world-forge";
import worldForgeFixture from "@/tests/fixtures/world-forge-approved.json";

const scenario = getOdysseyBook19WorldSimulation();
const worldPack = getOdysseyBook19WorldPack();

const view = (
  sessionId: string,
  turn: number,
  parentCheckpointId: string | null,
): WorldSessionView =>
  ({
    sessionId,
    parentCheckpointId,
    title: "The Night of the Scar",
    turn,
    maxTurns: scenario.maxTurns,
    status: "active",
    ending: null,
    cursor: {
      branchId: turn === 0 ? "branch.canon" : "branch.if_washing",
      parentBranchId: turn === 0 ? null : "branch.canon",
    },
    focalActor: {
      entityId: scenario.focalParticipantEntityId,
      label: "Penelope",
    },
  }) as WorldSessionView;

describe("World Codex projection", () => {
  it("builds a creator-readable state view only from the pack and receipts", () => {
    const openingSession = createWorldSimulationSession({ scenario });
    const openingReceipt = buildWorldCreatorReceipt({
      scenario,
      worldPack,
      session: openingSession,
      receipt: null,
    });
    const resolved = runWorldSimulationTurn({
      scenario,
      session: openingSession,
      input: "order washing",
    });
    const nextReceipt = buildWorldCreatorReceipt({
      scenario,
      worldPack,
      session: resolved.session,
      receipt: resolved.receipt,
    });
    const openingView = view("11111111-1111-4111-8111-111111111111", 0, null);
    const nextView = view(
      "22222222-2222-4222-8222-222222222222",
      1,
      openingView.sessionId,
    );
    const projection = buildWorldCodexProjection({
      active: { sequence: 2, view: nextView, creatorReceipt: nextReceipt },
      parent: { sequence: 1, view: openingView, creatorReceipt: openingReceipt },
      checkpoints: [
        { sequence: 1, view: openingView, creatorReceipt: openingReceipt },
        { sequence: 2, view: nextView, creatorReceipt: nextReceipt },
      ],
    });

    expect(projection.overview.dramaticQuestion).toContain("Penelope");
    expect(projection.cast.find(({ entityId }) => entityId === "entity.eurycleia")).toMatchObject({
      desire: expect.any(String),
      changes: expect.arrayContaining([expect.stringContaining("learned")]),
    });
    expect(projection.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subjectName: "Penelope",
          objectName: "Disguised Odysseus",
          label: "married to",
        }),
      ]),
    );
    expect(projection.plot.currentEvents).toEqual(
      expect.arrayContaining([expect.stringContaining("scar")]),
    );
    expect(projection.branches).toHaveLength(2);
  });

  it("returns an honest empty relationship state for a pack without declared edges", () => {
    const session = createWorldSimulationSession({ scenario });
    const { definitionDigest: _digest, worldCodex: _worldCodex, ...definition } = worldPack;
    void _digest;
    void _worldCodex;
    const packWithoutCodex = sealPenelopeWorldPack(definition);
    const creatorReceipt = buildWorldCreatorReceipt({
      scenario,
      worldPack: packWithoutCodex,
      session,
      receipt: null,
    });
    const activeView = view("33333333-3333-4333-8333-333333333333", 0, null);
    const projection = buildWorldCodexProjection({
      active: { sequence: 1, view: activeView, creatorReceipt },
      parent: null,
      checkpoints: [{ sequence: 1, view: activeView, creatorReceipt }],
    });

    expect(projection.relationships).toEqual([]);
  });

  it("projects a five-scene spine, cumulative beats, relationship history, and parent-child depth", () => {
    const compiled = compileWorldForgeDraft({
      draft: WorldForgeDraftSchema.parse(worldForgeFixture),
    });
    const pack = sealPenelopeWorldPack(compiled.definition);
    const episodeScenario = pack.scenario;
    const openingSession = createWorldSimulationSession({
      scenario: episodeScenario,
    });
    const first = runWorldSimulationTurn({
      scenario: episodeScenario,
      session: openingSession,
      input: worldForgeFixture.recommendedAction.value,
    });
    const second = runWorldSimulationTurn({
      scenario: episodeScenario,
      session: first.session,
      input: worldForgeFixture.recommendedAction.value,
    });
    const sessions = [openingSession, first.session, second.session];
    const receipts = [
      buildWorldCreatorReceipt({
        scenario: episodeScenario,
        worldPack: pack,
        session: openingSession,
        receipt: null,
      }),
      buildWorldCreatorReceipt({
        scenario: episodeScenario,
        worldPack: pack,
        session: first.session,
        receipt: first.receipt,
      }),
      buildWorldCreatorReceipt({
        scenario: episodeScenario,
        worldPack: pack,
        session: second.session,
        receipt: second.receipt,
      }),
    ];
    const ids = [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ];
    const episodeCheckpoints = sessions.map((session, index) => ({
      sequence: index + 1,
      view: {
        ...view(ids[index]!, index, index === 0 ? null : ids[index - 1]!),
        title: episodeScenario.title,
        maxTurns: 5,
        cursor: {
          branchId: session.cursor.branchId,
          parentBranchId: session.cursor.parentBranchId,
          forkedFromReceiptHash: session.cursor.forkedFromReceiptHash,
        },
      },
      creatorReceipt: receipts[index]!,
    }));
    const projection = buildWorldCodexProjection({
      active: episodeCheckpoints[2]!,
      parent: episodeCheckpoints[1]!,
      checkpoints: episodeCheckpoints,
    });

    expect(projection.overview.currentScene).toMatchObject({
      sequence: 3,
      total: 5,
    });
    expect(projection.plot.episodeSpine).toHaveLength(5);
    expect(projection.plot.realizedBeats).toHaveLength(3);
    expect(projection.relationships[0]).toMatchObject({
      currentLevel: 2,
      currentLabel: "bound",
      changeFromParent: 1,
    });
    expect(projection.relationships[0]?.history).toHaveLength(2);
    expect(projection.branches.map(({ depth }) => depth)).toEqual([0, 1, 2]);
  });
});

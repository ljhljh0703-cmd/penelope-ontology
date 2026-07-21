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
});

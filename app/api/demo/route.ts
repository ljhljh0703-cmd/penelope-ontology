import { NextResponse } from "next/server";
import {
  loadDemoBundle,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { runFrozenReplay } from "@/src/application/replay-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [{ worldPack, replayCases }, overlay, snapshot] = await Promise.all([
      loadDemoBundle(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const replay = await runFrozenReplay({
      worldPack,
      replayCases,
      fixtureModel: fixtureNarrativeModel,
    });

    return NextResponse.json({
      mode: "fixture",
      worldPack: {
        id: worldPack.meta.id,
        version: worldPack.meta.version,
        label: worldPack.meta.title,
      },
      styleProfiles: worldPack.styleProfiles,
      selectedStyleProfileId: worldPack.defaultStyleProfileId,
      overlay,
      snapshot,
      participantSlots: [
        {
          intentId: "intent.penelope",
          participantId: "participant.one",
          controlledEntityId: "penelope",
          characterLabel: "Penelope",
          defaultIntent: "Keep uncertainty distinct from knowledge while preparing the household.",
        },
        {
          intentId: "intent.telemachus",
          participantId: "participant.two",
          controlledEntityId: "telemachus",
          characterLabel: "Telemachus",
          defaultIntent: "Propose a red-sail harbor signal and organize a cautious watch.",
        },
      ],
      replayResults: replay.map((result) => ({
        id: result.id,
        label: result.description,
        status: result.passed ? "pass" : "fail",
        detail: result.stages
          .map(({ stageId, passed }) => `${stageId}:${passed ? "PASS" : "FAIL"}`)
          .join(" · "),
      })),
    });
  } catch {
    return NextResponse.json(
      { error: { code: "demo_bootstrap_failed", message: "Demo data failed validation." } },
      { status: 500 },
    );
  }
}

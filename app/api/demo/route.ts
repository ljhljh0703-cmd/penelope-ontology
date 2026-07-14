import { NextResponse } from "next/server";
import {
  loadDemoBundle,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import { runFrozenReplay } from "@/src/application/replay-runner";
import type { NarrativeModel } from "@/src/ports/narrative-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const disabledLiveModel: NarrativeModel = {
  async generate() {
    return {
      outcome: "configuration_error",
      error: {
        code: "public_demo_live_forbidden",
        message: "The public demo is fixture-only.",
        retryable: false,
      },
      trace: {
        mode: "live",
        outcome: "configuration_error",
        requestedModel: "gpt-5.6",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      },
    };
  },
};

export async function GET() {
  try {
    const [{ worldPack, replayCases }, overlay, snapshot, helenSnapshot] = await Promise.all([
      loadDemoBundle(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
      loadSnapshotFixture("snapshot.helen_s0"),
    ]);
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: disabledLiveModel,
    });
    const redSailReplay = replayCases.find(({ id }) => id === "replay.red_sail_proposal");
    const registeredStage = redSailReplay?.stages.find(
      (stage) => stage.kind === "run" && stage.stageId === "stage.red_sail_proposal",
    );
    if (
      !redSailReplay ||
      registeredStage?.kind !== "run" ||
      registeredStage.draftFixtureId !== "draft.red_sail_proposal" ||
      registeredStage.taskType !== "expand"
    ) {
      throw new Error("The registered red-sail rehearsal is missing or changed shape.");
    }
    const registeredRun = registeredStage;
    const [replay, grounded, conflict] = await Promise.all([
      runFrozenReplay({
        worldPack,
        replayCases,
        fixtureModel: fixtureNarrativeModel,
      }),
      run({
        modelMode: "fixture",
        draftFixtureId: "draft.grounded_penelope",
        overlay,
        snapshot,
        styleProfileId: worldPack.defaultStyleProfileId,
        taskType: "scene",
        brief: "Let Penelope and Eurycleia discuss a rumor without revealing hidden facts.",
        participantIntents: [
          {
            intentId: "intent.penelope",
            participantId: "participant.one",
            controlledEntityIds: ["penelope"],
            intent: "Keep Penelope cautious and focused on what she can prepare.",
          },
          {
            intentId: "intent.eurycleia",
            participantId: "participant.two",
            controlledEntityIds: ["eurycleia"],
            intent: "Offer practical household support without claiming secret knowledge.",
          },
        ],
      }),
      run({
        modelMode: "fixture",
        draftFixtureId: "draft.helen_conflict",
        overlay,
        snapshot: helenSnapshot,
        styleProfileId: worldPack.defaultStyleProfileId,
        taskType: "query",
        brief: "State where the real Helen was during the war without choosing a tradition.",
        participantIntents: [
          {
            intentId: "intent.helen",
            participantId: "participant.one",
            controlledEntityIds: ["helen"],
            intent: "Expose the unresolved split between the active traditions.",
          },
        ],
      }),
    ]);
    if (
      grounded.status !== "passed" ||
      grounded.modelOutcome.outcome !== "completed" ||
      conflict.status !== "needs_creator_decision"
    ) {
      throw new Error("The public proof fixtures do not match their frozen outcomes.");
    }

    const ogygiaClaim = worldPack.claims.find(
      ({ id }) => id === "claim.odyssey.odysseus_at_ogygia",
    );
    const uncertainFateClaim = worldPack.claims.find(
      ({ id }) => id === "claim.odyssey.penelope_uncertain_fate",
    );
    const penelopeView = grounded.evidence.characterViews.find(
      ({ characterId }) => characterId === "penelope",
    );
    const penelopeVisibleClaimIds = new Set([
      ...(penelopeView?.knownClaimIds ?? []),
      ...(penelopeView?.uncertainClaimIds ?? []),
    ]);
    if (
      !ogygiaClaim?.epistemicVisibility.includes("narrator") ||
      penelopeVisibleClaimIds.has("claim.odyssey.odysseus_at_ogygia") ||
      !uncertainFateClaim ||
      !penelopeView?.uncertainClaimIds.includes(uncertainFateClaim.id)
    ) {
      throw new Error("The fixture knowledge-boundary proof no longer matches the World Pack.");
    }

    const participantSlots = registeredRun.participantIntents.map((participantIntent) => {
      const controlledEntityId = participantIntent.controlledEntityIds[0];
      const character = worldPack.entities.find(({ id }) => id === controlledEntityId);
      if (!controlledEntityId || !character) {
        throw new Error("A registered rehearsal participant controls an unknown character.");
      }
      return {
        intentId: participantIntent.intentId,
        participantId: participantIntent.participantId,
        controlledEntityId,
        characterLabel: character.name,
        defaultIntent: participantIntent.intent,
        frozen: true as const,
      };
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
      participantSlots,
      registeredRehearsal: {
        replayCaseId: "replay.red_sail_proposal",
        stageId: registeredRun.stageId,
        draftFixtureId: "draft.red_sail_proposal",
        styleProfileId: registeredRun.styleProfileId,
        taskType: "expand",
        brief: registeredRun.brief,
        participantIntents: registeredRun.participantIntents,
        frozen: true,
      },
      knowledgeBoundary: [
        {
          perspectiveId: "narrator",
          perspectiveLabel: "Narrator",
          factLabel: "Odysseus is on Ogygia",
          status: "visible",
          evidenceId: ogygiaClaim.id,
          basis: "World Pack visibility includes narrator.",
        },
        {
          perspectiveId: "penelope",
          perspectiveLabel: "Penelope",
          factLabel: "Odysseus's exact Ogygia location",
          status: "withheld",
          evidenceId: ogygiaClaim.id,
          basis: "Absent from Penelope's character-scoped agent view.",
        },
        {
          perspectiveId: "penelope",
          perspectiveLabel: "Penelope",
          factLabel: "Odysseus's fate",
          status: "uncertain",
          evidenceId: uncertainFateClaim.id,
          basis: "Registered as uncertain in Penelope's character view.",
        },
      ],
      proofs: {
        grounded: {
          status: grounded.status,
          narrative: grounded.modelOutcome.draft.narrative,
          usedClaimIds: grounded.modelOutcome.draft.usedClaimIds,
          selectedClaimIds: grounded.evidence.claimIds,
          characterViews: grounded.evidence.characterViews.map(
            ({ characterId, knownClaimIds, uncertainClaimIds }) => ({
              characterId,
              knownClaimIds,
              uncertainClaimIds,
            }),
          ),
        },
        conflict: {
          status: conflict.status,
          violationCodes: conflict.hardViolations.map(({ code }) => code),
          evidenceIds: conflict.hardViolations.flatMap(({ evidenceIds }) => evidenceIds),
          graph: conflict.graph,
        },
      },
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

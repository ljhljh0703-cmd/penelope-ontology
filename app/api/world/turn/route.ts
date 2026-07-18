import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createCodexCliWorldNarrator } from "@/src/adapters/codex-cli/world-narrator";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import { fixtureWorldNarrator } from "@/src/adapters/fixtures/world-narrator";
import {
  buildWorldVisibleSceneMemory,
  buildWorldSessionProjections,
  narrateWorldSession,
  WorldNarrationError,
} from "@/src/application/world-simulation-service";
import {
  existingWorldBranchIds,
  releaseWorldSessionTurn,
  reserveWorldSessionTurn,
  saveWorldSessionCheckpoint,
} from "@/src/application/world-session-store";
import {
  STORY_LIVE_TOKEN_HEADER,
  StoryLiveGateError,
  assertStoryTransportAllowed,
} from "@/src/application/story-live-gate";
import { WorldTurnApiRequestSchema } from "@/src/contracts/world-api";
import {
  forkWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gateError = (error: StoryLiveGateError) => {
  const details = {
    story_live_disabled: [403, "Local Codex narration is not enabled."],
    story_live_local_only: [403, "Codex CLI narration is restricted to a loopback host."],
    story_live_token_not_configured: [503, "The local narration token is not configured."],
    story_live_token_required: [401, "A local narration token is required."],
    story_live_token_invalid: [403, "The local narration token was rejected."],
  }[error.code] as [number, string];
  return NextResponse.json(
    { error: { code: error.code, message: details[1] } },
    { status: details[0] },
  );
};

export async function POST(request: Request) {
  let reservedSessionId: string | null = null;
  let commitMainlineAdvance = false;
  try {
    const body = WorldTurnApiRequestSchema.parse(await request.json());
    assertStoryTransportAllowed({
      transport: body.transport,
      requestUrl: request.url,
      presentedToken: request.headers.get(STORY_LIVE_TOKEN_HEADER),
    });
    const reservation = reserveWorldSessionTurn({
      sessionId: body.sessionId,
      expectedStateHash: body.expectedStateHash,
      forkBeforeAction: body.forkBeforeAction,
    });
    if (reservation.status === "missing") {
      return NextResponse.json(
        { error: { code: "world_session_not_found", message: "The world checkpoint is missing or expired." } },
        { status: 404 },
      );
    }
    if (reservation.status === "stale") {
      return NextResponse.json(
        { error: { code: "world_session_stale", message: "The submitted world state is stale." } },
        { status: 409 },
      );
    }
    if (reservation.status === "busy") {
      return NextResponse.json(
        { error: { code: "world_session_busy", message: "This checkpoint is already resolving another turn." } },
        { status: 409 },
      );
    }
    if (reservation.status === "mainline_advanced") {
      return NextResponse.json(
        { error: { code: "world_session_advanced", message: "This checkpoint already has a mainline continuation. Fork it explicitly to test another consequence." } },
        { status: 409 },
      );
    }
    const checkpoint = reservation.checkpoint;
    reservedSessionId = checkpoint.sessionId;

    const scenario = getOdysseyBook19WorldSimulation();
    let authority = checkpoint.session;
    if (body.forkBeforeAction) {
      authority = forkWorldSimulationSession({
        scenario,
        session: authority,
        childBranchId: `branch.if_${authority.state.turn}_${randomUUID().slice(0, 8)}`,
        existingBranchIds: existingWorldBranchIds(),
      });
    }
    const result = runWorldSimulationTurn({
      scenario,
      session: authority,
      input: body.action,
    });
    const narrator =
      body.transport === "fixture"
        ? fixtureWorldNarrator
        : createCodexCliWorldNarrator();
    const narrated = await narrateWorldSession({
      scenario,
      session: result.session,
      receipt: result.receipt,
      previousVisibleSceneSummary: checkpoint.previousVisibleSceneSummary,
      narrator,
    });

    // Commit only after the draft passes the bounded narration validator.
    const nextCheckpoint = saveWorldSessionCheckpoint({
      session: result.session,
      parentCheckpointId: checkpoint.sessionId,
      previousVisibleSceneSummary: buildWorldVisibleSceneMemory({
        scenario,
        receipt: result.receipt,
      }),
    });
    commitMainlineAdvance = !body.forkBeforeAction;
    const { participantView } = buildWorldSessionProjections({
      scenario,
      session: result.session,
      sessionId: nextCheckpoint.sessionId,
      parentCheckpointId: checkpoint.sessionId,
      forked: body.forkBeforeAction,
      transport: body.transport,
      receipt: result.receipt,
      narration: narrated.narration,
      trace: narrated.trace,
    });
    return NextResponse.json(participantView, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof StoryLiveGateError) return gateError(error);
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: { code: "world_turn_request_invalid", message: "The world turn request is invalid." } },
        { status: 400 },
      );
    }
    if (error instanceof WorldNarrationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 422 },
      );
    }
    if (error instanceof Error && /already complete/u.test(error.message)) {
      return NextResponse.json(
        { error: { code: "world_session_complete", message: "This bounded world branch is already complete." } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: "world_turn_failed", message: "The world could not resolve this turn." } },
      { status: 500 },
    );
  } finally {
    if (reservedSessionId) {
      releaseWorldSessionTurn({
        sessionId: reservedSessionId,
        commitMainlineAdvance,
      });
    }
  }
}

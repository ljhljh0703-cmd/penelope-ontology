import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { createCodexCliNarrationRenderer } from "@/src/adapters/codex-cli/world-narrator";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import {
  fixtureNarrationCritic,
  fixtureNarrationRenderer,
} from "@/src/adapters/fixtures/world-narrator";
import {
  buildWorldVisibleSceneMemory,
  buildWorldSessionProjections,
  runWorldSessionNarrationPipeline,
  WorldNarrationError,
} from "@/src/application/world-simulation-service";
import {
  createWorldNarrationPendingDraft,
  existingWorldBranchIds,
  loadWorldCreatorCheckpoint,
  releaseWorldSessionTurn,
  reserveWorldSessionTurn,
  saveWorldSessionCheckpoint,
} from "@/src/application/world-session-store";
import {
  STORY_LIVE_TOKEN_HEADER,
  StoryLiveGateError,
  assertStoryTransportAllowed,
} from "@/src/application/story-live-gate";
import {
  projectModelNarrationOutputForWorldApi,
  WORLD_CREATOR_ACCESS_TOKEN_HEADER,
  WorldNarrationDraftAuthoritySchema,
  WorldNarrationDraftViewSchema,
  WorldNarrationPendingDraftReceiptSchema,
  WorldTurnApiRequestSchema,
} from "@/src/contracts/world-api";
import { PenelopeEnglishStyleProfileSchema } from "@/src/contracts/world-narrator";
import {
  forkWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);

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
    const creatorAccessToken = request.headers.get(
      WORLD_CREATOR_ACCESS_TOKEN_HEADER,
    );
    if (
      body.transport === "codex_cli" &&
      (!creatorAccessToken ||
        !loadWorldCreatorCheckpoint({
          sessionId: body.sessionId,
          creatorAccessToken,
        }))
    ) {
      return NextResponse.json(
        {
          error: {
            code: "world_creator_access_denied",
            message: "Private narration proposals require this workbench's creator capability.",
          },
        },
        { status: 403 },
      );
    }
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
    if (reservation.status === "pending_creator_review") {
      return NextResponse.json(
        {
          error: {
            code: "world_session_creator_review_pending",
            message: "Decide the pending narration candidate before resolving another turn from this checkpoint.",
          },
        },
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
    if (body.transport !== checkpoint.transport) {
      return NextResponse.json(
        {
          error: {
            code: "world_session_transport_mismatch",
            message: "This checkpoint must continue with the narration transport that opened it.",
          },
        },
        { status: 409 },
      );
    }

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
    const liveAdapter =
      checkpoint.transport === "codex_cli"
        ? createCodexCliNarrationRenderer()
        : null;
    const renderer = liveAdapter ?? fixtureNarrationRenderer;
    const critic = liveAdapter ?? fixtureNarrationCritic;
    const narrated = await runWorldSessionNarrationPipeline({
      scenario,
      session: result.session,
      receipt: result.receipt,
      styleProfile,
      renderer,
      critic,
    });
    if (narrated.outcome === "creator_review") {
      const pending = WorldNarrationPendingDraftReceiptSchema.parse(
        createWorldNarrationPendingDraft({
          baseCheckpointId: checkpoint.sessionId,
          baseStateHash: checkpoint.session.state.stateHash,
          candidateSession: narrated.candidateSession,
          candidateReceipt: narrated.candidateReceipt,
          modelOutput: narrated.modelOutput,
          trace: narrated.trace,
          artifacts: narrated.artifacts,
          transport: checkpoint.transport,
          forkBeforeAction: body.forkBeforeAction,
          creatorReviewRuleIds: narrated.creatorReviewRuleIds,
          pipeline: narrated.pipeline,
          creatorAccessToken: creatorAccessToken ?? "",
        }),
      );
      const { createdAtMs, consumed, ...authorityInput } = pending;
      void createdAtMs;
      void consumed;
      const draftView = WorldNarrationDraftViewSchema.parse({
        kind: "creator_review",
        question: "Does this narration fit what just happened in the world?",
        authority: WorldNarrationDraftAuthoritySchema.parse(authorityInput),
        narration: projectModelNarrationOutputForWorldApi(
          narrated.modelOutput,
        ),
        narratorTrace: narrated.trace,
      });
      return NextResponse.json(draftView, {
        status: 202,
        headers: { "cache-control": "no-store" },
      });
    }
    if (narrated.outcome !== "accepted") {
      throw new WorldNarrationError(
        `world_narration_${narrated.pipeline.disposition}`,
        "The narration pipeline did not accept this scene.",
      );
    }
    const narration = projectModelNarrationOutputForWorldApi(
      narrated.modelOutput,
    );

    // Commit only after the complete narration pipeline accepts the resolved turn.
    const nextCheckpoint = saveWorldSessionCheckpoint({
      session: narrated.committableSession,
      transport: checkpoint.transport,
      parentCheckpointId: checkpoint.sessionId,
      previousVisibleSceneSummary: buildWorldVisibleSceneMemory({
        scenario,
        receipt: narrated.committableReceipt,
      }),
    });
    commitMainlineAdvance = !body.forkBeforeAction;
    const { participantView } = buildWorldSessionProjections({
      scenario,
      session: narrated.committableSession,
      sessionId: nextCheckpoint.sessionId,
      parentCheckpointId: checkpoint.sessionId,
      forked: body.forkBeforeAction,
      transport: nextCheckpoint.transport,
      receipt: narrated.committableReceipt,
      narration,
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

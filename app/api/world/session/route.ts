import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
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
import { saveWorldSessionCheckpoint } from "@/src/application/world-session-store";
import {
  STORY_LIVE_TOKEN_HEADER,
  StoryLiveGateError,
  assertStoryTransportAllowed,
} from "@/src/application/story-live-gate";
import {
  projectModelNarrationOutputForWorldApi,
  StartWorldSessionApiRequestSchema,
  WORLD_CREATOR_ACCESS_TOKEN_HEADER,
} from "@/src/contracts/world-api";
import { PenelopeEnglishStyleProfileSchema } from "@/src/contracts/world-narrator";
import { createWorldSimulationSession } from "@/src/domain/world-runtime";

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
  try {
    const body = StartWorldSessionApiRequestSchema.parse(await request.json());
    assertStoryTransportAllowed({
      transport: body.transport,
      requestUrl: request.url,
      presentedToken: request.headers.get(STORY_LIVE_TOKEN_HEADER),
    });
    const scenario = getOdysseyBook19WorldSimulation();
    const instanceId = randomUUID().replace(/-/gu, "").slice(0, 12);
    const session = createWorldSimulationSession({
      scenario,
      branchId: `branch.canon_${instanceId}`,
      campaignId: `campaign.${scenario.id}.${instanceId}`,
    });
    // The opening is the prepared source-grounded fixture for both transports.
    // Live Codex prose starts only after a resolved turn has a base checkpoint
    // and creator capability to bind a pending review decision against.
    const renderer = fixtureNarrationRenderer;
    const critic = fixtureNarrationCritic;
    const narrated = await runWorldSessionNarrationPipeline({
      scenario,
      session,
      receipt: null,
      styleProfile,
      renderer,
      critic,
    });
    if (narrated.outcome !== "accepted") {
      throw new WorldNarrationError(
        `world_narration_${narrated.pipeline.disposition}`,
        "The narration pipeline did not accept this scene.",
      );
    }
    const narration = projectModelNarrationOutputForWorldApi(
      narrated.modelOutput,
    );
    const creatorAccessToken = randomUUID();
    const checkpoint = saveWorldSessionCheckpoint({
      session: narrated.committableSession,
      transport: body.transport,
      parentCheckpointId: null,
      previousVisibleSceneSummary: buildWorldVisibleSceneMemory({
        scenario,
        receipt: narrated.committableReceipt,
      }),
      creatorAccessToken,
    });
    const { participantView } = buildWorldSessionProjections({
      scenario,
      session: narrated.committableSession,
      sessionId: checkpoint.sessionId,
      parentCheckpointId: null,
      forked: false,
      transport: checkpoint.transport,
      receipt: narrated.committableReceipt,
      narration,
      trace: narrated.trace,
    });
    return NextResponse.json(participantView, {
      headers: {
        [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: creatorAccessToken,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof StoryLiveGateError) return gateError(error);
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: { code: "world_session_request_invalid", message: "The world session request is invalid." } },
        { status: 400 },
      );
    }
    if (error instanceof WorldNarrationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: { code: "world_session_failed", message: "The Odyssey world session could not be opened." } },
      { status: 500 },
    );
  }
}

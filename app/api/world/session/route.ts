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
import { saveWorldSessionCheckpoint } from "@/src/application/world-session-store";
import {
  STORY_LIVE_TOKEN_HEADER,
  StoryLiveGateError,
  assertStoryTransportAllowed,
} from "@/src/application/story-live-gate";
import {
  StartWorldSessionApiRequestSchema,
  WORLD_CREATOR_ACCESS_TOKEN_HEADER,
} from "@/src/contracts/world-api";
import { createWorldSimulationSession } from "@/src/domain/world-runtime";

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
    const narrator =
      body.transport === "fixture"
        ? fixtureWorldNarrator
        : createCodexCliWorldNarrator();
    const narrated = await narrateWorldSession({
      scenario,
      session,
      receipt: null,
      previousVisibleSceneSummary: null,
      narrator,
    });
    const creatorAccessToken = randomUUID();
    const checkpoint = saveWorldSessionCheckpoint({
      session,
      parentCheckpointId: null,
      previousVisibleSceneSummary: buildWorldVisibleSceneMemory({
        scenario,
        receipt: null,
      }),
      creatorAccessToken,
    });
    const { participantView } = buildWorldSessionProjections({
      scenario,
      session,
      sessionId: checkpoint.sessionId,
      parentCheckpointId: null,
      forked: false,
      transport: body.transport,
      receipt: null,
      narration: narrated.narration,
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

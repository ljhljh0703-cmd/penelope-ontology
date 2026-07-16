import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { loadRedSailStoryBundle } from "@/src/adapters/filesystem/story-data";
import { createFixtureStorySession, StoryTurnError } from "@/src/application/run-story-turn";
import {
  STORY_LIVE_TOKEN_HEADER,
  StoryLiveGateError,
  assertStoryTransportAllowed,
} from "@/src/application/story-live-gate";
import { storyStyleProfileView } from "@/src/application/story-presentation";
import { StartStorySessionApiRequestSchema } from "@/src/contracts/story-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = StartStorySessionApiRequestSchema.parse(await request.json());
    assertStoryTransportAllowed({
      transport: body.transport,
      requestUrl: request.url,
      presentedToken: request.headers.get(STORY_LIVE_TOKEN_HEADER),
    });
    const { scenario, worldPack, overlay, snapshot } =
      await loadRedSailStoryBundle();
    if (body.scenarioId && body.scenarioId !== scenario.id) {
      return NextResponse.json(
        {
          error: {
            code: "story_scenario_unavailable",
            message: "The requested bounded story scenario is not available.",
          },
        },
        { status: 404 },
      );
    }
    const bootstrap = createFixtureStorySession({
      scenario,
      worldPack,
      overlay,
      snapshot,
    });
    return NextResponse.json({
      ...bootstrap,
      transport: body.transport,
      openingTrace: {
        mode: "fixture",
        requestedModel: "fixture-story-v1",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
        outputSha256: bootstrap.opening.sceneHash,
        processDiagnostics: null,
      },
      styleProfile: storyStyleProfileView(bootstrap.session.styleProfile),
    });
  } catch (error) {
    if (error instanceof StoryLiveGateError) {
      const details = {
        story_live_disabled: {
          status: 403,
          message: "Local Codex story generation is not enabled.",
        },
        story_live_local_only: {
          status: 403,
          message: "Codex CLI story generation is restricted to a loopback host.",
        },
        story_live_token_not_configured: {
          status: 503,
          message: "The local live-story authorization token is not configured.",
        },
        story_live_token_required: {
          status: 401,
          message: "A local live-story authorization token is required.",
        },
        story_live_token_invalid: {
          status: 403,
          message: "The local live-story authorization token was rejected.",
        },
      }[error.code];
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: details.message,
          },
        },
        { status: details.status },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "story_session_request_invalid",
            message: error.issues[0]?.message ?? "Story session request failed validation.",
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof StoryTurnError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: "The story opening failed its authority checks.",
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "story_session_failed",
          message: "The bounded story session could not be opened.",
        },
      },
      { status: 500 },
    );
  }
}

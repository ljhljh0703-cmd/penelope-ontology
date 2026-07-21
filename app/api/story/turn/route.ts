import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createCodexCliStoryModel } from "@/src/adapters/codex-cli/story-model";
import { loadRedSailStoryBundle } from "@/src/adapters/filesystem/story-data";
import {
  StoryTurnError,
  runFixtureStoryTurn,
  runStoryTurn,
} from "@/src/application/run-story-turn";
import {
  STORY_LIVE_TOKEN_HEADER,
  StoryLiveGateError,
  assertStoryTransportAllowed,
} from "@/src/application/story-live-gate";
import {
  assertStorySessionScenarioAuthority,
  StoryPresentationError,
  resolvePresentedStoryChoice,
} from "@/src/application/story-presentation";
import { StoryTurnApiRequestSchema } from "@/src/contracts/story-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class StoryTurnRequestError extends Error {}

const parseStoryTurnRequest = async (request: Request) => {
  try {
    return StoryTurnApiRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      throw new StoryTurnRequestError(
        error.issues[0]?.message ?? "Story turn request failed validation.",
      );
    }
    if (error instanceof SyntaxError) {
      throw new StoryTurnRequestError("Story turn request is not valid JSON.");
    }
    throw error;
  }
};

export async function POST(request: Request) {
  try {
    const body = await parseStoryTurnRequest(request);
    assertStoryTransportAllowed({
      transport: body.transport,
      requestUrl: request.url,
      presentedToken: request.headers.get(STORY_LIVE_TOKEN_HEADER),
    });
    const { scenario, worldPack, overlay, snapshot } =
      await loadRedSailStoryBundle();
    assertStorySessionScenarioAuthority({
      session: body.authority,
      scenario,
    });
    const choice = resolvePresentedStoryChoice({
      session: body.authority,
      action: body.action,
      choiceId: body.choiceId,
    });
    const turnRequest = { session: body.authority, choice };
    const result =
      body.transport === "fixture"
        ? runFixtureStoryTurn({
            scenario,
            worldPack,
            overlay,
            snapshot,
            request: turnRequest,
          })
        : await runStoryTurn({
            scenario,
            worldPack,
            overlay,
            snapshot,
            request: turnRequest,
            model: createCodexCliStoryModel(),
            transport: "codex_cli",
          });
    const { knowledgeScope, ...publicResult } = result;
    return NextResponse.json({
      ...publicResult,
      scopeReceipt: {
        allowedClaimIds: knowledgeScope.allowedClaimIds,
        scopeHash: knowledgeScope.scopeHash,
      },
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
    if (error instanceof StoryTurnRequestError) {
      return NextResponse.json(
        {
          error: {
            code: "story_turn_request_invalid",
            message: error.message,
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof StoryPresentationError) {
      const messages = {
        story_session_complete:
          "The submitted story session is already complete.",
        story_session_authority_mismatch:
          "The submitted story session does not match the server-loaded scenario authority.",
        story_choice_unavailable:
          "The selected choice is not available in the current scene.",
        story_choice_text_changed:
          "The selected choice text does not match its registered scene authority.",
        story_creator_direction_requires_interview:
          "This rehearsal only executes its prepared routes. Use the World Workbench C interview to develop a creator direction before the world changes.",
      } satisfies Record<typeof error.code, string>;
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: messages[error.code],
          },
        },
        {
          status:
            error.code === "story_session_complete" ||
            error.code === "story_session_authority_mismatch"
              ? 409
              : error.code === "story_creator_direction_requires_interview"
                ? 422
                : 400,
        },
      );
    }
    if (error instanceof StoryTurnError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message:
              "The submitted story authority or next scene failed its bounded causal checks.",
          },
        },
        { status: 422 },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "story_turn_contract_invalid",
            message:
              "The server-loaded story contract or generated scene failed validation.",
          },
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "story_turn_failed",
          message: "The next story scene could not be produced.",
        },
      },
      { status: 500 },
    );
  }
}

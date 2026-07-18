import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import { buildWorldCreatorReceipt } from "@/src/application/world-simulation-service";
import { loadWorldCreatorCheckpoint } from "@/src/application/world-session-store";
import {
  WORLD_CREATOR_ACCESS_TOKEN_HEADER,
  WorldCreatorReceiptApiRequestSchema,
} from "@/src/contracts/world-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = WorldCreatorReceiptApiRequestSchema.parse(await request.json());
    const creatorAccessToken =
      request.headers.get(WORLD_CREATOR_ACCESS_TOKEN_HEADER) ?? "";
    const checkpoint = loadWorldCreatorCheckpoint({
      sessionId: body.sessionId,
      creatorAccessToken,
    });
    if (!checkpoint) {
      return NextResponse.json(
        {
          error: {
            code: "world_creator_access_denied",
            message: "The creator workbench projection requires this session's capability.",
          },
        },
        { status: 403 },
      );
    }
    if (checkpoint.session.state.stateHash !== body.expectedStateHash) {
      return NextResponse.json(
        {
          error: {
            code: "world_creator_checkpoint_stale",
            message: "The creator inspector request targets a stale world state.",
          },
        },
        { status: 409 },
      );
    }
    const scenario = getOdysseyBook19WorldSimulation();
    return NextResponse.json(
      buildWorldCreatorReceipt({
        scenario,
        session: checkpoint.session,
        receipt: checkpoint.session.turns.at(-1) ?? null,
        narrationDecisionReceipt: checkpoint.narrationDecisionReceipt,
      }),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: {
            code: "world_creator_request_invalid",
            message: "The creator inspector request is invalid.",
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "world_creator_request_failed",
          message: "The creator inspector could not load this checkpoint.",
        },
      },
      { status: 500 },
    );
  }
}

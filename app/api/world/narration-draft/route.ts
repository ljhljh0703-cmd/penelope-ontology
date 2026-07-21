import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  finalizeWorldNarrationCreatorDecision,
  WorldNarrationCreatorDecisionError,
} from "@/src/application/world-narration-review";
import {
  buildWorldSessionProjections,
  buildWorldVisibleSceneMemory,
} from "@/src/application/world-simulation-service";
import {
  releaseWorldNarrationDraftDecision,
  loadWorldSessionCheckpoint,
  releaseWorldSessionTurn,
  resolveWorldPackForCheckpoint,
  saveWorldSessionCheckpoint,
} from "@/src/application/world-session-store";
import {
  projectModelNarrationOutputForWorldApi,
  WORLD_CREATOR_ACCESS_TOKEN_HEADER,
  WorldNarrationDraftDecisionApiRequestSchema,
  WorldNarrationDraftDecisionApiResponseSchema,
} from "@/src/contracts/world-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const decisionErrorStatus = (
  code: WorldNarrationCreatorDecisionError["code"],
): number =>
  ({
    invalid_input: 400,
    creator_unauthorized: 403,
    draft_not_found: 404,
    draft_expired: 410,
    draft_consumed: 409,
    draft_busy: 409,
    authority_mismatch: 409,
    base_stale: 409,
    validation_failed: 422,
  })[code];

export async function POST(request: Request) {
  let heldBaseCheckpointId: string | null = null;
  let heldDraftDecision: {
    draftId: string;
    decisionReservationId: string;
  } | null = null;
  let commitMainlineAdvance = false;
  try {
    const creatorAccessToken = request.headers.get(
      WORLD_CREATOR_ACCESS_TOKEN_HEADER,
    );
    if (!creatorAccessToken) {
      return NextResponse.json(
        {
          error: {
            code: "creator_unauthorized",
            message: "Creator approval requires this workbench's capability.",
          },
        },
        { status: 403 },
      );
    }

    const body = WorldNarrationDraftDecisionApiRequestSchema.parse(
      await request.json(),
    );
    const baseCheckpoint = loadWorldSessionCheckpoint(
      body.authority.baseCheckpointId,
    );
    if (!baseCheckpoint) {
      return NextResponse.json(
        {
          error: {
            code: "world_session_not_found",
            message: "The narration draft's base world checkpoint is missing or expired.",
          },
        },
        { status: 404 },
      );
    }
    const worldPack = resolveWorldPackForCheckpoint(baseCheckpoint);
    if (!worldPack) {
      return NextResponse.json(
        {
          error: {
            code: "world_pack_unavailable",
            message: "The sealed world pack for this checkpoint is unavailable.",
          },
        },
        { status: 409 },
      );
    }
    const result = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken,
      authority: body.authority,
      decision: body.decision,
    });

    if (result.status === "rejected") {
      return NextResponse.json(
        WorldNarrationDraftDecisionApiResponseSchema.parse({
          status: "rejected",
          draftId: body.authority.draftId,
          baseCheckpointId: body.authority.baseCheckpointId,
          baseStateHash: body.authority.baseStateHash,
          stateChanged: false,
        }),
        { headers: { "cache-control": "no-store" } },
      );
    }

    heldBaseCheckpointId = body.authority.baseCheckpointId;
    heldDraftDecision = {
      draftId: body.authority.draftId,
      decisionReservationId: result.draftDecisionReservationId,
    };
    const scenario = worldPack.scenario;
    const prospectiveSessionId = randomUUID();
    const narration = projectModelNarrationOutputForWorldApi(
      result.modelOutput,
    );
    const { participantView } = buildWorldSessionProjections({
      scenario,
      worldPack,
      session: result.committableSession,
      sessionId: prospectiveSessionId,
      parentCheckpointId: body.authority.baseCheckpointId,
      forked: body.authority.forkBeforeAction,
      transport: body.authority.transport,
      receipt: result.committableReceipt,
      narration,
      trace: result.trace,
    });
    const responseBody = WorldNarrationDraftDecisionApiResponseSchema.parse({
      status: "approved",
      session: participantView,
    });

    // This is the only mutation. The store validates the held decision receipt
    // and consumes its draft in the same operation as the checkpoint insert.
    saveWorldSessionCheckpoint({
      session: result.committableSession,
      transport: body.authority.transport,
      parentCheckpointId: body.authority.baseCheckpointId,
      previousVisibleSceneSummary: buildWorldVisibleSceneMemory({
        scenario,
        worldPack,
        receipt: result.committableReceipt,
      }),
      narrationDecisionReceipt: result.decisionReceipt,
      narrationDecisionReservation: heldDraftDecision,
      idFactory: () => prospectiveSessionId,
    });
    heldDraftDecision = null;
    commitMainlineAdvance = !body.authority.forkBeforeAction;
    return NextResponse.json(responseBody, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: {
            code: "world_narration_decision_invalid",
            message: "The narration decision request is invalid.",
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof WorldNarrationCreatorDecisionError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: decisionErrorStatus(error.code) },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "world_narration_decision_failed",
          message: "The narration decision could not be applied.",
        },
      },
      { status: 500 },
    );
  } finally {
    if (heldDraftDecision) {
      releaseWorldNarrationDraftDecision(heldDraftDecision);
    }
    if (heldBaseCheckpointId) {
      releaseWorldSessionTurn({
        sessionId: heldBaseCheckpointId,
        commitMainlineAdvance,
      });
    }
  }
}

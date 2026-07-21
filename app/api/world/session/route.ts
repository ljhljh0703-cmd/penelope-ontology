import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  getDefaultWorldPack,
  getWorldPackById,
  hasRegisteredWorldPackId,
} from "@/src/adapters/world-packs/registry";
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
  MAX_WORLD_SESSION_REQUEST_BYTES,
  projectModelNarrationOutputForWorldApi,
  StartWorldSessionApiRequestSchema,
  WORLD_CREATOR_ACCESS_TOKEN_HEADER,
} from "@/src/contracts/world-api";
import { PenelopeEnglishStyleProfileSchema } from "@/src/contracts/world-narrator";
import {
  bindSessionToWorldPack,
  sealPenelopeWorldPack,
} from "@/src/contracts/penelope-world-pack";
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
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_WORLD_SESSION_REQUEST_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "world_session_request_too_large",
            message: "The world session request is too large.",
          },
        },
        { status: 413 },
      );
    }
    const body = StartWorldSessionApiRequestSchema.parse(JSON.parse(rawBody));
    assertStoryTransportAllowed({
      transport: body.transport,
      requestUrl: request.url,
      presentedToken: request.headers.get(STORY_LIVE_TOKEN_HEADER),
    });
    const creatorWorldPack = body.creatorPackDefinition
      ? sealPenelopeWorldPack(body.creatorPackDefinition)
      : null;
    if (creatorWorldPack && hasRegisteredWorldPackId(creatorWorldPack.packId)) {
      return NextResponse.json(
        {
          error: {
            code: "world_creator_pack_id_reserved",
            message: "The creator pack must use an unregistered pack identifier.",
          },
        },
        { status: 409 },
      );
    }
    const worldPack = creatorWorldPack
      ? creatorWorldPack
      : body.packId
        ? getWorldPackById(body.packId)
        : getDefaultWorldPack();
    const scenario = worldPack.scenario;
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
      worldPack,
      session,
      receipt: null,
      styleProfile,
      renderer,
      critic,
    });
    if (narrated.outcome !== "accepted") {
      throw new WorldNarrationError(
        `world_narration_${
          narrated.outcome === "no_render"
            ? narrated.reason
            : narrated.pipeline.disposition
        }`,
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
        worldPack,
        receipt: narrated.committableReceipt,
      }),
      creatorAccessToken,
      worldPackBinding: bindSessionToWorldPack(worldPack),
      resolvedWorldPack: worldPack,
    });
    const { participantView } = buildWorldSessionProjections({
      scenario,
      worldPack,
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
      { error: { code: "world_session_failed", message: "The selected world session could not be opened." } },
      { status: 500 },
    );
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { createCodexCliNarrationRenderer } from "@/src/adapters/codex-cli/world-narrator";
import {
  fixtureNarrationCritic,
  fixtureNarrationRenderer,
} from "@/src/adapters/fixtures/world-narrator";
import {
  buildWorldVisibleSceneMemory,
  buildWorldSessionProjections,
  runWorldSessionNarrationPipeline,
  selectedWorldActionCandidates,
  WorldNarrationError,
} from "@/src/application/world-simulation-service";
import {
  createWorldNarrationPendingDraft,
  existingWorldBranchIds,
  loadWorldCreatorCheckpoint,
  releaseWorldSessionTurn,
  resolveWorldPackForCheckpoint,
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
import type { CreatorWorldDirectionReceipt } from "@/src/contracts/world-runtime";
import {
  forkWorldSimulationSession,
  resolveWorldAction,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";
import {
  assessCreatorDirection,
  registeredCreatorActionInput,
} from "@/src/domain/creator-c-dialogue";

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
    const confirmsCreatorDirection =
      body.creatorDialogue?.confirmedProposalHash !== undefined;
    if (
      (body.transport === "codex_cli" || confirmsCreatorDirection) &&
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
            message:
              "Private narration and confirmed creator directions require this workbench's creator capability.",
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

    const worldPack = resolveWorldPackForCheckpoint(checkpoint);
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
    const scenario = worldPack.scenario;
    let turnInput = body.action;
    let creatorDirection: CreatorWorldDirectionReceipt | null = null;
    if (body.creatorDialogue) {
      const assessment = assessCreatorDirection({
        pack: worldPack,
        session: checkpoint.session,
        baseSessionId: checkpoint.sessionId,
        originalAction: body.action,
        answers: body.creatorDialogue.answers,
        forkBeforeAction: body.forkBeforeAction,
      });
      const confirmedProposalHash =
        body.creatorDialogue.confirmedProposalHash;
      if (!confirmedProposalHash) {
        return NextResponse.json(assessment, {
          headers: { "cache-control": "no-store" },
        });
      }
      if (assessment.kind !== "creator_confirmation") {
        return NextResponse.json(
          {
            error: {
              code: "world_creator_direction_not_executable",
              message:
                "This creator direction still needs clarification or world support before it can advance the scene.",
            },
          },
          { status: 409 },
        );
      }
      if (assessment.proposal.proposalHash !== confirmedProposalHash) {
        return NextResponse.json(
          {
            error: {
              code: "world_creator_proposal_stale",
              message:
                "The confirmed creator proposal no longer matches this world state or these answers.",
            },
          },
          { status: 409 },
        );
      }
      turnInput = registeredCreatorActionInput({
        pack: worldPack,
        actionId: assessment.proposal.registeredActionId,
        canonicalExecution: assessment.proposal.canonicalExecution,
      });
      creatorDirection = {
        source: "creator_c",
        proposalHash: assessment.proposal.proposalHash,
        originalAction: assessment.originalAction,
        desiredOutcome: assessment.proposal.desiredOutcome,
        characterMotive: assessment.proposal.characterMotive,
        acceptedCost: assessment.proposal.acceptedCost,
        registeredActionId: assessment.proposal.registeredActionId,
        mappingBasis: assessment.proposal.mappingBasis,
        forkBeforeAction: assessment.proposal.forkBeforeAction,
      };
    } else {
      const prepared = selectedWorldActionCandidates({
        scenario,
        worldPack,
        session: checkpoint.session,
      })
        .slice(0, 2)
        .find(({ actionId }) => actionId === body.preparedActionId);
      const resolvedPreparedAction = resolveWorldAction({
        scenario,
        input: body.action,
      });
      if (
        !prepared ||
        resolvedPreparedAction.status !== "accepted" ||
        resolvedPreparedAction.actionId !== prepared.actionId
      ) {
        return NextResponse.json(
          {
            error: {
              code: "world_prepared_action_invalid",
              message:
                "The prepared action does not match either route currently offered by this checkpoint.",
            },
          },
          { status: 409 },
        );
      }
      turnInput = prepared.suggestedInput;
    }
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
      input: turnInput,
      creatorDirection,
    });
    const liveAdapter =
      checkpoint.transport === "codex_cli"
        ? createCodexCliNarrationRenderer()
        : null;
    const renderer = liveAdapter ?? fixtureNarrationRenderer;
    const critic = liveAdapter ?? fixtureNarrationCritic;
    const narrated = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
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
    if (
      narrated.outcome !== "accepted" &&
      narrated.outcome !== "no_render"
    ) {
      throw new WorldNarrationError(
        `world_narration_${narrated.pipeline.disposition}`,
        "The narration pipeline did not accept this scene.",
      );
    }
    const narration =
      narrated.outcome === "no_render"
        ? narrated.narration
        : projectModelNarrationOutputForWorldApi(narrated.modelOutput);

    // Commit only after the complete narration pipeline accepts the resolved turn.
    const nextCheckpoint = saveWorldSessionCheckpoint({
      session: narrated.committableSession,
      transport: checkpoint.transport,
      parentCheckpointId: checkpoint.sessionId,
      previousVisibleSceneSummary: buildWorldVisibleSceneMemory({
        scenario,
        worldPack,
        receipt: narrated.committableReceipt,
      }),
    });
    commitMainlineAdvance = !body.forkBeforeAction;
    const { participantView } = buildWorldSessionProjections({
      scenario,
      worldPack,
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

import { beforeEach, describe, expect, it } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import { getOdysseyBook19WorldPack } from "@/src/adapters/world-packs/odyssey-book19";
import {
  buildWorldNarrationPipelineArtifacts,
  runWorldSessionNarrationPipeline,
} from "@/src/application/world-simulation-service";
import {
  createWorldNarrationPendingDraft,
  loadWorldSessionCheckpoint,
  releaseWorldNarrationDraftDecision,
  releaseWorldSessionTurn,
  reserveWorldNarrationDraftDecision,
  reserveWorldSessionTurn,
  resetWorldSessionStoreForTests,
  saveWorldSessionCheckpoint,
  type WorldNarrationDraftDecisionAuthority,
  type WorldNarrationPendingDraftReceipt,
} from "@/src/application/world-session-store";
import { bindSessionToWorldPack } from "@/src/contracts/penelope-world-pack";
import {
  PenelopeEnglishStyleProfileSchema,
  type ModelNarrationOutput,
  type NarrationRendererOutcome,
} from "@/src/contracts/world-narrator";
import {
  createWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";
import type { NarrationRenderer } from "@/src/ports/world-narrator";

const ROOT_TTL_MS = 30 * 60 * 1_000;
const ROOT_CREATED_AT_MS = 1_000_000;
const ROOT_EXPIRES_AT_MS = ROOT_CREATED_AT_MS + ROOT_TTL_MS;
const CREATOR_TOKEN = "creator-capability-for-retention-tests";
const scenario = getOdysseyBook19WorldSimulation();
const worldPack = getOdysseyBook19WorldPack();
const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);

const outputFor = (
  artifacts: ReturnType<typeof buildWorldNarrationPipelineArtifacts>,
): ModelNarrationOutput => ({
  planReceipt: artifacts.scenePlan.sentencePlans.map((plan) => ({
    sentencePlanId: plan.sentencePlanId,
    role: plan.role,
    sourceFactIds: [...plan.sourceFactIds],
    sourceEventIds: [...plan.sourceEventIds],
    speechEventIds: [...plan.speechEventIds],
    licensedRenderingDetailIds: [...plan.licensedRenderingDetailIds],
  })),
  readerProse: {
    format: "english_prose_paragraphs",
    paragraphs: [
      {
        paragraphId: "paragraph.retention",
        sentencePlanIds: artifacts.scenePlan.sentencePlans.map(
          ({ sentencePlanId }) => sentencePlanId,
        ),
        text: "She keeps her place. Light rests across the threshold. The nurse remains nearby. The room stays quiet.",
      },
    ],
  },
});

const rendererFor = (modelOutput: ModelNarrationOutput): NarrationRenderer => ({
  async render(): Promise<NarrationRendererOutcome> {
    return {
      outcome: "completed",
      modelOutput,
      trace: { provenance: "model", adapterId: "adapter.retention-test" },
    };
  },
});

const authorityFrom = (
  receipt: WorldNarrationPendingDraftReceipt,
): WorldNarrationDraftDecisionAuthority => {
  const { createdAtMs, consumed, ...authority } = receipt;
  void createdAtMs;
  void consumed;
  return authority;
};

const saveRoot = (id: string) =>
  saveWorldSessionCheckpoint({
    session: createWorldSimulationSession({ scenario }),
    transport: "codex_cli",
    parentCheckpointId: null,
    previousVisibleSceneSummary: null,
    creatorAccessToken: CREATOR_TOKEN,
    worldPackBinding: bindSessionToWorldPack(worldPack),
    resolvedWorldPack: worldPack,
    nowMs: ROOT_CREATED_AT_MS,
    idFactory: () => id,
  });

describe("world session root retention", () => {
  beforeEach(() => resetWorldSessionStoreForTests());

  it("keeps a child on the root lease instead of extending private checkpoint lifetime", () => {
    const root = saveRoot("11111111-1111-4111-8111-111111111111");
    const child = saveWorldSessionCheckpoint({
      session: root.session,
      transport: "codex_cli",
      parentCheckpointId: root.sessionId,
      previousVisibleSceneSummary: null,
      nowMs: ROOT_EXPIRES_AT_MS - 1,
      idFactory: () => "22222222-2222-4222-8222-222222222222",
    });

    expect(loadWorldSessionCheckpoint(root.sessionId, ROOT_EXPIRES_AT_MS - 1)).not.toBeNull();
    expect(loadWorldSessionCheckpoint(child.sessionId, ROOT_EXPIRES_AT_MS - 1)).not.toBeNull();
    expect(JSON.stringify(child)).not.toContain("expiresAtMs");

    expect(loadWorldSessionCheckpoint(root.sessionId, ROOT_EXPIRES_AT_MS + 1)).toBeNull();
    expect(loadWorldSessionCheckpoint(child.sessionId, ROOT_EXPIRES_AT_MS + 1)).toBeNull();
  });

  it("caps pending narration by root expiry and prunes private draft artifacts with that root", async () => {
    const root = saveRoot("33333333-3333-4333-8333-333333333333");
    const draftCreatedAtMs = ROOT_EXPIRES_AT_MS - 1_000;
    const child = saveWorldSessionCheckpoint({
      session: root.session,
      transport: "codex_cli",
      parentCheckpointId: root.sessionId,
      previousVisibleSceneSummary: null,
      nowMs: draftCreatedAtMs - 1,
      idFactory: () => "44444444-4444-4444-8444-444444444444",
    });
    const reservation = reserveWorldSessionTurn({
      sessionId: child.sessionId,
      expectedStateHash: child.session.state.stateHash,
      forkBeforeAction: false,
      nowMs: draftCreatedAtMs,
    });
    if (reservation.status !== "reserved") {
      throw new Error(`Expected reservation, received ${reservation.status}.`);
    }

    const turn = runWorldSimulationTurn({
      scenario,
      session: child.session,
      input: "bring the basin",
    });
    const artifacts = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
    });
    const modelOutput = outputFor(artifacts);
    const narrated = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
      session: turn.session,
      receipt: turn.receipt,
      styleProfile,
      renderer: rendererFor(modelOutput),
    });
    if (narrated.outcome !== "creator_review") {
      throw new Error(`Expected creator review, received ${narrated.outcome}.`);
    }

    const draft = createWorldNarrationPendingDraft({
      baseCheckpointId: child.sessionId,
      baseStateHash: child.session.state.stateHash,
      candidateSession: narrated.candidateSession,
      candidateReceipt: narrated.candidateReceipt,
      modelOutput: narrated.modelOutput,
      trace: narrated.trace,
      artifacts: narrated.artifacts,
      transport: "codex_cli",
      forkBeforeAction: false,
      creatorReviewRuleIds: narrated.creatorReviewRuleIds,
      pipeline: narrated.pipeline,
      creatorAccessToken: CREATOR_TOKEN,
      nowMs: draftCreatedAtMs,
      idFactory: () => "draft-retention",
    });
    const authority = authorityFrom(draft);
    releaseWorldSessionTurn({
      sessionId: child.sessionId,
      commitMainlineAdvance: false,
    });

    expect(draft.expiresAtMs).toBe(ROOT_EXPIRES_AT_MS);
    expect(JSON.stringify(draft)).not.toContain("rootExpiresAtMs");
    const held = reserveWorldNarrationDraftDecision({
      authority,
      creatorAccessToken: CREATOR_TOKEN,
      nowMs: ROOT_EXPIRES_AT_MS - 1,
    });
    expect(held.status).toBe("reserved");
    if (held.status !== "reserved") throw new Error("Expected a held draft.");

    expect(
      reserveWorldNarrationDraftDecision({
        authority,
        creatorAccessToken: CREATOR_TOKEN,
        nowMs: ROOT_EXPIRES_AT_MS,
      }).status,
    ).toBe("missing");
    expect(loadWorldSessionCheckpoint(root.sessionId, ROOT_EXPIRES_AT_MS)).toBeNull();
    expect(loadWorldSessionCheckpoint(child.sessionId, ROOT_EXPIRES_AT_MS)).toBeNull();
    expect(
      releaseWorldNarrationDraftDecision({
        draftId: authority.draftId,
        decisionReservationId: held.draft.decisionReservationId,
      }),
    ).toBe(false);
  });
});

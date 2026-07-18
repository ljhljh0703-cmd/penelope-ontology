import { beforeEach, describe, expect, it } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import {
  finalizeWorldNarrationCreatorDecision,
  WorldNarrationCreatorDecisionError,
} from "@/src/application/world-narration-review";
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

const scenario = getOdysseyBook19WorldSimulation();
const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);
const CREATOR_TOKEN = "creator-capability-for-review-tests";
const BASE_CHECKPOINT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_CHECKPOINT_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT_MS = 1_000_000;
const FREE_PROSE =
  "She keeps her place. Light rests across the threshold. The nurse remains nearby. The room stays quiet.";

const outputFor = (
  text: string,
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
        paragraphId: "paragraph.creator_review",
        sentencePlanIds: artifacts.scenePlan.sentencePlans.map(
          ({ sentencePlanId }) => sentencePlanId,
        ),
        text,
      },
    ],
  },
});

const rendererFor = (modelOutput: ModelNarrationOutput): NarrationRenderer => ({
  async render(): Promise<NarrationRendererOutcome> {
    return {
      outcome: "completed",
      modelOutput,
      trace: { provenance: "model", adapterId: "adapter.review-test" },
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

const expectDecisionError = async (
  result: Promise<unknown>,
  code: WorldNarrationCreatorDecisionError["code"],
): Promise<void> => {
  await expect(result).rejects.toMatchObject({
    name: "WorldNarrationCreatorDecisionError",
    code,
  });
};

const pendingContext = async ({
  text = FREE_PROSE,
  releaseBase = true,
  draftId = "draft-a",
}: {
  text?: string;
  releaseBase?: boolean;
  draftId?: string;
} = {}) => {
  const initial = createWorldSimulationSession({ scenario });
  const baseCheckpoint = saveWorldSessionCheckpoint({
    session: initial,
    transport: "codex_cli",
    parentCheckpointId: null,
    previousVisibleSceneSummary: null,
    creatorAccessToken: CREATOR_TOKEN,
    nowMs: CREATED_AT_MS,
    idFactory: () => BASE_CHECKPOINT_ID,
  });
  const turnReservation = reserveWorldSessionTurn({
    sessionId: baseCheckpoint.sessionId,
    expectedStateHash: baseCheckpoint.session.state.stateHash,
    forkBeforeAction: false,
    nowMs: CREATED_AT_MS + 1,
  });
  if (turnReservation.status !== "reserved") {
    throw new Error(`Unexpected base reservation: ${turnReservation.status}`);
  }
  const turn = runWorldSimulationTurn({
    scenario,
    session: initial,
    input: "bring the basin",
  });
  const artifacts = buildWorldNarrationPipelineArtifacts({
    scenario,
    session: turn.session,
    receipt: turn.receipt,
    styleProfile,
  });
  const modelOutput = outputFor(text, artifacts);
  const narrated = await runWorldSessionNarrationPipeline({
    scenario,
    session: turn.session,
    receipt: turn.receipt,
    styleProfile,
    renderer: rendererFor(modelOutput),
  });
  if (narrated.outcome !== "creator_review") {
    throw new Error(`Expected creator review, received ${narrated.outcome}.`);
  }
  const pendingReceipt = createWorldNarrationPendingDraft({
    baseCheckpointId: baseCheckpoint.sessionId,
    baseStateHash: baseCheckpoint.session.state.stateHash,
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
    nowMs: CREATED_AT_MS + 2,
    idFactory: () => draftId,
  });
  if (releaseBase) {
    releaseWorldSessionTurn({
      sessionId: baseCheckpoint.sessionId,
      commitMainlineAdvance: false,
    });
  }
  return {
    baseCheckpoint,
    turn,
    narrated,
    pendingReceipt,
    authority: authorityFrom(pendingReceipt),
  };
};

describe("world narration creator review", () => {
  beforeEach(() => resetWorldSessionStoreForTests());

  it("atomically preserves an approved human receipt and consumes only after checkpoint save", async () => {
    const context = await pendingContext();
    const finalized = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken: CREATOR_TOKEN,
      authority: context.authority,
      decision: { action: "approve" },
      nowMs: CREATED_AT_MS + 3,
    });
    expect(finalized.status).toBe("approved");
    if (finalized.status !== "approved") throw new Error("Expected approval.");
    const finalCreatorReviewRuleIds = [
      ...new Set(
        finalized.pipeline.validation?.findings
          .filter(({ severity }) => severity === "creator_review")
          .map(({ ruleId }) => ruleId) ?? [],
      ),
    ].sort((left, right) => left.localeCompare(right));
    expect(finalized.decisionReceipt.originalCreatorReviewRuleIds).toEqual(
      context.narrated.creatorReviewRuleIds,
    );
    expect(finalized.decisionReceipt.satisfiedCreatorReviewRuleIds).toEqual(
      finalCreatorReviewRuleIds,
    );

    const checkpoint = saveWorldSessionCheckpoint({
      session: finalized.committableSession,
      transport: "codex_cli",
      parentCheckpointId: context.baseCheckpoint.sessionId,
      previousVisibleSceneSummary: "Registered events only.",
      narrationDecisionReceipt: finalized.decisionReceipt,
      narrationDecisionReservation: {
        draftId: context.authority.draftId,
        decisionReservationId: finalized.draftDecisionReservationId,
      },
      nowMs: CREATED_AT_MS + 4,
      idFactory: () => CHILD_CHECKPOINT_ID,
    });
    releaseWorldSessionTurn({
      sessionId: context.baseCheckpoint.sessionId,
      commitMainlineAdvance: true,
    });

    expect(checkpoint.narrationDecisionReceipt).toEqual(
      finalized.decisionReceipt,
    );
    expect(
      loadWorldSessionCheckpoint(CHILD_CHECKPOINT_ID, CREATED_AT_MS + 5)
        ?.narrationDecisionReceipt,
    ).toEqual(finalized.decisionReceipt);
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: CREATOR_TOKEN,
        authority: context.authority,
        decision: { action: "approve" },
        nowMs: CREATED_AT_MS + 5,
      }),
      "draft_consumed",
    );
  });

  it("rejects without reserving or changing the base checkpoint", async () => {
    const context = await pendingContext();
    const rejected = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken: CREATOR_TOKEN,
      authority: context.authority,
      decision: { action: "reject" },
      nowMs: CREATED_AT_MS + 3,
    });
    expect(rejected).toMatchObject({
      status: "rejected",
      committableSession: null,
      baseReservationHeld: false,
      draftReservationHeld: false,
    });
    expect(
      loadWorldSessionCheckpoint(BASE_CHECKPOINT_ID, CREATED_AT_MS + 4),
    ).toMatchObject({
      session: { state: { stateHash: context.baseCheckpoint.session.state.stateHash } },
      narrationDecisionReceipt: null,
    });
    const freshTurn = reserveWorldSessionTurn({
      sessionId: BASE_CHECKPOINT_ID,
      expectedStateHash: context.baseCheckpoint.session.state.stateHash,
      forkBeforeAction: false,
      nowMs: CREATED_AT_MS + 4,
    });
    expect(freshTurn.status).toBe("reserved");
    releaseWorldSessionTurn({
      sessionId: BASE_CHECKPOINT_ID,
      commitMainlineAdvance: false,
    });
  });

  it("releases both reservations after a hard edit so the creator can correct it", async () => {
    const context = await pendingContext();
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: CREATOR_TOKEN,
        authority: context.authority,
        decision: {
          action: "edit",
          paragraphs: context.narrated.modelOutput.readerProse.paragraphs.map(
            ({ paragraphId }) => ({
              paragraphId,
              text: "The pipeline validates the scene. Light rests across the threshold. The nurse remains nearby. The room stays quiet.",
            }),
          ),
        },
        nowMs: CREATED_AT_MS + 3,
      }),
      "validation_failed",
    );
    expect(
      reserveWorldSessionTurn({
        sessionId: BASE_CHECKPOINT_ID,
        expectedStateHash: context.baseCheckpoint.session.state.stateHash,
        forkBeforeAction: true,
        nowMs: CREATED_AT_MS + 4,
      }).status,
    ).toBe("pending_creator_review");

    const corrected = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken: CREATOR_TOKEN,
      authority: context.authority,
      decision: {
        action: "edit",
        paragraphs: context.narrated.modelOutput.readerProse.paragraphs.map(
          ({ paragraphId }) => ({
            paragraphId,
            text: "She keeps her place. Lamp light rests across the threshold. The nurse stays nearby. The room remains quiet.",
          }),
        ),
      },
      nowMs: CREATED_AT_MS + 4,
    });
    expect(corrected).toMatchObject({
      status: "approved",
      baseReservationHeld: true,
      draftReservationHeld: true,
    });
    if (corrected.status !== "approved") throw new Error("Expected approval.");
    expect(corrected.modelOutput.readerProse.paragraphs[0]?.text).toContain(
      "Lamp light",
    );
    releaseWorldNarrationDraftDecision({
      draftId: context.authority.draftId,
      decisionReservationId: corrected.draftDecisionReservationId,
    });
    releaseWorldSessionTurn({
      sessionId: BASE_CHECKPOINT_ID,
      commitMainlineAdvance: false,
    });
  });

  it("keeps a draft retryable when checkpoint saving fails after validation", async () => {
    const context = await pendingContext();
    const first = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken: CREATOR_TOKEN,
      authority: context.authority,
      decision: { action: "approve" },
      nowMs: CREATED_AT_MS + 3,
    });
    if (first.status !== "approved") throw new Error("Expected approval.");
    expect(() =>
      saveWorldSessionCheckpoint({
        session: first.committableSession,
        transport: "codex_cli",
        parentCheckpointId: "33333333-3333-4333-8333-333333333333",
        previousVisibleSceneSummary: null,
        narrationDecisionReceipt: first.decisionReceipt,
        narrationDecisionReservation: {
          draftId: context.authority.draftId,
          decisionReservationId: first.draftDecisionReservationId,
        },
        nowMs: CREATED_AT_MS + 4,
      }),
    ).toThrow(/parent world checkpoint is missing/u);
    expect(
      releaseWorldNarrationDraftDecision({
        draftId: context.authority.draftId,
        decisionReservationId: first.draftDecisionReservationId,
      }),
    ).toBe(true);
    releaseWorldSessionTurn({
      sessionId: BASE_CHECKPOINT_ID,
      commitMainlineAdvance: false,
    });

    const retried = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken: CREATOR_TOKEN,
      authority: context.authority,
      decision: { action: "approve" },
      nowMs: CREATED_AT_MS + 5,
    });
    expect(retried.status).toBe("approved");
    if (retried.status !== "approved") throw new Error("Expected retry approval.");
    releaseWorldNarrationDraftDecision({
      draftId: context.authority.draftId,
      decisionReservationId: retried.draftDecisionReservationId,
    });
    releaseWorldSessionTurn({
      sessionId: BASE_CHECKPOINT_ID,
      commitMainlineAdvance: false,
    });
  });

  it("fails closed when an approval lease expires before checkpoint commit", async () => {
    const context = await pendingContext();
    const finalized = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken: CREATOR_TOKEN,
      authority: context.authority,
      decision: { action: "approve" },
      nowMs: context.pendingReceipt.expiresAtMs - 1,
    });
    if (finalized.status !== "approved") throw new Error("Expected approval.");

    expect(() =>
      saveWorldSessionCheckpoint({
        session: finalized.committableSession,
        transport: "codex_cli",
        parentCheckpointId: BASE_CHECKPOINT_ID,
        previousVisibleSceneSummary: "Registered events only.",
        narrationDecisionReceipt: finalized.decisionReceipt,
        narrationDecisionReservation: {
          draftId: context.authority.draftId,
          decisionReservationId: finalized.draftDecisionReservationId,
        },
        nowMs: context.pendingReceipt.expiresAtMs,
        idFactory: () => CHILD_CHECKPOINT_ID,
      }),
    ).toThrow(/held draft decision/u);
    expect(
      loadWorldSessionCheckpoint(
        CHILD_CHECKPOINT_ID,
        context.pendingReceipt.expiresAtMs,
      ),
    ).toBeNull();
    expect(
      releaseWorldNarrationDraftDecision({
        draftId: context.authority.draftId,
        decisionReservationId: finalized.draftDecisionReservationId,
      }),
    ).toBe(true);
    releaseWorldSessionTurn({
      sessionId: BASE_CHECKPOINT_ID,
      commitMainlineAdvance: false,
    });
    expect(
      loadWorldSessionCheckpoint(
        BASE_CHECKPOINT_ID,
        context.pendingReceipt.expiresAtMs,
      )?.session.state.stateHash,
    ).toBe(context.baseCheckpoint.session.state.stateHash);
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: CREATOR_TOKEN,
        authority: context.authority,
        decision: { action: "approve" },
        nowMs: context.pendingReceipt.expiresAtMs,
      }),
      "draft_expired",
    );
  });

  it("releases a transient base-busy decision reservation for retry", async () => {
    const context = await pendingContext({ releaseBase: false });
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: CREATOR_TOKEN,
        authority: context.authority,
        decision: { action: "approve" },
        nowMs: CREATED_AT_MS + 3,
      }),
      "draft_busy",
    );
    releaseWorldSessionTurn({
      sessionId: BASE_CHECKPOINT_ID,
      commitMainlineAdvance: false,
    });
    const retry = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken: CREATOR_TOKEN,
      authority: context.authority,
      decision: { action: "approve" },
      nowMs: CREATED_AT_MS + 4,
    });
    expect(retry.status).toBe("approved");
    if (retry.status !== "approved") throw new Error("Expected retry approval.");
    releaseWorldNarrationDraftDecision({
      draftId: context.authority.draftId,
      decisionReservationId: retry.draftDecisionReservationId,
    });
    releaseWorldSessionTurn({
      sessionId: BASE_CHECKPOINT_ID,
      commitMainlineAdvance: false,
    });
  });

  it("rejects a concurrent decision while preserving the held draft for its owner", async () => {
    const context = await pendingContext();
    const held = reserveWorldNarrationDraftDecision({
      authority: context.authority,
      creatorAccessToken: CREATOR_TOKEN,
      nowMs: CREATED_AT_MS + 3,
    });
    expect(held.status).toBe("reserved");
    if (held.status !== "reserved") throw new Error("Expected reservation.");
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: CREATOR_TOKEN,
        authority: context.authority,
        decision: { action: "approve" },
        nowMs: CREATED_AT_MS + 3,
      }),
      "draft_busy",
    );
    expect(
      releaseWorldNarrationDraftDecision({
        draftId: context.authority.draftId,
        decisionReservationId: held.draft.decisionReservationId,
      }),
    ).toBe(true);
    const rejected = await finalizeWorldNarrationCreatorDecision({
      creatorAccessToken: CREATOR_TOKEN,
      authority: context.authority,
      decision: { action: "reject" },
      nowMs: CREATED_AT_MS + 4,
    });
    expect(rejected.status).toBe("rejected");
  });

  it("does not consume wrong-capability or tampered attempts, but expires exactly once", async () => {
    const context = await pendingContext();
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: "wrong-capability",
        authority: context.authority,
        decision: { action: "approve" },
        nowMs: CREATED_AT_MS + 3,
      }),
      "creator_unauthorized",
    );
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: CREATOR_TOKEN,
        authority: { ...context.authority, modelOutputHash: "0".repeat(64) },
        decision: { action: "approve" },
        nowMs: CREATED_AT_MS + 4,
      }),
      "authority_mismatch",
    );
    const reservation = reserveWorldNarrationDraftDecision({
      authority: context.authority,
      creatorAccessToken: CREATOR_TOKEN,
      nowMs: CREATED_AT_MS + 5,
    });
    expect(reservation.status).toBe("reserved");
    if (reservation.status !== "reserved") throw new Error("Expected reservation.");
    releaseWorldNarrationDraftDecision({
      draftId: context.authority.draftId,
      decisionReservationId: reservation.draft.decisionReservationId,
    });
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: CREATOR_TOKEN,
        authority: context.authority,
        decision: { action: "approve" },
        nowMs: context.pendingReceipt.expiresAtMs,
      }),
      "draft_expired",
    );
    await expectDecisionError(
      finalizeWorldNarrationCreatorDecision({
        creatorAccessToken: CREATOR_TOKEN,
        authority: context.authority,
        decision: { action: "approve" },
        nowMs: context.pendingReceipt.expiresAtMs + 1,
      }),
      "draft_consumed",
    );
    expect(
      loadWorldSessionCheckpoint(
        BASE_CHECKPOINT_ID,
        context.pendingReceipt.expiresAtMs + 1,
      )?.session.state.stateHash,
    ).toBe(context.baseCheckpoint.session.state.stateHash);
  });
});

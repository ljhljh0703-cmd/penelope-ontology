import { z } from "zod";
import {
  runWorldNarrationPipeline,
  type WorldNarrationPipelineResult,
} from "@/src/application/world-narration-pipeline";
import {
  commitWorldNarrationDraftDecision,
  releaseWorldNarrationDraftDecision,
  releaseWorldSessionTurn,
  reserveWorldNarrationDraftDecision,
  reserveWorldSessionTurn,
  type WorldNarrationDraftDecisionAuthority,
  type WorldNarrationHumanDecisionReceipt,
  type WorldNarrationHumanDecisionReceiptPayload,
} from "@/src/application/world-session-store";
import {
  WorldNarrationDraftAuthoritySchema,
  WorldNarrationDraftDecisionSchema,
  type WorldNarrationDraftDecision,
} from "@/src/contracts/world-api";
import {
  ModelNarrationOutputSchema,
  type ModelNarrationOutput,
  type NarrationRendererTrace,
} from "@/src/contracts/world-narrator";
import type {
  WorldSimulationSession,
  WorldTurnReceipt,
} from "@/src/contracts/world-runtime";
import { sha256Canonical } from "@/src/domain/canonical-json";
import type { NarrationRenderer } from "@/src/ports/world-narrator";

export const WorldNarrationCreatorDecisionSchema =
  WorldNarrationDraftDecisionSchema;

export type WorldNarrationCreatorDecision = WorldNarrationDraftDecision;

export type WorldNarrationCreatorDecisionInput = {
  creatorAccessToken: string;
  authority: WorldNarrationDraftDecisionAuthority;
  decision: WorldNarrationCreatorDecision;
  nowMs?: number;
};

export type WorldNarrationCreatorDecisionErrorCode =
  | "invalid_input"
  | "creator_unauthorized"
  | "draft_not_found"
  | "draft_expired"
  | "draft_consumed"
  | "draft_busy"
  | "authority_mismatch"
  | "base_stale"
  | "validation_failed";

export class WorldNarrationCreatorDecisionError extends Error {
  constructor(
    readonly code: WorldNarrationCreatorDecisionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorldNarrationCreatorDecisionError";
  }
}

export type ApprovedWorldNarrationCreatorDecision = {
  status: "approved";
  committableSession: WorldSimulationSession;
  committableReceipt: WorldTurnReceipt;
  modelOutput: ModelNarrationOutput;
  trace: NarrationRendererTrace;
  decisionReceipt: WorldNarrationHumanDecisionReceipt;
  pipeline: WorldNarrationPipelineResult;
  baseReservationHeld: true;
  draftDecisionReservationId: string;
  draftReservationHeld: true;
};

export type RejectedWorldNarrationCreatorDecision = {
  status: "rejected";
  committableSession: null;
  committableReceipt: null;
  modelOutput: null;
  trace: null;
  decisionReceipt: WorldNarrationHumanDecisionReceipt;
  pipeline: null;
  baseReservationHeld: false;
  draftDecisionReservationId: null;
  draftReservationHeld: false;
};

export type WorldNarrationCreatorDecisionResult =
  | ApprovedWorldNarrationCreatorDecision
  | RejectedWorldNarrationCreatorDecision;

const fail = (
  code: WorldNarrationCreatorDecisionErrorCode,
  message: string,
): never => {
  throw new WorldNarrationCreatorDecisionError(code, message);
};

const decisionReceipt = (
  payload: WorldNarrationHumanDecisionReceiptPayload,
): WorldNarrationHumanDecisionReceipt => ({
  ...payload,
  receiptHash: sha256Canonical(payload),
});

const outputWithEditedParagraphs = ({
  original,
  decision,
}: {
  original: ModelNarrationOutput;
  decision: Extract<WorldNarrationCreatorDecision, { action: "edit" }>;
}): ModelNarrationOutput => {
  const originalParagraphs = original.readerProse.paragraphs;
  if (
    decision.paragraphs.length !== originalParagraphs.length ||
    decision.paragraphs.some(
      ({ paragraphId }, index) =>
        paragraphId !== originalParagraphs[index]?.paragraphId,
    )
  ) {
    return fail(
      "invalid_input",
      "An edited decision must preserve every paragraph identifier and its order.",
    );
  }
  return ModelNarrationOutputSchema.parse({
    ...original,
    readerProse: {
      ...original.readerProse,
      paragraphs: originalParagraphs.map((paragraph, index) => ({
        ...paragraph,
        text: decision.paragraphs[index]!.text,
      })),
    },
  });
};

const mapDraftReservationFailure = (
  status: Exclude<
    ReturnType<typeof reserveWorldNarrationDraftDecision>["status"],
    "reserved"
  >,
): never => {
  switch (status) {
    case "missing":
      return fail("draft_not_found", "The narration draft is missing.");
    case "expired":
      return fail("draft_expired", "The narration draft has expired.");
    case "consumed":
      return fail("draft_consumed", "The narration draft was already decided.");
    case "busy":
      return fail("draft_busy", "The narration draft is already being decided.");
    case "unauthorized":
      return fail(
        "creator_unauthorized",
        "The creator capability does not authorize this narration draft.",
      );
    case "tampered":
      return fail(
        "authority_mismatch",
        "The narration decision does not bind the exact pending draft.",
      );
    case "stale":
      return fail(
        "base_stale",
        "The narration draft no longer has its exact base checkpoint authority.",
      );
  }
};

const sortedCreatorReviewRuleIds = (
  pipeline: WorldNarrationPipelineResult,
): string[] => [
  ...new Set(
    pipeline.validation?.findings
      .filter(({ severity }) => severity === "creator_review")
      .map(({ ruleId }) => ruleId) ?? [],
  ),
].sort((left, right) => left.localeCompare(right));

/**
 * Recomputes a one-use creator decision without storing a checkpoint. The
 * caller owns the successful checkpoint save and releases the held base turn.
 */
export const finalizeWorldNarrationCreatorDecision = async ({
  creatorAccessToken: creatorAccessTokenInput,
  authority: authorityInput,
  decision: decisionInput,
  nowMs = Date.now(),
}: WorldNarrationCreatorDecisionInput): Promise<WorldNarrationCreatorDecisionResult> => {
  const creatorAccessToken = z.string().min(1).safeParse(creatorAccessTokenInput);
  const authority = WorldNarrationDraftAuthoritySchema.safeParse(authorityInput);
  const decision = WorldNarrationCreatorDecisionSchema.safeParse(decisionInput);
  if (!creatorAccessToken.success || !authority.success || !decision.success) {
    return fail("invalid_input", "The creator decision failed schema validation.");
  }
  if (
    decision.data.action === "edit" &&
    (new Set(
      decision.data.paragraphs.map(({ paragraphId }) => paragraphId),
    ).size !== decision.data.paragraphs.length ||
      decision.data.paragraphs.some(({ text }) => text.trim().length === 0) ||
      decision.data.paragraphs
        .map(({ text }) => text)
        .join("\n\n").length > 12_000)
  ) {
    return fail(
      "invalid_input",
      "Edited narration must use unique paragraph IDs, visible text, and the public prose budget.",
    );
  }

  const reservedDraft = reserveWorldNarrationDraftDecision({
    authority: authority.data,
    creatorAccessToken: creatorAccessToken.data,
    nowMs,
  });
  if (reservedDraft.status !== "reserved") {
    return mapDraftReservationFailure(reservedDraft.status);
  }
  const draft = reservedDraft.draft;

  if (decision.data.action === "reject") {
    if (
      !commitWorldNarrationDraftDecision({
        draftId: draft.draftId,
        decisionReservationId: draft.decisionReservationId,
      })
    ) {
      return fail(
        "authority_mismatch",
        "The narration draft decision reservation could not be committed.",
      );
    }
    return {
      status: "rejected",
      committableSession: null,
      committableReceipt: null,
      modelOutput: null,
      trace: null,
      decisionReceipt: decisionReceipt({
        receiptId: `receipt.creator_review.${draft.draftId}`,
        decision: "reject",
        draftId: draft.draftId,
        draftHash: draft.draftHash,
        baseCheckpointId: draft.baseCheckpointId,
        baseStateHash: draft.baseStateHash,
        candidateStateHash: draft.candidateStateHash,
        candidateReceiptHash: draft.receiptHash,
        originalModelOutputHash: draft.modelOutputHash,
        approvedModelOutputHash: null,
        originalCreatorReviewRuleIds: [...draft.creatorReviewRuleIds],
        satisfiedCreatorReviewRuleIds: [],
        decidedAtMs: nowMs,
      }),
      pipeline: null,
      baseReservationHeld: false,
      draftDecisionReservationId: null,
      draftReservationHeld: false,
    };
  }

  const baseReservation = reserveWorldSessionTurn({
    sessionId: draft.baseCheckpointId,
    expectedStateHash: draft.baseStateHash,
    forkBeforeAction: draft.forkBeforeAction,
    narrationDecisionReservation: {
      draftId: draft.draftId,
      decisionReservationId: draft.decisionReservationId,
    },
    nowMs,
  });
  if (baseReservation.status !== "reserved") {
    releaseWorldNarrationDraftDecision({
      draftId: draft.draftId,
      decisionReservationId: draft.decisionReservationId,
    });
    if (baseReservation.status === "busy") {
      return fail("draft_busy", "The base checkpoint is resolving another turn.");
    }
    return fail(
      "base_stale",
      "The base checkpoint cannot authorize this narration decision.",
    );
  }

  try {
    const approvedOutput =
      decision.data.action === "edit"
        ? outputWithEditedParagraphs({
            original: draft.modelOutput,
            decision: decision.data,
          })
        : ModelNarrationOutputSchema.parse(draft.modelOutput);
    const capturedRenderer: NarrationRenderer = {
      async render() {
        return {
          outcome: "completed",
          modelOutput: approvedOutput,
          trace: draft.trace,
        };
      },
    };
    const pipeline = await runWorldNarrationPipeline({
      artifacts: draft.artifacts,
      renderer: capturedRenderer,
      critic: null,
    });
    const hardFindings =
      pipeline.validation?.findings.filter(
        ({ severity }) => severity === "hard_fail",
      ) ?? [];
    if (
      !pipeline.validation ||
      !pipeline.validation.hardPass ||
      hardFindings.length > 0 ||
      (pipeline.disposition !== "accepted" &&
        pipeline.disposition !== "creator_review") ||
      !pipeline.modelOutput ||
      !pipeline.trace ||
      sha256Canonical(pipeline.modelOutput) !== sha256Canonical(approvedOutput) ||
      sha256Canonical(pipeline.trace) !== draft.traceHash
    ) {
      return fail(
        "validation_failed",
        "The approved narration did not survive deterministic revalidation.",
      );
    }

    const satisfiedCreatorReviewRuleIds = sortedCreatorReviewRuleIds(pipeline);
    const receipt = decisionReceipt({
      receiptId: `receipt.creator_review.${draft.draftId}`,
      decision: decision.data.action,
      draftId: draft.draftId,
      draftHash: draft.draftHash,
      baseCheckpointId: draft.baseCheckpointId,
      baseStateHash: draft.baseStateHash,
      candidateStateHash: draft.candidateStateHash,
      candidateReceiptHash: draft.receiptHash,
      originalModelOutputHash: draft.modelOutputHash,
      approvedModelOutputHash: sha256Canonical(pipeline.modelOutput),
      originalCreatorReviewRuleIds: [...draft.creatorReviewRuleIds],
      satisfiedCreatorReviewRuleIds,
      decidedAtMs: nowMs,
    });
    return {
      status: "approved",
      committableSession: draft.candidateSession,
      committableReceipt: draft.candidateReceipt,
      modelOutput: pipeline.modelOutput,
      trace: pipeline.trace,
      decisionReceipt: receipt,
      pipeline,
      baseReservationHeld: true,
      draftDecisionReservationId: draft.decisionReservationId,
      draftReservationHeld: true,
    };
  } catch (error) {
    releaseWorldSessionTurn({
      sessionId: draft.baseCheckpointId,
      commitMainlineAdvance: false,
    });
    releaseWorldNarrationDraftDecision({
      draftId: draft.draftId,
      decisionReservationId: draft.decisionReservationId,
    });
    if (error instanceof WorldNarrationCreatorDecisionError) throw error;
    return fail(
      "validation_failed",
      "The approved narration could not be revalidated.",
    );
  }
};

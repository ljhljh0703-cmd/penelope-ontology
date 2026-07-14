import { z } from "zod";
import { ModelOutcomeKindSchema } from "@/src/contracts/model-outcome";
import type { SanitizedLiveEvidence } from "@/src/evidence/sanitize-live-evidence";

export const LiveCaptureOutcomeSchema = z.enum([
  "persisted",
  "typed_failure",
  "run_threw",
  "invalid_live_result",
  "sanitization_failed",
  "raw_write_failed",
  "raw_target_conflict",
  "public_write_failed",
  "public_target_conflict",
  "canonical_rollback_failed",
]);

export const LiveCaptureAttemptReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("live_capture_attempt"),
    attemptId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    dispatchedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    requestedModel: z.string().regex(/^gpt-5\.6(?:$|-[A-Za-z0-9._-]+$)/),
    actualModel: z
      .string()
      .regex(/^gpt-5\.6(?:$|-[A-Za-z0-9._-]+$)/)
      .nullable(),
    modelOutcome: z.union([ModelOutcomeKindSchema, z.literal("not_returned")]),
    captureOutcome: LiveCaptureOutcomeSchema,
    errorCode: z.string().regex(/^[a-z0-9_]{1,80}$/).nullable(),
    responseIdSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    rawPersisted: z.boolean(),
    publicPersisted: z.boolean(),
  })
  .strict();

export type LiveCaptureAttemptReceipt = z.infer<
  typeof LiveCaptureAttemptReceiptSchema
>;
export type LiveCaptureOutcome = z.infer<typeof LiveCaptureOutcomeSchema>;

export const LiveCaptureRecoverySchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("live_capture_recovery"),
    attemptId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
    requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    requestedModel: z.string().regex(/^gpt-5\.6(?:$|-[A-Za-z0-9._-]+$)/),
    reservedAt: z.iso.datetime(),
    state: z.literal("dispatch_reserved"),
  })
  .strict();

export const assertCompletedLiveCaptureReceiptBinding = (
  receiptInput: unknown,
  liveEvidence: SanitizedLiveEvidence,
): LiveCaptureAttemptReceipt => {
  const receipt = LiveCaptureAttemptReceiptSchema.parse(receiptInput);
  const bound =
    receipt.requestSha256 === liveEvidence.authority.requestSha256 &&
    receipt.finishedAt === liveEvidence.capturedAt &&
    receipt.requestedModel === liveEvidence.requestedModel &&
    receipt.actualModel === liveEvidence.actualModel &&
    receipt.modelOutcome === "completed" &&
    receipt.captureOutcome === "persisted" &&
    receipt.errorCode === null &&
    receipt.responseIdSha256 === liveEvidence.responseIdSha256 &&
    receipt.inputTokens === liveEvidence.inputTokens &&
    receipt.outputTokens === liveEvidence.outputTokens &&
    receipt.rawPersisted === true &&
    receipt.publicPersisted === true;
  if (!bound) {
    throw new Error(
      "The live capture receipt is not bound to the completed sanitized evidence.",
    );
  }
  return receipt;
};

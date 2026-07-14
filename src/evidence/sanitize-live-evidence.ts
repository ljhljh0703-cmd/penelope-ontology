import { createHash } from "node:crypto";
import { z } from "zod";
import { sha256Canonical } from "@/src/domain/canonical-json";
import type { RunResult } from "@/src/contracts/run";

export const SanitizedLiveEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("live_sanitized"),
    capturedAt: z.iso.datetime(),
    requestedModel: z.string().min(1),
    actualModel: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    responseIdSha256: z.string().regex(/^[a-f0-9]{64}$/),
    runId: z.string().min(1),
    runStatus: z.enum(["passed", "blocked", "needs_creator_decision"]),
    hardViolationCodes: z.array(z.string().min(1)),
    draftDigest: z.string().regex(/^[a-f0-9]{64}$/),
    graphDigest: z.string().regex(/^[a-f0-9]{64}$/),
    currentStateHash: z.string().regex(/^[a-f0-9]{64}$/),
    proposedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
    rawResponsePersistedPublicly: z.literal(false),
  })
  .strict();

export type SanitizedLiveEvidence = z.infer<typeof SanitizedLiveEvidenceSchema>;

export const sanitizeLiveEvidence = (
  result: RunResult,
  capturedAt: string,
): SanitizedLiveEvidence => {
  if (
    result.modelOutcome.outcome !== "completed" ||
    result.modelOutcome.trace.mode !== "live" ||
    !result.modelOutcome.trace.responseId ||
    !result.modelOutcome.trace.actualModel ||
    result.modelOutcome.trace.inputTokens === null ||
    result.modelOutcome.trace.outputTokens === null ||
    result.status === "refused" ||
    result.status === "error"
  ) {
    throw new Error("Only a completed live run can become sanitized live evidence.");
  }
  const trace = result.modelOutcome.trace;
  return SanitizedLiveEvidenceSchema.parse({
    schemaVersion: 1,
    evidenceType: "live_sanitized",
    capturedAt,
    requestedModel: trace.requestedModel,
    actualModel: trace.actualModel,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    responseIdSha256: createHash("sha256").update(trace.responseId).digest("hex"),
    runId: result.runId,
    runStatus: result.status,
    hardViolationCodes: result.hardViolations.map(({ code }) => code),
    draftDigest: sha256Canonical(result.modelOutcome.draft),
    graphDigest: sha256Canonical(result.graph),
    currentStateHash: result.currentSnapshot.stateHash,
    proposedStateHash: result.proposedNextSnapshot.stateHash,
    rawResponsePersistedPublicly: false,
  });
};

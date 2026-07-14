import { createHash } from "node:crypto";
import { z } from "zod";
import { sha256Canonical } from "@/src/domain/canonical-json";
import type { RunRequest, RunResult } from "@/src/contracts/run";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

export const SanitizedLiveEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("live_sanitized"),
    capturedAt: z.iso.datetime(),
    authority: z
      .object({
        worldPackId: z.string().min(1),
        worldPackVersion: z.string().min(1),
        worldPackSha256: z.string().regex(/^[a-f0-9]{64}$/),
        styleProfileId: z.string().min(1),
        overlayId: z.string().min(1),
        overlayVersion: z.number().int().nonnegative(),
        overlayHash: z.string().regex(/^[a-f0-9]{64}$/),
        scenarioId: z.string().min(1),
        baseStateId: z.string().min(1),
        requestSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    requestedModel: z.string().regex(/^gpt-5\.6(?:$|-)/),
    actualModel: z.string().regex(/^gpt-5\.6(?:$|-)/),
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

export const buildLiveEvidenceAuthority = ({
  worldPackId,
  worldPackSha256,
  request,
}: {
  worldPackId: string;
  worldPackSha256: string;
  request: LiveRunRequest;
}): SanitizedLiveEvidence["authority"] => ({
  worldPackId,
  worldPackVersion: request.overlay.worldPackVersion,
  worldPackSha256,
  styleProfileId: request.styleProfileId,
  overlayId: request.overlay.id,
  overlayVersion: request.overlay.version,
  overlayHash: request.overlay.hash,
  scenarioId: request.snapshot.scenarioId,
  baseStateId: request.snapshot.baseStateId,
  requestSha256: sha256Canonical(request),
});

export const sanitizeLiveEvidence = (
  result: RunResult,
  capturedAt: string,
  authority: {
    worldPackId: string;
    worldPackSha256: string;
    request: LiveRunRequest;
  },
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
  const { request } = authority;
  if (
    request.snapshot.stateHash !== result.currentSnapshot.stateHash ||
    request.overlay.hash !== result.currentSnapshot.canonHash ||
    request.styleProfileId !== result.currentSnapshot.styleProfileId
  ) {
    throw new Error("Live evidence authority does not match the completed run.");
  }
  const expectedRunId = `run.${sha256Canonical({ request, modelOutcome: result.modelOutcome }).slice(0, 20)}`;
  if (result.runId !== expectedRunId) {
    throw new Error("Live evidence request digest does not match the completed run.");
  }
  const trace = result.modelOutcome.trace;
  return SanitizedLiveEvidenceSchema.parse({
    schemaVersion: 1,
    evidenceType: "live_sanitized",
    capturedAt,
    authority: buildLiveEvidenceAuthority(authority),
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

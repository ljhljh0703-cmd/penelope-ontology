import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { sha256Canonical } from "@/src/domain/canonical-json";
import type { SanitizedLiveEvidence } from "@/src/evidence/sanitize-live-evidence";
import { isLiveEvidenceBundleVerified } from "@/src/evidence/live-evidence-verifier";
import { hasLiveReadinessShape } from "@/src/evidence/live-readiness";

describe("health evidence status", () => {
  it("requires a bound sanitized result and receipt, not a readiness shape alone", () => {
    const hash = "a".repeat(64);
    const authority: SanitizedLiveEvidence["authority"] = {
      worldPackId: "pack.demo",
      worldPackVersion: "0.2.0",
      worldPackSha256: hash,
      styleProfileId: "style.demo",
      overlayId: "overlay.demo",
      overlayVersion: 0,
      overlayHash: hash,
      scenarioId: "scenario.demo",
      baseStateId: "state.demo",
      requestSha256: hash,
    };
    const sanitized: SanitizedLiveEvidence = {
      schemaVersion: 1,
      evidenceType: "live_sanitized",
      capturedAt: "2026-07-15T00:00:01.000Z",
      authority,
      requestedModel: "gpt-5.6",
      actualModel: "gpt-5.6-2026-07-01",
      inputTokens: 10,
      outputTokens: 8,
      responseIdSha256: hash,
      runId: `run.${"a".repeat(20)}`,
      runStatus: "passed",
      hardViolationCodes: [],
      draftDigest: hash,
      graphDigest: hash,
      currentStateHash: hash,
      proposedStateHash: hash,
      rawResponsePersistedPublicly: false,
    };
    const receipt = {
      schemaVersion: 1,
      evidenceType: "live_capture_attempt",
      attemptId: "attempt.demo",
      requestSha256: hash,
      dispatchedAt: "2026-07-15T00:00:00.000Z",
      finishedAt: sanitized.capturedAt,
      requestedModel: sanitized.requestedModel,
      actualModel: sanitized.actualModel,
      modelOutcome: "completed",
      captureOutcome: "persisted",
      errorCode: null,
      retryable: null,
      responseIdSha256: sanitized.responseIdSha256,
      sanitizedEvidenceSha256: sha256Canonical(sanitized),
      inputTokens: sanitized.inputTokens,
      outputTokens: sanitized.outputTokens,
      rawPersisted: true,
      publicPersisted: true,
    } as const;
    const receiptSource = `${JSON.stringify(receipt)}\n`;
    const readiness = {
      evidenceType: "live_readiness",
      status: "verified",
      sanitizedEvidencePath: "artifacts/evidence/live-sanitized.json",
      requestedModel: sanitized.requestedModel,
      actualModel: sanitized.actualModel,
      authorityBindingVerified: true,
      captureReceiptPath: "artifacts/evidence/live-capture-receipt.json",
      captureReceiptSha256: createHash("sha256").update(receiptSource).digest("hex"),
      captureBindingVerified: true,
      worldPackSha256: authority.worldPackSha256,
      requestSha256: authority.requestSha256,
      rawResponsePersistedPublicly: false,
    } as const;

    expect(hasLiveReadinessShape(readiness)).toBe(true);
    expect(
      isLiveEvidenceBundleVerified({
        readiness,
        sanitized,
        receipt,
        receiptSource,
        expectedAuthority: authority,
        expectedCurrentStateHash: hash,
        now: Date.parse("2026-07-16T00:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isLiveEvidenceBundleVerified({
        readiness,
        sanitized: { status: "fabricated" },
        receipt: {},
        receiptSource: "{}",
        expectedAuthority: authority,
        expectedCurrentStateHash: hash,
        now: Date.parse("2026-07-16T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("reports the current not-executed repository as unverified", async () => {
    const response = GET();
    const body = await response.json();
    expect(body.liveEvidenceReadinessRecorded).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

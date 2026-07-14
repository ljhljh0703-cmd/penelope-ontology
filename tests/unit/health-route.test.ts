import { describe, expect, it } from "vitest";
import { GET, isLiveEvidenceVerified } from "@/app/api/health/route";
import liveReadiness from "@/artifacts/evidence/live-readiness.json";

describe("health evidence status", () => {
  it("derives live verification from the generated readiness artifact", async () => {
    const verified = {
      evidenceType: "live_readiness",
      status: "verified",
      sanitizedEvidencePath: "artifacts/evidence/live-sanitized.json",
      requestedModel: "gpt-5.6",
      actualModel: "gpt-5.6-2026-07-01",
      authorityBindingVerified: true,
      captureReceiptPath: "artifacts/evidence/live-capture-receipt.json",
      captureReceiptSha256: "c".repeat(64),
      captureBindingVerified: true,
      worldPackSha256: "a".repeat(64),
      requestSha256: "b".repeat(64),
      rawResponsePersistedPublicly: false,
    };
    expect(isLiveEvidenceVerified(verified)).toBe(true);
    expect(isLiveEvidenceVerified({ status: "verified" })).toBe(false);
    expect(isLiveEvidenceVerified({ ...verified, authorityBindingVerified: false })).toBe(false);
    expect(isLiveEvidenceVerified({ ...verified, captureBindingVerified: false })).toBe(false);
    expect(isLiveEvidenceVerified({ ...verified, rawResponsePersistedPublicly: true })).toBe(false);
    expect(isLiveEvidenceVerified({ ...verified, actualModel: "gpt-4.1" })).toBe(false);
    expect(isLiveEvidenceVerified({ status: "not_executed" })).toBe(false);
    expect(isLiveEvidenceVerified(null)).toBe(false);

    const response = GET();
    const body = await response.json();
    expect(body.liveEvidenceVerified).toBe(isLiveEvidenceVerified(liveReadiness));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

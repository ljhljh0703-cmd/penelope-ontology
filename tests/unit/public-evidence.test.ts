import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertLiveEvidenceAuthorityBinding,
  buildPreservedEvidenceManifestEntry,
} from "@/scripts/generate-evidence";
import { SanitizedLiveEvidenceSchema } from "@/src/evidence/sanitize-live-evidence";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { buildPublicEvidence } from "@/src/evidence/build-public-evidence";
import { StyleAblationPlanSchema } from "@/src/evaluation/style-ablation-contracts";

describe("sanitized public evidence", () => {
  it("captures the complete fixture flow without overstating live evidence", async () => {
    const evidence = await buildPublicEvidence();
    expect(evidence.fixtureReplay.allPassed).toBe(true);
    expect(evidence.fixtureReplay.caseCount).toBe(5);
    expect(evidence.fixtureReplay.stageCount).toBe(8);
    expect(evidence.fixtureReplay.approvedOverlayRegression).toMatchObject({
      allPassed: true,
      caseCount: 4,
      overlayHash: evidence.simulation.creatorDecision.overlayHash,
    });
    const { digest, ...approvedOverlayPayload } =
      evidence.fixtureReplay.approvedOverlayRegression;
    expect(digest).toBe(sha256Canonical(approvedOverlayPayload));
    expect(evidence.simulation.transitions).toHaveLength(2);
    expect(evidence.simulation.transitions.every(({ status }) => status === "applied")).toBe(true);
    expect(evidence.simulation.finalTurnIndex).toBe(2);
    expect(evidence.simulation.thirdStep).toMatchObject({
      status: "blocked",
      stateHashUnchanged: true,
    });
    expect(evidence.liveReadiness.status).toBe("not_executed");
    expect(evidence.styleHarness.claimBoundary).toContain("model-vendor comparison");
    expect(evidence.graph.edgeStatuses.proposed).toBeGreaterThan(0);
    expect(evidence.graph.approvedEdgeStatuses.proposed ?? 0).toBe(0);
    expect(evidence.graph.approvedNodeVisualStates.approved_overlay).toBeGreaterThan(0);
    expect(evidence.graph.conflictEdgeStatuses.blocked).toBeGreaterThan(0);
  });

  it("contains no local path, API key, or external feedback-session identity", async () => {
    const serialized = JSON.stringify(await buildPublicEvidence());
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(serialized).not.toMatch(/feedback.{0,20}[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  });

  it("hashes preserved style artifacts from their exact bytes", () => {
    const exactSource = "{\n  \"evaluationId\": \"style-ablation.penelope.v1\"\n}\n";
    const entry = buildPreservedEvidenceManifestEntry(
      "artifacts/evidence/style-ablation-capture-receipt.json",
      exactSource,
    );
    expect(entry).toEqual({
      path: "artifacts/evidence/style-ablation-capture-receipt.json",
      sha256: createHash("sha256").update(exactSource).digest("hex"),
      bytes: Buffer.byteLength(exactSource),
    });
    expect(entry.sha256).not.toBe(
      createHash("sha256").update(exactSource.trim()).digest("hex"),
    );
  });

  it("publishes the exact current plan digest and capture-receipt status", () => {
    const plan = StyleAblationPlanSchema.parse(
      JSON.parse(readFileSync(resolve("data/evals/style-ablation-plan.json"), "utf8")),
    );
    const readiness = JSON.parse(
      readFileSync(resolve("artifacts/evidence/style-ablation-readiness.json"), "utf8"),
    ) as { planSha256: string; receiptStatus: string; design: { maxOutputTokens: number } };
    expect(readiness.planSha256).toBe(sha256Canonical(plan));
    expect(readiness.receiptStatus).toBe("not_present");
    expect(readiness.design.maxOutputTokens).toBe(4096);
  });

  it("rejects a sanitized live receipt when its current authority changes", () => {
    const hash = "a".repeat(64);
    const authority = {
      worldPackId: "pack.demo",
      worldPackVersion: "0.2.0",
      worldPackSha256: hash,
      styleProfileId: "style.demo",
      overlayId: "creator_canon",
      overlayVersion: 0,
      overlayHash: hash,
      scenarioId: "scenario.demo",
      baseStateId: "state.demo",
      requestSha256: hash,
    };
    const evidence = SanitizedLiveEvidenceSchema.parse({
      schemaVersion: 1,
      evidenceType: "live_sanitized",
      capturedAt: "2026-07-15T00:00:00.000Z",
      authority,
      requestedModel: "gpt-5.6",
      actualModel: "gpt-5.6-sol",
      inputTokens: 10,
      outputTokens: 10,
      responseIdSha256: hash,
      runId: "run.demo",
      runStatus: "passed",
      hardViolationCodes: [],
      draftDigest: hash,
      graphDigest: hash,
      currentStateHash: hash,
      proposedStateHash: hash,
      rawResponsePersistedPublicly: false,
    });

    expect(() => assertLiveEvidenceAuthorityBinding(evidence, authority)).not.toThrow();
    expect(() =>
      assertLiveEvidenceAuthorityBinding(evidence, {
        ...authority,
        worldPackSha256: "b".repeat(64),
      }),
    ).toThrow("live evidence is stale");
  });
});

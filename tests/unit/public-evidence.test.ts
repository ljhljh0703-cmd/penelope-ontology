import { describe, expect, it } from "vitest";
import { buildPublicEvidence } from "@/src/evidence/build-public-evidence";

describe("sanitized public evidence", () => {
  it("captures the complete fixture flow without overstating live evidence", async () => {
    const evidence = await buildPublicEvidence();
    expect(evidence.fixtureReplay.allPassed).toBe(true);
    expect(evidence.fixtureReplay.caseCount).toBe(5);
    expect(evidence.fixtureReplay.stageCount).toBe(8);
    expect(evidence.simulation.transitions).toHaveLength(2);
    expect(evidence.simulation.transitions.every(({ status }) => status === "applied")).toBe(true);
    expect(evidence.simulation.finalTurnIndex).toBe(2);
    expect(evidence.simulation.thirdStep).toMatchObject({
      status: "blocked",
      stateHashUnchanged: true,
    });
    expect(evidence.liveReadiness.status).toBe("not_executed");
    expect(evidence.styleHarness.claimBoundary).toContain("not a model-vendor");
  });

  it("contains no local path, API key, or external feedback-session identity", async () => {
    const serialized = JSON.stringify(await buildPublicEvidence());
    expect(serialized).not.toMatch(/\/Users\//);
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(serialized).not.toMatch(/feedback.{0,20}[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  });
});

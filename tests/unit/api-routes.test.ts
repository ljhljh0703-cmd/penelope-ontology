import { describe, expect, it } from "vitest";
import { GET as getDemo } from "@/app/api/demo/route";
import { POST as postDecision } from "@/app/api/decisions/route";
import { POST as postRun } from "@/app/api/runs/route";
import { POST as postTransition } from "@/app/api/transitions/route";

const jsonRequest = (url: string, body: unknown): Request =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("fixture API vertical slice", () => {
  it("bootstraps, proposes, accepts, rebases, and applies exactly two steps", async () => {
    const demoResponse = await getDemo();
    expect(demoResponse.status).toBe(200);
    const demo = await demoResponse.json();
    expect(demo.mode).toBe("fixture");
    expect(demo.replayResults.every(({ status }: { status: string }) => status === "pass")).toBe(true);

    const participantIntents = demo.participantSlots.map(
      (slot: {
        intentId: string;
        participantId: string;
        controlledEntityId: string;
        defaultIntent: string;
      }) => ({
        intentId: slot.intentId,
        participantId: slot.participantId,
        controlledEntityIds: [slot.controlledEntityId],
        intent: slot.defaultIntent,
      }),
    );
    const runResponse = await postRun(
      jsonRequest("http://local.test/api/runs", {
        modelMode: "fixture",
        draftFixtureId: "draft.red_sail_proposal",
        overlay: demo.overlay,
        snapshot: demo.snapshot,
        styleProfileId: demo.selectedStyleProfileId,
        taskType: "expand",
        brief: "Propose a red-sail signal without treating it as canon.",
        participantIntents,
      }),
    );
    expect(runResponse.status).toBe(200);
    const run = await runResponse.json();
    expect(run.status).toBe("needs_creator_decision");
    expect(run.proposals).toHaveLength(1);
    const proposal = run.proposals[0];

    const decisionResponse = await postDecision(
      jsonRequest("http://local.test/api/decisions", {
        overlay: demo.overlay,
        snapshot: demo.snapshot,
        proposal,
        decision: {
          action: "accept",
          proposalId: proposal.id,
          proposalHash: proposal.proposalHash,
          baseOverlayId: proposal.baseOverlayId,
          baseOverlayVersion: proposal.baseOverlayVersion,
          baseOverlayHash: proposal.baseOverlayHash,
        },
      }),
    );
    expect(decisionResponse.status).toBe(200);
    const decision = await decisionResponse.json();
    expect(decision.status).toBe("applied");
    expect(decision.overlay.version).toBe(1);
    expect(decision.snapshot.turnIndex).toBe(0);
    expect(decision.snapshot.canonHash).toBe(decision.overlay.hash);

    const step1Response = await postTransition(
      jsonRequest("http://local.test/api/transitions", {
        overlay: decision.overlay,
        snapshot: decision.snapshot,
        step: 1,
        participantIntents,
      }),
    );
    expect(step1Response.status).toBe(200);
    const step1 = await step1Response.json();
    expect(step1.status).toBe("applied");
    expect(step1.snapshot.turnIndex).toBe(1);
    expect(step1.snapshot.variables).toContainEqual({ id: "harbor_watch", value: "watching" });

    const step2Response = await postTransition(
      jsonRequest("http://local.test/api/transitions", {
        overlay: decision.overlay,
        snapshot: step1.snapshot,
        step: 2,
        participantIntents,
      }),
    );
    expect(step2Response.status).toBe(200);
    const step2 = await step2Response.json();
    expect(step2.status).toBe("applied");
    expect(step2.snapshot.turnIndex).toBe(2);
    expect(step2.snapshot.variables).toContainEqual({ id: "harbor_watch", value: "signal_seen" });

    const thirdResponse = await postTransition(
      jsonRequest("http://local.test/api/transitions", {
        overlay: decision.overlay,
        snapshot: step2.snapshot,
        step: 2,
        participantIntents,
      }),
    );
    expect(thirdResponse.status).toBe(409);
  });
});

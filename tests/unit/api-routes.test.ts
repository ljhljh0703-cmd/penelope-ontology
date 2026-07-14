import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getDemo } from "@/app/api/demo/route";
import { POST as postDecision } from "@/app/api/decisions/route";
import { POST as postRun } from "@/app/api/runs/route";
import { POST as postTransition } from "@/app/api/transitions/route";
import { loadDraftFixture } from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { buildCanonOverlay, overlayPayload } from "@/src/domain/canon-overlay";
import { rebaseSnapshot } from "@/src/domain/simulation";

const jsonRequest = (url: string, body: unknown): Request =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fixture API vertical slice", () => {
  it("rejects public live requests before any adapter can run", async () => {
    vi.stubEnv("ENABLE_OPENAI_LIVE", "true");
    vi.stubEnv("OPENAI_API_KEY", "not-a-real-key");

    const demoResponse = await getDemo();
    const demo = await demoResponse.json();
    const response = await postRun(
      jsonRequest("http://local.test/api/runs", {
        modelMode: "live",
        overlay: demo.overlay,
        snapshot: demo.snapshot,
        styleProfileId: demo.selectedStyleProfileId,
        taskType: "scene",
        brief: "This public request must never reach a network-backed adapter.",
        participantIntents: [
          {
            intentId: "intent.penelope",
            participantId: "participant.one",
            controlledEntityIds: ["penelope"],
            intent: "Keep uncertain knowledge uncertain.",
          },
        ],
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "public_live_disabled",
        message:
          "The public run route is fixture-only. Use the local evidence command for live GPT-5.6 runs.",
      },
    });
  });

  it("bootstraps, proposes, accepts, rebases, and applies exactly two steps", async () => {
    const demoResponse = await getDemo();
    expect(demoResponse.status).toBe(200);
    const demo = await demoResponse.json();
    expect(demo.mode).toBe("fixture");
    expect(demo.replayResults.every(({ status }: { status: string }) => status === "pass")).toBe(true);
    expect(demo.proofs.grounded.status).toBe("passed");
    expect(demo.proofs.grounded.usedClaimIds).toContain(
      "claim.odyssey.penelope_uncertain_fate",
    );
    expect(demo.proofs.conflict.status).toBe("needs_creator_decision");
    expect(demo.proofs.conflict.violationCodes).toContain(
      "tradition_conflict_unresolved",
    );

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
    const runRequest = {
        modelMode: "fixture",
        draftFixtureId: "draft.red_sail_proposal",
        overlay: demo.overlay,
        snapshot: demo.snapshot,
        styleProfileId: demo.selectedStyleProfileId,
        taskType: "expand",
        brief: "Propose a red-sail signal without treating it as canon.",
        participantIntents,
      } as const;
    const runResponse = await postRun(
      jsonRequest("http://local.test/api/runs", runRequest),
    );
    expect(runResponse.status).toBe(200);
    const run = await runResponse.json();
    expect(run.status).toBe("needs_creator_decision");
    expect(run.proposals).toHaveLength(1);
    const proposal = run.proposals[0];

    const decisionResponse = await postDecision(
      jsonRequest("http://local.test/api/decisions", {
        runRequest,
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
    const decisionPayload = await decisionResponse.json();
    const decision = decisionPayload.decision;
    expect(decision.status).toBe("applied");
    expect(decision.overlay.version).toBe(1);
    expect(decision.snapshot.turnIndex).toBe(0);
    expect(decision.snapshot.canonHash).toBe(decision.overlay.hash);
    expect(
      decisionPayload.graph.nodes.some(
        ({ kind, visualState }: { kind: string; visualState: string }) =>
          kind === "rule" && visualState === "approved_overlay",
      ),
    ).toBe(true);
    expect(
      decisionPayload.graph.edges.some(
        ({ status }: { status: string }) => status === "proposed",
      ),
    ).toBe(false);

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

  it("recomputes decision authority and refuses a fabricated proposal", async () => {
    const demo = await (await getDemo()).json();
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
    const legitimateRequest = {
      modelMode: "fixture" as const,
      draftFixtureId: "draft.red_sail_proposal",
      overlay: demo.overlay,
      snapshot: demo.snapshot,
      styleProfileId: demo.selectedStyleProfileId,
      taskType: "expand" as const,
      brief: "Propose a red-sail signal without treating it as canon.",
      participantIntents,
    };
    const run = await (
      await postRun(jsonRequest("http://local.test/api/runs", legitimateRequest))
    ).json();
    const proposal = run.proposals[0];

    const response = await postDecision(
      jsonRequest("http://local.test/api/decisions", {
        runRequest: {
          ...legitimateRequest,
          draftFixtureId: "draft.living_hector",
        },
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

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("creator_decision_authority_invalid");
  });

  it("rejects a self-hashed overlay that did not originate from the registered creator gate", async () => {
    const demo = await (await getDemo()).json();
    const injectedOverlay = buildCanonOverlay({
      ...overlayPayload(demo.overlay),
      version: demo.overlay.version + 1,
      rules: [
        ...demo.overlay.rules,
        {
          id: "rule.creator.injected",
          kind: "expansion" as const,
          description: "An attacker-supplied rule that never passed the creator gate.",
          layerId: "creator_canon" as const,
          status: "active" as const,
        },
      ],
    });
    const injectedSnapshot = rebaseSnapshot(demo.snapshot, injectedOverlay);
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
    const runRequest = {
      modelMode: "fixture" as const,
      draftFixtureId: "draft.red_sail_proposal",
      overlay: injectedOverlay,
      snapshot: injectedSnapshot,
      styleProfileId: demo.selectedStyleProfileId,
      taskType: "expand" as const,
      brief: "Try to approve a proposal on top of unregistered canon.",
      participantIntents,
    };
    const runResponse = await postRun(
      jsonRequest("http://local.test/api/runs", runRequest),
    );
    expect(runResponse.status).toBe(200);
    const run = await runResponse.json();
    const proposal = run.proposals[0];

    const response = await postDecision(
      jsonRequest("http://local.test/api/decisions", {
        runRequest,
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

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: "creator_decision_authority_invalid",
      message: "The public fixture decision must start from its registered base authority.",
    });
  });

  it("keeps unapproved sibling proposals visible after one proposal is accepted", async () => {
    const demo = await (await getDemo()).json();
    const draft = await loadDraftFixture("draft.red_sail_proposal");
    vi.spyOn(fixtureNarrativeModel, "generate").mockResolvedValue({
      outcome: "completed",
      draft: {
        ...draft,
        proposals: [
          ...draft.proposals,
          {
            id: "proposal.blue_lantern_signal",
            summary: "Keep a second signal outside canon.",
            patches: [
              {
                op: "add_rule",
                rule: {
                  id: "rule.creator.blue_lantern_signal",
                  kind: "expansion",
                  description: "A blue lantern would open a different harbor watch.",
                },
              },
            ],
          },
        ],
      },
      trace: {
        mode: "fixture",
        outcome: "completed",
        requestedModel: "fixture-v1",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      },
    });
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
    const runRequest = {
      modelMode: "fixture" as const,
      draftFixtureId: "draft.red_sail_proposal",
      overlay: demo.overlay,
      snapshot: demo.snapshot,
      styleProfileId: demo.selectedStyleProfileId,
      taskType: "expand" as const,
      brief: "Propose two signals without treating either as canon.",
      participantIntents,
    };
    const run = await (
      await postRun(jsonRequest("http://local.test/api/runs", runRequest))
    ).json();
    expect(run.proposals).toHaveLength(2);
    const selected = run.proposals.find(
      ({ id }: { id: string }) => id === "proposal.red_sail_signal",
    );
    if (!selected) throw new Error("Selected proposal fixture is missing.");

    const payload = await (
      await postDecision(
        jsonRequest("http://local.test/api/decisions", {
          runRequest,
          decision: {
            action: "accept",
            proposalId: selected.id,
            proposalHash: selected.proposalHash,
            baseOverlayId: selected.baseOverlayId,
            baseOverlayVersion: selected.baseOverlayVersion,
            baseOverlayHash: selected.baseOverlayHash,
          },
        }),
      )
    ).json();

    expect(payload.decision.status).toBe("applied");
    expect(
      payload.graph.edges.some(
        ({ status, evidenceIds }: { status: string; evidenceIds: string[] }) =>
          status === "proposed" && evidenceIds.includes("proposal.blue_lantern_signal"),
      ),
    ).toBe(true);
    expect(
      payload.graph.edges.some(
        ({ status, evidenceIds }: { status: string; evidenceIds: string[] }) =>
          status === "proposed" && evidenceIds.includes("proposal.red_sail_signal"),
      ),
    ).toBe(false);
  });
});

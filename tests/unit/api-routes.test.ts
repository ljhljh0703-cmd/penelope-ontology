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

const registeredRunRequest = (demo: {
  overlay: unknown;
  snapshot: unknown;
  registeredRehearsal: {
    draftFixtureId: string;
    styleProfileId: string;
    taskType: string;
    brief: string;
    participantIntents: unknown[];
  };
}) => ({
  modelMode: "fixture" as const,
  draftFixtureId: demo.registeredRehearsal.draftFixtureId,
  overlay: demo.overlay,
  snapshot: demo.snapshot,
  styleProfileId: demo.registeredRehearsal.styleProfileId,
  taskType: demo.registeredRehearsal.taskType,
  brief: demo.registeredRehearsal.brief,
  participantIntents: demo.registeredRehearsal.participantIntents,
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
    expect(demo.registeredRehearsal).toMatchObject({
      replayCaseId: "replay.red_sail_proposal",
      stageId: "stage.red_sail_proposal",
      draftFixtureId: "draft.red_sail_proposal",
      styleProfileId: "style.table_ready_mythic",
      taskType: "expand",
      brief: "Propose a red-sail signal, but do not treat it as canon before approval.",
      frozen: true,
    });
    expect(demo.registeredRehearsal.participantIntents).toHaveLength(2);
    expect(demo.participantSlots).toEqual(
      demo.registeredRehearsal.participantIntents.map(
        (intent: {
          intentId: string;
          participantId: string;
          controlledEntityIds: string[];
          intent: string;
        }) => ({
          intentId: intent.intentId,
          participantId: intent.participantId,
          controlledEntityId: intent.controlledEntityIds[0],
          characterLabel: intent.controlledEntityIds[0] === "penelope" ? "Penelope" : "Telemachus",
          defaultIntent: intent.intent,
          frozen: true,
        }),
      ),
    );
    expect(demo.knowledgeBoundary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          perspectiveId: "narrator",
          evidenceId: "claim.odyssey.odysseus_at_ogygia",
          status: "visible",
        }),
        expect.objectContaining({
          perspectiveId: "penelope",
          evidenceId: "claim.odyssey.odysseus_at_ogygia",
          status: "withheld",
        }),
        expect.objectContaining({
          perspectiveId: "penelope",
          evidenceId: "claim.odyssey.penelope_uncertain_fate",
          status: "uncertain",
        }),
      ]),
    );

    const runRequest = {
        modelMode: "fixture",
        draftFixtureId: demo.registeredRehearsal.draftFixtureId,
        overlay: demo.overlay,
        snapshot: demo.snapshot,
        styleProfileId: demo.registeredRehearsal.styleProfileId,
        taskType: demo.registeredRehearsal.taskType,
        brief: demo.registeredRehearsal.brief,
        participantIntents: demo.registeredRehearsal.participantIntents,
      } as const;
    const runResponse = await postRun(
      jsonRequest("http://local.test/api/runs", runRequest),
    );
    expect(runResponse.status).toBe(200);
    const run = await runResponse.json();
    expect(run.status).toBe("needs_creator_decision");
    expect(run.proposals).toHaveLength(1);
    expect(run.modelOutcome.draft.utterances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          speakerId: "penelope",
          authorizingIntentId: "intent.penelope",
          contributingIntentIds: ["intent.telemachus"],
        }),
        expect.objectContaining({
          speakerId: "telemachus",
          authorizingIntentId: "intent.telemachus",
          contributingIntentIds: ["intent.penelope"],
        }),
      ]),
    );
    const proposal = run.proposals[0];

    const creatorDecision = {
      action: "accept" as const,
      proposalId: proposal.id,
      proposalHash: proposal.proposalHash,
      baseOverlayId: proposal.baseOverlayId,
      baseOverlayVersion: proposal.baseOverlayVersion,
      baseOverlayHash: proposal.baseOverlayHash,
    };
    const decisionResponse = await postDecision(
      jsonRequest("http://local.test/api/decisions", {
        runRequest,
        decision: creatorDecision,
      }),
    );
    expect(decisionResponse.status).toBe(200);
    const decisionPayload = await decisionResponse.json();
    const decision = decisionPayload.decision;
    expect(decision.status).toBe("applied");
    expect(decision.overlay.version).toBe(1);
    expect(decision.snapshot.turnIndex).toBe(0);
    expect(decision.snapshot.canonHash).toBe(decision.overlay.hash);
    expect(decisionPayload.overlayReplay).toMatchObject({
      suiteId: "approved_overlay_regression",
      overlayVersion: 1,
      overlayHash: decision.overlay.hash,
      allPassed: true,
    });
    expect(decisionPayload.overlayReplay.replayResults).toHaveLength(4);
    expect(
      decisionPayload.overlayReplay.replayResults.every(
        ({ status }: { status: string }) => status === "pass",
      ),
    ).toBe(true);
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
        runRequest,
        decision: creatorDecision,
        snapshot: decision.snapshot,
        step: 1,
      }),
    );
    expect(step1Response.status).toBe(200);
    const step1 = await step1Response.json();
    expect(step1.status).toBe("applied");
    expect(step1.snapshot.turnIndex).toBe(1);
    expect(step1.snapshot.variables).toContainEqual({ id: "harbor_watch", value: "watching" });

    const step2Response = await postTransition(
      jsonRequest("http://local.test/api/transitions", {
        runRequest,
        decision: creatorDecision,
        snapshot: step1.snapshot,
        step: 2,
      }),
    );
    expect(step2Response.status).toBe(200);
    const step2 = await step2Response.json();
    expect(step2.status).toBe("applied");
    expect(step2.snapshot.turnIndex).toBe(2);
    expect(step2.snapshot.variables).toContainEqual({ id: "harbor_watch", value: "signal_seen" });

    const thirdResponse = await postTransition(
      jsonRequest("http://local.test/api/transitions", {
        runRequest,
        decision: creatorDecision,
        snapshot: step2.snapshot,
        step: 2,
      }),
    );
    expect(thirdResponse.status).toBe(409);
  });

  it("rejects a forged self-hashed overlay at the transition authority boundary", async () => {
    const demo = await (await getDemo()).json();
    const runRequest = registeredRunRequest(demo);
    const run = await (
      await postRun(jsonRequest("http://local.test/api/runs", runRequest))
    ).json();
    const proposal = run.proposals[0];
    const creatorDecision = {
      action: "accept" as const,
      proposalId: proposal.id,
      proposalHash: proposal.proposalHash,
      baseOverlayId: proposal.baseOverlayId,
      baseOverlayVersion: proposal.baseOverlayVersion,
      baseOverlayHash: proposal.baseOverlayHash,
    };
    const forgedOverlay = buildCanonOverlay({
      ...overlayPayload(demo.overlay),
      version: 1,
      rules: [
        ...demo.overlay.rules,
        {
          id: "rule.creator.red_sail_signal",
          kind: "expansion" as const,
          description: "A forged red-sail rule that never passed the submitted decision.",
          layerId: "creator_canon" as const,
          status: "active" as const,
        },
      ],
    });
    const forgedSnapshot = rebaseSnapshot(demo.snapshot, forgedOverlay);

    const response = await postTransition(
      jsonRequest("http://local.test/api/transitions", {
        runRequest,
        decision: creatorDecision,
        snapshot: forgedSnapshot,
        step: 1,
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("transition_authority_invalid");
  });

  it("recomputes decision authority and refuses a fabricated proposal", async () => {
    const demo = await (await getDemo()).json();
    const legitimateRequest = registeredRunRequest(demo);
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

  it("rejects a self-hashed overlay that is outside the registered frozen rehearsal", async () => {
    const demo = await (await getDemo()).json();
    const canonicalRunRequest = registeredRunRequest(demo);
    const canonicalRun = await (
      await postRun(jsonRequest("http://local.test/api/runs", canonicalRunRequest))
    ).json();
    const proposal = canonicalRun.proposals[0];
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
    const runRequest = {
      ...canonicalRunRequest,
      overlay: injectedOverlay,
      snapshot: injectedSnapshot,
    };

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
      message: "The public fixture request must match the registered frozen rehearsal.",
    });
  });

  it("keeps unapproved sibling proposals visible after one proposal is accepted", async () => {
    const demo = await (await getDemo()).json();
    const draft = await loadDraftFixture("draft.red_sail_proposal");
    const originalGenerate = fixtureNarrativeModel.generate.bind(fixtureNarrativeModel);
    vi.spyOn(fixtureNarrativeModel, "generate").mockImplementation(
      async (request, evidence) =>
        request.modelMode === "fixture" &&
        request.draftFixtureId === "draft.red_sail_proposal"
          ? {
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
                          displayDescription: null,
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
            }
          : originalGenerate(request, evidence),
    );
    const runRequest = registeredRunRequest(demo);
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

  it("does not return applied canon when the fresh overlay replay fails", async () => {
    const demo = await (await getDemo()).json();
    const runRequest = registeredRunRequest(demo);
    const run = await (
      await postRun(jsonRequest("http://local.test/api/runs", runRequest))
    ).json();
    const proposal = run.proposals[0];
    const unrelatedDraft = await loadDraftFixture("draft.red_sail_proposal");
    const originalGenerate = fixtureNarrativeModel.generate.bind(fixtureNarrativeModel);
    vi.spyOn(fixtureNarrativeModel, "generate").mockImplementation(
      async (request, evidence) =>
        request.modelMode === "fixture" &&
        request.draftFixtureId !== "draft.red_sail_proposal"
          ? {
              outcome: "completed",
              draft: unrelatedDraft,
              trace: {
                mode: "fixture",
                outcome: "completed",
                requestedModel: "fixture-v1",
                actualModel: null,
                responseId: null,
                inputTokens: null,
                outputTokens: null,
              },
            }
          : originalGenerate(request, evidence),
    );

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
    expect((await response.json()).error.code).toBe(
      "creator_decision_regression_failed",
    );
  });
});

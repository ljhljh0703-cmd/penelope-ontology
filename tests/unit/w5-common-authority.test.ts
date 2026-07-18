import { describe, expect, it } from "vitest";
import {
  W5CommonSceneAuthorityProjectionSchema,
  W5CreatorRatingSheetSchema,
  W5PrivateCallPlanSchema,
} from "@/scripts/w5/contracts";
import {
  W5_CASE_DEFINITIONS,
  assertW5CommonSceneAuthorityParity,
  buildW5CaseSessions,
  buildW5CommonSceneAuthority,
  canonicalW5CommonSceneAuthority,
  hasValidW5CommonSceneAuthorityHash,
} from "@/scripts/w5/cases";

describe("W5 preregistered Odyssey common authority", () => {
  it("pins three distinct cases and the approved diagnostic targets", () => {
    expect(W5_CASE_DEFINITIONS).toMatchObject([
      {
        caseId: "case.normal_observation",
        inputSequence: ["bring the basin", "observe"],
        targetTurn: 1,
        targetDisposition: "prose_ab",
        expectedEndingId: "ending.canon_contained",
      },
      {
        caseId: "case.controlled_discovery",
        inputSequence: ["bring the basin", "confront the stranger"],
        targetTurn: 2,
        targetDisposition: "prose_ab",
        expectedEndingId: "ending.controlled_discovery",
      },
      {
        caseId: "case.absurd_no_render",
        inputSequence: [
          "Command Zeus to erase every suitor from the palace now.",
          "bring the basin",
        ],
        targetTurn: 1,
        targetDisposition: "structural_no_render",
        expectedEndingId: "ending.canon_contained",
      },
    ]);
    expect(new Set(W5_CASE_DEFINITIONS.map(({ caseId }) => caseId)).size).toBe(3);
  });

  it("builds deterministic setup, turn, and ending sessions for every case", () => {
    const first = buildW5CaseSessions();
    const second = buildW5CaseSessions();

    expect(first).toHaveLength(3);
    expect(
      first.map(({ turns, finalSession }) => ({
        actionStatuses: turns.map(({ receipt }) => receipt.action.status),
        endingId: finalSession.state.endingId,
        status: finalSession.state.status,
      })),
    ).toEqual([
      {
        actionStatuses: ["accepted", "accepted"],
        endingId: "ending.canon_contained",
        status: "complete",
      },
      {
        actionStatuses: ["accepted", "accepted"],
        endingId: "ending.controlled_discovery",
        status: "complete",
      },
      {
        actionStatuses: ["unsupported", "accepted"],
        endingId: "ending.canon_contained",
        status: "complete",
      },
    ]);
    expect(
      first.map((run) => buildW5CommonSceneAuthority(run)),
    ).toEqual(second.map((run) => buildW5CommonSceneAuthority(run)));
  });

  it("exposes renderable target requests for case 1 and case 2 only", () => {
    const [normal, discovery, absurd] = buildW5CaseSessions();
    expect(normal?.target).toMatchObject({
      disposition: "render",
      turn: 1,
      participantInput: "bring the basin",
    });
    expect(discovery?.target).toMatchObject({
      disposition: "render",
      turn: 2,
      participantInput: "confront the stranger",
    });
    expect(absurd?.target).toMatchObject({
      disposition: "no_render",
      turn: 1,
      reason: "unsupported_action",
      expectedRendererCallCount: 0,
      expectedCriticCallCount: 0,
      artifacts: null,
      rendererRequest: null,
    });
    if (!normal || normal.target.disposition !== "render") {
      throw new Error("Normal W5 target must be renderable.");
    }
    if (!discovery || discovery.target.disposition !== "render") {
      throw new Error("Discovery W5 target must be renderable.");
    }
    expect(normal.target.rendererRequest.modelFacingRequest.sceneMode).toBe("turn");
    expect(discovery.target.rendererRequest.modelFacingRequest.sceneMode).toBe(
      "ending",
    );
    expect(
      discovery.target.rendererRequest.modelFacingRequest.licensedRenderingDetails,
    ).toEqual([
      expect.objectContaining({
        licenseId: "license.speech.eurycleia.controlled_disclosure",
        category: "speech_act",
      }),
    ]);
  });

  it("keeps the absurd command as a zero-gain turn and still reaches an ending", () => {
    const absurd = buildW5CaseSessions()[2]!;
    const [unsupported, recovery] = absurd.turns;
    expect(unsupported.disposition).toBe("no_render");
    expect(unsupported.session.state.turn).toBe(1);
    expect(unsupported.session.state.worldTick).toBe(1);
    expect(unsupported.session.state.flags).toEqual(
      unsupported.beforeSession.state.flags,
    );
    expect(unsupported.session.state.clocks).toEqual(
      unsupported.beforeSession.state.clocks,
    );
    expect(recovery.receipt.action.status).toBe("accepted");
    expect(absurd.finalSession.state).toMatchObject({
      turn: 2,
      status: "complete",
      endingId: "ending.canon_contained",
    });
  });

  it("hashes only the shared state, input, facts, events, licenses, and reserved actions", () => {
    const authorities = buildW5CaseSessions().map((run) =>
      buildW5CommonSceneAuthority(run),
    );
    for (const authority of authorities) {
      expect(hasValidW5CommonSceneAuthorityHash(authority)).toBe(true);
      expect(canonicalW5CommonSceneAuthority(authority)).not.toMatch(
        /styleProfile|readerProse|modelOutput|blindLabel|prompt/u,
      );
    }

    const same = structuredClone(authorities[0]!);
    expect(() =>
      assertW5CommonSceneAuthorityParity(authorities[0]!, same),
    ).not.toThrow();
    expect(() =>
      assertW5CommonSceneAuthorityParity(authorities[0]!, authorities[1]!),
    ).toThrow("W5 A/B common authority mismatch");
  });

  it("fails closed when a prose target lacks renderer authority", () => {
    const authority = buildW5CommonSceneAuthority(buildW5CaseSessions()[0]!);
    expect(
      W5CommonSceneAuthorityProjectionSchema.safeParse({
        ...authority.projection,
        rendererAuthority: null,
      }).success,
    ).toBe(false);
  });

  it("keeps call planning model claims bounded and ratings complete", () => {
    const authority = buildW5CommonSceneAuthority(buildW5CaseSessions()[0]!);
    expect(
      W5PrivateCallPlanSchema.parse({
        callId: "call.w5.normal.a",
        caseId: "case.normal_observation",
        targetTurn: 1,
        harnessId: "baseline_a",
        commonAuthorityHash: authority.commonAuthorityHash,
        requestedModel: "gpt-5.6-sol",
        actualModelIdentity: "unreported",
        outputContract: "legacy_baseline",
        tense: "unchanged",
        maximumCriticCalls: 0,
        orderIndex: 0,
      }),
    ).toMatchObject({
      requestedModel: "gpt-5.6-sol",
      actualModelIdentity: "unreported",
    });

    const criterionIds = [
      "clarity",
      "character_desire",
      "causal_legibility",
      "consequence_continuity",
      "no_report_register",
      "dialogue_turns_scene",
      "scene_continuity",
      "fair_consequence",
      "desire_to_continue",
    ] as const;
    const complete = W5CreatorRatingSheetSchema.parse({
      blindLabel: "sample-a",
      ratings: criterionIds.map((criterionId) => ({
        criterionId,
        score: 3,
        rationale: "Creator review is pending.",
        publicRationale: "The causal turn needs clearer staging.",
      })),
      tensePreference: null,
      creatorDecision: "revise_once",
    });
    const duplicate = structuredClone(complete);
    duplicate.ratings[8]!.criterionId = "clarity";
    expect(W5CreatorRatingSheetSchema.safeParse(duplicate).success).toBe(false);

    const privatePathLeak = structuredClone(complete);
    privatePathLeak.ratings[0]!.publicRationale =
      `See ${["", "Users", "example", "private-draft.md"].join("/")} for the quote.`;
    expect(W5CreatorRatingSheetSchema.safeParse(privatePathLeak).success).toBe(
      false,
    );
  });
});

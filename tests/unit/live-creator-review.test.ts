import { describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import {
  bindSimpleCreatorDecision,
  renderPrivateLiveCreatorReview,
} from "@/src/application/live-creator-review";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import type { NarrativeModel } from "@/src/ports/narrative-model";

const makeLiveRun = async () => {
  const [worldPack, overlay, snapshot, draft] = await Promise.all([
    loadDemoWorldPack(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
    loadDraftFixture("draft.red_sail_proposal"),
  ]);
  const liveModel: NarrativeModel = {
    async generate() {
      return {
        outcome: "completed",
        draft,
        trace: {
          mode: "live",
          outcome: "completed",
          requestedModel: "gpt-5.6",
          actualModel: "gpt-5.6-2026-07-01",
          responseId: "resp_private_creator_review",
          inputTokens: 420,
          outputTokens: 170,
        },
      };
    },
  };
  const run = createRunOrchestrator({
    worldPack,
    fixtureModel: fixtureNarrativeModel,
    liveModel,
  });
  return run(
    buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    }),
  );
};

describe("private live creator review", () => {
  it("renders only the creative material and three meaningful choices", async () => {
    const liveRun = await makeLiveRun();
    const review = renderPrivateLiveCreatorReview(liveRun);

    expect(review).toContain("## Generated Scene");
    expect(review).toContain("**penelope**");
    expect(review).toContain("**telemachus**");
    expect(review).toContain("`accept`");
    expect(review).toContain("`edit`");
    expect(review).toContain("`reject`");
    expect(review).not.toContain("resp_private_creator_review");
    expect(review).not.toContain("inputTokens");
  });

  it("escapes generated Markdown and HTML before writing the local review", async () => {
    const liveRun = await makeLiveRun();
    if (liveRun.modelOutcome.outcome !== "completed") {
      throw new Error("Expected completed live result.");
    }
    const injected = {
      ...liveRun,
      modelOutcome: {
        ...liveRun.modelOutcome,
        draft: {
          ...liveRun.modelOutcome.draft,
          narrative: "# false heading\n![remote](https://example.invalid/x) <img src=x>",
        },
      },
    };
    const review = renderPrivateLiveCreatorReview(injected);

    expect(review).not.toContain("\n# false heading");
    expect(review).not.toContain("![remote]");
    expect(review).not.toContain("<img");
    expect(review).toContain("\\# false heading");
    expect(review).toContain("\\!\\[remote\\]");
    expect(review).toContain("&lt;img src=x&gt;");
  });

  it("binds accept and reject to the exact proposal authority", async () => {
    const liveRun = await makeLiveRun();
    const proposal = liveRun.proposals[0];

    for (const action of ["accept", "reject"] as const) {
      expect(
        bindSimpleCreatorDecision({ liveRun, decision: { action } }),
      ).toEqual({
        action,
        proposalId: proposal?.id,
        proposalHash: proposal?.proposalHash,
        baseOverlayId: proposal?.baseOverlayId,
        baseOverlayVersion: proposal?.baseOverlayVersion,
        baseOverlayHash: proposal?.baseOverlayHash,
      });
    }
  });

  it("permits an edit only to the display wording, not the canon meaning", async () => {
    const liveRun = await makeLiveRun();
    const proposal = liveRun.proposals[0];
    const decision = bindSimpleCreatorDecision({
      liveRun,
      decision: {
        action: "edit",
        displayDescription: "A red sail begins the royal harbor watch.",
      },
    });

    expect(decision.action).toBe("edit");
    if (decision.action !== "edit") throw new Error("Expected edit decision.");
    expect(decision.patches[0]).toMatchObject({
      op: "add_rule",
      rule: {
        description:
          proposal?.patches[0]?.op === "add_rule"
            ? proposal.patches[0].rule.description
            : "unavailable",
        displayDescription: "A red sail begins the royal harbor watch.",
      },
    });
  });

  it("rejects pending, extra fields, and a semantically invalid live run", async () => {
    const liveRun = await makeLiveRun();

    expect(() =>
      bindSimpleCreatorDecision({ liveRun, decision: { action: "pending" } }),
    ).toThrow();
    expect(() =>
      bindSimpleCreatorDecision({
        liveRun,
        decision: { action: "accept", displayDescription: "smuggled" },
      }),
    ).toThrow();
    expect(() =>
      bindSimpleCreatorDecision({
        liveRun,
        decision: {
          action: "edit",
          displayDescription: "붉은 돛이 보이면 왕실 항구 감시를 시작한다.",
        },
      }),
    ).toThrow(/Latin-script/u);
    expect(() =>
      renderPrivateLiveCreatorReview({ ...liveRun, hardViolations: [] }),
    ).toThrow(/creator-review gate/u);
  });
});

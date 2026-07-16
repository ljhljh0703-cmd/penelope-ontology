import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import type { RunResult } from "@/src/contracts/run";
import { createCanonProposal } from "@/src/domain/canon-overlay";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  evaluateLiveRedSailRunResult,
  isLiveRedSailRunResultAccepted,
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  passesRegisteredEnglishScriptCheck,
} from "@/src/evidence/live-scenario-contract";
import type { NarrativeModel } from "@/src/ports/narrative-model";
import { sanitizeRegisteredLiveEvidence } from "@/scripts/capture-live-evidence";
import { sha256Canonical } from "@/src/domain/canonical-json";

const makeAcceptedResult = async (): Promise<RunResult> => {
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
          responseId: "resp_live_red_sail",
          inputTokens: 400,
          outputTokens: 160,
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

describe("preregistered live red-sail scenario", () => {
  it("binds the one-call request to v0, S0, the selected style, and two participant authorities", async () => {
    const [worldPack, overlay, snapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const request = buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    });

    expect(request.taskType).toBe("expand");
    expect(request.outputLocale).toBe("en");
    expect(request.overlay.hash).toBe(
      LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.overlayHash,
    );
    expect(request.snapshot.stateHash).toBe(
      LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.snapshotStateHash,
    );
    expect(request.styleProfileId).toBe(
      LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.styleProfileId,
    );
    expect(request.participantIntents).toEqual(
      LIVE_RED_SAIL_SCENARIO_CONTRACT.request.participantIntents,
    );
    expect(request.participantIntents.map(({ controlledEntityIds }) => controlledEntityIds))
      .toEqual([["penelope"], ["telemachus"]]);
    expect(sha256Canonical(request)).toBe(LIVE_RED_SAIL_REQUEST_SHA256);
  });

  it("keeps both write-once approval commands on the registered request hash", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    for (const scriptName of [
      "evidence:live:approve",
      "evidence:live:retry:approve",
    ]) {
      const command = packageJson.scripts?.[scriptName];
      expect(command).toContain(`--request-sha ${LIVE_RED_SAIL_REQUEST_SHA256}`);
    }
  });

  it("fails before dispatch when the selected authority is not the preregistered one", async () => {
    const [overlay, snapshot] = await Promise.all([
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);

    expect(() =>
      buildLiveEvidenceRunRequest({
        overlay,
        snapshot,
        styleProfileId: "style.unregistered",
      }),
    ).toThrow(/Live scenario authority/u);
  });

  it("accepts a completed live result with only the expected creator-decision proposal", async () => {
    const result = await makeAcceptedResult();

    expect(evaluateLiveRedSailRunResult(result)).toEqual({ ok: true, issues: [] });
    expect(isLiveRedSailRunResultAccepted(result)).toBe(true);
    expect(result.modelOutcome.outcome).toBe("completed");
    expect(result.status).toBe("needs_creator_decision");
    expect(result.hardViolations.map(({ code }) => code)).toEqual([
      "unapproved_expansion",
    ]);
    expect(result.modelOutcome.outcome === "completed" && result.modelOutcome.draft.actions)
      .toEqual([]);
    expect(passesRegisteredEnglishScriptCheck(result)).toBe(true);
  });

  it("rejects registered English evidence when generated prose contains non-Latin letters", async () => {
    const result = await makeAcceptedResult();
    if (result.modelOutcome.outcome !== "completed") throw new Error("Expected draft.");
    for (const nonLatinText of ["붉은 돛", "красный парус", "شراع أحمر"]) {
      const mutated = {
        ...result,
        modelOutcome: {
          ...result.modelOutcome,
          draft: {
            ...result.modelOutcome.draft,
            narrative: `${result.modelOutcome.draft.narrative} ${nonLatinText}`,
          },
        },
      };

      expect(passesRegisteredEnglishScriptCheck(mutated)).toBe(false);
      expect(evaluateLiveRedSailRunResult(mutated).issues).toContain(
        "registered_output_script_mismatch",
      );
    }
  });

  it("rejects unrelated hard violations and any action in the proposal call", async () => {
    const result = await makeAcceptedResult();
    if (result.modelOutcome.outcome !== "completed") throw new Error("Expected draft.");
    const mutated = {
      ...result,
      hardViolations: [
        ...result.hardViolations,
        {
          code: "belief_scope_violation" as const,
          message: "Injected unrelated hard violation.",
          evidenceIds: ["claim.odyssey.odysseus_on_ogygia"],
        },
      ],
      modelOutcome: {
        ...result.modelOutcome,
        draft: {
          ...result.modelOutcome.draft,
          actions: [
            {
              actorEntityId: "telemachus",
              authorizingIntentId: "intent.telemachus",
              contributingIntentIds: ["intent.penelope"],
              op: "set_variable" as const,
              variableId: "harbor_watch",
              from: "idle",
              to: "watching",
              evidenceClaimIds: [],
              evidenceRuleIds: ["rule.creator.red_sail_signal"],
            },
          ],
        },
      },
    };

    expect(evaluateLiveRedSailRunResult(mutated).issues).toEqual(
      expect.arrayContaining([
        "action_expectation_mismatch",
        "hard_violation_mismatch",
      ]),
    );
  });

  it("rejects a well-formed but semantically different creator-canon patch", async () => {
    const result = await makeAcceptedResult();
    const overlay = await loadOverlayFixture("overlay.v0");
    if (result.modelOutcome.outcome !== "completed") throw new Error("Expected draft.");
    const changedDraftProposal = {
      ...result.modelOutcome.draft.proposals[0],
      patches: [
        {
          op: "add_rule" as const,
          rule: {
            id: "rule.creator.red_sail_signal",
            kind: "expansion" as const,
            description: "A red sail proves the king has returned.",
            displayDescription: null,
          },
        },
      ],
    };
    const changedProposal = createCanonProposal(changedDraftProposal, overlay);
    const mutated = {
      ...result,
      proposals: [changedProposal],
      modelOutcome: {
        ...result.modelOutcome,
        draft: {
          ...result.modelOutcome.draft,
          proposals: [changedDraftProposal],
        },
      },
    };

    expect(evaluateLiveRedSailRunResult(mutated)).toEqual({
      ok: false,
      issues: ["proposal_semantic_patch_mismatch"],
    });
  });

  it("allows display wording to vary without changing semantic authority", async () => {
    const result = await makeAcceptedResult();
    const overlay = await loadOverlayFixture("overlay.v0");
    if (result.modelOutcome.outcome !== "completed") throw new Error("Expected draft.");
    const displayEditedDraftProposal = {
      ...result.modelOutcome.draft.proposals[0],
      patches: result.modelOutcome.draft.proposals[0].patches.map((patch) =>
        patch.op === "add_rule"
          ? {
              ...patch,
              rule: {
                ...patch.rule,
                displayDescription: "A red sail calls the harbor watch to observe.",
              },
            }
          : patch,
      ),
    };
    const displayEditedProposal = createCanonProposal(
      displayEditedDraftProposal,
      overlay,
    );
    const mutated = {
      ...result,
      proposals: [displayEditedProposal],
      modelOutcome: {
        ...result.modelOutcome,
        draft: {
          ...result.modelOutcome.draft,
          proposals: [displayEditedDraftProposal],
        },
      },
    };

    expect(evaluateLiveRedSailRunResult(mutated)).toEqual({ ok: true, issues: [] });
  });

  it("persists sanitized evidence only after the registered semantic gate", async () => {
    const [result, worldPack, overlay, snapshot] = await Promise.all([
      makeAcceptedResult(),
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const request = buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    });
    const authority = {
      worldPackId: worldPack.meta.id,
      worldPackSha256: sha256Canonical(worldPack),
      request,
    };

    expect(
      sanitizeRegisteredLiveEvidence(
        result,
        "2026-07-15T00:00:00.000Z",
        authority,
      ),
    ).toMatchObject({
      runStatus: "needs_creator_decision",
      hardViolationCodes: ["unapproved_expansion"],
      rawResponsePersistedPublicly: false,
    });
    expect(() =>
      sanitizeRegisteredLiveEvidence(
        { ...result, hardViolations: [] },
        "2026-07-15T00:00:00.000Z",
        authority,
      ),
    ).toThrow(/preregistered scenario contract/u);
  });
});

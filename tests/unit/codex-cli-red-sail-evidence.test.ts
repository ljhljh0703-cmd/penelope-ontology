import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CODEX_CLI_ISOLATION,
  CodexCliNarrativeOutcomeSchema,
} from "@/src/adapters/codex-cli/contracts";
import { buildCodexCliAuthorityBundle } from "@/src/adapters/codex-cli/authority";
import {
  CodexCliSanitizedEvidenceSchema,
  buildCodexCliSanitizedEvidence,
  evaluateCodexCliRedSailDraft,
} from "@/src/adapters/codex-cli/red-sail-evidence";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import { ModelDraftSchema } from "@/src/contracts/model-draft";
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";
import { StyleProfileSetSchema } from "@/src/contracts/style-profile";
import { WorldPackSchema } from "@/src/domain/schemas";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  LIVE_RED_SAIL_WORLD_PACK_SHA256,
} from "@/src/evidence/live-scenario-contract";

const readJson = (locator: string): unknown =>
  JSON.parse(readFileSync(locator, "utf8")) as unknown;

const world = WorldPackSchema.parse(
  readJson("data/world-packs/trojan-returns/world.json"),
);
const styleProfiles = StyleProfileSetSchema.parse(world.styleProfiles);
const styleProfile = styleProfiles.find(
  ({ id }) => id === "style.table_ready_mythic",
)!;
const draft = ModelDraftSchema.parse(
  readJson("data/world-packs/trojan-returns/drafts/red-sail-proposal.json"),
);
const request = buildLiveEvidenceRunRequest({
  overlay: CanonOverlaySchema.parse(
    readJson("data/world-packs/trojan-returns/overlays/overlay.v0.json"),
  ),
  snapshot: SimulationSnapshotSchema.parse(
    readJson("data/world-packs/trojan-returns/snapshots/s0.json"),
  ),
  styleProfileId: styleProfile.id,
});
const authorityBundle = buildCodexCliAuthorityBundle({ worldPack: world, request });

const outcome = CodexCliNarrativeOutcomeSchema.parse({
  outcome: "completed",
  draft,
  trace: {
    schemaVersion: 1,
    transport: "codex_cli",
    requestedModel: "gpt-5.6-sol",
    actualModel: null,
    responseId: null,
    threadId: ["0199a213", "81c0", "7800", "8aa1", "bbab2a035a53"].join(
      "-",
    ),
    cliVersion: "codex-cli 0.142.5",
    usage: {
      inputTokens: 400,
      cachedInputTokens: 100,
      outputTokens: 220,
      reasoningOutputTokens: 20,
    },
    requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
    worldPackSha256: authorityBundle.authority.worldPackSha256,
    modelInputSha256: authorityBundle.authority.modelInputSha256,
    promptSha256: authorityBundle.authority.promptSha256,
    outputSchemaSha256: authorityBundle.authority.outputSchemaSha256,
    executionContractSha256:
      authorityBundle.authority.executionContractSha256,
    approvalAuthoritySha256: authorityBundle.approvalAuthoritySha256,
    jsonlSha256: "b".repeat(64),
    finalMessageSha256: "c".repeat(64),
    isolation: CODEX_CLI_ISOLATION,
  },
});
if (outcome.outcome !== "completed") {
  throw new Error("expected completed Codex CLI fixture outcome");
}

describe("Codex CLI red-sail evidence contract", () => {
  it("accepts the exact preregistered request and fixture-shaped semantic draft", () => {
    expect(
      evaluateCodexCliRedSailDraft({ request, draft, styleProfile }),
    ).toEqual({ ok: true, issues: [] });
  });

  it("rejects request drift, non-Latin generated prose, and proposal drift", () => {
    const changedRequest = { ...request, brief: `${request.brief} changed` };
    const changedDraft = {
      ...draft,
      narrative: "붉은 돛은 증거가 아니다.",
      proposals: [
        {
          ...draft.proposals[0],
          patches: [
            {
              op: "add_rule" as const,
              rule: {
                id: LIVE_RED_SAIL_SCENARIO_CONTRACT.expected.patch.rule.id,
                kind: "expansion" as const,
                description: "A different semantic rule.",
                displayDescription: null,
              },
            },
          ],
        },
      ],
    };

    expect(
      evaluateCodexCliRedSailDraft({
        request: changedRequest,
        draft: changedDraft,
        styleProfile,
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        "request_hash_mismatch",
        "registered_output_script_mismatch",
        "proposal_semantic_patch_mismatch",
      ]),
    });
  });

  it("creates separate CLI evidence without fabricating actual model or response ID", () => {
    const evidence = buildCodexCliSanitizedEvidence({
      capturedAt: "2026-07-15T12:00:00.000Z",
      request,
      worldPackSha256: LIVE_RED_SAIL_WORLD_PACK_SHA256,
      styleProfile,
      outcome,
    });

    expect(CodexCliSanitizedEvidenceSchema.parse(evidence)).toMatchObject({
      evidenceType: "codex_cli_sanitized",
      transport: "codex_cli",
      requestedModel: "gpt-5.6-sol",
      actualModel: null,
      responseId: null,
      actualModelObserved: false,
      responseIdObserved: false,
      authority: { requestSha256: LIVE_RED_SAIL_REQUEST_SHA256 },
      scenarioVerdict: "passed",
      rawJsonlPublic: false,
      rawFinalMessagePublic: false,
    });
  });

  it("rejects a completed outcome whose trace is not bound to the request", () => {
    const mismatched = CodexCliNarrativeOutcomeSchema.parse({
      ...outcome,
      trace: { ...outcome.trace, requestSha256: "d".repeat(64) },
    });
    expect(() =>
      buildCodexCliSanitizedEvidence({
        capturedAt: "2026-07-15T12:00:00.000Z",
        request,
        worldPackSha256: LIVE_RED_SAIL_WORLD_PACK_SHA256,
        styleProfile,
        outcome: mismatched,
      }),
    ).toThrow(/not bound/u);
  });
});

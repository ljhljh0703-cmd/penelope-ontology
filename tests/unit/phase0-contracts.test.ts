import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import { CreatorDecisionSchema } from "@/src/contracts/creator-decision";
import { FixtureRegistrySchema } from "@/src/contracts/fixture-registry";
import { GraphDescriptorSchema } from "@/src/contracts/graph";
import {
  NarrativeModelOutcomeSchema,
  ModelTraceSchema,
} from "@/src/contracts/model-outcome";
import { ParticipantIntentSetSchema } from "@/src/contracts/participant-intent";
import {
  MAX_DISPLAY_DESCRIPTION_LENGTH,
  MAX_PROPOSAL_PATCHES,
} from "@/src/contracts/proposal";
import { ProposalPatchSchema } from "@/src/contracts/proposal";
import { RunRequestSchema } from "@/src/contracts/run";
import {
  SimulationScenarioSchema,
  SimulationSnapshotSchema,
} from "@/src/contracts/simulation";
import { StyleProfileSchema } from "@/src/contracts/style-profile";
import { ModelDraftSchema } from "@/src/contracts/model-draft";

const dataRoot = "data/world-packs/trojan-returns";
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(dataRoot, path), "utf8")) as unknown;

describe("Phase 0 contracts", () => {
  it("locks original style constraints to stable IDs and objective check modes", () => {
    const world = readJson("world.json") as { styleProfiles: unknown[] };
    const profile = StyleProfileSchema.parse(world.styleProfiles[0]);
    expect(profile.constraints.some(({ kind }) => kind === "max_words")).toBe(true);
    expect(profile.constraints.some(({ kind }) => kind === "cadence")).toBe(true);

    const invalid = structuredClone(profile);
    invalid.constraints[0].checkMode = "deterministic";
    expect(StyleProfileSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects duplicate people, intent IDs, and overlapping character control", () => {
    const base = [
      {
        intentId: "intent.one",
        participantId: "participant.one",
        controlledEntityIds: ["penelope"],
        intent: "Keep the scene cautious.",
      },
      {
        intentId: "intent.two",
        participantId: "participant.two",
        controlledEntityIds: ["telemachus"],
        intent: "Raise the watch.",
      },
    ];
    expect(ParticipantIntentSetSchema.safeParse(base).success).toBe(true);
    expect(
      ParticipantIntentSetSchema.safeParse([
        base[0],
        { ...base[1], controlledEntityIds: ["penelope"] },
      ]).success,
    ).toBe(false);
    expect(
      ParticipantIntentSetSchema.safeParse([base[0], { ...base[1], intentId: "intent.one" }]).success,
    ).toBe(false);
  });

  it("represents red-sail expansion as an add_rule patch, not canon metadata", () => {
    const draft = ModelDraftSchema.parse(readJson("drafts/red-sail-proposal.json"));
    const patch = draft.proposals[0].patches[0];
    expect(ProposalPatchSchema.parse(patch)).toMatchObject({
      op: "add_rule",
      rule: { id: "rule.creator.red_sail_signal" },
    });
    expect("baseOverlayHash" in draft.proposals[0]).toBe(false);
    expect("proposalHash" in draft.proposals[0]).toBe(false);
  });

  it("keeps completed fixture provenance separate from typed model failures", () => {
    expect(
      ModelTraceSchema.safeParse({
        mode: "fixture",
        outcome: "completed",
        requestedModel: "fixture-v1",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      }).success,
    ).toBe(true);
    expect(
      ModelTraceSchema.safeParse({
        mode: "fixture",
        outcome: "completed",
        requestedModel: "fixture-v1",
        actualModel: "gpt-5.6",
        responseId: "resp_fake",
        inputTokens: 1,
        outputTokens: 1,
      }).success,
    ).toBe(false);

    const refused = {
      outcome: "refused",
      error: { code: "safety_refusal", message: "Refused.", retryable: false },
      trace: {
        mode: "live",
        outcome: "refused",
        requestedModel: "gpt-5.6",
        actualModel: "gpt-5.6-sol",
        responseId: "resp_1",
        inputTokens: 10,
        outputTokens: 0,
      },
    };
    expect(NarrativeModelOutcomeSchema.safeParse(refused).success).toBe(true);
    expect(NarrativeModelOutcomeSchema.safeParse({ ...refused, outcome: "schema_error" }).success).toBe(false);
  });

  it("loads complete overlays and snapshots with matching canon references", () => {
    const overlayV0 = CanonOverlaySchema.parse(readJson("overlays/overlay.v0.json"));
    const overlayV1 = CanonOverlaySchema.parse(readJson("overlays/overlay.v1.red-sail.json"));
    const s0 = SimulationSnapshotSchema.parse(readJson("snapshots/s0.json"));
    const s0r = SimulationSnapshotSchema.parse(readJson("snapshots/s0r.json"));
    expect([s0.overlayVersion, s0.canonHash]).toEqual([overlayV0.version, overlayV0.hash]);
    expect([s0r.overlayVersion, s0r.canonHash]).toEqual([overlayV1.version, overlayV1.hash]);
    expect(s0r.turnIndex).toBe(s0.turnIndex);
    expect(s0r.variables).toEqual(s0.variables);
    expect(s0r.stateHash).not.toBe(s0.stateHash);
  });

  it("locks the harbor-watch finite transition table and step cap", () => {
    const world = readJson("world.json") as { simulationScenarios: unknown[] };
    const scenario = SimulationScenarioSchema.parse(world.simulationScenarios[0]);
    expect(scenario.maxSteps).toBe(2);
    expect(scenario.variables[0].transitions.map(({ from, to }) => `${from}->${to}`)).toEqual([
      "idle->watching",
      "watching->signal_seen",
    ]);
    expect(SimulationScenarioSchema.safeParse({ ...scenario, maxSteps: 3 }).success).toBe(false);
  });

  it("requires graph order and rejects dangling graph edges", () => {
    const node = (id: string) => ({
      id,
      kind: "entity" as const,
      label: id,
      nonAuthoritativeDisplayLabel: null,
      visualState: "active_evidence" as const,
      evidenceIds: [],
    });
    const valid = {
      id: "graph.test",
      nodes: [node("node.a"), node("node.b")],
      edges: [
        {
          id: "edge.a",
          kind: "claim",
          fromNodeId: "node.a",
          toNodeId: "node.b",
          predicate: "located_at",
          visualState: "active_evidence",
          evidenceIds: [],
          visibleToIds: [],
          status: "active",
        },
      ],
    };
    expect(GraphDescriptorSchema.safeParse(valid).success).toBe(true);
    expect(GraphDescriptorSchema.safeParse({ ...valid, nodes: [...valid.nodes].reverse() }).success).toBe(false);
    expect(
      GraphDescriptorSchema.safeParse({
        ...valid,
        edges: [{ ...valid.edges[0], toNodeId: "node.missing" }],
      }).success,
    ).toBe(false);
  });

  it("discriminates fixture and live run requests", () => {
    const overlay = CanonOverlaySchema.parse(readJson("overlays/overlay.v0.json"));
    const snapshot = SimulationSnapshotSchema.parse(readJson("snapshots/s0.json"));
    const base = {
      overlay,
      snapshot,
      styleProfileId: "style.table_ready_mythic",
      taskType: "scene",
      brief: "Keep the uncertainty visible.",
      participantIntents: [
        {
          intentId: "intent.penelope",
          participantId: "participant.one",
          controlledEntityIds: ["penelope"],
          intent: "Remain cautious.",
        },
      ],
    };
    expect(
      RunRequestSchema.safeParse({ ...base, modelMode: "fixture", draftFixtureId: "draft.grounded_penelope" })
        .success,
    ).toBe(true);
    expect(RunRequestSchema.safeParse({ ...base, modelMode: "live" }).success).toBe(true);
    expect(
      RunRequestSchema.safeParse({ ...base, modelMode: "live", draftFixtureId: "draft.grounded_penelope" })
        .success,
    ).toBe(false);
  });

  it("requires a version-aware proposal reference for creator decisions", () => {
    const overlay = CanonOverlaySchema.parse(readJson("overlays/overlay.v0.json"));
    expect(
      CreatorDecisionSchema.safeParse({
        action: "accept",
        proposalId: "proposal.red_sail_signal",
        proposalHash: "a".repeat(64),
        baseOverlayId: overlay.id,
        baseOverlayVersion: overlay.version,
        baseOverlayHash: overlay.hash,
      }).success,
    ).toBe(true);
    expect(
      CreatorDecisionSchema.safeParse({
        action: "edit",
        proposalId: "proposal.red_sail_signal",
        proposalHash: "a".repeat(64),
        baseOverlayId: overlay.id,
        baseOverlayVersion: overlay.version,
        baseOverlayHash: overlay.hash,
      }).success,
    ).toBe(false);
  });

  it("bounds creator display edits and proposal patch count", () => {
    const overlay = CanonOverlaySchema.parse(readJson("overlays/overlay.v0.json"));
    const base = {
      action: "edit" as const,
      proposalId: "proposal.red_sail_signal",
      proposalHash: "a".repeat(64),
      baseOverlayId: overlay.id,
      baseOverlayVersion: overlay.version,
      baseOverlayHash: overlay.hash,
    };
    const patch = (index: number, displayDescription: string) => ({
      op: "add_rule" as const,
      rule: {
        id: `rule.creator.limit_${index}`,
        kind: "world" as const,
        description: "Locked semantic rule.",
        displayDescription,
      },
    });

    expect(
      CreatorDecisionSchema.safeParse({
        ...base,
        patches: [patch(0, "x".repeat(MAX_DISPLAY_DESCRIPTION_LENGTH))],
      }).success,
    ).toBe(true);
    expect(
      CreatorDecisionSchema.safeParse({
        ...base,
        patches: [patch(0, "x".repeat(MAX_DISPLAY_DESCRIPTION_LENGTH + 1))],
      }).success,
    ).toBe(false);
    expect(
      CreatorDecisionSchema.safeParse({
        ...base,
        patches: Array.from({ length: MAX_PROPOSAL_PATCHES + 1 }, (_, index) =>
          patch(index, "Display wording."),
        ),
      }).success,
    ).toBe(false);
  });

  it("declares every fixture path through one strict registry", () => {
    const registry = FixtureRegistrySchema.parse(readJson("fixture-registry.json"));
    for (const fixture of [...registry.drafts, ...registry.overlays, ...registry.snapshots]) {
      expect(() => readJson(fixture.path), fixture.id).not.toThrow();
    }
  });
});

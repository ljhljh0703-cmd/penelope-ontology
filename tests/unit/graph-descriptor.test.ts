import { describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadDraftFixture,
  loadOverlayFixture,
  loadReplayCases,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import type { ParticipantIntent } from "@/src/contracts/participant-intent";
import { createCanonProposal } from "@/src/domain/canon-overlay";
import { canonicalJson } from "@/src/domain/canonical-json";
import { buildGraphDescriptor } from "@/src/domain/graph-descriptor";
import { buildCharacterAgentViews } from "@/src/domain/retrieval";
import { validateDraft } from "@/src/domain/validation";

const graphForFixture = async (draftFixtureId: string) => {
  const [pack, replayCases] = await Promise.all([
    loadDemoWorldPack(),
    loadReplayCases(),
  ]);
  const stage = replayCases
    .flatMap(({ stages }) => stages)
    .find(
      (candidate) =>
        (candidate.kind === "run" || candidate.kind === "transition") &&
        candidate.draftFixtureId === draftFixtureId,
    );
  if (!stage || (stage.kind !== "run" && stage.kind !== "transition")) {
    throw new Error(`No replay stage owns ${draftFixtureId}.`);
  }
  const [overlay, snapshot, draft] = await Promise.all([
    loadOverlayFixture(stage.overlayFixtureId),
    loadSnapshotFixture(stage.snapshotFixtureId),
    loadDraftFixture(stage.draftFixtureId),
  ]);
  const styleProfile = pack.styleProfiles.find(({ id }) => id === snapshot.styleProfileId);
  const scenario = pack.simulationScenarios.find(({ id }) => id === snapshot.scenarioId);
  const state = pack.states.find(({ id }) => id === snapshot.baseStateId);
  const canonProfile = pack.canonProfiles.find(({ id }) => id === snapshot.canonProfileId);
  if (!styleProfile || !scenario || !state || !canonProfile) {
    throw new Error(`Incomplete graph context for ${draftFixtureId}.`);
  }
  const participantIntents: ParticipantIntent[] = stage.participantIntents;
  const characterViews = buildCharacterAgentViews({
    pack,
    overlay,
    snapshot,
    participantIntents,
  });
  const violations = validateDraft(draft, {
    pack,
    overlay,
    state,
    scenario,
    snapshot,
    styleProfile,
    participantIntents,
    characterViews,
    activeLayerIds: new Set(canonProfile.activeLayerIds),
  });
  const proposals = draft.proposals.map((proposal) => createCanonProposal(proposal, overlay));
  const graph = buildGraphDescriptor({
    pack,
    overlay,
    snapshot,
    draft,
    characterViews,
    violations,
    proposals,
  });
  return { graph, violations };
};

const expectOrderedAndClosed = (graph: Awaited<ReturnType<typeof graphForFixture>>["graph"]) => {
  const nodeIds = graph.nodes.map(({ id }) => id);
  const edgeIds = graph.edges.map(({ id }) => id);
  expect(nodeIds).toEqual([...nodeIds].sort());
  expect(edgeIds).toEqual([...edgeIds].sort());
  const knownNodes = new Set(nodeIds);
  for (const edge of graph.edges) {
    expect(knownNodes.has(edge.fromNodeId), `${edge.id} source`).toBe(true);
    expect(knownNodes.has(edge.toNodeId), `${edge.id} target`).toBe(true);
  }
};

describe("derived canon and knowledge graph", () => {
  it("renders the red-sail proposal as a ghost proposal without approving it", async () => {
    const { graph } = await graphForFixture("draft.red_sail_proposal");
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: "proposal.proposal.red_sail_signal",
        kind: "proposal",
        visualState: "ghost_proposal",
      }),
    );
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: "rule.rule.creator.red_sail_signal",
        visualState: "ghost_proposal",
      }),
    );
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        kind: "proposal",
        status: "proposed",
        visualState: "ghost_proposal",
      }),
    );
    expectOrderedAndClosed(graph);
  });

  it("renders the accepted overlay-v1 rule as approved canon", async () => {
    const { graph, violations } = await graphForFixture("draft.red_sail_step_1");
    expect(violations).toEqual([]);
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: "rule.rule.creator.red_sail_signal",
        kind: "rule",
        visualState: "approved_overlay",
      }),
    );
    expect(graph.nodes).not.toContainEqual(
      expect.objectContaining({
        id: "proposal.proposal.red_sail_signal",
      }),
    );
    expectOrderedAndClosed(graph);
  });

  it("is byte-stable for identical structured inputs", async () => {
    const first = await graphForFixture("draft.grounded_penelope");
    const second = await graphForFixture("draft.grounded_penelope");
    expect(canonicalJson(second.graph)).toBe(canonicalJson(first.graph));
    expectOrderedAndClosed(first.graph);
  });
});

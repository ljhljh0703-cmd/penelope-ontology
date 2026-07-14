import { describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadDraftFixture,
  loadOverlayFixture,
  loadReplayCases,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import type { ParticipantIntent } from "@/src/contracts/participant-intent";
import {
  buildCanonOverlay,
  createCanonProposal,
  overlayPayload,
} from "@/src/domain/canon-overlay";
import { canonicalJson } from "@/src/domain/canonical-json";
import { buildGraphDescriptor } from "@/src/domain/graph-descriptor";
import { buildCharacterAgentViews } from "@/src/domain/retrieval";
import { rebaseSnapshot } from "@/src/domain/simulation";
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

  it("keeps locked rule semantics visible beside non-authoritative display wording", async () => {
    const [pack, baseOverlay, baseSnapshot, draft] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v1.red-sail"),
      loadSnapshotFixture("snapshot.s0r"),
      loadDraftFixture("draft.red_sail_step_1"),
    ]);
    const overlay = buildCanonOverlay({
      ...overlayPayload(baseOverlay),
      rules: baseOverlay.rules.map((rule) =>
        rule.id === "rule.creator.red_sail_signal"
          ? { ...rule, displayDescription: "Blue lantern teleport rule." }
          : rule,
      ),
    });
    const semanticDescription = baseOverlay.rules.find(
      ({ id }) => id === "rule.creator.red_sail_signal",
    )?.description;
    if (!semanticDescription) throw new Error("Missing registered red-sail semantic rule.");
    const snapshot = rebaseSnapshot(baseSnapshot, overlay);
    const participantIntents: ParticipantIntent[] = [
      {
        intentId: "intent.penelope",
        participantId: "participant.one",
        controlledEntityIds: ["penelope"],
        intent: "Remain cautious.",
      },
      {
        intentId: "intent.eurycleia",
        participantId: "participant.two",
        controlledEntityIds: ["eurycleia"],
        intent: "Offer support.",
      },
    ];
    const characterViews = buildCharacterAgentViews({
      pack,
      overlay,
      snapshot,
      participantIntents,
    });
    const graph = buildGraphDescriptor({
      pack,
      overlay,
      snapshot,
      draft,
      characterViews,
      violations: [],
      proposals: [],
    });

    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        id: "rule.rule.creator.red_sail_signal",
        label: semanticDescription,
        nonAuthoritativeDisplayLabel: "Blue lantern teleport rule.",
        visualState: "approved_overlay",
      }),
    );
  });

  it("keeps approval status for an overlay claim that remains hidden from focal characters", async () => {
    const [pack, baseOverlay, baseSnapshot, draft] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
      loadDraftFixture("draft.grounded_penelope"),
    ]);
    const overlay = buildCanonOverlay({
      ...overlayPayload(baseOverlay),
      version: 1,
      claims: [
        {
          id: "claim.creator.private_sign",
          subjectId: "penelope",
          predicate: "keeps_private_sign",
          object: { kind: "literal", value: "a sealed token" },
          temporalScope: "ithaca.odyssey_book_1",
          spatialScope: "ithaca",
          epistemicVisibility: ["narrator"],
          conflictSetId: null,
          summary: "A creator-approved sign remains outside the focal characters' views.",
          sourceIds: ["source.odyssey.1"],
          layerId: "creator_canon",
          status: "asserted",
        },
      ],
    });
    const snapshot = rebaseSnapshot(baseSnapshot, overlay);
    const participantIntents: ParticipantIntent[] = [
      {
        intentId: "intent.penelope",
        participantId: "participant.one",
        controlledEntityIds: ["penelope"],
        intent: "Remain cautious.",
      },
      {
        intentId: "intent.eurycleia",
        participantId: "participant.two",
        controlledEntityIds: ["eurycleia"],
        intent: "Offer support.",
      },
    ];
    const characterViews = buildCharacterAgentViews({
      pack,
      overlay,
      snapshot,
      participantIntents,
    });
    const graph = buildGraphDescriptor({
      pack,
      overlay,
      snapshot,
      draft,
      characterViews,
      violations: [],
      proposals: [],
    });

    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        id: "edge.claim.claim.creator.private_sign",
        visualState: "approved_overlay",
        status: "approved",
        visibleToIds: [],
      }),
    );
  });

  it("is byte-stable for identical structured inputs", async () => {
    const first = await graphForFixture("draft.grounded_penelope");
    const second = await graphForFixture("draft.grounded_penelope");
    expect(canonicalJson(second.graph)).toBe(canonicalJson(first.graph));
    expectOrderedAndClosed(first.graph);
  });
});

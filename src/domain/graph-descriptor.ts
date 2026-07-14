import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { ModelDraft } from "@/src/contracts/model-draft";
import type { CanonProposal } from "@/src/contracts/proposal";
import type {
  CharacterAgentView,
  HardViolation,
} from "@/src/contracts/run";
import {
  GraphDescriptorSchema,
  type GraphDescriptor,
  type GraphNode,
  type GraphEdge,
  type GraphVisualState,
} from "@/src/contracts/graph";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import type { Claim, WorldPack } from "@/src/domain/schemas";

const visualPriority: Record<GraphVisualState, number> = {
  active_evidence: 0,
  current_scenario_value: 1,
  approved_overlay: 2,
  missing_character_knowledge: 3,
  ghost_proposal: 4,
  blocked_assertion: 5,
};

const claimObjectNode = (claim: Claim): { id: string; label: string; kind: "entity" | "literal" } =>
  claim.object.kind === "entity"
    ? { id: `entity.${claim.object.entityId}`, label: claim.object.entityId, kind: "entity" }
    : { id: `literal.${claim.id}`, label: claim.object.value, kind: "literal" };

const makeNode = (
  id: string,
  kind: GraphNode["kind"],
  label: string,
  visualState: GraphVisualState,
  evidenceIds: string[] = [],
  nonAuthoritativeDisplayLabel: string | null = null,
): GraphNode => ({
  id,
  kind,
  label,
  nonAuthoritativeDisplayLabel,
  visualState,
  evidenceIds: [...new Set(evidenceIds)].sort(),
});

export const buildGraphDescriptor = ({
  pack,
  overlay,
  snapshot,
  draft,
  characterViews,
  violations,
  proposals,
}: {
  pack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  draft: ModelDraft;
  characterViews: ReadonlyArray<CharacterAgentView>;
  violations: ReadonlyArray<HardViolation>;
  proposals: ReadonlyArray<CanonProposal>;
}): GraphDescriptor => {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const blockedIds = new Set(violations.flatMap(({ evidenceIds }) => evidenceIds));
  const visibleClaims = new Set(
    characterViews.flatMap(({ knownClaimIds, uncertainClaimIds }) => [
      ...knownClaimIds,
      ...uncertainClaimIds,
    ]),
  );
  const activeLayers = new Set(
    pack.canonProfiles.find(({ id }) => id === snapshot.canonProfileId)?.activeLayerIds ?? [],
  );

  const upsertNode = (node: GraphNode): void => {
    const current = nodes.get(node.id);
    if (!current || visualPriority[node.visualState] > visualPriority[current.visualState]) {
      nodes.set(node.id, node);
    }
  };
  const addEntityNode = (entityId: string, state: GraphVisualState, evidenceIds: string[]): void => {
    const entity = pack.entities.find(({ id }) => id === entityId);
    upsertNode(makeNode(`entity.${entityId}`, "entity", entity?.name ?? entityId, state, evidenceIds));
  };

  const claims = [
    ...pack.claims.filter(({ layerId }) => activeLayers.has(layerId)),
    ...overlay.claims,
  ].sort(({ id: left }, { id: right }) => left.localeCompare(right));

  for (const claim of claims) {
    const fromNodeId = `entity.${claim.subjectId}`;
    const objectNode = claimObjectNode(claim);
    const isOverlay = claim.layerId === "creator_canon";
    const isBlocked = blockedIds.has(claim.id);
    const isMissing = !visibleClaims.has(claim.id);
    const visualState: GraphVisualState = isBlocked
      ? "blocked_assertion"
      : isOverlay
        ? "approved_overlay"
        : isMissing
          ? "missing_character_knowledge"
          : "active_evidence";
    addEntityNode(claim.subjectId, visualState, [claim.id]);
    if (objectNode.kind === "entity") {
      addEntityNode(claim.object.kind === "entity" ? claim.object.entityId : objectNode.id, visualState, [claim.id]);
    } else {
      upsertNode(makeNode(objectNode.id, "literal", objectNode.label, visualState, [claim.id]));
    }
    edges.set(`edge.claim.${claim.id}`, {
      id: `edge.claim.${claim.id}`,
      kind: "claim",
      fromNodeId,
      toNodeId: objectNode.id,
      predicate: claim.predicate,
      visualState,
      evidenceIds: [claim.id, ...claim.sourceIds].sort(),
      visibleToIds: characterViews
        .filter(({ knownClaimIds, uncertainClaimIds }) =>
          [...knownClaimIds, ...uncertainClaimIds].includes(claim.id),
        )
        .map(({ characterId }) => characterId)
        .sort(),
      status: isBlocked ? "blocked" : isOverlay ? "approved" : isMissing ? "missing" : "active",
    });
  }

  const conflicts = new Map<string, Claim[]>();
  for (const claim of claims) {
    if (claim.conflictSetId) {
      conflicts.set(claim.conflictSetId, [...(conflicts.get(claim.conflictSetId) ?? []), claim]);
    }
  }
  for (const [conflictId, conflictClaims] of conflicts) {
    if (conflictClaims.length < 2) continue;
    const [first, second] = [...conflictClaims].sort(({ id: left }, { id: right }) => left.localeCompare(right));
    const firstNode = claimObjectNode(first);
    const secondNode = claimObjectNode(second);
    edges.set(`edge.conflict.${conflictId}`, {
      id: `edge.conflict.${conflictId}`,
      kind: "conflict",
      fromNodeId: firstNode.id,
      toNodeId: secondNode.id,
      predicate: null,
      visualState: "blocked_assertion",
      evidenceIds: conflictClaims.map(({ id }) => id).sort(),
      visibleToIds: [],
      status: "blocked",
    });
  }

  for (const proposal of proposals) {
    const proposalNodeId = `proposal.${proposal.id}`;
    upsertNode(
      makeNode(proposalNodeId, "proposal", proposal.summary, "ghost_proposal", [proposal.id]),
    );
    for (const patch of proposal.patches) {
      if (patch.op === "add_rule") {
        const ruleNodeId = `rule.${patch.rule.id}`;
        upsertNode(
          makeNode(
            ruleNodeId,
            "rule",
            patch.rule.description,
            "ghost_proposal",
            [proposal.id],
            patch.rule.displayDescription,
          ),
        );
        edges.set(`edge.proposal.${proposal.id}.${patch.rule.id}`, {
          id: `edge.proposal.${proposal.id}.${patch.rule.id}`,
          kind: "proposal",
          fromNodeId: proposalNodeId,
          toNodeId: ruleNodeId,
          predicate: "proposes",
          visualState: "ghost_proposal",
          evidenceIds: [proposal.id],
          visibleToIds: [],
          status: "proposed",
        });
      } else {
        const targetNodeId = `entity.${patch.claim.subjectId}`;
        addEntityNode(patch.claim.subjectId, "ghost_proposal", [proposal.id]);
        edges.set(`edge.proposal.${proposal.id}.${patch.claim.id}`, {
          id: `edge.proposal.${proposal.id}.${patch.claim.id}`,
          kind: "proposal",
          fromNodeId: proposalNodeId,
          toNodeId: targetNodeId,
          predicate: patch.claim.predicate,
          visualState: "ghost_proposal",
          evidenceIds: [proposal.id],
          visibleToIds: [],
          status: "proposed",
        });
      }
    }
  }

  for (const rule of overlay.rules) {
    const nodeId = `rule.${rule.id}`;
    upsertNode(
      makeNode(
        nodeId,
        "rule",
        rule.description,
        "approved_overlay",
        [rule.id],
        rule.displayDescription ?? null,
      ),
    );
  }

  const snapshotNodeId = `snapshot.${snapshot.stateHash.slice(0, 12)}`;
  upsertNode(
    makeNode(
      snapshotNodeId,
      "snapshot",
      `Turn ${snapshot.turnIndex}`,
      "current_scenario_value",
      [snapshot.scenarioId],
    ),
  );
  for (const variable of snapshot.variables) {
    const variableNodeId = `state_variable.${variable.id}`;
    const valueNodeId = `state_value.${variable.id}.${variable.value}`;
    upsertNode(
      makeNode(variableNodeId, "state_variable", variable.id, "current_scenario_value", [snapshot.scenarioId]),
    );
    upsertNode(
      makeNode(valueNodeId, "state_value", variable.value, "current_scenario_value", [snapshot.stateHash]),
    );
    edges.set(`edge.current_value.${variable.id}`, {
      id: `edge.current_value.${variable.id}`,
      kind: "current_value",
      fromNodeId: variableNodeId,
      toNodeId: valueNodeId,
      predicate: "current_value",
      visualState: "current_scenario_value",
      evidenceIds: [snapshot.stateHash],
      visibleToIds: [],
      status: "current",
    });
    edges.set(`edge.applied.${snapshot.stateHash.slice(0, 12)}.${variable.id}`, {
      id: `edge.applied.${snapshot.stateHash.slice(0, 12)}.${variable.id}`,
      kind: "applied",
      fromNodeId: snapshotNodeId,
      toNodeId: variableNodeId,
      predicate: "tracks",
      visualState: "current_scenario_value",
      evidenceIds: [snapshot.stateHash],
      visibleToIds: [],
      status: "current",
    });
  }

  // Keep aliases reported by the draft visible in the audit surface without creating hidden edges.
  for (const entityId of draft.mentionedEntityIds) {
    addEntityNode(entityId, blockedIds.has(entityId) ? "blocked_assertion" : "active_evidence", [entityId]);
  }

  return GraphDescriptorSchema.parse({
    id: `graph.${snapshot.stateHash.slice(0, 12)}`,
    nodes: [...nodes.values()].sort(({ id: left }, { id: right }) => left.localeCompare(right)),
    edges: [...edges.values()].sort(({ id: left }, { id: right }) => left.localeCompare(right)),
  });
};

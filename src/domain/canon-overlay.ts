import {
  CanonOverlayPayloadSchema,
  CanonOverlaySchema,
  type CanonOverlay,
  type CanonOverlayPayload,
} from "@/src/contracts/canon-overlay";
import type {
  CreatorDecision,
  CreatorDecisionResult,
} from "@/src/contracts/creator-decision";
import {
  CanonProposalSchema,
  type CanonProposal,
  type ModelProposal,
  type ProposalPatch,
} from "@/src/contracts/proposal";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { WorldPackSchema, type WorldPack } from "@/src/domain/schemas";
import {
  hasValidSnapshotHash,
  rebaseSnapshot,
} from "@/src/domain/simulation";

const normalizeOverlayPayload = (payload: CanonOverlayPayload): CanonOverlayPayload => ({
  ...payload,
  claims: [...payload.claims].sort(({ id: left }, { id: right }) => left.localeCompare(right)),
  rules: [...payload.rules].sort(({ id: left }, { id: right }) => left.localeCompare(right)),
});

export const buildCanonOverlay = (input: CanonOverlayPayload): CanonOverlay => {
  const payload = normalizeOverlayPayload(CanonOverlayPayloadSchema.parse(input));
  return CanonOverlaySchema.parse({ ...payload, hash: sha256Canonical(payload) });
};

export const overlayPayload = (overlay: CanonOverlay): CanonOverlayPayload => {
  const parsed = CanonOverlaySchema.parse(overlay);
  return {
    id: parsed.id,
    version: parsed.version,
    worldPackId: parsed.worldPackId,
    worldPackVersion: parsed.worldPackVersion,
    claims: parsed.claims,
    rules: parsed.rules,
  };
};

export const hasValidOverlayHash = (overlay: CanonOverlay): boolean =>
  sha256Canonical(normalizeOverlayPayload(overlayPayload(overlay))) === overlay.hash;

const proposalHashPayload = (proposal: Omit<CanonProposal, "proposalHash">) => proposal;

export const createCanonProposal = (
  proposal: ModelProposal,
  overlay: CanonOverlay,
): CanonProposal => {
  if (!hasValidOverlayHash(overlay)) {
    throw new Error("Cannot bind a proposal to an invalid overlay hash.");
  }
  const payload: Omit<CanonProposal, "proposalHash"> = {
    ...proposal,
    baseOverlayId: overlay.id,
    baseOverlayVersion: overlay.version,
    baseOverlayHash: overlay.hash,
  };
  return CanonProposalSchema.parse({
    ...payload,
    proposalHash: sha256Canonical(proposalHashPayload(payload)),
  });
};

export const hasValidProposalHash = (proposal: CanonProposal): boolean => {
  const { proposalHash, ...payload } = CanonProposalSchema.parse(proposal);
  return sha256Canonical(proposalHashPayload(payload)) === proposalHash;
};

const applyPatches = (
  pack: WorldPack,
  overlay: CanonOverlay,
  patches: ReadonlyArray<ProposalPatch>,
): CanonOverlay => {
  const claims = [...overlay.claims];
  const rules = [...overlay.rules];
  const knownIds = new Set([
    ...pack.claims.map(({ id }) => id),
    ...pack.rules.map(({ id }) => id),
    ...claims.map(({ id }) => id),
    ...rules.map(({ id }) => id),
  ]);
  const entityIds = new Set(pack.entities.map(({ id }) => id));
  const sourceIds = new Set(pack.sources.map(({ id }) => id));
  const phaseIds = new Set(pack.events.map(({ phaseId }) => phaseId));
  const visibilityIds = new Set(["all", "gods", "narrator", ...entityIds]);

  for (const patch of patches) {
    const targetId = patch.op === "add_claim" ? patch.claim.id : patch.rule.id;
    if (knownIds.has(targetId)) {
      throw new Error(`Overlay target already exists: ${targetId}`);
    }
    knownIds.add(targetId);

    if (patch.op === "add_claim") {
      const referencedEntityIds = [
        patch.claim.subjectId,
        ...(patch.claim.object.kind === "entity" ? [patch.claim.object.entityId] : []),
        ...(patch.claim.spatialScope ? [patch.claim.spatialScope] : []),
      ];
      if (
        referencedEntityIds.some((id) => !entityIds.has(id)) ||
        !phaseIds.has(patch.claim.temporalScope) ||
        patch.claim.sourceIds.some((id) => !sourceIds.has(id)) ||
        patch.claim.epistemicVisibility.some((id) => !visibilityIds.has(id))
      ) {
        throw new Error(`Claim patch has references outside the selected World Pack: ${targetId}`);
      }
      claims.push({
        ...patch.claim,
        layerId: "creator_canon",
        status: "asserted",
      });
    } else {
      if (!pack.expansionPolicy.allowNewRules) {
        throw new Error("The selected World Pack does not allow new creator rules.");
      }
      const { displayDescription, ...semanticRule } = patch.rule;
      rules.push({
        ...semanticRule,
        ...(displayDescription ? { displayDescription } : {}),
        layerId: "creator_canon",
        status: "active",
      });
    }
  }

  return buildCanonOverlay({
    ...overlayPayload(overlay),
    version: overlay.version + 1,
    claims,
    rules,
  });
};

const patchAuthority = (patches: ReadonlyArray<ProposalPatch>): string =>
  sha256Canonical(
    patches
      .map((patch) =>
        patch.op === "add_claim"
          ? {
              op: patch.op,
              id: patch.claim.id,
              subjectId: patch.claim.subjectId,
              predicate: patch.claim.predicate,
              object: patch.claim.object,
              temporalScope: patch.claim.temporalScope,
              spatialScope: patch.claim.spatialScope,
              epistemicVisibility: patch.claim.epistemicVisibility,
              conflictSetId: patch.claim.conflictSetId,
              summary: patch.claim.summary,
              sourceIds: patch.claim.sourceIds,
            }
          : {
              op: patch.op,
              id: patch.rule.id,
              kind: patch.rule.kind,
              description: patch.rule.description,
            },
      )
      .sort(({ id: left }, { id: right }) => left.localeCompare(right)),
  );

const samePatchAuthority = (
  proposalPatches: ReadonlyArray<ProposalPatch>,
  editedPatches: ReadonlyArray<ProposalPatch>,
): boolean =>
  patchAuthority(proposalPatches) === patchAuthority(editedPatches);

export const applyCreatorDecision = ({
  worldPack: worldPackInput,
  overlay,
  snapshot,
  proposal,
  decision,
}: {
  worldPack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  proposal: CanonProposal;
  decision: CreatorDecision;
}): CreatorDecisionResult => {
  const parsedPack = WorldPackSchema.safeParse(worldPackInput);
  if (!parsedPack.success) return { status: "invalid", overlay, snapshot };
  const worldPack = parsedPack.data;
  const stale =
    !hasValidOverlayHash(overlay) ||
    !hasValidSnapshotHash(snapshot) ||
    overlay.worldPackId !== worldPack.meta.id ||
    overlay.worldPackVersion !== worldPack.meta.version ||
    snapshot.worldPackVersion !== worldPack.meta.version ||
    snapshot.overlayId !== overlay.id ||
    snapshot.overlayVersion !== overlay.version ||
    snapshot.canonHash !== overlay.hash ||
    overlay.id !== decision.baseOverlayId ||
    overlay.version !== decision.baseOverlayVersion ||
    overlay.hash !== decision.baseOverlayHash ||
    proposal.baseOverlayId !== overlay.id ||
    proposal.baseOverlayVersion !== overlay.version ||
    proposal.baseOverlayHash !== overlay.hash;
  if (stale) return { status: "stale", overlay, snapshot };

  const invalid =
    !hasValidProposalHash(proposal) ||
    decision.proposalId !== proposal.id ||
    decision.proposalHash !== proposal.proposalHash;
  if (invalid) return { status: "invalid", overlay, snapshot };

  if (decision.action === "reject") {
    return { status: "rejected", overlay, snapshot };
  }

  if (!worldPack.expansionPolicy.approvalActions.includes(decision.action)) {
    return { status: "invalid", overlay, snapshot };
  }
  if (
    decision.action === "edit" &&
    !samePatchAuthority(proposal.patches, decision.patches)
  ) {
    return { status: "invalid", overlay, snapshot };
  }

  try {
    const nextOverlay = applyPatches(
      worldPack,
      overlay,
      decision.action === "edit" ? decision.patches : proposal.patches,
    );
    return {
      status: "applied",
      overlay: nextOverlay,
      snapshot: rebaseSnapshot(snapshot, nextOverlay),
    };
  } catch {
    return { status: "invalid", overlay, snapshot };
  }
};

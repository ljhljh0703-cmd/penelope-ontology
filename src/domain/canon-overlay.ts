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
import { rebaseSnapshot } from "@/src/domain/simulation";

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
  overlay: CanonOverlay,
  patches: ReadonlyArray<ProposalPatch>,
): CanonOverlay => {
  const claims = [...overlay.claims];
  const rules = [...overlay.rules];
  const knownIds = new Set([...claims.map(({ id }) => id), ...rules.map(({ id }) => id)]);

  for (const patch of patches) {
    const targetId = patch.op === "add_claim" ? patch.claim.id : patch.rule.id;
    if (knownIds.has(targetId)) {
      throw new Error(`Overlay target already exists: ${targetId}`);
    }
    knownIds.add(targetId);

    if (patch.op === "add_claim") {
      claims.push({
        ...patch.claim,
        layerId: "creator_canon",
        status: "asserted",
      });
    } else {
      rules.push({
        ...patch.rule,
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

export const applyCreatorDecision = ({
  overlay,
  snapshot,
  proposal,
  decision,
}: {
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  proposal: CanonProposal;
  decision: CreatorDecision;
}): CreatorDecisionResult => {
  const stale =
    !hasValidOverlayHash(overlay) ||
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

  try {
    const nextOverlay = applyPatches(
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

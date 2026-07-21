import {
  VisualMomentCandidateSchema,
  VisualMomentDecisionSchema,
  type VisualMomentCandidate,
  type VisualMomentDecision,
  type VisualMomentTrigger,
} from "@/src/contracts/visual-moment";

export const selectVisualMomentTrigger = ({
  status,
  forked,
  turn,
  ending,
}: {
  status: "active" | "complete";
  forked: boolean;
  turn: number;
  ending: { id: string; kind: string; summary: string } | null;
}): VisualMomentTrigger | null => {
  if (turn < 1) return null;
  if (status === "complete" && ending !== null) return "ending_divergence";
  if (forked) return "irreversible_choice";
  return null;
};

export const applyVisualMomentDecision = ({
  candidate: candidateInput,
  action,
}: {
  candidate: VisualMomentCandidate;
  action: "approve" | "reference_only" | "reject";
}): VisualMomentDecision => {
  const candidate = VisualMomentCandidateSchema.parse(candidateInput);
  const status =
    action === "approve"
      ? "approved"
      : action === "reject"
        ? "rejected"
        : "reference_only";
  return VisualMomentDecisionSchema.parse({
    candidateId: candidate.candidateId,
    checkpointId: candidate.checkpointId,
    renderHash: candidate.frame.renderHash,
    status,
    bindsToCheckpoint: status === "approved",
  });
};

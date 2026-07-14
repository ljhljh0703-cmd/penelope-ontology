import {
  LiveRunRequestSchema,
  type RunRequest,
} from "@/src/contracts/run";
import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { SimulationSnapshot } from "@/src/contracts/simulation";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

export const buildLiveEvidenceRunRequest = ({
  overlay,
  snapshot,
  styleProfileId,
}: {
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  styleProfileId: string;
}): LiveRunRequest =>
  LiveRunRequestSchema.parse({
    modelMode: "live",
    overlay,
    snapshot,
    styleProfileId,
    taskType: "scene",
    brief: "Let Penelope and Eurycleia discuss a rumor without revealing hidden facts.",
    participantIntents: [
      {
        intentId: "intent.penelope",
        participantId: "participant.one",
        controlledEntityIds: ["penelope"],
        intent: "Keep Penelope cautious and focused on what she can prepare.",
      },
      {
        intentId: "intent.eurycleia",
        participantId: "participant.two",
        controlledEntityIds: ["eurycleia"],
        intent: "Offer household support without claiming secret knowledge.",
      },
    ],
  });

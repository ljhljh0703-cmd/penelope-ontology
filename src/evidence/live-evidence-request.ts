import {
  LiveRunRequestSchema,
  type RunRequest,
} from "@/src/contracts/run";
import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import {
  assertLiveRedSailScenarioAuthority,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
} from "@/src/evidence/live-scenario-contract";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

export const buildLiveEvidenceRunRequest = ({
  overlay,
  snapshot,
  styleProfileId,
}: {
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  styleProfileId: string;
}): LiveRunRequest => {
  assertLiveRedSailScenarioAuthority({ overlay, snapshot, styleProfileId });
  const { request } = LIVE_RED_SAIL_SCENARIO_CONTRACT;
  return LiveRunRequestSchema.parse({
    modelMode: "live",
    outputLocale: request.outputLocale,
    overlay,
    snapshot,
    styleProfileId,
    taskType: request.taskType,
    brief: request.brief,
    participantIntents: request.participantIntents,
  });
};

import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { CreatorDecisionResult } from "@/src/contracts/creator-decision";
import type { HardViolation } from "@/src/contracts/run";
import type {
  SimulationSnapshot,
  SimulationTransitionRecord,
} from "@/src/contracts/simulation";
import type { StyleProfile } from "@/src/contracts/style-profile";

export type DemoParticipantSlot = {
  intentId: string;
  participantId: string;
  controlledEntityId: string;
  characterLabel: string;
  defaultIntent: string;
};

export type DemoReplayResult = {
  id: string;
  label: string;
  status: "pass" | "fail";
  detail: string;
};

export type DemoBootstrap = {
  mode: "fixture";
  worldPack: {
    id: string;
    version: string;
    label: string;
  };
  styleProfiles: StyleProfile[];
  selectedStyleProfileId: string;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  participantSlots: DemoParticipantSlot[];
  replayResults: DemoReplayResult[];
};

export type TransitionApiResult = {
  status: "applied" | "blocked";
  snapshot: SimulationSnapshot;
  transition: SimulationTransitionRecord;
  violations: HardViolation[];
};

export type DecisionApiResult = CreatorDecisionResult;

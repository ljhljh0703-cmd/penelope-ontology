import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { CreatorDecisionResult } from "@/src/contracts/creator-decision";
import type { GraphDescriptor } from "@/src/contracts/graph";
import type { ParticipantIntent } from "@/src/contracts/participant-intent";
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
  frozen: true;
};

export type DemoRegisteredRehearsal = {
  replayCaseId: "replay.red_sail_proposal";
  stageId: string;
  draftFixtureId: "draft.red_sail_proposal";
  styleProfileId: string;
  taskType: "expand";
  brief: string;
  participantIntents: ParticipantIntent[];
  frozen: true;
};

export type DemoKnowledgeBoundary = {
  perspectiveId: "narrator" | "penelope";
  perspectiveLabel: string;
  factLabel: string;
  status: "visible" | "withheld" | "uncertain";
  evidenceId: string;
  basis: string;
};

export type DemoReplayResult = {
  id: string;
  label: string;
  status: "pass" | "fail";
  detail: string;
};

export type OverlayReplayApiResult = {
  suiteId: "approved_overlay_regression";
  overlayId: string;
  overlayVersion: number;
  overlayHash: string;
  allPassed: boolean;
  replayResults: DemoReplayResult[];
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
  registeredRehearsal: DemoRegisteredRehearsal;
  knowledgeBoundary: DemoKnowledgeBoundary[];
  proofs: {
    grounded: {
      status: "passed";
      narrative: string;
      usedClaimIds: string[];
      selectedClaimIds: string[];
      characterViews: Array<{
        characterId: string;
        knownClaimIds: string[];
        uncertainClaimIds: string[];
      }>;
    };
    conflict: {
      status: "needs_creator_decision";
      violationCodes: string[];
      evidenceIds: string[];
      graph: GraphDescriptor;
    };
  };
  replayResults: DemoReplayResult[];
};

export type TransitionApiResult = {
  status: "applied" | "blocked";
  snapshot: SimulationSnapshot;
  transition: SimulationTransitionRecord;
  violations: HardViolation[];
};

export type DecisionApiResult = {
  decision: CreatorDecisionResult;
  graph: GraphDescriptor;
  overlayReplay: OverlayReplayApiResult | null;
};

import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { ModelDraft } from "@/src/contracts/model-draft";
import type { ParticipantIntent } from "@/src/contracts/participant-intent";
import type { CharacterAgentView, HardViolation } from "@/src/contracts/run";
import type {
  SimulationScenario,
  SimulationSnapshot,
} from "@/src/contracts/simulation";
import type { StyleProfile } from "@/src/contracts/style-profile";
import type { WorldPack, WorldState } from "@/src/domain/schemas";

export type ValidationContext = {
  pack: WorldPack;
  overlay: CanonOverlay;
  state: WorldState;
  scenario: SimulationScenario;
  snapshot: SimulationSnapshot;
  styleProfile: StyleProfile;
  participantIntents: ReadonlyArray<ParticipantIntent>;
  characterViews: ReadonlyArray<CharacterAgentView>;
  activeLayerIds: ReadonlySet<string>;
};

export type HardValidator = (
  draft: ModelDraft,
  context: ValidationContext,
) => ReadonlyArray<HardViolation>;

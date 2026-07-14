import type { ModelDraft } from "@/src/contracts/model-draft";
import type { HardViolation } from "@/src/contracts/run";
import type { WorldPack, WorldState } from "@/src/domain/schemas";

export type ValidationContext = {
  pack: WorldPack;
  state: WorldState;
  activeLayerIds: ReadonlySet<string>;
};

export type HardValidator = (
  draft: ModelDraft,
  context: ValidationContext,
) => ReadonlyArray<HardViolation>;

// Implementations belong to the clean core-build session. This Day 0 file fixes the contract only.

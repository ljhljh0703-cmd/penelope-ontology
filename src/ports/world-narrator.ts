import type {
  WorldNarrationRequest,
  WorldNarratorOutcome,
} from "@/src/contracts/world-narrator";

/**
 * Narrates already-resolved world events. It has no authority to resolve an
 * action, mutate canon, grant knowledge, or create world effects.
 */
export interface WorldNarrator {
  narrate(request: WorldNarrationRequest): Promise<WorldNarratorOutcome>;
}

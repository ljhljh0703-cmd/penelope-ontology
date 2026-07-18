import type {
  NarrationCriticRequest,
  NarrationRendererOutcome,
  NarrationRendererRequest,
} from "@/src/contracts/world-narrator";

/**
 * Renders a deterministic, already-authorized scene plan. The request type has
 * no private validation, render-audit, or trusted-evidence field.
 */
export interface NarrationRenderer {
  render(request: NarrationRendererRequest): Promise<NarrationRendererOutcome>;
}

/** Optional one-shot warning repair. Hard failures must never call this port. */
export interface NarrationCritic {
  revise(request: NarrationCriticRequest): Promise<NarrationRendererOutcome>;
}

import type { NarrativeModel } from "@/src/ports/narrative-model";

export const fixtureNarrativeModel: NarrativeModel = {
  async generate(_request, evidence) {
    return {
      draft: {
        narrative: "Penelope keeps uncertainty intact; no unsupported return is declared.",
        usedClaimIds: evidence.claimIds,
        assertedClaims: [],
        characterActions: [],
        stateChanges: [],
        unknowns: [],
        expansionCandidates: [],
      },
      trace: {
        mode: "fixture",
        outcome: "fixture",
        requestedModel: "fixture-v1",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      },
    };
  },
};

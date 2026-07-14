import type { NarrativeModelOutcome } from "@/src/contracts/model-outcome";
import type { EvidenceBundle, RunRequest } from "@/src/contracts/run";

export interface NarrativeModel {
  generate(request: RunRequest, evidence: EvidenceBundle): Promise<NarrativeModelOutcome>;
}

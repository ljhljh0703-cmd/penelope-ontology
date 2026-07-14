import type { ModelDraft } from "@/src/contracts/model-draft";
import type { ModelTrace, RunRequest } from "@/src/contracts/run";

export type EvidenceBundle = {
  entityIds: string[];
  claimIds: string[];
  eventIds: string[];
  ruleIds: string[];
  context: string;
};

export type NarrativeModelOutput = {
  draft: ModelDraft;
  trace: ModelTrace;
};

export interface NarrativeModel {
  generate(request: RunRequest, evidence: EvidenceBundle): Promise<NarrativeModelOutput>;
}

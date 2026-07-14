import { z } from "zod";
import { IdentifierSchema } from "@/src/contracts/common";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import { GraphDescriptorSchema } from "@/src/contracts/graph";
import {
  ModelTraceSchema,
  NarrativeModelOutcomeSchema,
} from "@/src/contracts/model-outcome";
import { ParticipantIntentSetSchema } from "@/src/contracts/participant-intent";
import { CanonProposalSchema } from "@/src/contracts/proposal";
import {
  CandidateActionSchema,
  SimulationSnapshotSchema,
} from "@/src/contracts/simulation";

const RunRequestBaseFields = {
  overlay: CanonOverlaySchema,
  snapshot: SimulationSnapshotSchema,
  styleProfileId: IdentifierSchema,
  taskType: z.enum(["query", "scene", "action", "expand"]),
  brief: z.string().min(1).max(2_000),
  participantIntents: ParticipantIntentSetSchema,
} as const;

export const FixtureRunRequestSchema = z
  .object({
    ...RunRequestBaseFields,
    modelMode: z.literal("fixture"),
    draftFixtureId: IdentifierSchema,
  })
  .strict();

export const LiveRunRequestSchema = z
  .object({
    ...RunRequestBaseFields,
    modelMode: z.literal("live"),
  })
  .strict();

export const RunRequestSchema = z.discriminatedUnion("modelMode", [
  FixtureRunRequestSchema,
  LiveRunRequestSchema,
]);

export const ViolationCodeSchema = z.enum([
  "entity_unknown",
  "entity_state_invalid",
  "fixed_state_missing",
  "temporal_order_violation",
  "location_path_missing",
  "belief_scope_violation",
  "tradition_conflict_unresolved",
  "tradition_inactive",
  "unsupported_claim",
  "unapproved_expansion",
  "intent_lineage_invalid",
  "unauthorized_speaker",
  "unauthorized_action",
  "style_constraint_invalid",
  "entity_alias_mismatch",
  "overlay_mismatch",
  "proposal_hash_invalid",
  "stale_decision",
  "state_variable_invalid",
  "state_transition_invalid",
  "step_limit_exceeded",
]);

export const HardViolationSchema = z
  .object({
    code: ViolationCodeSchema,
    message: z.string().min(1),
    evidenceIds: z.array(IdentifierSchema),
  })
  .strict();

export const CharacterAgentViewSchema = z
  .object({
    characterId: IdentifierSchema,
    entityIds: z.array(IdentifierSchema),
    knownClaimIds: z.array(IdentifierSchema),
    uncertainClaimIds: z.array(IdentifierSchema),
    eventIds: z.array(IdentifierSchema),
    ruleIds: z.array(IdentifierSchema),
    context: z.string().min(1),
  })
  .strict();

export const EvidenceBundleSchema = z
  .object({
    entityIds: z.array(IdentifierSchema),
    claimIds: z.array(IdentifierSchema),
    eventIds: z.array(IdentifierSchema),
    ruleIds: z.array(IdentifierSchema),
    characterViews: z.array(CharacterAgentViewSchema),
    context: z.string().min(1),
  })
  .strict();

export const RunResultSchema = z
  .object({
    status: z.enum(["passed", "blocked", "needs_creator_decision", "refused", "error"]),
    runId: IdentifierSchema,
    evidence: EvidenceBundleSchema,
    modelOutcome: NarrativeModelOutcomeSchema,
    hardViolations: z.array(HardViolationSchema),
    proposals: z.array(CanonProposalSchema),
    graph: GraphDescriptorSchema,
    transitionCandidate: CandidateActionSchema.nullable(),
    currentSnapshot: SimulationSnapshotSchema,
    proposedNextSnapshot: SimulationSnapshotSchema,
  })
  .strict();

export type RunRequest = z.infer<typeof RunRequestSchema>;
export type ModelTrace = z.infer<typeof ModelTraceSchema>;
export type RunResult = z.infer<typeof RunResultSchema>;
export type HardViolation = z.infer<typeof HardViolationSchema>;
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
export type CharacterAgentView = z.infer<typeof CharacterAgentViewSchema>;
export type CanonOverlayInput = z.infer<typeof CanonOverlaySchema>;

export { ModelTraceSchema } from "@/src/contracts/model-outcome";

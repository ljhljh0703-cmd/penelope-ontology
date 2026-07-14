import { z } from "zod";
import { IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";
import { SimulationScenarioSchema } from "@/src/contracts/simulation";
import { StyleProfileSchema } from "@/src/contracts/style-profile";

export { IdentifierSchema } from "@/src/contracts/common";

const uniqueIds = (
  values: ReadonlyArray<{ id: string }>,
  label: string,
  context: z.RefinementCtx,
): void => {
  addDuplicateIssues(
    values.map(({ id }) => id),
    `${label} id`,
    context,
  );
};

export const SourceSchema = z
  .object({
    id: IdentifierSchema,
    work: z.string().min(1),
    author: z.string().min(1),
    locator: z.string().min(1),
    url: z.url(),
    editionNote: z.string().min(1),
    rightsStatus: z.enum(["public_domain_source", "reference_only", "pending_review"]),
    verificationStatus: z.enum(["verified", "source_verify", "rights_verify"]),
  })
  .strict();

export const LayerSchema = z
  .object({
    id: IdentifierSchema,
    traditionGroup: z.enum([
      "homeric",
      "later_tragedy",
      "roman_adaptation",
      "creator_canon",
    ]),
    sourceWork: z.string().min(1),
    rightsStatus: z.enum(["public_domain_source", "original_creator_canon"]),
  })
  .strict();

export const EntitySchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum(["character", "place", "object", "concept"]),
    name: z.string().min(1),
    aliases: z.array(z.string().min(1)),
    summary: z.string().min(1),
  })
  .strict();

export const ClaimObjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entity"), entityId: IdentifierSchema }).strict(),
  z.object({ kind: z.literal("literal"), value: z.string().min(1) }).strict(),
]);

export const ClaimSchema = z
  .object({
    id: IdentifierSchema,
    layerId: IdentifierSchema,
    subjectId: IdentifierSchema,
    predicate: IdentifierSchema,
    object: ClaimObjectSchema,
    temporalScope: IdentifierSchema,
    spatialScope: IdentifierSchema.nullable(),
    epistemicVisibility: z.array(IdentifierSchema).min(1),
    conflictSetId: IdentifierSchema.nullable(),
    status: z.enum(["asserted", "attributed", "proposed"]),
    summary: z.string().min(1),
    sourceIds: z.array(IdentifierSchema).min(1),
  })
  .strict();

export const EventSchema = z
  .object({
    id: IdentifierSchema,
    phaseId: IdentifierSchema,
    title: z.string().min(1),
    participantIds: z.array(IdentifierSchema),
    locationId: IdentifierSchema.nullable(),
    precedesEventIds: z.array(IdentifierSchema),
    summary: z.string().min(1),
    sourceIds: z.array(IdentifierSchema).min(1),
  })
  .strict();

export const RuleSchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum(["world", "timeline", "knowledge", "expansion"]),
    description: z.string().min(1),
    layerId: IdentifierSchema,
    status: z.enum(["active", "proposed"]),
  })
  .strict();

export const BeliefProfileSchema = z
  .object({
    characterId: IdentifierSchema,
    knownClaimIds: z.array(IdentifierSchema),
    uncertainClaimIds: z.array(IdentifierSchema),
  })
  .strict();

export const WorldStateSchema = z
  .object({
    id: IdentifierSchema,
    phaseId: IdentifierSchema,
    locationId: IdentifierSchema,
    presentEntityIds: z.array(IdentifierSchema),
    deceasedEntityIds: z.array(IdentifierSchema),
  })
  .strict();

export const CanonProfileSchema = z
  .object({
    id: IdentifierSchema,
    activeLayerIds: z.array(IdentifierSchema).min(1),
    conflictResolutions: z.record(IdentifierSchema, IdentifierSchema),
  })
  .strict();

export const WorldPackSchema = z
  .object({
    schemaVersion: z.literal("0.2.0"),
    meta: z
      .object({
        id: IdentifierSchema,
        title: z.string().min(1),
        version: z.string().min(1),
        description: z.string().min(1),
        sourcePolicy: z.literal("original_summaries_no_translation_quotes"),
      })
      .strict(),
    layers: z.array(LayerSchema).min(1),
    sources: z.array(SourceSchema).min(1),
    entities: z.array(EntitySchema).min(1),
    claims: z.array(ClaimSchema).min(1),
    events: z.array(EventSchema),
    rules: z.array(RuleSchema),
    beliefs: z.array(BeliefProfileSchema),
    states: z.array(WorldStateSchema).min(1),
    canonProfiles: z.array(CanonProfileSchema).min(1),
    styleProfiles: z.array(StyleProfileSchema).min(1),
    simulationScenarios: z.array(SimulationScenarioSchema).min(1),
    defaultStateId: IdentifierSchema,
    defaultCanonProfileId: IdentifierSchema,
    defaultStyleProfileId: IdentifierSchema,
    defaultSimulationScenarioId: IdentifierSchema,
    expansionPolicy: z
      .object({
        mode: z.literal("creator_approval_required"),
        allowNewEntities: z.boolean(),
        allowNewRules: z.boolean(),
        approvalActions: z.tuple([
          z.literal("accept"),
          z.literal("edit"),
          z.literal("reject"),
        ]),
      })
      .strict(),
    replayCaseIds: z.array(IdentifierSchema),
  })
  .strict()
  .superRefine((pack, context) => {
    uniqueIds(pack.layers, "layer", context);
    uniqueIds(pack.sources, "source", context);
    uniqueIds(pack.entities, "entity", context);
    uniqueIds(pack.claims, "claim", context);
    uniqueIds(pack.events, "event", context);
    uniqueIds(pack.rules, "rule", context);
    uniqueIds(pack.states, "state", context);
    uniqueIds(pack.canonProfiles, "canon profile", context);
    uniqueIds(pack.styleProfiles, "style profile", context);
    uniqueIds(pack.simulationScenarios, "simulation scenario", context);
    addDuplicateIssues(
      pack.beliefs.map(({ characterId }) => characterId),
      "belief profile character id",
      context,
    );

    const layerIds = new Set(pack.layers.map(({ id }) => id));
    const sourceIds = new Set(pack.sources.map(({ id }) => id));
    const entityIds = new Set(pack.entities.map(({ id }) => id));
    const characterIds = new Set(
      pack.entities.filter(({ kind }) => kind === "character").map(({ id }) => id),
    );
    const claimIds = new Set(pack.claims.map(({ id }) => id));
    const eventIds = new Set(pack.events.map(({ id }) => id));
    const eventPhaseIds = new Set(pack.events.map(({ phaseId }) => phaseId));
    const stateIds = new Set(pack.states.map(({ id }) => id));
    const profileIds = new Set(pack.canonProfiles.map(({ id }) => id));
    const styleProfileIds = new Set(pack.styleProfiles.map(({ id }) => id));
    const scenarioIds = new Set(pack.simulationScenarios.map(({ id }) => id));
    const conflictSetIds = new Set(
      pack.claims.flatMap(({ conflictSetId }) => (conflictSetId ? [conflictSetId] : [])),
    );

    const issue = (message: string): void => context.addIssue({ code: "custom", message });

    if (!stateIds.has(pack.defaultStateId)) issue(`Unknown default state: ${pack.defaultStateId}`);
    if (!profileIds.has(pack.defaultCanonProfileId)) {
      issue(`Unknown default canon profile: ${pack.defaultCanonProfileId}`);
    }
    if (!styleProfileIds.has(pack.defaultStyleProfileId)) {
      issue(`Unknown default style profile: ${pack.defaultStyleProfileId}`);
    }
    if (!scenarioIds.has(pack.defaultSimulationScenarioId)) {
      issue(`Unknown default simulation scenario: ${pack.defaultSimulationScenarioId}`);
    }

    for (const claim of pack.claims) {
      if (!layerIds.has(claim.layerId)) issue(`Claim ${claim.id} has unknown layer ${claim.layerId}`);
      if (!entityIds.has(claim.subjectId)) issue(`Claim ${claim.id} has unknown subject ${claim.subjectId}`);
      if (claim.object.kind === "entity" && !entityIds.has(claim.object.entityId)) {
        issue(`Claim ${claim.id} has unknown object ${claim.object.entityId}`);
      }
      if (claim.spatialScope && !entityIds.has(claim.spatialScope)) {
        issue(`Claim ${claim.id} has unknown spatial scope ${claim.spatialScope}`);
      }
      for (const sourceId of claim.sourceIds) {
        if (!sourceIds.has(sourceId)) issue(`Claim ${claim.id} has unknown source ${sourceId}`);
      }
    }

    for (const event of pack.events) {
      if (event.locationId && !entityIds.has(event.locationId)) {
        issue(`Event ${event.id} has unknown location ${event.locationId}`);
      }
      for (const participantId of event.participantIds) {
        if (!entityIds.has(participantId)) issue(`Event ${event.id} has unknown participant ${participantId}`);
      }
      for (const nextEventId of event.precedesEventIds) {
        if (!eventIds.has(nextEventId)) issue(`Event ${event.id} precedes unknown event ${nextEventId}`);
      }
      for (const sourceId of event.sourceIds) {
        if (!sourceIds.has(sourceId)) issue(`Event ${event.id} has unknown source ${sourceId}`);
      }
    }

    for (const rule of pack.rules) {
      if (!layerIds.has(rule.layerId)) issue(`Rule ${rule.id} has unknown layer ${rule.layerId}`);
    }

    for (const belief of pack.beliefs) {
      if (!characterIds.has(belief.characterId)) {
        issue(`Belief profile has unknown character ${belief.characterId}`);
      }
      for (const claimId of [...belief.knownClaimIds, ...belief.uncertainClaimIds]) {
        if (!claimIds.has(claimId)) issue(`Belief profile ${belief.characterId} has unknown claim ${claimId}`);
      }
    }

    for (const state of pack.states) {
      if (!entityIds.has(state.locationId)) issue(`State ${state.id} has unknown location ${state.locationId}`);
      if (!eventPhaseIds.has(state.phaseId)) issue(`State ${state.id} has unknown event phase ${state.phaseId}`);
      for (const entityId of [...state.presentEntityIds, ...state.deceasedEntityIds]) {
        if (!entityIds.has(entityId)) issue(`State ${state.id} has unknown entity ${entityId}`);
      }
    }

    for (const profile of pack.canonProfiles) {
      for (const layerId of profile.activeLayerIds) {
        if (!layerIds.has(layerId)) issue(`Canon profile ${profile.id} has unknown layer ${layerId}`);
      }
      for (const [conflictSetId, winningClaimId] of Object.entries(profile.conflictResolutions)) {
        if (!conflictSetIds.has(conflictSetId)) {
          issue(`Canon profile ${profile.id} resolves unknown conflict ${conflictSetId}`);
          continue;
        }
        const winningClaim = pack.claims.find(({ id }) => id === winningClaimId);
        if (!winningClaim || winningClaim.conflictSetId !== conflictSetId) {
          issue(`Canon profile ${profile.id} selects invalid claim ${winningClaimId} for ${conflictSetId}`);
        } else if (!profile.activeLayerIds.includes(winningClaim.layerId)) {
          issue(`Canon profile ${profile.id} selects claim ${winningClaimId} from an inactive layer`);
        }
      }
    }

    for (const scenario of pack.simulationScenarios) {
      if (scenario.worldPackId !== pack.meta.id) {
        issue(`Simulation scenario ${scenario.id} targets unknown World Pack ${scenario.worldPackId}`);
      }
      if (scenario.worldPackVersion !== pack.meta.version) {
        issue(`Simulation scenario ${scenario.id} targets stale World Pack version ${scenario.worldPackVersion}`);
      }
      if (!stateIds.has(scenario.baseStateId)) {
        issue(`Simulation scenario ${scenario.id} has unknown base state ${scenario.baseStateId}`);
      }
    }

    addDuplicateIssues(pack.replayCaseIds, "replay case id", context);
  });

export type WorldPack = z.infer<typeof WorldPackSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Rule = z.infer<typeof RuleSchema>;

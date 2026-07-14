import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { ParticipantIntent } from "@/src/contracts/participant-intent";
import type {
  CharacterAgentView,
  EvidenceBundle,
} from "@/src/contracts/run";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import type { Claim, Rule, WorldPack } from "@/src/domain/schemas";
import { sortedUniqueIds } from "@/src/domain/canonical-json";

const tokens = (text: string): Set<string> =>
  new Set(
    text
      .toLocaleLowerCase("en-US")
      .replace(/[^a-z0-9._-]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );

const claimEntityIds = (claim: Claim): string[] => [
  claim.subjectId,
  ...(claim.object.kind === "entity" ? [claim.object.entityId] : []),
  ...(claim.spatialScope ? [claim.spatialScope] : []),
];

const activeProfile = (pack: WorldPack, snapshot: SimulationSnapshot) => {
  const profile = pack.canonProfiles.find(({ id }) => id === snapshot.canonProfileId);
  if (!profile) throw new Error(`Unknown canon profile ${snapshot.canonProfileId}.`);
  return profile;
};

export const activeClaims = (
  pack: WorldPack,
  overlay: CanonOverlay,
  snapshot: SimulationSnapshot,
): Claim[] => {
  const layers = new Set(activeProfile(pack, snapshot).activeLayerIds);
  return [...pack.claims.filter(({ layerId }) => layers.has(layerId)), ...overlay.claims].sort(
    ({ id: left }, { id: right }) => left.localeCompare(right),
  );
};

export const activeRules = (
  pack: WorldPack,
  overlay: CanonOverlay,
  snapshot: SimulationSnapshot,
): Rule[] => {
  const layers = new Set(activeProfile(pack, snapshot).activeLayerIds);
  return [...pack.rules.filter(({ layerId, status }) => layers.has(layerId) && status === "active"), ...overlay.rules].sort(
    ({ id: left }, { id: right }) => left.localeCompare(right),
  );
};

const isVisibleTo = (claim: Claim, characterId: string, beliefClaimIds: Set<string>): boolean =>
  beliefClaimIds.has(claim.id) ||
  claim.epistemicVisibility.includes("all") ||
  claim.epistemicVisibility.includes(characterId);

export const buildCharacterAgentViews = ({
  pack,
  overlay,
  snapshot,
  participantIntents,
}: {
  pack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  participantIntents: ReadonlyArray<ParticipantIntent>;
}): CharacterAgentView[] => {
  const claims = activeClaims(pack, overlay, snapshot);
  const rules = activeRules(pack, overlay, snapshot);
  const state = pack.states.find(({ id }) => id === snapshot.baseStateId);
  if (!state) throw new Error(`Unknown fixed state ${snapshot.baseStateId}.`);

  const focalCharacterIds = sortedUniqueIds(
    participantIntents.flatMap(({ controlledEntityIds }) => controlledEntityIds),
  );

  return focalCharacterIds.map((characterId) => {
    const belief = pack.beliefs.find((profile) => profile.characterId === characterId);
    const knownByBelief = new Set(belief?.knownClaimIds ?? []);
    const uncertainByBelief = new Set(belief?.uncertainClaimIds ?? []);
    const visibleClaims = claims.filter((claim) =>
      isVisibleTo(claim, characterId, new Set([...knownByBelief, ...uncertainByBelief])),
    );
    const knownClaimIds = visibleClaims
      .filter(({ id }) => !uncertainByBelief.has(id))
      .map(({ id }) => id);
    const uncertainClaimIds = visibleClaims
      .filter(({ id }) => uncertainByBelief.has(id))
      .map(({ id }) => id);
    const eventIds = pack.events
      .filter(
        ({ phaseId, participantIds }) =>
          phaseId === state.phaseId && participantIds.includes(characterId),
      )
      .map(({ id }) => id)
      .sort();
    const entityIds = sortedUniqueIds([
      characterId,
      ...visibleClaims.flatMap(claimEntityIds),
    ]);
    const contextLines = visibleClaims.map(
      ({ id, summary }) => `${id}: ${summary}`,
    );

    return {
      characterId,
      entityIds,
      knownClaimIds: knownClaimIds.sort(),
      uncertainClaimIds: uncertainClaimIds.sort(),
      eventIds,
      ruleIds: rules.map(({ id }) => id),
      context:
        contextLines.length > 0
          ? contextLines.join("\n")
          : "No character-visible claims are available for this fixed state.",
    };
  });
};

const scoreClaim = (
  claim: Claim,
  queryTokens: ReadonlySet<string>,
  focalIds: ReadonlySet<string>,
  statePhaseId: string,
): number => {
  const claimTokens = tokens(
    [claim.id, claim.subjectId, claim.predicate, claim.summary, ...claimEntityIds(claim)].join(" "),
  );
  let score = 0;
  for (const token of queryTokens) if (claimTokens.has(token)) score += 2;
  if (focalIds.has(claim.subjectId)) score += 4;
  if (claim.temporalScope === statePhaseId) score += 3;
  return score;
};

export const retrieveEvidence = ({
  pack,
  overlay,
  snapshot,
  participantIntents,
  brief,
}: {
  pack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  participantIntents: ReadonlyArray<ParticipantIntent>;
  brief: string;
}): EvidenceBundle => {
  const views = buildCharacterAgentViews({ pack, overlay, snapshot, participantIntents });
  const focalIds = new Set(views.map(({ characterId }) => characterId));
  const state = pack.states.find(({ id }) => id === snapshot.baseStateId);
  if (!state) throw new Error(`Unknown fixed state ${snapshot.baseStateId}.`);
  const query = tokens(
    [brief, ...participantIntents.map(({ intent }) => intent)].join(" "),
  );
  const claims = activeClaims(pack, overlay, snapshot)
    .map((claim) => ({
      claim,
      score: scoreClaim(claim, query, focalIds, state.phaseId),
    }))
    .filter(({ score, claim }) =>
      score > 0 || views.some((view) => [...view.knownClaimIds, ...view.uncertainClaimIds].includes(claim.id)),
    )
    .sort((left, right) => right.score - left.score || left.claim.id.localeCompare(right.claim.id))
    .map(({ claim }) => claim);
  const rules = activeRules(pack, overlay, snapshot);
  const events = pack.events
    .filter(({ phaseId }) => phaseId === state.phaseId)
    .sort(({ id: left }, { id: right }) => left.localeCompare(right));
  const entityIds = sortedUniqueIds([
    ...views.flatMap(({ entityIds }) => entityIds),
    ...claims.flatMap(claimEntityIds),
  ]);

  return {
    entityIds,
    claimIds: claims.map(({ id }) => id),
    eventIds: events.map(({ id }) => id),
    ruleIds: rules.map(({ id }) => id),
    characterViews: views,
    context: [
      `fixed_state=${state.id}`,
      `phase=${state.phaseId}`,
      ...views.map(({ characterId, context }) => `[${characterId}]\n${context}`),
    ].join("\n"),
  };
};

import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { ParticipantIntent } from "@/src/contracts/participant-intent";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import {
  ScopedStoryKnowledgeSchema,
  StorySceneDraftSchema,
  type ScopedStoryKnowledge,
  type StorySceneDraft,
} from "@/src/contracts/story";
import { sha256Canonical, sortedUniqueIds } from "@/src/domain/canonical-json";
import {
  activeClaims,
  buildCharacterAgentViews,
} from "@/src/domain/retrieval";
import type { WorldPack } from "@/src/domain/schemas";

export type StoryScopeViolation = {
  code:
    | "scope_character_unknown"
    | "scope_speaker_unknown"
    | "scope_claim_forbidden"
    | "scope_claim_missing"
    | "scope_echo_unknown"
    | "scope_prose_style_violation";
  message: string;
  evidenceIds: string[];
};

const storyParticipantIntents = (speakerIds: string[]): ParticipantIntent[] =>
  speakerIds.map((characterId, index) => ({
    intentId: `intent.story.scope.${index + 1}`,
    participantId: `participant.story.scope.${index + 1}`,
    controlledEntityIds: [characterId],
    intent: `Keep ${characterId} inside the facts this character may know.`,
  }));

/**
 * Builds one deliberately narrow writer scope. A single writer call receives
 * only the intersection of facts visible to the focal viewpoint and every
 * present speaker. Character-private views are never concatenated into the
 * prompt, so a speaker cannot borrow another character's hidden context.
 */
export const buildScopedStoryKnowledge = ({
  pack,
  overlay,
  snapshot,
  focalCharacterId,
  presentSpeakerIds: speakerInput,
  activeClaimIds: activeClaimInput,
}: {
  pack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  focalCharacterId: string;
  presentSpeakerIds: string[];
  activeClaimIds?: readonly string[];
}): ScopedStoryKnowledge => {
  const characters = new Set(
    pack.entities.filter(({ kind }) => kind === "character").map(({ id }) => id),
  );
  if (!characters.has(focalCharacterId)) {
    throw new Error(`Unknown focal story character ${focalCharacterId}.`);
  }
  const presentSpeakerIds = sortedUniqueIds([
    focalCharacterId,
    ...speakerInput,
  ]);
  const unknownSpeaker = presentSpeakerIds.find((id) => !characters.has(id));
  if (unknownSpeaker) {
    throw new Error(`Unknown story speaker ${unknownSpeaker}.`);
  }

  const views = buildCharacterAgentViews({
    pack,
    overlay,
    snapshot,
    participantIntents: storyParticipantIntents(presentSpeakerIds),
  });
  const visibleByCharacter = views.map(
    (view) =>
      new Set([
        ...view.knownClaimIds,
        ...view.uncertainClaimIds,
      ]),
  );
  const packClaimIds = new Set(pack.claims.map(({ id }) => id));
  const activeClaimIds = new Set(
    activeClaimInput ?? pack.claims.map(({ id }) => id),
  );
  const unknownActiveClaim = [...activeClaimIds].find(
    (claimId) => !packClaimIds.has(claimId),
  );
  if (unknownActiveClaim) {
    throw new Error(`Unknown active story claim ${unknownActiveClaim}.`);
  }
  const allowedClaimIds = sortedUniqueIds(
    [...(visibleByCharacter[0] ?? new Set<string>())].filter((claimId) =>
      activeClaimIds.has(claimId) &&
      visibleByCharacter.every((visible) => visible.has(claimId)),
    ),
  );
  const allowed = new Set(allowedClaimIds);
  const claims = activeClaims(pack, overlay, snapshot);
  const scopedClaims = claims
    .filter(({ id }) => allowed.has(id))
    .map(({ id, summary }) => ({ claimId: id, summary }))
    .sort(({ claimId: left }, { claimId: right }) => left.localeCompare(right));
  const withheldClaimIds = claims
    .map(({ id }) => id)
    .filter((id) => activeClaimIds.has(id) && !allowed.has(id))
    .sort();
  const context = [
    `focal_character=${focalCharacterId}`,
    `present_speakers=${presentSpeakerIds.join(",")}`,
    ...(scopedClaims.length > 0
      ? scopedClaims.map(({ claimId, summary }) => `${claimId}: ${summary}`)
      : ["No shared world claim is available; continue from character drives and causal pressure only."]),
  ].join("\n");
  const payload = {
    focalCharacterId,
    presentSpeakerIds,
    allowedClaimIds,
    withheldClaimIds,
    claims: scopedClaims,
    context,
  };

  return ScopedStoryKnowledgeSchema.parse({
    ...payload,
    scopeHash: sha256Canonical(payload),
  });
};

/**
 * Deterministic receipt validation for the structured part of model output.
 * This does not pretend to understand prose semantics; a semantic grounding
 * audit remains a separate post-generation gate.
 */
export const validateStoryDraftScope = ({
  draft: draftInput,
  scope,
  availableEchoEffectIds,
  pack,
}: {
  draft: StorySceneDraft;
  scope: ScopedStoryKnowledge;
  availableEchoEffectIds: ReadonlySet<string>;
  pack: WorldPack;
}): StoryScopeViolation[] => {
  const draft = StorySceneDraftSchema.parse(draftInput);
  const allowedClaims = new Set(scope.allowedClaimIds);
  const speakers = new Set(scope.presentSpeakerIds);
  const violations: StoryScopeViolation[] = [];
  const citedClaimIds = new Set(
    draft.segments.flatMap(({ groundingClaimIds }) => groundingClaimIds),
  );

  if (scope.allowedClaimIds.length > 0 && citedClaimIds.size === 0) {
    violations.push({
      code: "scope_claim_missing",
      message: "The scene cites no active world claim even though grounded claims are available.",
      evidenceIds: scope.allowedClaimIds,
    });
  }

  for (const segment of draft.segments) {
    if (segment.speakerId && !speakers.has(segment.speakerId)) {
      violations.push({
        code: "scope_speaker_unknown",
        message: `${segment.speakerId} is not present in this scoped scene.`,
        evidenceIds: [segment.segmentId, segment.speakerId],
      });
    }
    for (const claimId of segment.groundingClaimIds) {
      if (!allowedClaims.has(claimId)) {
        violations.push({
          code: "scope_claim_forbidden",
          message: `${segment.segmentId} cites a claim outside the shared scene scope.`,
          evidenceIds: [segment.segmentId, claimId],
        });
      }
    }
    for (const effectId of segment.echoedEffectIds) {
      if (!availableEchoEffectIds.has(effectId)) {
        violations.push({
          code: "scope_echo_unknown",
          message: `${segment.segmentId} cites an unavailable causal effect.`,
          evidenceIds: [segment.segmentId, effectId],
        });
      }
    }
  }

  const normalizedProse = draft.prose.toLocaleLowerCase("en-US");
  const abstractKnowledgeReport = draft.segments.find(
    ({ speakerId, text }) =>
      speakerId === null &&
      (/(?:remains?|lies?) beyond (?:what|anything) [^.?!]{0,80}\b(?:can|could) (?:conclude|know|prove|settle)\b/iu.test(text) ||
        /\b(?:knowledge boundary|ontology language|grounded (?:claim|evidence))\b/iu.test(text)),
  );
  if (abstractKnowledgeReport) {
    violations.push({
      code: "scope_prose_style_violation",
      message: "Narration reports a knowledge boundary instead of dramatizing uncertainty.",
      evidenceIds: [abstractKnowledgeReport.segmentId],
    });
  }
  const entityById = new Map(pack.entities.map((entity) => [entity.id, entity]));
  const claimById = new Map(pack.claims.map((claim) => [claim.id, claim]));
  for (const claimId of scope.withheldClaimIds) {
    const claim = claimById.get(claimId);
    if (!claim || claim.object.kind !== "entity") continue;
    const subject = entityById.get(claim.subjectId);
    const object = entityById.get(claim.object.entityId);
    if (!subject || !object) continue;
    const subjectMentioned = [subject.name, ...subject.aliases].some((alias) =>
      normalizedProse.includes(alias.toLocaleLowerCase("en-US")),
    );
    const objectMentioned = [object.name, ...object.aliases].some((alias) =>
      normalizedProse.includes(alias.toLocaleLowerCase("en-US")),
    );
    if (subjectMentioned && objectMentioned) {
      violations.push({
        code: "scope_claim_forbidden",
        message: `Canonical prose co-locates both entities of withheld relational claim ${claimId}.`,
        evidenceIds: [claimId, claim.subjectId, claim.object.entityId],
      });
    }
  }

  return violations;
};

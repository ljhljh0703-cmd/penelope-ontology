import type { ModelDraft } from "@/src/contracts/model-draft";
import type { CharacterAgentView, HardViolation } from "@/src/contracts/run";
import type { Claim } from "@/src/domain/schemas";
import type { ValidationContext } from "@/src/domain/validation/types";
import { validateOutputLineage } from "@/src/domain/participants";

const violation = (
  code: HardViolation["code"],
  message: string,
  evidenceIds: string[],
): HardViolation => ({ code, message, evidenceIds });

const allClaims = (context: ValidationContext): Claim[] => [
  ...context.pack.claims,
  ...context.overlay.claims,
];

const characterView = (
  views: ReadonlyArray<CharacterAgentView>,
  characterId: string,
): CharacterAgentView | undefined => views.find(({ characterId: id }) => id === characterId);

const wordCount = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;

const regexEscape = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mentionsRegisteredName = (prose: string, name: string): boolean =>
  new RegExp(
    `(?<![\\p{L}\\p{N}_])${regexEscape(name)}(?![\\p{L}\\p{N}_])`,
    "iu",
  ).test(prose);

const validateStyle = (draft: ModelDraft, context: ValidationContext): HardViolation[] => {
  const violations: HardViolation[] = [];
  const constraintIds = new Set(context.styleProfile.constraints.map(({ id }) => id));

  if (
    draft.styleProfileId !== context.styleProfile.id ||
    draft.styleProfileId !== context.snapshot.styleProfileId
  ) {
    violations.push(
      violation(
        "style_constraint_invalid",
        `Draft style ${draft.styleProfileId} does not match selected style ${context.styleProfile.id}.`,
        [draft.styleProfileId, context.styleProfile.id],
      ),
    );
  }
  for (const id of draft.appliedStyleConstraintIds) {
    if (!constraintIds.has(id)) {
      violations.push(
        violation(
          "style_constraint_invalid",
          `Unknown or cross-profile style constraint ${id}.`,
          [id],
        ),
      );
    }
  }
  for (const constraint of context.styleProfile.constraints) {
    if (!draft.appliedStyleConstraintIds.includes(constraint.id)) {
      violations.push(
        violation(
          "style_constraint_invalid",
          `Draft omitted selected style constraint ${constraint.id}.`,
          [constraint.id],
        ),
      );
    }
  }

  for (const constraint of context.styleProfile.constraints) {
    if (constraint.kind === "max_words" && typeof constraint.value === "number") {
      if (wordCount(draft.narrative) > constraint.value) {
        violations.push(
          violation(
            "style_constraint_invalid",
            `Narrative exceeds ${constraint.value} words.`,
            [constraint.id],
          ),
        );
      }
    }
    if (
      constraint.kind === "prohibited_phrase" &&
      typeof constraint.value === "string" &&
      draft.narrative.toLocaleLowerCase("en-US").includes(
        constraint.value.toLocaleLowerCase("en-US"),
      )
    ) {
      violations.push(
        violation(
          "style_constraint_invalid",
          `Narrative contains prohibited phrase from ${constraint.id}.`,
          [constraint.id],
        ),
      );
    }
  }
  return violations;
};

const validateAliasesAndEntities = (
  draft: ModelDraft,
  context: ValidationContext,
): HardViolation[] => {
  const violations: HardViolation[] = [];
  const entities = new Map(context.pack.entities.map((entity) => [entity.id, entity]));
  const reported = new Set(draft.mentionedEntityIds);
  const prose = draft.narrative;

  for (const id of reported) {
    if (!entities.has(id)) {
      violations.push(violation("entity_unknown", `Unknown mentioned entity ${id}.`, [id]));
    }
  }
  for (const entity of context.pack.entities) {
    const aliases = [entity.name, ...entity.aliases];
    if (
      aliases.some((alias) => mentionsRegisteredName(prose, alias)) &&
      !reported.has(entity.id)
    ) {
      violations.push(
        violation(
          "entity_alias_mismatch",
          `Narrative names ${entity.name} without reporting entity ID ${entity.id}.`,
          [entity.id],
        ),
      );
    }
  }

  const referencedEntityIds = [
    ...draft.utterances.map(({ speakerId }) => speakerId),
    ...draft.actions.map(({ actorEntityId }) => actorEntityId),
    ...draft.assertedClaims.flatMap((claim) => [
      claim.subjectId,
      ...(claim.object.kind === "entity" ? [claim.object.entityId] : []),
    ]),
  ];
  for (const id of referencedEntityIds) {
    if (!entities.has(id)) {
      violations.push(violation("entity_unknown", `Unknown referenced entity ${id}.`, [id]));
    }
  }
  return violations;
};

const validateState = (draft: ModelDraft, context: ValidationContext): HardViolation[] => {
  const violations: HardViolation[] = [];
  const state = context.pack.states.find(({ id }) => id === context.snapshot.baseStateId);
  if (!state) {
    return [
      violation(
        "fixed_state_missing",
        `Unknown fixed state ${context.snapshot.baseStateId}.`,
        [context.snapshot.baseStateId],
      ),
    ];
  }

  const actors = new Set([
    ...draft.utterances.map(({ speakerId }) => speakerId),
    ...draft.actions.map(({ actorEntityId }) => actorEntityId),
  ]);
  for (const actorId of actors) {
    if (context.snapshot.deceasedEntityIds.includes(actorId)) {
      violations.push(
        violation(
          "entity_state_invalid",
          `${actorId} is deceased in ${state.id} and cannot speak or act as living.`,
          [actorId, state.id],
        ),
      );
    }
    if (!context.snapshot.presentEntityIds.includes(actorId)) {
      violations.push(
        violation(
          "location_path_missing",
          `${actorId} is absent from fixed state ${state.id}.`,
          [actorId, state.id],
        ),
      );
    }
  }
  return violations;
};

const validateClaimsAndKnowledge = (
  draft: ModelDraft,
  context: ValidationContext,
): HardViolation[] => {
  const violations: HardViolation[] = [];
  const claimIndex = new Map(allClaims(context).map((claim) => [claim.id, claim]));
  const overlayClaimIds = new Set(context.overlay.claims.map(({ id }) => id));
  const currentEvent = context.pack.events.find(
    ({ phaseId }) => phaseId === context.state.phaseId,
  );
  const eventById = new Map(context.pack.events.map((event) => [event.id, event]));
  const futurePhaseIds = new Set<string>();
  const queue = [...(currentEvent?.precedesEventIds ?? [])];
  while (queue.length > 0) {
    const eventId = queue.shift()!;
    const event = eventById.get(eventId);
    if (!event || futurePhaseIds.has(event.phaseId)) continue;
    futurePhaseIds.add(event.phaseId);
    queue.push(...event.precedesEventIds);
  }

  for (const claimId of draft.usedClaimIds) {
    const claim = claimIndex.get(claimId);
    if (!claim) {
      violations.push(violation("unsupported_claim", `Unknown used claim ${claimId}.`, [claimId]));
    } else if (
      !overlayClaimIds.has(claimId) &&
      !context.activeLayerIds.has(claim.layerId)
    ) {
      violations.push(
        violation(
          "tradition_inactive",
          `Claim ${claimId} belongs to inactive layer ${claim.layerId}.`,
          [claimId, claim.layerId],
        ),
      );
    } else if (futurePhaseIds.has(claim.temporalScope)) {
      violations.push(
        violation(
          "temporal_order_violation",
          `Claim ${claimId} belongs to future phase ${claim.temporalScope}.`,
          [claimId, claim.temporalScope, context.state.phaseId],
        ),
      );
    }
  }

  for (const asserted of draft.assertedClaims) {
    const existing = claimIndex.get(asserted.id);
    const proposedIds = new Set(
      draft.proposals.flatMap(({ patches }) =>
        patches.map((patch) => (patch.op === "add_claim" ? patch.claim.id : patch.rule.id)),
      ),
    );
    if (!existing && !proposedIds.has(asserted.id)) {
      violations.push(
        violation(
          "unsupported_claim",
          `Asserted claim ${asserted.id} is neither active evidence nor an isolated proposal.`,
          [asserted.id],
        ),
      );
    }
  }

  for (const utterance of draft.utterances) {
    const view = characterView(context.characterViews, utterance.speakerId);
    const visible = new Set([
      ...(view?.knownClaimIds ?? []),
      ...(view?.uncertainClaimIds ?? []),
    ]);
    for (const claimId of utterance.assertedClaimIds) {
      if (!visible.has(claimId)) {
        violations.push(
          violation(
            "belief_scope_violation",
            `${utterance.speakerId} cannot assert ${claimId} from its character view.`,
            [utterance.speakerId, claimId],
          ),
        );
      } else if (
        utterance.certainty === "certain" &&
        view?.uncertainClaimIds.includes(claimId)
      ) {
        violations.push(
          violation(
            "belief_scope_violation",
            `${utterance.speakerId} upgrades uncertain claim ${claimId} to certainty.`,
            [utterance.speakerId, claimId],
          ),
        );
      }
    }
  }

  const profile = context.pack.canonProfiles.find(
    ({ id }) => id === context.snapshot.canonProfileId,
  );
  const activeConflictClaims = context.pack.claims.filter(
    ({ conflictSetId, layerId }) =>
      conflictSetId && context.activeLayerIds.has(layerId),
  );
  const conflictGroups = new Map<string, Claim[]>();
  for (const claim of activeConflictClaims) {
    const id = claim.conflictSetId!;
    conflictGroups.set(id, [...(conflictGroups.get(id) ?? []), claim]);
  }
  for (const [conflictSetId, claims] of conflictGroups) {
    if (claims.length > 1 && !profile?.conflictResolutions[conflictSetId]) {
      const relevant = claims.some(({ id }) =>
        [...draft.usedClaimIds, ...draft.assertedClaims.map((claim) => claim.id)].includes(id),
      );
      if (relevant) {
        violations.push(
          violation(
            "tradition_conflict_unresolved",
            `Conflict ${conflictSetId} has no creator-selected tradition.`,
            [conflictSetId, ...claims.map(({ id }) => id).sort()],
          ),
        );
      }
    }
  }

  return violations;
};

const validateActions = (draft: ModelDraft, context: ValidationContext): HardViolation[] => {
  const violations: HardViolation[] = [];
  const claimIndex = new Map(allClaims(context).map((claim) => [claim.id, claim]));
  const overlayClaimIds = new Set(context.overlay.claims.map(({ id }) => id));
  const ruleIndex = new Map(
    [...context.pack.rules, ...context.overlay.rules].map((rule) => [rule.id, rule]),
  );
  const overlayRuleIds = new Set(context.overlay.rules.map(({ id }) => id));

  for (const action of draft.actions) {
    for (const claimId of action.evidenceClaimIds) {
      const claim = claimIndex.get(claimId);
      if (!claim) {
        violations.push(
          violation(
            "unsupported_claim",
            `Unknown action evidence claim ${claimId}.`,
            [claimId],
          ),
        );
      } else if (
        !overlayClaimIds.has(claimId) &&
        !context.activeLayerIds.has(claim.layerId)
      ) {
        violations.push(
          violation(
            "tradition_inactive",
            `Action evidence claim ${claimId} belongs to inactive layer ${claim.layerId}.`,
            [claimId, claim.layerId],
          ),
        );
      } else if (!draft.usedClaimIds.includes(claimId)) {
        violations.push(
          violation(
            "unsupported_claim",
            `Action evidence claim ${claimId} must also be declared in usedClaimIds.`,
            [claimId],
          ),
        );
      }
    }

    for (const ruleId of action.evidenceRuleIds) {
      const rule = ruleIndex.get(ruleId);
      if (!rule) {
        violations.push(
          violation(
            "unapproved_expansion",
            `Unknown or unapproved action evidence rule ${ruleId}.`,
            [ruleId],
          ),
        );
      } else if (
        !overlayRuleIds.has(ruleId) &&
        (!context.activeLayerIds.has(rule.layerId) || rule.status !== "active")
      ) {
        violations.push(
          violation(
            "tradition_inactive",
            `Action evidence rule ${ruleId} belongs to inactive layer ${rule.layerId}.`,
            [ruleId, rule.layerId],
          ),
        );
      }
    }

    const variable = context.scenario.variables.find(({ id }) => id === action.variableId);
    const current = context.snapshot.variables.find(({ id }) => id === action.variableId);
    if (!variable || !current) {
      violations.push(
        violation(
          "state_variable_invalid",
          `Action targets unknown variable ${action.variableId}.`,
          [action.variableId],
        ),
      );
      continue;
    }
    const transition = variable.transitions.find(
      ({ from, to }) => from === action.from && to === action.to,
    );
    if (current.value !== action.from || !transition) {
      violations.push(
        violation(
          "state_transition_invalid",
          `Action ${action.variableId}:${action.from}->${action.to} is invalid from ${current.value}.`,
          [action.variableId, action.from, action.to],
        ),
      );
      continue;
    }
    for (const ruleId of transition.requiredRuleIds) {
      if (!action.evidenceRuleIds.includes(ruleId)) {
        violations.push(
          violation(
            "unapproved_expansion",
            `Action requires approved rule ${ruleId}.`,
            [ruleId],
          ),
        );
      }
    }
  }
  return violations;
};

const uniqueViolations = (violations: ReadonlyArray<HardViolation>): HardViolation[] => {
  const byKey = new Map<string, HardViolation>();
  for (const item of violations) {
    const normalized = {
      ...item,
      evidenceIds: [...new Set(item.evidenceIds)].sort(),
    };
    const key = `${normalized.code}:${normalized.message}:${normalized.evidenceIds.join(",")}`;
    byKey.set(key, normalized);
  }
  return [...byKey.values()].sort((left, right) =>
    `${left.code}:${left.message}`.localeCompare(`${right.code}:${right.message}`),
  );
};

export const validateDraft = (
  draft: ModelDraft,
  context: ValidationContext,
): HardViolation[] => {
  const normalized = context.participantIntents.reduce<Record<string, string[]>>(
    (index, intent) => ({ ...index, [intent.intentId]: intent.controlledEntityIds }),
    {},
  );
  const overlayViolations =
    context.snapshot.overlayId !== context.overlay.id ||
    context.snapshot.overlayVersion !== context.overlay.version ||
    context.snapshot.canonHash !== context.overlay.hash
      ? [
          violation(
            "overlay_mismatch",
            "Snapshot and overlay authorities do not match.",
            [context.overlay.id, context.snapshot.overlayId],
          ),
        ]
      : [];
  const proposalViolations = draft.proposals.map((proposal) =>
    violation(
      "unapproved_expansion",
      `Proposal ${proposal.id} requires a creator decision.`,
      [proposal.id],
    ),
  );

  return uniqueViolations([
    ...overlayViolations,
    ...validateStyle(draft, context),
    ...validateAliasesAndEntities(draft, context),
    ...validateState(draft, context),
    ...validateClaimsAndKnowledge(draft, context),
    ...validateOutputLineage(draft.utterances, draft.actions, normalized),
    ...validateActions(draft, context),
    ...proposalViolations,
  ]);
};

const creatorDecisionCodes = new Set<HardViolation["code"]>([
  "tradition_conflict_unresolved",
  "unapproved_expansion",
]);

export const statusForViolations = (
  violations: ReadonlyArray<HardViolation>,
): "passed" | "blocked" | "needs_creator_decision" => {
  if (violations.length === 0) return "passed";
  return violations.every(({ code }) => creatorDecisionCodes.has(code))
    ? "needs_creator_decision"
    : "blocked";
};

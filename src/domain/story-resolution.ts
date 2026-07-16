import type { CampaignLedger, CausalEffect } from "@/src/contracts/campaign";
import {
  ResolutionEnvelopeSchema,
  StoryScenarioSchema,
  type ResolutionEnvelope,
  type SceneContract,
  type StoryChoice,
  type StoryScenario,
  type StorySpine,
} from "@/src/contracts/story";
import { sha256Canonical } from "@/src/domain/canonical-json";

export type StoryResolutionViolation = {
  code:
    | "story_action_inactive"
    | "story_effect_inactive"
    | "story_entity_unknown"
    | "story_evidence_inactive"
    | "story_contract_mismatch"
    | "story_echo_missing";
  message: string;
  evidenceIds: string[];
};

const effectEntities = (effect: CausalEffect): string[] => {
  switch (effect.kind) {
    case "relation_delta":
      return [effect.subjectEntityId, effect.objectEntityId];
    case "resource_delta":
    case "knowledge_grant":
    case "flag_set":
      return [effect.entityId];
    case "debt_open":
      return [effect.debtorEntityId, effect.creditorEntityId];
    case "state_transition":
    case "clock_delta":
    case "debt_resolve":
      return [];
  }
};

const effectDimension = (effect: CausalEffect): { kind: string; id: string } | null => {
  switch (effect.kind) {
    case "relation_delta":
      return { kind: "relation axis", id: effect.axisId };
    case "resource_delta":
      return { kind: "resource", id: effect.resourceId };
    case "flag_set":
      return { kind: "flag", id: effect.flagId };
    case "clock_delta":
      return { kind: "clock", id: effect.clockId };
    case "debt_open":
      return { kind: "debt kind", id: effect.debtKindId };
    case "state_transition":
    case "knowledge_grant":
    case "debt_resolve":
      return null;
  }
};

const dimensionAllowed = (
  effect: CausalEffect,
  scenario: StoryScenario,
): boolean => {
  const ontology = scenario.ontology;
  switch (effect.kind) {
    case "relation_delta":
      return ontology.relationAxisIds.includes(effect.axisId);
    case "resource_delta":
      return ontology.resourceIds.includes(effect.resourceId);
    case "knowledge_grant":
      return ontology.activeClaimIds.includes(effect.claimId);
    case "flag_set":
      return ontology.flagIds.includes(effect.flagId);
    case "clock_delta":
      return ontology.clockIds.includes(effect.clockId);
    case "debt_open":
      return ontology.debtKindIds.includes(effect.debtKindId);
    case "state_transition":
    case "debt_resolve":
      return true;
  }
};

export const validateStoryResolution = ({
  scenario: scenarioInput,
  resolution: resolutionInput,
}: {
  scenario: StoryScenario;
  resolution: ResolutionEnvelope;
}): StoryResolutionViolation[] => {
  const scenario = StoryScenarioSchema.parse(scenarioInput);
  const resolution = ResolutionEnvelopeSchema.parse(resolutionInput);
  const knownEntities = new Set(scenario.ontology.knownEntityIds);
  const activeClaims = new Set(scenario.ontology.activeClaimIds);
  const activeRules = new Set(scenario.ontology.activeRuleIds);
  const violations: StoryResolutionViolation[] = [];

  if (!scenario.ontology.actionTypeIds.includes(resolution.actionTypeId)) {
    violations.push({
      code: "story_action_inactive",
      message: `Story action ${resolution.actionTypeId} is outside the active scenario ontology.`,
      evidenceIds: [resolution.actionTypeId],
    });
  }
  for (const entityId of [
    ...resolution.targetEntityIds,
    ...resolution.effects.flatMap(effectEntities),
  ]) {
    if (!knownEntities.has(entityId)) {
      violations.push({
        code: "story_entity_unknown",
        message: `Story resolution references unknown entity ${entityId}.`,
        evidenceIds: [entityId],
      });
    }
  }
  for (const effect of resolution.effects) {
    if (!dimensionAllowed(effect, scenario)) {
      const dimension = effectDimension(effect);
      violations.push({
        code: "story_effect_inactive",
        message: `${dimension?.kind ?? "effect"} ${dimension?.id ?? effect.kind} is not active for this story.`,
        evidenceIds: [effect.effectId, dimension?.id ?? effect.kind],
      });
    }
  }
  for (const claimId of resolution.evidenceClaimIds) {
    if (!activeClaims.has(claimId)) {
      violations.push({
        code: "story_evidence_inactive",
        message: `Story resolution cites inactive claim ${claimId}.`,
        evidenceIds: [claimId],
      });
    }
  }
  for (const ruleId of resolution.evidenceRuleIds) {
    if (!activeRules.has(ruleId)) {
      violations.push({
        code: "story_evidence_inactive",
        message: `Story resolution cites inactive rule ${ruleId}.`,
        evidenceIds: [ruleId],
      });
    }
  }
  return violations;
};

export const validateSceneResolutionContract = ({
  resolution,
  contract,
  priorLedger,
}: {
  resolution: ResolutionEnvelope;
  contract: SceneContract;
  priorLedger: CampaignLedger;
}): StoryResolutionViolation[] => {
  const currentEffects = new Set(resolution.effects.map(({ effectId }) => effectId));
  const priorEffects = new Set(
    priorLedger.entries.flatMap(({ effects }) => effects.map(({ effectId }) => effectId)),
  );
  const violations: StoryResolutionViolation[] = [];
  for (const effectId of contract.stateDeltaEffectIds) {
    if (!currentEffects.has(effectId)) {
      violations.push({
        code: "story_contract_mismatch",
        message: `Scene state delta ${effectId} is not produced by its resolution.`,
        evidenceIds: [effectId, resolution.resolutionId],
      });
    }
  }
  for (const effectId of contract.inheritedConsequenceIds) {
    if (!priorEffects.has(effectId)) {
      violations.push({
        code: "story_echo_missing",
        message: `Scene inherits unavailable causal effect ${effectId}.`,
        evidenceIds: [effectId],
      });
    }
  }
  return violations;
};

export const bindFixtureResolutionToChoice = (
  resolution: ResolutionEnvelope,
  choice: StoryChoice,
): ResolutionEnvelope =>
  ResolutionEnvelopeSchema.parse({
    ...resolution,
    choiceId: choice.choiceId,
    authority: {
      kind: "user_choice",
      evidenceRefs: [choice.choiceId],
    },
  });

/**
 * Unsupported input never becomes new canon and never stalls the story. It
 * pays a bounded pressure cost, then follows the registered safe continuation.
 */
export const buildFailForwardResolution = ({
  scenario,
  choice,
  sceneNumber,
  safeResolution,
}: {
  scenario: StoryScenario;
  choice: StoryChoice;
  sceneNumber: number;
  safeResolution: ResolutionEnvelope;
}): ResolutionEnvelope => {
  const clockId = scenario.ontology.clockIds[0];
  if (!clockId) {
    throw new Error("Fail-forward requires one registered pressure clock.");
  }
  const penalty: CausalEffect = {
    effectId: `effect.fail_forward.pressure.${sceneNumber}`,
    kind: "clock_delta",
    clockId,
    delta: 1,
  };
  const effects = [...safeResolution.effects, penalty];
  return ResolutionEnvelopeSchema.parse({
    ...safeResolution,
    resolutionId: `resolution.fail_forward.${sha256Canonical({
      sceneNumber,
      choiceId: choice.choiceId,
      intent: choice.intent,
    }).slice(0, 16)}`,
    choiceId: choice.choiceId,
    authority: { kind: "user_choice", evidenceRefs: [choice.choiceId] },
    outcome: "failure_with_progress",
    effects,
    openedDebtEffectIds: effects
      .filter((effect) => effect.kind === "debt_open")
      .map(({ effectId }) => effectId),
    resolvedDebtEffectIds: effects
      .filter((effect) => effect.kind === "debt_resolve")
      .map((effect) => effect.debtEffectId),
    summary: `The attempted action exceeds the current story scope. Pressure rises, but the registered world-safe continuation still changes the scene: ${safeResolution.summary}`,
  });
};

export const advanceStorySpine = ({
  spine,
  contract,
}: {
  spine: StorySpine;
  contract: SceneContract;
}): StorySpine => ({
  ...spine,
  currentBeat: contract.sceneNumber,
  openThreads: spine.openThreads.map((thread) => ({
    ...thread,
    status: contract.closedThreadIds.includes(thread.threadId)
      ? "closed" as const
      : contract.openedThreadIds.includes(thread.threadId)
        ? "open" as const
      : thread.status,
  })),
  mustPayOffObligations: spine.mustPayOffObligations.map((obligation) => ({
    ...obligation,
    status: contract.paidObligationIds.includes(obligation.obligationId)
      ? "paid" as const
      : contract.openedObligationIds.includes(obligation.obligationId)
        ? "open" as const
      : obligation.status,
  })),
});

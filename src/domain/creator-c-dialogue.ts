import {
  CreatorCDialogueResponseSchema,
  CreatorTacitKnowledgeAnswerSchema,
  type CreatorCDialogueResponse,
  type CreatorCCanonicalExecution,
  type CreatorTacitKnowledgeAnswer,
  type CreatorTacitKnowledgeQuestionId,
} from "@/src/contracts/creator-c-dialogue";
import type { WorldSimulationSession } from "@/src/contracts/world-runtime";
import type { PenelopeWorldPackV1 } from "@/src/contracts/penelope-world-pack";
import type {
  ActionDefinition,
  WorldSimulationScenario,
} from "@/src/contracts/world-simulation";
import { sha256Canonical } from "@/src/domain/canonical-json";

const QUESTION_ORDER = [
  "desired_outcome",
  "character_motive",
  "accepted_cost",
] as const satisfies readonly CreatorTacitKnowledgeQuestionId[];

const focalParticipant = (scenario: WorldSimulationScenario) => {
  const actor = scenario.actors.find(({ id }) => id === scenario.focalParticipantEntityId);
  if (!actor) {
    throw new Error("World pack focal participant is not registered as a scenario actor.");
  }
  return actor;
};

const questionCopyFor = ({
  pack,
  scenario,
}: {
  pack: PenelopeWorldPackV1;
  scenario: WorldSimulationScenario;
}): Record<CreatorTacitKnowledgeQuestionId, { prompt: string; whyItMatters: string }> => {
  const focalLabel = focalParticipant(scenario).participantLabel;
  return {
    desired_outcome: {
      prompt: pack.creatorInput.tacitKnowledgePrompts.desiredOutcome,
      whyItMatters: `The same outward move can seek proof, safety, leverage, or mercy. The world needs the gain ${focalLabel} is pursuing before it can judge the action.`,
    },
    character_motive: {
      prompt: pack.creatorInput.tacitKnowledgePrompts.characterMotive,
      whyItMatters: `A motive turns a convenient move into ${focalLabel}'s decision and tells the world which pressure that character is answering.`,
    },
    accepted_cost: {
      prompt: pack.creatorInput.tacitKnowledgePrompts.acceptedCost,
      whyItMatters: `A chosen cost lets the world honor the creator's aim without granting ${focalLabel}'s desired result for free.`,
    },
  };
};

const normalize = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const meaningfulTokens = (value: string): Set<string> =>
  new Set(
    normalize(value)
      .split(/\s+/u)
      .filter(
        (token) =>
          token.length > 2 &&
          ![
            "and",
            "the",
            "this",
            "that",
            "with",
            "from",
            "into",
            "while",
            "what",
            "should",
            "would",
            "could",
            "before",
            "after",
          ].includes(token),
      ),
  );

const answerById = (
  answers: readonly CreatorTacitKnowledgeAnswer[],
  questionId: CreatorTacitKnowledgeQuestionId,
): string => answers.find((answer) => answer.questionId === questionId)?.answer ?? "";

const participantActions = (
  scenario: WorldSimulationScenario,
): ActionDefinition[] =>
  scenario.actions.filter(
    (action) =>
      action.actorMode === "participant" &&
      action.allowedActorEntityIds.includes(scenario.focalParticipantEntityId),
  );

type RankedAction = {
  action: ActionDefinition;
  score: number;
  matchedSignals: string[];
};

const rankActions = ({
  pack,
  scenario,
  originalAction,
  answers,
}: {
  pack: PenelopeWorldPackV1;
  scenario: WorldSimulationScenario;
  originalAction: string;
  answers: readonly CreatorTacitKnowledgeAnswer[];
}): RankedAction[] => {
  const originalNormalized = normalize(originalAction);
  const answerText = answers.map(({ answer }) => answer).join(" ");
  const combinedNormalized = normalize(`${originalAction} ${answerText}`);
  const originalTokens = meaningfulTokens(originalAction);
  const answerTokens = meaningfulTokens(answerText);

  const vocabularyByActionId = new Map(
    pack.creatorInput.actionVocabulary.map((entry) => [entry.actionId, entry]),
  );

  return participantActions(scenario)
    .map((action) => {
      const vocabulary = vocabularyByActionId.get(action.id);
      const metadataTokens = meaningfulTokens(
        [
          action.label,
          action.summary,
          action.worldMeaning,
          ...action.verbAliases,
          vocabulary?.creatorFacingLabel ?? "",
        ].join(" "),
      );
      const metadataOverlap = [...metadataTokens].reduce(
        (total, token) =>
          total + (originalTokens.has(token) ? 2 : 0) + (answerTokens.has(token) ? 1 : 0),
        0,
      );
      const cueScore = (vocabulary?.cueTerms ?? []).reduce((total, cue) => {
        const normalizedCue = normalize(cue);
        if (!normalizedCue) return total;
        if (originalNormalized.includes(normalizedCue)) return total + 5;
        if (combinedNormalized.includes(normalizedCue)) return total + 3;
        return total;
      }, 0);
      const matchedSignals = (vocabulary?.cueTerms ?? []).filter((cue) =>
        combinedNormalized.includes(normalize(cue)),
      );
      return { action, score: metadataOverlap + cueScore, matchedSignals };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.action.id.localeCompare(right.action.id),
    );
};

const alternativesFrom = ({
  pack,
  ranked,
}: {
  pack: PenelopeWorldPackV1;
  ranked: readonly RankedAction[];
}) => {
  const vocabularyByActionId = new Map(
    pack.creatorInput.actionVocabulary.map((entry) => [entry.actionId, entry]),
  );
  return ranked.slice(0, 3).map(({ action }) => ({
    registeredActionId: action.id,
    label: vocabularyByActionId.get(action.id)?.creatorFacingLabel ?? action.label,
    why: action.worldMeaning,
  }));
};

const canonicalVerb = (action: ActionDefinition): string | null =>
  [...new Set(action.verbAliases.map(normalize).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  )[0] ?? null;

const explicitlyNamedEntityTargets = ({
  scenario,
  action,
  originalAction,
}: {
  scenario: WorldSimulationScenario;
  action: ActionDefinition;
  originalAction: string;
}): string[] => {
  const normalizedAction = normalize(originalAction);
  return action.allowedTargetEntityIds.filter((entityId) => {
    const actor = scenario.actors.find(({ id }) => id === entityId);
    if (!actor) return false;
    const aliases = [
      actor.id,
      actor.name,
      actor.participantLabel,
      actor.id.split(".").at(-1) ?? actor.id,
      actor.name.split(/\s+/u).at(-1) ?? actor.name,
    ]
      .map(normalize)
      .filter(Boolean);
    return aliases.some((alias) => normalizedAction.includes(alias));
  });
};

const explicitlyNamedZoneTargets = ({
  scenario,
  action,
  originalAction,
}: {
  scenario: WorldSimulationScenario;
  action: ActionDefinition;
  originalAction: string;
}): string[] => {
  const normalizedAction = normalize(originalAction);
  return action.allowedZoneIds.filter((zoneId) => {
    const zone = scenario.zones.find(({ id }) => id === zoneId);
    const aliases = [zoneId, zone?.name ?? "", zoneId.split(".").at(-1) ?? ""]
      .map(normalize)
      .filter(Boolean);
    return aliases.some((alias) => normalizedAction.includes(alias));
  });
};

type CanonicalExecutionResult =
  | { kind: "ready"; execution: CreatorCCanonicalExecution }
  | { kind: "blocked"; boundary: string; nextQuestion: string };

const canonicalExecutionFor = ({
  scenario,
  action,
  originalAction,
}: {
  scenario: WorldSimulationScenario;
  action: ActionDefinition;
  originalAction: string;
}): CanonicalExecutionResult => {
  const focalLabel = focalParticipant(scenario).participantLabel;
  const verb = canonicalVerb(action);
  if (!verb) {
    return {
      kind: "blocked",
      boundary:
        "The registered action has no stable execution verb, so the world cannot turn this proposal into a consequence safely.",
      nextQuestion:
        `Which registered physical action should ${focalLabel} take before the world resolves the outcome?`,
    };
  }
  if (action.targetMode === "entity") {
    const explicitTargets = explicitlyNamedEntityTargets({ scenario, action, originalAction });
    const targetEntityId =
      explicitTargets.length === 1
        ? explicitTargets[0] ?? null
        : action.allowedTargetEntityIds.length === 1
          ? action.allowedTargetEntityIds[0] ?? null
          : null;
    if (!targetEntityId) {
      return {
        kind: "blocked",
        boundary:
          "This registered action can address more than one entity target, but the creator direction does not authorize one target explicitly.",
        nextQuestion:
          `Which one permitted person does ${focalLabel} physically address or affect with this move?`,
      };
    }
    return {
      kind: "ready",
      execution: { verb, targetEntityId, targetZoneId: null },
    };
  }
  if (action.targetMode === "zone") {
    const explicitZones = explicitlyNamedZoneTargets({ scenario, action, originalAction });
    const targetZoneId =
      explicitZones.length === 1
        ? explicitZones[0] ?? null
        : action.allowedZoneIds.length === 1
          ? action.allowedZoneIds[0] ?? null
          : null;
    if (!targetZoneId) {
      return {
        kind: "blocked",
        boundary:
          "This registered action can address more than one zone, but the creator direction does not authorize one destination explicitly.",
        nextQuestion:
          `Which one permitted place does ${focalLabel} physically move to or affect with this move?`,
      };
    }
    return {
      kind: "ready",
      execution: { verb, targetEntityId: null, targetZoneId },
    };
  }
  return {
    kind: "ready",
    execution: { verb, targetEntityId: null, targetZoneId: null },
  };
};

const namesNonParticipantActor = (
  scenario: WorldSimulationScenario,
  originalAction: string,
): { label: string; aliases: string[] } | null => {
  const normalized = normalize(originalAction);
  return (
    scenario.actors
      .filter(({ id }) => id !== scenario.focalParticipantEntityId)
      .map((actor) => ({
        label: actor.participantLabel,
        aliases: [
          actor.name,
          actor.participantLabel,
          actor.id.split(".").at(-1) ?? actor.id,
          actor.name.split(/\s+/u).at(-1) ?? actor.name,
        ]
          .map(normalize)
          .filter(Boolean),
      }))
      .find(({ aliases }) =>
        aliases.some((alias) =>
          new RegExp(
            `^(?:i want |have |let )?(?:the )?${alias}(?: should| to| |$)`,
            "u",
          ).test(normalized),
        ),
      ) ?? null
  );
};

const unsupportedWorldMechanism = ({
  creatorInput,
  originalAction,
}: {
  creatorInput: PenelopeWorldPackV1["creatorInput"];
  originalAction: string;
}): string | null => {
  const normalized = normalize(originalAction);
  return (
    creatorInput.unsupportedMechanisms.find(({ cueTerms }) =>
      cueTerms.some((cue) => {
        const normalizedCue = normalize(cue);
        return normalizedCue.length > 0 && normalized.includes(normalizedCue);
      }),
    )?.explanation ?? null
  );
};

const sortedAnswers = (
  input: readonly CreatorTacitKnowledgeAnswer[],
): CreatorTacitKnowledgeAnswer[] => {
  const parsed = input.map((answer) => CreatorTacitKnowledgeAnswerSchema.parse(answer));
  if (new Set(parsed.map(({ questionId }) => questionId)).size !== parsed.length) {
    throw new Error("Creator tacit-knowledge answers must be unique.");
  }
  return [...parsed].sort(
    (left, right) =>
      QUESTION_ORDER.indexOf(left.questionId) - QUESTION_ORDER.indexOf(right.questionId),
  );
};

export const assessCreatorDirection = ({
  pack,
  session,
  baseSessionId,
  originalAction,
  answers: answerInput,
  forkBeforeAction,
}: {
  pack: PenelopeWorldPackV1;
  session: WorldSimulationSession;
  baseSessionId: string;
  originalAction: string;
  answers: readonly CreatorTacitKnowledgeAnswer[];
  forkBeforeAction: boolean;
}): CreatorCDialogueResponse => {
  const scenario = pack.scenario;
  if (session.scenarioId !== scenario.id) {
    throw new Error("Creator direction targets another world scenario.");
  }
  const answers = sortedAnswers(answerInput);
  const base = {
    baseSessionId,
    baseStateHash: session.state.stateHash,
    originalAction: originalAction.trim(),
    answers,
    stateChanged: false as const,
  };
  const missingWorldSupport = unsupportedWorldMechanism({
    creatorInput: pack.creatorInput,
    originalAction,
  });
  if (missingWorldSupport) {
    const ranked = rankActions({ pack, scenario, originalAction, answers });
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_expansion_required",
      ...base,
      preservedIntent:
        answerById(answers, "desired_outcome") || originalAction.trim(),
      missingWorldSupport,
      nextQuestion: pack.creatorInput.expansionPrompt,
      alternatives: alternativesFrom({ pack, ranked }),
    });
  }
  const missing = QUESTION_ORDER.find(
    (questionId) => !answers.some((answer) => answer.questionId === questionId),
  );
  if (missing) {
    const questionCopy = questionCopyFor({ pack, scenario });
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_clarification",
      ...base,
      progress: { answered: answers.length, total: 3 },
      question: { questionId: missing, ...questionCopy[missing] },
    });
  }

  const desiredOutcome = answerById(answers, "desired_outcome");
  const focalLabel = focalParticipant(scenario).participantLabel;
  const ranked = rankActions({ pack, scenario, originalAction, answers });
  const alternatives = alternativesFrom({ pack, ranked });
  const namedNpc = namesNonParticipantActor(scenario, originalAction);
  if (namedNpc) {
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_blocked",
      ...base,
      preservedIntent: desiredOutcome,
      boundary: `${namedNpc.label} is an NPC in this bounded scene. ${focalLabel} cannot silently author ${namedNpc.label}'s decision; that character must act through an agenda or a resolved reaction.`,
      nextQuestion: `What can ${focalLabel} do to give ${namedNpc.label} a reason or opportunity to make that choice?`,
      alternatives,
    });
  }

  const selected = ranked[0];
  const runnerUp = ranked[1];
  if (
    !selected ||
    selected.matchedSignals.length < 1 ||
    selected.score < 8 ||
    (runnerUp && selected.score - runnerUp.score < 3)
  ) {
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_blocked",
      ...base,
      preservedIntent: desiredOutcome,
      boundary:
        `The intention is clear, but the current scene has no registered ${focalLabel} action that can carry the proposed move without inventing its result.`,
      nextQuestion:
        `What does ${focalLabel} physically do in this scene to pursue this aim without assuming the outcome?`,
      alternatives,
    });
  }

  const action = selected.action;
  const canonicalExecution = canonicalExecutionFor({
    scenario,
    action,
    originalAction,
  });
  if (canonicalExecution.kind === "blocked") {
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_blocked",
      ...base,
      preservedIntent: desiredOutcome,
      boundary: canonicalExecution.boundary,
      nextQuestion: canonicalExecution.nextQuestion,
      alternatives,
    });
  }
  const proposalPayload = {
    schemaVersion: 1,
    packId: pack.packId,
    packVersion: pack.packVersion,
    definitionDigest: pack.definitionDigest,
    scenarioId: scenario.id,
    baseSessionId,
    baseStateHash: session.state.stateHash,
    originalAction: originalAction.trim(),
    answers,
    registeredActionId: action.id,
    canonicalExecution: canonicalExecution.execution,
    forkBeforeAction,
  };
  return CreatorCDialogueResponseSchema.parse({
    kind: "creator_confirmation",
    ...base,
    praise:
      pack.creatorInput.actionVocabulary.find(({ actionId }) => actionId === action.id)
        ?.praise ??
      `You have given ${action.label} a motive and an accepted cost, so it can enter the world as a cause instead of a guaranteed result.`,
    proposal: {
      proposalHash: sha256Canonical(proposalPayload),
      registeredActionId: action.id,
      canonicalExecution: canonicalExecution.execution,
      label: action.label,
      preservedIntent: desiredOutcome,
      desiredOutcome,
      characterMotive: answerById(answers, "character_motive"),
      acceptedCost: answerById(answers, "accepted_cost"),
      worldCompatibleExecution: `${action.summary} The world will resolve the registered consequences; it will not grant the desired outcome merely because it was requested.`,
      worldMeaning: action.worldMeaning,
      mappingBasis: selected.matchedSignals
        .slice(0, 6)
        .map((signal) => `Creator direction or answers explicitly name “${signal}”.`),
      forkBeforeAction,
      turnCost: 1,
    },
  });
};

export const registeredCreatorActionInput = ({
  pack,
  actionId,
  canonicalExecution,
}: {
  pack: PenelopeWorldPackV1;
  actionId: string;
  canonicalExecution: CreatorCCanonicalExecution;
}): string => {
  const scenario = pack.scenario;
  const action = participantActions(scenario).find(({ id }) => id === actionId);
  if (!action) throw new Error("The confirmed creator action is not registered for the focal participant.");
  const verb = canonicalVerb(action);
  if (!verb || canonicalExecution.verb !== verb) {
    throw new Error("The confirmed canonical creator execution does not match the registered action.");
  }
  if (action.targetMode === "entity") {
    if (
      !canonicalExecution.targetEntityId ||
      canonicalExecution.targetZoneId ||
      !action.allowedTargetEntityIds.includes(canonicalExecution.targetEntityId)
    ) {
      throw new Error("The confirmed canonical creator execution does not authorize this entity target.");
    }
    const target = scenario.actors.find(
      ({ id }) => id === canonicalExecution.targetEntityId,
    );
    return target && !normalize(verb).includes(normalize(target.participantLabel))
      ? `${verb} ${target.participantLabel}`
      : verb;
  }
  if (action.targetMode === "zone") {
    if (
      !canonicalExecution.targetZoneId ||
      canonicalExecution.targetEntityId ||
      !action.allowedZoneIds.includes(canonicalExecution.targetZoneId)
    ) {
      throw new Error("The confirmed canonical creator execution does not authorize this zone target.");
    }
    const target = scenario.zones.find(({ id }) => id === canonicalExecution.targetZoneId);
    return target && !normalize(verb).includes(normalize(target.name))
      ? `${verb} ${target.name}`
      : verb;
  }
  if (canonicalExecution.targetEntityId || canonicalExecution.targetZoneId) {
    throw new Error("The confirmed canonical creator execution adds an unauthorized target.");
  }
  return verb;
};

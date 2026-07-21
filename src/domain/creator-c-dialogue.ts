import {
  CreatorCDialogueResponseSchema,
  CreatorTacitKnowledgeAnswerSchema,
  type CreatorCDialogueResponse,
  type CreatorCCanonicalExecution,
  type CreatorTacitKnowledgeAnswer,
  type CreatorTacitKnowledgeQuestionId,
} from "@/src/contracts/creator-c-dialogue";
import type { WorldSimulationSession } from "@/src/contracts/world-runtime";
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

const QUESTION_COPY: Record<
  CreatorTacitKnowledgeQuestionId,
  { prompt: string; whyItMatters: string }
> = {
  desired_outcome: {
    prompt: "If this works, what should Penelope gain, protect, or change?",
    whyItMatters:
      "The same outward move can seek proof, safety, leverage, or mercy; the world needs the intended gain before it can judge the action.",
  },
  character_motive: {
    prompt:
      "Why does Penelope choose this now, instead of waiting or taking one of the prepared routes?",
    whyItMatters:
      "A motive turns a convenient move into a character decision and tells the world which pressure she is answering.",
  },
  accepted_cost: {
    prompt:
      "What consequence is Penelope willing to risk if this draws attention or fails?",
    whyItMatters:
      "A chosen cost lets the world honor the creator's aim without guaranteeing the desired result for free.",
  },
};

const ACTION_CUES: Readonly<Record<string, readonly string[]>> = {
  "action.penelope.observe": [
    "observe",
    "watch",
    "wait",
    "study",
    "hold back",
    "stay silent",
    "attention",
  ],
  "action.penelope.test_testimony": [
    "test",
    "proof",
    "evidence",
    "truth",
    "lie",
    "trust",
    "question",
    "detail",
    "certainty",
  ],
  "action.penelope.order_washing": [
    "wash",
    "washing",
    "basin",
    "feet",
    "foot",
    "scar",
    "nurse",
    "household memory",
  ],
  "action.penelope.clear_room": [
    "melantho",
    "dismiss",
    "leave",
    "send away",
    "clear the room",
    "private",
    "privacy",
    "witness",
    "overhear",
    "exclude",
  ],
  "action.penelope.confront_privately": [
    "confront",
    "identity",
    "odysseus",
    "ask directly",
    "name him",
    "reveal",
    "admit",
  ],
};

const PRAISE_BY_ACTION: Readonly<Record<string, string>> = {
  "action.penelope.observe":
    "You are turning restraint into an active choice: Penelope protects what she does not yet know while allowing the other agendas in the room to move.",
  "action.penelope.test_testimony":
    "You have separated what Penelope wants to learn from what she can honestly know. That keeps the test useful without granting certainty for free.",
  "action.penelope.order_washing":
    "You have tied Penelope's aim to an existing household ritual. The answer can emerge through Eurycleia's memory instead of an unexplained revelation.",
  "action.penelope.clear_room":
    "You are buying privacy by creating a visible exclusion. That gives Penelope control now and gives Melantho a reason to react later.",
  "action.penelope.confront_privately":
    "You have chosen direct knowledge over concealment and accepted that the question itself may expose the secret. That makes the revelation costly.",
};

const normalize = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
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
            "penelope",
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
  scenario,
  originalAction,
  answers,
}: {
  scenario: WorldSimulationScenario;
  originalAction: string;
  answers: readonly CreatorTacitKnowledgeAnswer[];
}): RankedAction[] => {
  const originalNormalized = normalize(originalAction);
  const answerText = answers.map(({ answer }) => answer).join(" ");
  const combinedNormalized = normalize(`${originalAction} ${answerText}`);
  const originalTokens = meaningfulTokens(originalAction);
  const answerTokens = meaningfulTokens(answerText);

  return participantActions(scenario)
    .map((action) => {
      const metadataTokens = meaningfulTokens(
        [
          action.label,
          action.summary,
          action.worldMeaning,
          ...action.verbAliases,
        ].join(" "),
      );
      const metadataOverlap = [...metadataTokens].reduce(
        (total, token) =>
          total + (originalTokens.has(token) ? 2 : 0) + (answerTokens.has(token) ? 1 : 0),
        0,
      );
      const cueScore = (ACTION_CUES[action.id] ?? []).reduce((total, cue) => {
        const normalizedCue = normalize(cue);
        if (!normalizedCue) return total;
        if (originalNormalized.includes(normalizedCue)) return total + 5;
        if (combinedNormalized.includes(normalizedCue)) return total + 3;
        return total;
      }, 0);
      const matchedSignals = (ACTION_CUES[action.id] ?? []).filter((cue) =>
        combinedNormalized.includes(normalize(cue)),
      );
      return { action, score: metadataOverlap + cueScore, matchedSignals };
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.action.id.localeCompare(right.action.id),
    );
};

const alternativesFrom = (ranked: readonly RankedAction[]) =>
  ranked.slice(0, 3).map(({ action }) => ({
    registeredActionId: action.id,
    label: action.label,
    why: action.worldMeaning,
  }));

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
  const verb = canonicalVerb(action);
  if (!verb) {
    return {
      kind: "blocked",
      boundary:
        "The registered action has no stable execution verb, so the world cannot turn this proposal into a consequence safely.",
      nextQuestion:
        "Which registered physical action should Penelope take before the world resolves the outcome?",
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
          "Which one permitted person does Penelope physically address or affect with this move?",
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
          "Which one permitted place does Penelope physically move to or affect with this move?",
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

const unsupportedWorldMechanism = (originalAction: string): string | null => {
  const normalized = normalize(originalAction);
  if (/\b(?:magic|magical|spell|enchanted)\b/u.test(normalized)) {
    return "The current world has no registered magical power, spell, or enchanted object that can produce this result.";
  }
  if (/\bmirror\b/u.test(normalized)) {
    return "The current world has no registered mirror that can reveal identity or hidden knowledge.";
  }
  if (/\b(?:zeus|athena|poseidon|god|goddess)\b/u.test(normalized)) {
    return "The current world has no registered action that lets Penelope command a god or turn divine intervention into a guaranteed result.";
  }
  if (/\b(?:teleport|resurrect|time travel|fly the palace)\b/u.test(normalized)) {
    return "The current world has no premise or causal rule that supports this mechanism.";
  }
  return null;
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
  scenario,
  session,
  baseSessionId,
  originalAction,
  answers: answerInput,
  forkBeforeAction,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  baseSessionId: string;
  originalAction: string;
  answers: readonly CreatorTacitKnowledgeAnswer[];
  forkBeforeAction: boolean;
}): CreatorCDialogueResponse => {
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
  const missing = QUESTION_ORDER.find(
    (questionId) => !answers.some((answer) => answer.questionId === questionId),
  );
  if (missing) {
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_clarification",
      ...base,
      progress: { answered: answers.length, total: 3 },
      question: { questionId: missing, ...QUESTION_COPY[missing] },
    });
  }

  const desiredOutcome = answerById(answers, "desired_outcome");
  const ranked = rankActions({ scenario, originalAction, answers });
  const alternatives = alternativesFrom(ranked);
  const namedNpc = namesNonParticipantActor(scenario, originalAction);
  if (namedNpc) {
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_blocked",
      ...base,
      preservedIntent: desiredOutcome,
      boundary: `${namedNpc.label} is an NPC in this bounded scene. Penelope cannot silently author ${namedNpc.label}'s decision; that character must act through an agenda or a resolved reaction.`,
      nextQuestion: `What can Penelope do to give ${namedNpc.label} a reason or opportunity to make that choice?`,
      alternatives,
    });
  }

  const missingWorldSupport = unsupportedWorldMechanism(originalAction);
  if (missingWorldSupport) {
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_expansion_required",
      ...base,
      preservedIntent: desiredOutcome,
      missingWorldSupport,
      nextQuestion:
        "Do you want to pursue the same aim through evidence already present in Ithaca, or author a new world fact with a history, limit, and cost?",
      alternatives,
    });
  }

  const selected = ranked[0];
  const runnerUp = ranked[1];
  if (
    !selected ||
    selected.matchedSignals.length < 2 ||
    selected.score < 8 ||
    (runnerUp && selected.score - runnerUp.score < 3)
  ) {
    return CreatorCDialogueResponseSchema.parse({
      kind: "creator_blocked",
      ...base,
      preservedIntent: desiredOutcome,
      boundary:
        "The intention is clear, but the current scene has no registered Penelope action that can carry the proposed move without inventing its result.",
      nextQuestion:
        "What does Penelope physically do in the room to pursue this aim without assuming the outcome?",
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
      PRAISE_BY_ACTION[action.id] ??
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
  scenario,
  actionId,
  canonicalExecution,
}: {
  scenario: WorldSimulationScenario;
  actionId: string;
  canonicalExecution: CreatorCCanonicalExecution;
}): string => {
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

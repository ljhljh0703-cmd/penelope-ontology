import type { StoryActionBoundary } from "@/src/contracts/story";

export type ReservedActionSemanticViolation = {
  code:
    | "reserved_action_guard_missing"
    | "reserved_action_started"
    | "reserved_action_actor_transfer";
  choiceId: string;
  actionTypeId: string;
  expectedActorEntityId: string | null;
  detectedActorEntityId: string | null;
};

type ReservedActionGuard = {
  mentions: readonly RegExp[];
  started: readonly RegExp[];
};

const ACTOR = String.raw`(?:Penelope|Telemachus|Eurycleia|(?:the\s+)?guards?|(?:the\s+)?watcher|(?:the\s+)?servants?)`;
const MOVE_LAMP = String.raw`(?:moves?|moved|moving|carr(?:y|ies|ied|ying)|takes?|took|taking|shifts?|shifted|shifting|relocates?|relocated|relocating|places?|placed|placing|sets?|setting)\b(?:\s+[\p{L}'’-]+){0,5}\s+(?:the\s+)?(?:(?:covered|decoy)\s+)?lamp\b(?:\s+[\p{L}'’-]+){0,6}\s+(?:to|toward|towards|at|beside|beneath|into)\s+(?:the\s+)?east(?:ern)?\s+gate\b`;
const LIFT_LAMP_AND_HEAD_EAST = String.raw`(?:lifts?|lifted|lifting|picks?\s+up|picked\s+up|picking\s+up)\b(?:\s+[\p{L}'’-]+){0,4}\s+(?:the\s+)?(?:(?:covered|decoy)\s+)?lamp\b(?:\s+[\p{L}'’-]+){0,6}\s+(?:starts?|started|starting|heads?|headed|heading|moves?|moved|moving)\b(?:\s+[\p{L}'’-]+){0,4}\s+(?:toward|towards|for|to)\s+(?:the\s+)?east(?:ern)?\s+gate\b`;
const SWEEP_HARBOR = String.raw`(?:sweeps?|swept|sweeping|search(?:es|ed|ing)?|secures?|secured|securing|clears?|cleared|clearing|patrols?|patrolled|patrolling)\b(?:\s+[\p{L}'’-]+){0,6}\s+(?:the\s+)?(?:harbor|docks?|waterfront|quay|crowd)\b`;
const RING_BELL = String.raw`(?:(?:rings?|rang|rung|ringing|sounds?|sounded|sounding|tolls?|tolled|tolling)\b(?:\s+[\p{L}'’-]+){0,4}\s+(?:the\s+)?(?:public\s+|harbor\s+)?bell\b|(?:pulls?|pulled|pulling)\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:the\s+)?bell\s+rope\b|(?:raises?|raised|raising|sounds?|sounded|sounding)\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:the\s+)?(?:public\s+|harbor\s+)?alarm\b)`;
const QUIET_WATCH = String.raw`(?:(?:keeps?|kept|keeping|begins?|began|starting|starts?|started)\b(?:\s+[\p{L}'’-]+){0,4}\s+(?:a\s+)?quiet\s+watch\b|(?:leaves?|left|keeping|keeps?)\b(?:\s+[\p{L}'’-]+){0,4}\s+(?:the\s+)?bell\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:silent|quiet)\b|(?:puts?|put|placing|places?|placed|raises?|raised|raising|sets?|set|setting)\b(?:\s+[\p{L}'’-]+){0,4}\s+(?:the\s+)?(?:covered\s+)?lamp\b(?:\s+[\p{L}'’-]+){0,6}\s+(?:beneath|beside|at|under)\s+(?:the\s+)?west(?:ern)?\s+wall\b)`;

const registeredReservedActionGuards: Readonly<Record<string, ReservedActionGuard>> = {
  "action.move_decoy_lamp": {
    mentions: [
      new RegExp(MOVE_LAMP, "iu"),
      new RegExp(LIFT_LAMP_AND_HEAD_EAST, "iu"),
    ],
    started: [
      new RegExp(
        String.raw`\b${ACTOR}\b\s+(?:(?:now|already|quietly|quickly|carefully)\s+){0,3}${MOVE_LAMP}`,
        "iu",
      ),
      new RegExp(
        String.raw`\b${ACTOR}\b\s+(?:(?:begins?|began|starts?|started|continues?|continued)\s+(?:to\s+)?|(?:is|was|are|were)\s+)${MOVE_LAMP}`,
        "iu",
      ),
      new RegExp(
        String.raw`\b${ACTOR}\b\s+(?:(?:now|already|quietly|quickly|carefully)\s+){0,3}${LIFT_LAMP_AND_HEAD_EAST}`,
        "iu",
      ),
      new RegExp(
        String.raw`\b(?:the\s+)?(?:(?:covered|decoy)\s+)?lamp\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:is|was|has\s+been|had\s+been)\s+(?:moved|carried|taken|shifted|relocated|placed|set)\b(?:\s+[\p{L}'’-]+){0,6}\s+(?:to|toward|towards|at|beside|beneath|into)\s+(?:the\s+)?east(?:ern)?\s+gate\b`,
        "iu",
      ),
      new RegExp(
        String.raw`\b(?:the\s+)?(?:(?:covered|decoy)\s+)?lamp\b(?:\s+[\p{L}'’-]+){0,2}\s+(?:now\s+)?(?:stands?|waits?|burns?)\s+(?:at|beside|beneath)\s+(?:the\s+)?east(?:ern)?\s+gate\b`,
        "iu",
      ),
    ],
  },
  "action.sweep_harbor": {
    mentions: [
      new RegExp(SWEEP_HARBOR, "iu"),
      /\b(?:drives?|drove|driven|driving|forces?|forced|forcing)\b(?:\s+[\p{L}'’-]+){0,5}\s+(?:the\s+)?ship\b(?:\s+[\p{L}'’-]+){0,4}\s+away\b/iu,
    ],
    started: [
      new RegExp(
        String.raw`\b${ACTOR}\b\s+(?:(?:now|already|quickly|systematically)\s+){0,3}${SWEEP_HARBOR}`,
        "iu",
      ),
      new RegExp(
        String.raw`\b${ACTOR}\b\s+(?:(?:begins?|began|starts?|started|continues?|continued)\s+(?:to\s+)?|(?:is|was|are|were)\s+)${SWEEP_HARBOR}`,
        "iu",
      ),
      /\b(?:the\s+)?(?:harbor|docks?|waterfront|quay|crowd)\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:is|are|was|were|has\s+been|have\s+been|had\s+been)\s+(?:swept|searched|secured|cleared|patrolled)\b/iu,
      /\b(?:the\s+)?guards?\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:fan|fans|fanned|spread|spreads)\s+out\b(?:\s+[\p{L}'’-]+){0,5}\s+(?:the\s+)?(?:harbor|docks?|waterfront|quay|crowd)\b/iu,
    ],
  },
  "action.keep_quiet_watch": {
    mentions: [new RegExp(QUIET_WATCH, "iu")],
    started: [
      new RegExp(
        String.raw`\b${ACTOR}\b\s+(?:(?:now|already|quietly|carefully)\s+){0,3}${QUIET_WATCH}`,
        "iu",
      ),
      /\b(?:the\s+)?(?:covered\s+)?lamp\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:is|was|has\s+been|had\s+been)\s+(?:put|placed|raised|set)\b(?:\s+[\p{L}'’-]+){0,6}\s+(?:beneath|beside|at|under)\s+(?:the\s+)?west(?:ern)?\s+wall\b/iu,
    ],
  },
  "action.ring_public_bell": {
    mentions: [new RegExp(RING_BELL, "iu")],
    started: [
      new RegExp(
        String.raw`\b${ACTOR}\b\s+(?:(?:now|already|publicly|hard)\s+){0,3}${RING_BELL}`,
        "iu",
      ),
      /\b(?:the\s+)?(?:public\s+|harbor\s+)?bell\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:rings?|rang|tolls?|tolled|sounds?|sounded)\b/iu,
      /\b(?:the\s+)?(?:public\s+|harbor\s+)?alarm\b(?:\s+[\p{L}'’-]+){0,3}\s+(?:is|was|has\s+been|had\s+been)\s+(?:raised|sounded)\b/iu,
    ],
  },
};

const actorAliases: ReadonlyArray<{
  actorEntityId: string;
  pattern: RegExp;
}> = [
  { actorEntityId: "penelope", pattern: /\bPenelope\b/iu },
  { actorEntityId: "telemachus", pattern: /\bTelemachus\b/iu },
  { actorEntityId: "eurycleia", pattern: /\bEurycleia\b/iu },
  {
    actorEntityId: "__other_registered_role__",
    pattern: /\b(?:the\s+)?(?:guards?|watcher|servants?)\b/iu,
  },
];

const allMatches = (value: string, pattern: RegExp) => {
  const flags = [...new Set(`${pattern.flags.replaceAll("g", "")}g`)].join("");
  const matcher = new RegExp(pattern.source, flags);
  return [...value.matchAll(matcher)].map((match) => ({
    index: match.index,
    end: match.index + match[0].length,
  }));
};

const explicitTransferredActor = ({
  clause,
  mention,
  expectedActorEntityId,
}: {
  clause: string;
  mention: { index: number; end: number };
  expectedActorEntityId: string;
}): string | null => {
  const actors = actorAliases.flatMap(({ actorEntityId, pattern }) =>
    allMatches(clause, pattern).map((match) => ({ ...match, actorEntityId })),
  );
  const before = actors
    .filter(({ index }) => index < mention.index)
    .sort((left, right) => right.index - left.index)[0];
  if (before && before.actorEntityId !== expectedActorEntityId) {
    return before.actorEntityId;
  }
  const passiveActor = actors
    .filter(({ index }) => index >= mention.end)
    .sort((left, right) => left.index - right.index)
    .find(({ index }) => /\bby\s*$/iu.test(clause.slice(mention.end, index)));
  return passiveActor && passiveActor.actorEntityId !== expectedActorEntityId
    ? passiveActor.actorEntityId
    : null;
};

const clauses = (prose: string): string[] =>
  prose.split(/(?<=[.!?])\s+|\n+/u).filter((clause) => clause.trim().length > 0);

const violationKey = (violation: ReservedActionSemanticViolation): string =>
  `${violation.code}:${violation.choiceId}:${violation.detectedActorEntityId ?? "none"}`;

/**
 * Bounded English semantic guards for the registered Red Sail actions only.
 * These rules do not claim general coreference or natural-language inference.
 */
export const validateReservedStoryActionSemantics = ({
  prose,
  boundary,
}: {
  prose: string;
  boundary: StoryActionBoundary;
}): ReservedActionSemanticViolation[] => {
  const violations: ReservedActionSemanticViolation[] = [];
  for (const reserved of boundary.reservedNextActions) {
    const guard = registeredReservedActionGuards[reserved.actionTypeId];
    if (!guard) {
      violations.push({
        code: "reserved_action_guard_missing",
        choiceId: reserved.choiceId,
        actionTypeId: reserved.actionTypeId,
        expectedActorEntityId: reserved.actorEntityId,
        detectedActorEntityId: null,
      });
      continue;
    }
    if (guard.started.some((pattern) => pattern.test(prose))) {
      violations.push({
        code: "reserved_action_started",
        choiceId: reserved.choiceId,
        actionTypeId: reserved.actionTypeId,
        expectedActorEntityId: reserved.actorEntityId,
        detectedActorEntityId: null,
      });
    }
    if (reserved.actorEntityId !== null) {
      for (const clause of clauses(prose)) {
        for (const pattern of guard.mentions) {
          for (const mention of allMatches(clause, pattern)) {
            const transferred = explicitTransferredActor({
              clause,
              mention,
              expectedActorEntityId: reserved.actorEntityId,
            });
            if (transferred) {
              violations.push({
                code: "reserved_action_actor_transfer",
                choiceId: reserved.choiceId,
                actionTypeId: reserved.actionTypeId,
                expectedActorEntityId: reserved.actorEntityId,
                detectedActorEntityId: transferred,
              });
            }
          }
        }
      }
    }
  }
  return [...new Map(violations.map((violation) => [violationKey(violation), violation])).values()];
};

export const registeredReservedStoryActionTypes = (): string[] =>
  Object.keys(registeredReservedActionGuards).sort();

import type { CandidateUtterance } from "@/src/contracts/model-draft";
import {
  ParticipantIntentSetSchema,
  type ParticipantIntent,
} from "@/src/contracts/participant-intent";
import type { CandidateAction } from "@/src/contracts/simulation";
import type { HardViolation } from "@/src/contracts/run";
import type { WorldPack } from "@/src/domain/schemas";
import { sortedUniqueIds } from "@/src/domain/canonical-json";

export type ParticipantControlIndex = Readonly<Record<string, ReadonlyArray<string>>>;

export type NormalizedParticipants = {
  intents: ParticipantIntent[];
  focalCharacterIds: string[];
  controlledEntityIdsByIntent: ParticipantControlIndex;
};

type ParticipantIntentInput = Omit<ParticipantIntent, "controlledEntityIds"> & {
  readonly controlledEntityIds: readonly string[];
};

export const normalizeParticipantIntents = (
  input: ReadonlyArray<ParticipantIntentInput>,
  pack: WorldPack,
): NormalizedParticipants => {
  const parsed = ParticipantIntentSetSchema.parse(
    input.map((intent) => ({
      ...intent,
      controlledEntityIds: [...intent.controlledEntityIds],
    })),
  );
  const characterIds = new Set(
    pack.entities.filter(({ kind }) => kind === "character").map(({ id }) => id),
  );

  for (const participantIntent of parsed) {
    for (const entityId of participantIntent.controlledEntityIds) {
      if (!characterIds.has(entityId)) {
        throw new Error(
          `Intent ${participantIntent.intentId} controls unknown character ${entityId}.`,
        );
      }
    }
  }

  const intents = parsed
    .map((participantIntent) => ({
      ...participantIntent,
      controlledEntityIds: sortedUniqueIds(participantIntent.controlledEntityIds),
    }))
    .sort(({ intentId: left }, { intentId: right }) => left.localeCompare(right));

  const controlledEntityIdsByIntent = Object.fromEntries(
    intents.map(({ intentId, controlledEntityIds }) => [intentId, controlledEntityIds]),
  );

  return {
    intents,
    focalCharacterIds: sortedUniqueIds(intents.flatMap(({ controlledEntityIds }) => controlledEntityIds)),
    controlledEntityIdsByIntent,
  };
};

const lineageViolation = (
  code: "intent_lineage_invalid" | "unauthorized_speaker" | "unauthorized_action",
  message: string,
  evidenceIds: string[],
): HardViolation => ({ code, message, evidenceIds });

const validateLineage = (
  actorEntityId: string,
  authorizingIntentId: string,
  contributingIntentIds: ReadonlyArray<string>,
  controls: ParticipantControlIndex,
  kind: "speaker" | "action",
): HardViolation[] => {
  const violations: HardViolation[] = [];
  const controlled = controls[authorizingIntentId];

  if (!controlled) {
    violations.push(
      lineageViolation(
        "intent_lineage_invalid",
        `Unknown authorizing intent ${authorizingIntentId}.`,
        [authorizingIntentId],
      ),
    );
  } else if (!controlled.includes(actorEntityId)) {
    violations.push(
      lineageViolation(
        kind === "speaker" ? "unauthorized_speaker" : "unauthorized_action",
        `${authorizingIntentId} does not control ${actorEntityId}.`,
        [authorizingIntentId, actorEntityId],
      ),
    );
  }

  for (const contributingIntentId of contributingIntentIds) {
    if (!controls[contributingIntentId]) {
      violations.push(
        lineageViolation(
          "intent_lineage_invalid",
          `Unknown contributing intent ${contributingIntentId}.`,
          [contributingIntentId],
        ),
      );
    }
  }

  return violations;
};

export const validateOutputLineage = (
  utterances: ReadonlyArray<CandidateUtterance>,
  actions: ReadonlyArray<CandidateAction>,
  controls: ParticipantControlIndex,
): HardViolation[] => [
  ...utterances.flatMap((utterance) =>
    validateLineage(
      utterance.speakerId,
      utterance.authorizingIntentId,
      utterance.contributingIntentIds,
      controls,
      "speaker",
    ),
  ),
  ...actions.flatMap((action) =>
    validateLineage(
      action.actorEntityId,
      action.authorizingIntentId,
      action.contributingIntentIds,
      controls,
      "action",
    ),
  ),
].sort((left, right) =>
  `${left.code}:${left.evidenceIds.join(":")}`.localeCompare(
    `${right.code}:${right.evidenceIds.join(":")}`,
  ),
);

import { z } from "zod";
import {
  IdentifierSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";

const containsNonEnglishLetters = (text: string): boolean =>
  [...text].some(
    (character) => /\p{L}/u.test(character) && !/[A-Za-z]/u.test(character),
  );

export const countEnglishSceneWords = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;

const EnglishTextSchema = (maximumLength: number) =>
  z
    .string()
    .min(1)
    .max(maximumLength)
    .superRefine((text, context) => {
      if (text.trim().length === 0) {
        context.addIssue({
          code: "custom",
          message: "World narration text cannot contain only whitespace.",
        });
      }
      if (containsNonEnglishLetters(text)) {
        context.addIssue({
          code: "custom",
          message: "World narration input and output must use English prose.",
        });
      }
    });

export const WorldNarratorFactSchema = z
  .object({
    factId: IdentifierSchema,
    summary: EnglishTextSchema(600),
  })
  .strict();

export const WorldNarratorResolvedEventSchema = z
  .object({
    eventId: IdentifierSchema,
    source: z.enum(["player", "npc", "world"]),
    summary: EnglishTextSchema(800),
  })
  .strict();

export const WorldNarratorStyleConstraintSchema = z
  .object({
    constraintId: IdentifierSchema,
    ownership: z.enum(["creator_owned_original", "agent_proposed"]),
    instruction: EnglishTextSchema(400),
  })
  .strict();

export const WorldNarratorNextActionSchema = z
  .object({
    actionId: IdentifierSchema,
    actorEntityId: IdentifierSchema,
    actionTypeId: IdentifierSchema,
    label: EnglishTextSchema(160),
    intent: EnglishTextSchema(800),
  })
  .strict();

/**
 * The complete model-facing boundary. Hidden world truth, canon mutation,
 * effects, branch IDs, and facilitator-only state intentionally have no field.
 */
export const WorldNarrationRequestSchema = z
  .object({
    focalEntityId: IdentifierSchema,
    observableFacts: z.array(WorldNarratorFactSchema).min(1).max(24),
    focalKnowledge: z.array(WorldNarratorFactSchema).max(24),
    resolvedEvents: z.array(WorldNarratorResolvedEventSchema).min(1).max(8),
    previousVisibleSceneSummary: EnglishTextSchema(1_600).nullable(),
    styleConstraints: z
      .array(WorldNarratorStyleConstraintSchema)
      .min(1)
      .max(8),
    nextActionCandidates: z
      .array(WorldNarratorNextActionSchema)
      .max(3),
  })
  .strict()
  .superRefine((request, context) => {
    addDuplicateIssues(
      [
        ...request.observableFacts.map(({ factId }) => factId),
        ...request.focalKnowledge.map(({ factId }) => factId),
      ],
      "world narrator fact",
      context,
    );
    addDuplicateIssues(
      request.resolvedEvents.map(({ eventId }) => eventId),
      "world narrator event",
      context,
    );
    addDuplicateIssues(
      request.styleConstraints.map(({ constraintId }) => constraintId),
      "world narrator style constraint",
      context,
    );
    addDuplicateIssues(
      request.nextActionCandidates.map(({ actionId }) => actionId),
      "world narrator next action",
      context,
    );
  });

export const WorldNarrationGroundingSchema = z
  .object({
    factIds: z.array(IdentifierSchema),
    eventIds: z.array(IdentifierSchema),
  })
  .strict()
  .superRefine((grounding, context) => {
    addDuplicateIssues(grounding.factIds, "narration grounding fact", context);
    addDuplicateIssues(grounding.eventIds, "narration grounding event", context);
  });

export const WorldNarrationSegmentSchema = z
  .object({
    segmentId: IdentifierSchema,
    text: EnglishTextSchema(2_400),
    grounding: WorldNarrationGroundingSchema,
  })
  .strict();

const orderedUnique = (values: ReadonlyArray<string>): Array<string> => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

export const WorldNarrationSchema = z
  .object({
    title: EnglishTextSchema(160),
    prose: EnglishTextSchema(12_000),
    segments: z.array(WorldNarrationSegmentSchema).min(1).max(12),
    grounding: WorldNarrationGroundingSchema,
    nextActions: z.array(WorldNarratorNextActionSchema).max(3),
  })
  .strict()
  .superRefine((narration, context) => {
    const words = countEnglishSceneWords(narration.prose);
    if (words < 120 || words > 180) {
      context.addIssue({
        code: "custom",
        path: ["prose"],
        message: `World narration must contain 120 through 180 English words; received ${words}.`,
      });
    }
    if (narration.grounding.factIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["grounding", "factIds"],
        message: "World narration must cite at least one supplied fact.",
      });
    }

    addDuplicateIssues(
      narration.segments.map(({ segmentId }) => segmentId),
      "world narration segment",
      context,
    );

    const composedProse = narration.segments
      .map(({ text }) => text)
      .join("\n\n");
    if (narration.prose !== composedProse) {
      context.addIssue({
        code: "custom",
        path: ["prose"],
        message: "World narration prose must exactly concatenate its ordered segments.",
      });
    }

    const segmentFactIds = orderedUnique(
      narration.segments.flatMap(({ grounding }) => grounding.factIds),
    );
    const segmentEventIds = orderedUnique(
      narration.segments.flatMap(({ grounding }) => grounding.eventIds),
    );
    if (!equalIdSets(narration.grounding.factIds, segmentFactIds)) {
      context.addIssue({
        code: "custom",
        path: ["grounding", "factIds"],
        message: "Top-level fact grounding must match the facts cited by segments.",
      });
    }
    if (!equalIdSets(narration.grounding.eventIds, segmentEventIds)) {
      context.addIssue({
        code: "custom",
        path: ["grounding", "eventIds"],
        message: "Top-level event grounding must match the events cited by segments.",
      });
    }
  });

/** Post-generation scope data. This is never part of WorldNarrationRequest. */
export const WorldNarrationWithheldFactSchema = z
  .object({
    factId: IdentifierSchema,
    forbiddenPhrases: z.array(EnglishTextSchema(240)).min(1).max(8),
  })
  .strict();

const RestrictedConceptPhraseSchema = EnglishTextSchema(160);

export const WorldNarrationRestrictedEquivalenceSchema = z
  .object({
    subjectTerms: z.array(RestrictedConceptPhraseSchema).min(1).max(16),
    relationTerms: z.array(RestrictedConceptPhraseSchema).min(1).max(16),
    objectTerms: z.array(RestrictedConceptPhraseSchema).min(1).max(16),
    maxTokenDistance: z.number().int().min(3).max(40),
  })
  .strict()
  .superRefine((equivalence, context) => {
    addDuplicateIssues(
      equivalence.subjectTerms.map(normalizeLeakText),
      "restricted concept subject term",
      context,
    );
    addDuplicateIssues(
      equivalence.relationTerms.map(normalizeLeakText),
      "restricted concept relation term",
      context,
    );
    addDuplicateIssues(
      equivalence.objectTerms.map(normalizeLeakText),
      "restricted concept object term",
      context,
    );
  });

/**
 * Creator-only post-generation scope. Specific aliases and equivalences must
 * never be serialized into WorldNarrationRequest or sent to a model.
 */
export const WorldNarrationRestrictedConceptSchema = z
  .object({
    conceptId: IdentifierSchema,
    unlockFactId: IdentifierSchema,
    forbiddenTerms: z.array(RestrictedConceptPhraseSchema).min(1).max(16),
    equivalences: z
      .array(WorldNarrationRestrictedEquivalenceSchema)
      .min(1)
      .max(4),
  })
  .strict()
  .superRefine((concept, context) => {
    addDuplicateIssues(
      concept.forbiddenTerms.map(normalizeLeakText),
      "restricted concept forbidden term",
      context,
    );
  });

export const WorldNarrationValidationCodeSchema = z.enum([
  "request_invalid",
  "narration_invalid",
  "fact_not_visible",
  "event_not_supplied",
  "resolved_event_omitted",
  "next_actions_mutated",
  "hidden_fact_leak",
  "restricted_concept_leak",
]);

const normalizeLeakText = (text: string): string =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

type TokenSpan = { start: number; end: number };

const tokenSpans = (tokens: string[], phrase: string): TokenSpan[] => {
  const phraseTokens = normalizeLeakText(phrase).split(/\s+/u).filter(Boolean);
  if (phraseTokens.length === 0 || phraseTokens.length > tokens.length) return [];
  const spans: TokenSpan[] = [];
  for (let start = 0; start <= tokens.length - phraseTokens.length; start += 1) {
    if (phraseTokens.every((token, offset) => tokens[start + offset] === token)) {
      spans.push({ start, end: start + phraseTokens.length - 1 });
    }
  }
  return spans;
};

const phraseAppears = (tokens: string[], phrase: string): boolean =>
  tokenSpans(tokens, phrase).length > 0;

export const worldNarrationTextMatchesRestrictedConcept = ({
  text,
  concept,
}: {
  text: string;
  concept: WorldNarrationRestrictedConcept;
}): boolean => {
  const parsed = WorldNarrationRestrictedConceptSchema.parse(concept);
  const tokens = normalizeLeakText(text).split(/\s+/u).filter(Boolean);
  if (parsed.forbiddenTerms.some((term) => phraseAppears(tokens, term))) {
    return true;
  }

  return parsed.equivalences.some((equivalence) => {
    const subjectSpans = equivalence.subjectTerms.flatMap((term) =>
      tokenSpans(tokens, term),
    );
    const relationSpans = equivalence.relationTerms.flatMap((term) =>
      tokenSpans(tokens, term),
    );
    const objectSpans = equivalence.objectTerms.flatMap((term) =>
      tokenSpans(tokens, term),
    );
    return subjectSpans.some((subject) =>
      objectSpans.some((object) => {
        const windowStart = Math.min(subject.start, object.start);
        const windowEnd = Math.max(subject.end, object.end);
        if (windowEnd - windowStart + 1 > equivalence.maxTokenDistance) {
          return false;
        }
        return relationSpans.some(
          (relation) =>
            relation.start >= Math.max(0, windowStart - 3) &&
            relation.end <= windowEnd + 3,
        );
      }),
    );
  });
};

const equalIdSets = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

export const validateWorldNarration = (input: {
  request: unknown;
  narration: unknown;
  withheldFacts?: ReadonlyArray<WorldNarrationWithheldFact>;
  restrictedConcepts?: ReadonlyArray<WorldNarrationRestrictedConcept>;
}): WorldNarrationValidationResult => {
  const requestResult = WorldNarrationRequestSchema.safeParse(input.request);
  if (!requestResult.success) {
    return {
      ok: false,
      code: "request_invalid",
      message: requestResult.error.issues[0]?.message ?? "Narration request is invalid.",
    };
  }

  const narrationResult = WorldNarrationSchema.safeParse(input.narration);
  if (!narrationResult.success) {
    return {
      ok: false,
      code: "narration_invalid",
      message:
        narrationResult.error.issues[0]?.message ?? "World narration is invalid.",
    };
  }

  const withheldResult = z
    .array(WorldNarrationWithheldFactSchema)
    .safeParse(input.withheldFacts ?? []);
  if (!withheldResult.success) {
    return {
      ok: false,
      code: "request_invalid",
      message:
        withheldResult.error.issues[0]?.message ??
        "Withheld fact validation context is invalid.",
    };
  }

  const restrictedConceptResult = z
    .array(WorldNarrationRestrictedConceptSchema)
    .safeParse(input.restrictedConcepts ?? []);
  if (!restrictedConceptResult.success) {
    return {
      ok: false,
      code: "request_invalid",
      message:
        restrictedConceptResult.error.issues[0]?.message ??
        "Restricted concept validation context is invalid.",
    };
  }

  const request = requestResult.data;
  const narration = narrationResult.data;
  const visibleFactIds = new Set([
    ...request.observableFacts.map(({ factId }) => factId),
    ...request.focalKnowledge.map(({ factId }) => factId),
  ]);
  const suppliedEventIds = new Set(
    request.resolvedEvents.map(({ eventId }) => eventId),
  );

  const unknownFactId = narration.grounding.factIds.find(
    (factId) => !visibleFactIds.has(factId),
  );
  if (unknownFactId !== undefined) {
    return {
      ok: false,
      code: "fact_not_visible",
      message: `Narration cited a fact outside the focal boundary: ${unknownFactId}`,
    };
  }

  const unknownEventId = narration.grounding.eventIds.find(
    (eventId) => !suppliedEventIds.has(eventId),
  );
  if (unknownEventId !== undefined) {
    return {
      ok: false,
      code: "event_not_supplied",
      message: `Narration cited an unresolved event: ${unknownEventId}`,
    };
  }

  if (
    !equalIdSets(
      narration.grounding.eventIds,
      request.resolvedEvents.map(({ eventId }) => eventId),
    )
  ) {
    return {
      ok: false,
      code: "resolved_event_omitted",
      message: "Narration must ground every resolved player, NPC, and world event.",
    };
  }

  if (
    JSON.stringify(narration.nextActions) !==
    JSON.stringify(request.nextActionCandidates)
  ) {
    return {
      ok: false,
      code: "next_actions_mutated",
      message: "Narration must copy runtime-supplied next actions exactly.",
    };
  }

  const visibleOutput = normalizeLeakText(
    `${narration.title}\n${narration.prose}`,
  );
  for (const withheld of withheldResult.data) {
    const leakedPhrase = withheld.forbiddenPhrases.find((phrase) => {
      const normalizedPhrase = normalizeLeakText(phrase);
      return normalizedPhrase.length > 0 && visibleOutput.includes(normalizedPhrase);
    });
    if (leakedPhrase !== undefined) {
      return {
        ok: false,
        code: "hidden_fact_leak",
        message: `Narration exposed withheld fact ${withheld.factId}.`,
      };
    }
  }

  const focalKnowledgeIds = new Set(
    request.focalKnowledge.map(({ factId }) => factId),
  );
  for (const concept of restrictedConceptResult.data) {
    if (
      !focalKnowledgeIds.has(concept.unlockFactId) &&
      worldNarrationTextMatchesRestrictedConcept({
        text: visibleOutput,
        concept,
      })
    ) {
      return {
        ok: false,
        code: "restricted_concept_leak",
        message: `Narration exposed restricted concept ${concept.conceptId}.`,
      };
    }
  }

  return { ok: true, request, narration };
};

export const WorldNarratorTraceSchema = z
  .object({
    provenance: z.enum(["fixture", "model"]),
    adapterId: IdentifierSchema,
  })
  .strict();

export const WorldNarratorOutcomeSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("completed"),
      narration: WorldNarrationSchema,
      trace: WorldNarratorTraceSchema,
    })
    .strict(),
  z
    .object({
      outcome: z.literal("rejected"),
      error: z
        .object({
          code: IdentifierSchema,
          message: z.string().min(1),
        })
        .strict(),
      trace: WorldNarratorTraceSchema,
    })
    .strict(),
]);

export type WorldNarratorFact = z.infer<typeof WorldNarratorFactSchema>;
export type WorldNarratorResolvedEvent = z.infer<
  typeof WorldNarratorResolvedEventSchema
>;
export type WorldNarratorStyleConstraint = z.infer<
  typeof WorldNarratorStyleConstraintSchema
>;
export type WorldNarratorNextAction = z.infer<
  typeof WorldNarratorNextActionSchema
>;
export type WorldNarrationRequest = z.infer<typeof WorldNarrationRequestSchema>;
export type WorldNarrationGrounding = z.infer<
  typeof WorldNarrationGroundingSchema
>;
export type WorldNarrationSegment = z.infer<
  typeof WorldNarrationSegmentSchema
>;
export type WorldNarration = z.infer<typeof WorldNarrationSchema>;
export type WorldNarrationWithheldFact = z.infer<
  typeof WorldNarrationWithheldFactSchema
>;
export type WorldNarrationRestrictedEquivalence = z.infer<
  typeof WorldNarrationRestrictedEquivalenceSchema
>;
export type WorldNarrationRestrictedConcept = z.infer<
  typeof WorldNarrationRestrictedConceptSchema
>;
export type WorldNarrationValidationCode = z.infer<
  typeof WorldNarrationValidationCodeSchema
>;
export type WorldNarrationValidationResult =
  | {
      ok: true;
      request: WorldNarrationRequest;
      narration: WorldNarration;
    }
  | {
      ok: false;
      code: WorldNarrationValidationCode;
      message: string;
    };
export type WorldNarratorOutcome = z.infer<typeof WorldNarratorOutcomeSchema>;

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import { IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";
import {
  NarrationRendererRequestSchema,
  type NarrationRendererRequest,
} from "@/src/contracts/world-narrator";
import { canonicalJson } from "@/src/domain/canonical-json";

/**
 * W5 evaluation-only reconstruction of the pre-Lane-D renderer.
 *
 * This file must never be imported by production code. Its historical sources
 * are retrieved with `git show` and verified before capture; no deprecated
 * runtime authority is imported from `src/`.
 */
export const LEGACY_BASELINE_COMMIT =
  "e7ca346c45d1f6982ede21a9816b21a6bf6a4a0f" as const;
export const LEGACY_BASELINE_ADAPTER_PATH =
  "src/adapters/codex-cli/world-narrator.ts" as const;
export const LEGACY_BASELINE_CONTRACT_PATH =
  "src/contracts/world-narrator.ts" as const;
export const LEGACY_BASELINE_ADAPTER_SHA256 =
  "078c3ca16487b3d474234ae4bc89332f506b9c53593649148fa45caa7c6a83fc" as const;
export const LEGACY_BASELINE_CONTRACT_SHA256 =
  "6365b1e7843687fedc7511cedce535a6cfddbcfc4185b179c47117a9d9251970" as const;
export const LEGACY_BASELINE_OUTPUT_SCHEMA_SHA256 =
  "d6fdbee02296755397a9ea66e4c806a038fd8c2dac837e0544bb8b8496c94d72" as const;
export const LEGACY_BASELINE_REQUESTED_MODEL = "gpt-5.6-sol" as const;

const containsNonEnglishLetters = (text: string): boolean =>
  [...text].some(
    (character) => /\p{L}/u.test(character) && !/[A-Za-z]/u.test(character),
  );

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

const LegacyBaselineFactSchema = z
  .object({
    factId: IdentifierSchema,
    summary: EnglishTextSchema(600),
  })
  .strict();

const LegacyBaselineResolvedEventSchema = z
  .object({
    eventId: IdentifierSchema,
    source: z.enum(["player", "npc", "world"]),
    summary: EnglishTextSchema(800),
  })
  .strict();

const LegacyBaselineStyleConstraintSchema = z
  .object({
    constraintId: IdentifierSchema,
    ownership: z.enum(["creator_owned_original", "agent_proposed"]),
    instruction: EnglishTextSchema(400),
  })
  .strict();

export const LegacyBaselineNextActionSchema = z
  .object({
    actionId: IdentifierSchema,
    actorEntityId: IdentifierSchema,
    actionTypeId: IdentifierSchema,
    label: EnglishTextSchema(160),
    intent: EnglishTextSchema(800),
  })
  .strict();

export const LegacyBaselineRequestSchema = z
  .object({
    focalEntityId: IdentifierSchema,
    observableFacts: z.array(LegacyBaselineFactSchema).min(1).max(24),
    focalKnowledge: z.array(LegacyBaselineFactSchema).max(24),
    resolvedEvents: z
      .array(LegacyBaselineResolvedEventSchema)
      .min(1)
      .max(8),
    previousVisibleSceneSummary: EnglishTextSchema(1_600).nullable(),
    styleConstraints: z
      .array(LegacyBaselineStyleConstraintSchema)
      .min(1)
      .max(8),
    nextActionCandidates: z.array(LegacyBaselineNextActionSchema).max(3),
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

const LegacyBaselineGroundingSchema = z
  .object({
    factIds: z.array(IdentifierSchema),
    eventIds: z.array(IdentifierSchema),
  })
  .strict()
  .superRefine((grounding, context) => {
    addDuplicateIssues(
      grounding.factIds,
      "narration grounding fact",
      context,
    );
    addDuplicateIssues(
      grounding.eventIds,
      "narration grounding event",
      context,
    );
  });

const LegacyBaselineSegmentSchema = z
  .object({
    segmentId: IdentifierSchema,
    text: EnglishTextSchema(2_400),
    grounding: LegacyBaselineGroundingSchema,
  })
  .strict();

const orderedUnique = (values: ReadonlyArray<string>): string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
};

const equalIdSets = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

export const countLegacyBaselineWords = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;

export const LegacyBaselineOutputSchema = z
  .object({
    title: EnglishTextSchema(160),
    prose: EnglishTextSchema(12_000),
    segments: z.array(LegacyBaselineSegmentSchema).min(1).max(12),
    grounding: LegacyBaselineGroundingSchema,
    nextActions: z.array(LegacyBaselineNextActionSchema).max(3),
  })
  .strict()
  .superRefine((narration, context) => {
    const words = countLegacyBaselineWords(narration.prose);
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
        message:
          "World narration prose must exactly concatenate its ordered segments.",
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
        message:
          "Top-level fact grounding must match the facts cited by segments.",
      });
    }
    if (!equalIdSets(narration.grounding.eventIds, segmentEventIds)) {
      context.addIssue({
        code: "custom",
        path: ["grounding", "eventIds"],
        message:
          "Top-level event grounding must match the events cited by segments.",
      });
    }
  });

export const LEGACY_BASELINE_OUTPUT_JSON_SCHEMA = z.toJSONSchema(
  LegacyBaselineOutputSchema,
  { target: "draft-07", reused: "inline" },
);

export type LegacyBaselineNextAction = z.infer<
  typeof LegacyBaselineNextActionSchema
>;
export type LegacyBaselineRequest = z.infer<
  typeof LegacyBaselineRequestSchema
>;
export type LegacyBaselineOutput = z.infer<
  typeof LegacyBaselineOutputSchema
>;

const LegacyBaselinePrivatePatternSchema = z
  .object({
    id: IdentifierSchema,
    patterns: z.array(z.string().min(1).max(240)).min(1).max(16),
  })
  .strict();

export const LegacyBaselinePrivateValidationSchema = z
  .object({
    forbiddenKnowledge: z.array(LegacyBaselinePrivatePatternSchema).max(16),
    forbiddenInferences: z.array(LegacyBaselinePrivatePatternSchema).max(16),
  })
  .strict();

export type LegacyBaselinePrivateValidation = z.infer<
  typeof LegacyBaselinePrivateValidationSchema
>;

const LEGACY_STYLE_CONSTRAINTS = [
  {
    constraintId: "style.limited_penelope_view",
    ownership: "agent_proposed" as const,
    instruction:
      "Use a close third-person view limited to what Penelope can perceive, remember, or reasonably infer.",
  },
  {
    constraintId: "style.concrete_pressure",
    ownership: "agent_proposed" as const,
    instruction:
      "Render pressure through physical action, interrupted speech, and objects in the room instead of abstract explanation.",
  },
  {
    constraintId: "style.dialogue_subtext",
    ownership: "agent_proposed" as const,
    instruction:
      "Let dialogue conceal as much as it reveals; do not make characters explain the ontology or causal rules.",
  },
  {
    constraintId: "style.no_false_certainty",
    ownership: "agent_proposed" as const,
    instruction:
      "Preserve uncertainty. Evidence may alter suspicion without becoming knowledge unless the resolved events explicitly grant it.",
  },
] as const;

const legacyEventSource = (
  eventId: string,
  request: NarrationRendererRequest,
): "player" | "npc" | "world" => {
  if (request.modelFacingRequest.authorizedActionEventIds.includes(eventId)) {
    return "player";
  }
  if (request.modelFacingRequest.authorizedReactionEventIds.includes(eventId)) {
    return "npc";
  }
  return "world";
};

/**
 * Projects the current, validated B scene authority into the historical A
 * request shape. No private validation fields, license boundaries, or current
 * prompt-only data are serialized into A. The old four style constraints are
 * intentionally preserved as the historical baseline condition.
 */
export const buildLegacyBaselineRequest = (
  rendererRequestInput: NarrationRendererRequest,
): LegacyBaselineRequest => {
  const rendererRequest = NarrationRendererRequestSchema.parse(
    rendererRequestInput,
  );
  const modelFacing = rendererRequest.modelFacingRequest;

  return LegacyBaselineRequestSchema.parse({
    focalEntityId: modelFacing.focalActorId,
    observableFacts: modelFacing.visibleFacts.map(({ factId, renderText }) => ({
      factId,
      summary: renderText,
    })),
    focalKnowledge: [],
    resolvedEvents: modelFacing.resolvedEvents.map(
      ({ eventId, observableText }) => ({
        eventId,
        source: legacyEventSource(eventId, rendererRequest),
        summary: observableText,
      }),
    ),
    previousVisibleSceneSummary: null,
    styleConstraints: LEGACY_STYLE_CONSTRAINTS,
    nextActionCandidates: [],
  });
};

const LEGACY_MODEL_INSTRUCTIONS = [
  "You are the world narrator for Penelope Ontology.",
  "Return only the structured world narration required by the supplied JSON schema.",
  "Write the prose in English using 120 through 180 words.",
  "Narrate only the observable facts, focal knowledge, previous visible scene summary, and already-resolved events in WORLD_NARRATION_REQUEST_JSON.",
  "Do not invent or mutate world state, canon, effects, knowledge, identities, motives, branch data, event results, or future actions.",
  "Render every supplied resolved event and ground it with its exact eventId; cite only supplied factIds and eventIds.",
  "Use the supplied style constraints only to shape expression, never to change facts or resolved events; preserve each ownership label exactly.",
  "Keep the focal viewpoint inside what focalEntityId can perceive or already knows.",
  "Copy nextActionCandidates exactly and in order into nextActions; do not complete, combine, reassign, or rewrite them.",
  "The prose field must exactly concatenate the ordered segment text fields with two newline characters.",
  "Stop before the next user decision.",
  "Do not run commands, inspect files, call tools, use MCP, or browse the web. The complete safe request is below.",
].join(" ");

export const buildLegacyBaselinePrompt = (
  requestInput: LegacyBaselineRequest,
): string => {
  const request = LegacyBaselineRequestSchema.parse(requestInput);
  return `${LEGACY_MODEL_INSTRUCTIONS}\n\nWORLD_NARRATION_REQUEST_JSON:\n${canonicalJson(request)}\n`;
};

export const buildLegacyBaselineArgs = ({
  schemaPath,
  outputPath,
}: {
  schemaPath: string;
  outputPath: string;
}): string[] => [
  "exec",
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--model",
  LEGACY_BASELINE_REQUESTED_MODEL,
  "--output-schema",
  schemaPath,
  "--output-last-message",
  outputPath,
  "--color",
  "never",
  "-",
];

export type LegacyBaselineValidationResult =
  | {
      ok: true;
      request: LegacyBaselineRequest;
      output: LegacyBaselineOutput;
    }
  | {
      ok: false;
      code:
        | "request_invalid"
        | "output_invalid"
        | "fact_not_visible"
        | "event_not_supplied"
        | "resolved_event_omitted"
        | "next_actions_mutated"
        | "private_validation_invalid"
        | "hidden_fact_leak";
      message: string;
    };

const normalizeScreeningText = (text: string): string =>
  text
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9'\s-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const exactPhraseAppears = (text: string, phrase: string): boolean => {
  const normalizedPhrase = normalizeScreeningText(phrase);
  if (normalizedPhrase.length === 0) return false;
  return new RegExp(
    `(?:^|\\s)${escapeRegExp(normalizedPhrase)}(?:$|\\s)`,
    "u",
  ).test(normalizeScreeningText(text));
};

export const validateLegacyBaselineOutput = ({
  request: requestInput,
  output: outputInput,
  privateValidation: privateValidationInput = {
    forbiddenKnowledge: [],
    forbiddenInferences: [],
  },
}: {
  request: unknown;
  output: unknown;
  privateValidation?: unknown;
}): LegacyBaselineValidationResult => {
  const requestResult = LegacyBaselineRequestSchema.safeParse(requestInput);
  if (!requestResult.success) {
    return {
      ok: false,
      code: "request_invalid",
      message:
        requestResult.error.issues[0]?.message ??
        "Legacy baseline request is invalid.",
    };
  }
  const outputResult = LegacyBaselineOutputSchema.safeParse(outputInput);
  if (!outputResult.success) {
    return {
      ok: false,
      code: "output_invalid",
      message:
        outputResult.error.issues[0]?.message ??
        "Legacy baseline output is invalid.",
    };
  }
  const privateValidationResult =
    LegacyBaselinePrivateValidationSchema.safeParse(privateValidationInput);
  if (!privateValidationResult.success) {
    return {
      ok: false,
      code: "private_validation_invalid",
      message:
        privateValidationResult.error.issues[0]?.message ??
        "Legacy baseline private validation material is invalid.",
    };
  }

  const request = requestResult.data;
  const output = outputResult.data;
  const visibleFactIds = new Set([
    ...request.observableFacts.map(({ factId }) => factId),
    ...request.focalKnowledge.map(({ factId }) => factId),
  ]);
  const suppliedEventIds = new Set(
    request.resolvedEvents.map(({ eventId }) => eventId),
  );
  const unknownFactId = output.grounding.factIds.find(
    (factId) => !visibleFactIds.has(factId),
  );
  if (unknownFactId !== undefined) {
    return {
      ok: false,
      code: "fact_not_visible",
      message: `Narration cited a fact outside the focal boundary: ${unknownFactId}`,
    };
  }
  const unknownEventId = output.grounding.eventIds.find(
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
      output.grounding.eventIds,
      request.resolvedEvents.map(({ eventId }) => eventId),
    )
  ) {
    return {
      ok: false,
      code: "resolved_event_omitted",
      message:
        "Narration must ground every resolved player, NPC, and world event.",
    };
  }
  if (
    JSON.stringify(output.nextActions) !==
    JSON.stringify(request.nextActionCandidates)
  ) {
    return {
      ok: false,
      code: "next_actions_mutated",
      message: "Narration must copy runtime-supplied next actions exactly.",
    };
  }
  const proseForScreening = `${output.title}\n${output.prose}`;
  for (const material of [
    ...privateValidationResult.data.forbiddenKnowledge,
    ...privateValidationResult.data.forbiddenInferences,
  ]) {
    if (
      material.patterns.some((pattern) =>
        exactPhraseAppears(proseForScreening, pattern),
      )
    ) {
      return {
        ok: false,
        code: "hidden_fact_leak",
        message: `Narration exposed private material ${material.id}.`,
      };
    }
  }

  return { ok: true, request, output };
};

const sha256 = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const gitShow = ({
  repoRoot,
  revisionPath,
}: {
  repoRoot: string;
  revisionPath: string;
}): Buffer => {
  const result = spawnSync(
    "git",
    ["-C", repoRoot, "show", revisionPath],
    {
      encoding: "buffer",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (
    result.error !== undefined ||
    result.status !== 0 ||
    !Buffer.isBuffer(result.stdout)
  ) {
    throw new Error(`Legacy baseline pin unavailable: ${revisionPath}`);
  }
  return result.stdout;
};

const historicalStringArray = ({
  source,
  startMarker,
  endMarker,
}: {
  source: string;
  startMarker: string;
  endMarker: string;
}): string[] => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error("Legacy baseline behavioral source could not be parsed.");
  }
  const body = source.slice(start + startMarker.length, end);
  return [...body.matchAll(/"(?:[^"\\]|\\.)*"/gu)].map((match) =>
    JSON.parse(match[0]!) as string,
  );
};

const verifyHistoricalAdapterBehavior = (adapter: Buffer): void => {
  const source = adapter.toString("utf8");
  const historicalInstructions = historicalStringArray({
    source,
    startMarker: "const MODEL_INSTRUCTIONS = [",
    endMarker: "].join(\" \");",
  }).join(" ");
  if (historicalInstructions !== LEGACY_MODEL_INSTRUCTIONS) {
    throw new Error("Legacy baseline prompt reconstruction drifted from the pinned adapter.");
  }

  const functionStart = source.indexOf("export const buildCodexCliWorldNarratorArgs");
  const arrayStart = source.indexOf("): string[] => [", functionStart);
  const arrayEnd = source.indexOf("\n];", arrayStart);
  if (functionStart < 0 || arrayStart < 0 || arrayEnd < 0) {
    throw new Error("Legacy baseline CLI argument source could not be parsed.");
  }
  const argumentSource = source.slice(arrayStart + "): string[] => [".length, arrayEnd);
  const historicalArgs = argumentSource
    .split("\n")
    .map((line) => line.trim().replace(/,$/u, ""))
    .filter(Boolean)
    .map((token) => {
      if (token === "CODEX_CLI_WORLD_NARRATOR_REQUESTED_MODEL") {
        return LEGACY_BASELINE_REQUESTED_MODEL;
      }
      if (token === "schemaPath") return "__SCHEMA__";
      if (token === "outputPath") return "__OUTPUT__";
      if (/^"(?:[^"\\]|\\.)*"$/u.test(token)) {
        return JSON.parse(token) as string;
      }
      throw new Error(`Legacy baseline CLI argument token is unsupported: ${token}`);
    });
  const reconstructedArgs = buildLegacyBaselineArgs({
    schemaPath: "__SCHEMA__",
    outputPath: "__OUTPUT__",
  });
  if (JSON.stringify(historicalArgs) !== JSON.stringify(reconstructedArgs)) {
    throw new Error("Legacy baseline CLI argument reconstruction drifted from the pinned adapter.");
  }
};

export type LegacyBaselinePinVerification = {
  commit: typeof LEGACY_BASELINE_COMMIT;
  adapterSha256: typeof LEGACY_BASELINE_ADAPTER_SHA256;
  contractSha256: typeof LEGACY_BASELINE_CONTRACT_SHA256;
};

/**
 * Fails closed before evaluation if the pinned commit cannot be read or either
 * historical file differs by one byte. `git show` is mandatory so a copied or
 * reconstructed local file cannot silently become the baseline authority.
 */
export const verifyLegacyBaselinePins = ({
  repoRoot,
}: {
  repoRoot: string;
}): LegacyBaselinePinVerification => {
  const adapter = gitShow({
    repoRoot,
    revisionPath: `${LEGACY_BASELINE_COMMIT}:${LEGACY_BASELINE_ADAPTER_PATH}`,
  });
  const contract = gitShow({
    repoRoot,
    revisionPath: `${LEGACY_BASELINE_COMMIT}:${LEGACY_BASELINE_CONTRACT_PATH}`,
  });
  const adapterSha256 = sha256(adapter);
  const contractSha256 = sha256(contract);
  if (adapterSha256 !== LEGACY_BASELINE_ADAPTER_SHA256) {
    throw new Error(
      `Legacy baseline adapter pin mismatch: expected ${LEGACY_BASELINE_ADAPTER_SHA256}, received ${adapterSha256}`,
    );
  }
  if (contractSha256 !== LEGACY_BASELINE_CONTRACT_SHA256) {
    throw new Error(
      `Legacy baseline contract pin mismatch: expected ${LEGACY_BASELINE_CONTRACT_SHA256}, received ${contractSha256}`,
    );
  }
  verifyHistoricalAdapterBehavior(adapter);
  const reconstructedSchemaSha256 = sha256(
    Buffer.from(canonicalJson(LEGACY_BASELINE_OUTPUT_JSON_SCHEMA), "utf8"),
  );
  if (reconstructedSchemaSha256 !== LEGACY_BASELINE_OUTPUT_SCHEMA_SHA256) {
    throw new Error(
      `Legacy baseline output schema reconstruction drifted: expected ${LEGACY_BASELINE_OUTPUT_SCHEMA_SHA256}, received ${reconstructedSchemaSha256}`,
    );
  }
  return {
    commit: LEGACY_BASELINE_COMMIT,
    adapterSha256: LEGACY_BASELINE_ADAPTER_SHA256,
    contractSha256: LEGACY_BASELINE_CONTRACT_SHA256,
  };
};

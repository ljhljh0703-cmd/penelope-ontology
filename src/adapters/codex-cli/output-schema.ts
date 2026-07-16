import { zodTextFormat } from "openai/helpers/zod";
import { ModelDraftSchema } from "@/src/contracts/model-draft";

export const CODEX_CLI_OUTPUT_SCHEMA_NAME = "narrative_model_draft" as const;

export type CodexCliOutputSchema = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const assertExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void => {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has an unexpected shape.`);
  }
};

const assertJsonSchemaNode = (
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new Error(`Codex CLI output schema is cyclic at ${path}.`);
    }
    ancestors.add(value);
    value.forEach((child, index) =>
      assertJsonSchemaNode(child, `${path}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return;
  }

  if (!isRecord(value)) {
    throw new Error(`Codex CLI output schema is not JSON-compatible at ${path}.`);
  }
  if (ancestors.has(value)) {
    throw new Error(`Codex CLI output schema is cyclic at ${path}.`);
  }
  ancestors.add(value);

  if (Object.hasOwn(value, "oneOf")) {
    throw new Error(`Codex CLI output schema contains unsupported oneOf at ${path}.`);
  }

  if (value.type === "object") {
    if (!isRecord(value.properties) || value.additionalProperties !== false) {
      throw new Error(`Codex CLI output schema is not a strict object at ${path}.`);
    }
    if (
      !Array.isArray(value.required) ||
      value.required.some((key) => typeof key !== "string")
    ) {
      throw new Error(`Codex CLI output schema has invalid required fields at ${path}.`);
    }

    const propertyKeys = Object.keys(value.properties).sort();
    const requiredKeys = [...value.required].sort();
    if (
      propertyKeys.length !== requiredKeys.length ||
      propertyKeys.some((key, index) => key !== requiredKeys[index])
    ) {
      throw new Error(
        `Codex CLI output schema does not require every object property at ${path}.`,
      );
    }
  }

  for (const [key, child] of Object.entries(value)) {
    assertJsonSchemaNode(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
};

const deepFreeze = <T>(value: T, seen = new Set<object>()): T => {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return value;
  }
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
};

export const extractCodexCliOutputSchema = (format: unknown): CodexCliOutputSchema => {
  if (!isRecord(format)) {
    throw new Error("OpenAI text format wrapper is not an object.");
  }
  assertExactKeys(format, ["type", "name", "strict", "schema"], "OpenAI text format wrapper");
  if (
    format.type !== "json_schema" ||
    format.name !== CODEX_CLI_OUTPUT_SCHEMA_NAME ||
    format.strict !== true ||
    !isRecord(format.schema)
  ) {
    throw new Error("OpenAI text format wrapper has an unexpected contract.");
  }
  if (format.schema.type !== "object") {
    throw new Error("Codex CLI output schema must have an object root.");
  }

  assertJsonSchemaNode(format.schema, "$", new Set());
  return deepFreeze(format.schema);
};

export const buildCodexCliOutputSchema = (): CodexCliOutputSchema =>
  extractCodexCliOutputSchema(
    zodTextFormat(ModelDraftSchema, CODEX_CLI_OUTPUT_SCHEMA_NAME),
  );

export const CODEX_CLI_MODEL_DRAFT_OUTPUT_SCHEMA = buildCodexCliOutputSchema();

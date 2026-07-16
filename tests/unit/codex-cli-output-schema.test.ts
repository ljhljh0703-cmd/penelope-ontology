import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";
import {
  CODEX_CLI_MODEL_DRAFT_OUTPUT_SCHEMA,
  CODEX_CLI_OUTPUT_SCHEMA_NAME,
  buildCodexCliOutputSchema,
  extractCodexCliOutputSchema,
} from "@/src/adapters/codex-cli/output-schema";
import { ModelDraftSchema } from "@/src/contracts/model-draft";

type JsonObject = Record<string, unknown>;

const visitJson = (value: unknown, visitor: (value: JsonObject) => void): void => {
  if (Array.isArray(value)) {
    value.forEach((child) => visitJson(child, visitor));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  visitor(value as JsonObject);
  Object.values(value).forEach((child) => visitJson(child, visitor));
};

describe("Codex CLI output schema", () => {
  it("is exactly the schema normalized by the OpenAI Zod helper", () => {
    const sdkFormat = zodTextFormat(ModelDraftSchema, CODEX_CLI_OUTPUT_SCHEMA_NAME);

    expect(CODEX_CLI_MODEL_DRAFT_OUTPUT_SCHEMA).toEqual(sdkFormat.schema);
    expect(buildCodexCliOutputSchema()).toEqual(sdkFormat.schema);
    expect(Object.isFrozen(CODEX_CLI_MODEL_DRAFT_OUTPUT_SCHEMA)).toBe(true);
  });

  it("uses anyOf for unions and contains no oneOf keyword", () => {
    let anyOfCount = 0;
    visitJson(CODEX_CLI_MODEL_DRAFT_OUTPUT_SCHEMA, (node) => {
      if (Object.hasOwn(node, "anyOf")) anyOfCount += 1;
      expect(Object.hasOwn(node, "oneOf")).toBe(false);
    });

    expect(anyOfCount).toBeGreaterThan(0);
  });

  it("keeps every object strict and requires every declared property", () => {
    let objectCount = 0;
    visitJson(CODEX_CLI_MODEL_DRAFT_OUTPUT_SCHEMA, (node) => {
      if (node.type !== "object") return;
      objectCount += 1;
      const properties = node.properties as Record<string, unknown>;
      const required = node.required as string[];
      expect(node.additionalProperties).toBe(false);
      expect([...required].sort()).toEqual(Object.keys(properties).sort());
    });

    expect(objectCount).toBeGreaterThan(1);
  });

  it("fails closed on a malformed SDK wrapper or unsupported oneOf", () => {
    expect(() => extractCodexCliOutputSchema({})).toThrow(/unexpected shape/);
    expect(() =>
      extractCodexCliOutputSchema({
        type: "json_schema",
        name: CODEX_CLI_OUTPUT_SCHEMA_NAME,
        strict: true,
        schema: {
          type: "object",
          properties: {
            value: { oneOf: [{ type: "string" }, { type: "number" }] },
          },
          required: ["value"],
          additionalProperties: false,
        },
      }),
    ).toThrow(/unsupported oneOf/);
  });
});

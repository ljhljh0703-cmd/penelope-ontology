import { describe, expect, it } from "vitest";
import {
  MODEL_DRAFT_JSON_SCHEMA,
  ModelDraftSchema,
} from "@/src/contracts/model-draft";

type JsonSchemaNode = {
  type?: string | readonly string[];
  minLength?: number;
  properties?: Record<string, JsonSchemaNode>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: JsonSchemaNode;
};

const assertStrictObjects = (schema: JsonSchemaNode): void => {
  if (schema.type === "object") {
    expect(schema.additionalProperties).toBe(false);
    expect(new Set(schema.required)).toEqual(new Set(Object.keys(schema.properties ?? {})));
  }
  for (const child of Object.values(schema.properties ?? {})) assertStrictObjects(child);
  if (schema.items) assertStrictObjects(schema.items);
};

describe("ModelDraft contract", () => {
  it("accepts a fully structured draft", () => {
    const result = ModelDraftSchema.safeParse({
      narrative: "A bounded scene.",
      usedClaimIds: ["claim.odyssey.penelope_uncertain_fate"],
      assertedClaims: [],
      characterActions: [],
      stateChanges: [],
      unknowns: [],
      expansionCandidates: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects prose-only output", () => {
    expect(ModelDraftSchema.safeParse({ narrative: "Only prose." }).success).toBe(false);
  });

  it("keeps every object strict for Responses Structured Outputs", () => {
    assertStrictObjects(MODEL_DRAFT_JSON_SCHEMA);
  });

  it("matches Zod's non-empty identifier constraints", () => {
    expect(MODEL_DRAFT_JSON_SCHEMA.properties.usedClaimIds.items.minLength).toBe(1);
    expect(
      MODEL_DRAFT_JSON_SCHEMA.properties.assertedClaims.items.properties.predicate.minLength,
    ).toBe(1);
    expect(
      MODEL_DRAFT_JSON_SCHEMA.properties.characterActions.items.properties.actorId.minLength,
    ).toBe(1);
    expect(MODEL_DRAFT_JSON_SCHEMA.properties.unknowns.items.minLength).toBe(1);
    expect(
      MODEL_DRAFT_JSON_SCHEMA.properties.expansionCandidates.items.properties.id.minLength,
    ).toBe(1);
  });
});

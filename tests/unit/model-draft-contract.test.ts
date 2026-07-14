import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MODEL_DRAFT_JSON_SCHEMA,
  ModelDraftSchema,
} from "@/src/contracts/model-draft";
import { FixtureRegistrySchema } from "@/src/contracts/fixture-registry";

type JsonSchemaNode = {
  type?: string | readonly string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  $defs?: Record<string, JsonSchemaNode>;
};

const assertStrictObjects = (schema: JsonSchemaNode): void => {
  if (schema.type === "object") {
    expect(schema.additionalProperties).toBe(false);
    expect(new Set(schema.required)).toEqual(new Set(Object.keys(schema.properties ?? {})));
  }
  for (const child of Object.values(schema.properties ?? {})) assertStrictObjects(child);
  if (schema.items) assertStrictObjects(schema.items);
  for (const branch of [...(schema.anyOf ?? []), ...(schema.oneOf ?? []), ...(schema.allOf ?? [])]) {
    assertStrictObjects(branch);
  }
  for (const definition of Object.values(schema.$defs ?? {})) assertStrictObjects(definition);
};

const dataRoot = "data/world-packs/trojan-returns";
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(dataRoot, path), "utf8")) as unknown;

describe("ModelDraft contract", () => {
  it("accepts every structured draft fixture", () => {
    const registry = FixtureRegistrySchema.parse(readJson("fixture-registry.json"));
    for (const fixture of registry.drafts) {
      expect(ModelDraftSchema.safeParse(readJson(fixture.path)).success, fixture.id).toBe(true);
    }
  });

  it("rejects prose-only and legacy Day-0 output", () => {
    expect(ModelDraftSchema.safeParse({ narrative: "Only prose." }).success).toBe(false);
    expect(
      ModelDraftSchema.safeParse({
        narrative: "Legacy draft",
        usedClaimIds: [],
        assertedClaims: [],
        characterActions: [],
        stateChanges: [],
        unknowns: [],
        expansionCandidates: [],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate style IDs and ambiguous intent authority", () => {
    const fixture = readJson("drafts/grounded-penelope.json") as Record<string, unknown>;
    fixture.appliedStyleConstraintIds = ["style.same", "style.same"];
    expect(ModelDraftSchema.safeParse(fixture).success).toBe(false);

    const actionFixture = readJson("drafts/red-sail-step-1.json") as Record<string, unknown>;
    const actions = actionFixture.actions as Array<Record<string, unknown>>;
    actions[0] = {
      ...actions[0],
      contributingIntentIds: [actions[0].authorizingIntentId],
    };
    expect(ModelDraftSchema.safeParse(actionFixture).success).toBe(false);
  });

  it("derives a strict JSON schema from the Zod source of truth", () => {
    assertStrictObjects(MODEL_DRAFT_JSON_SCHEMA as JsonSchemaNode);
  });
});

import { createHash } from "node:crypto";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const normalize = (value: unknown, path: string): JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Canonical JSON rejects non-finite number at ${path}.`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalize(item, `${path}[${index}]`));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, JsonValue> = {};

    for (const key of Object.keys(record).sort()) {
      const child = record[key];
      if (child === undefined) {
        throw new TypeError(`Canonical JSON rejects undefined at ${path}.${key}.`);
      }
      output[key] = normalize(child, `${path}.${key}`);
    }

    return output;
  }

  throw new TypeError(`Canonical JSON rejects ${typeof value} at ${path}.`);
};

export const canonicalJson = (value: unknown): string => JSON.stringify(normalize(value, "$"));

export const sha256Canonical = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

export const sortedUniqueIds = (values: ReadonlyArray<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

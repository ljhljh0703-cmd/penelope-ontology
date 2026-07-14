import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  sha256Canonical,
  sortedUniqueIds,
} from "@/src/domain/canonical-json";

describe("canonical JSON", () => {
  it("sorts object keys recursively while preserving ordered arrays", () => {
    const left = {
      z: 1,
      nested: { b: true, a: "first" },
      ordered: ["step-2", "step-1"],
    };
    const right = {
      ordered: ["step-2", "step-1"],
      nested: { a: "first", b: true },
      z: 1,
    };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJson(left)).toContain('["step-2","step-1"]');
    expect(sha256Canonical(left)).toBe(sha256Canonical(right));
  });

  it("rejects values that JSON would silently erase or corrupt", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow("undefined");
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow("non-finite");
    expect(() => canonicalJson({ invalid: Number.POSITIVE_INFINITY })).toThrow("non-finite");
  });

  it("normalizes unordered identifier sets only when explicitly requested", () => {
    expect(sortedUniqueIds(["telemachus", "penelope", "penelope"])).toEqual([
      "penelope",
      "telemachus",
    ]);
  });
});

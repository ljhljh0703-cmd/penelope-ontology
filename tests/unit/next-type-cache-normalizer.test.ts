import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeNextTypeCache } from "@/scripts/normalize-next-type-cache";

const roots: string[] = [];

const makeRoot = (): string => {
  const root = mkdtempSync(resolve(tmpdir(), "next-type-cache-"));
  roots.push(root);
  mkdirSync(resolve(root, ".next/types"), { recursive: true });
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Next generated type cache normalizer", () => {
  it("accepts but never deletes a byte-identical generated duplicate", () => {
    const root = makeRoot();
    const canonical = resolve(root, ".next/types/routes.d.ts");
    const duplicate = resolve(root, ".next/types/routes.d 2.ts");
    writeFileSync(canonical, "export type Route = '/';\n", "utf8");
    writeFileSync(duplicate, readFileSync(canonical));

    expect(normalizeNextTypeCache(root)).toBe(1);
    expect(readFileSync(duplicate, "utf8")).toBe("export type Route = '/';\n");
    expect(readFileSync(canonical, "utf8")).toBe("export type Route = '/';\n");
  });

  it("fails without deleting when contents differ or the canonical file is missing", () => {
    const root = makeRoot();
    const canonical = resolve(root, ".next/types/validator.ts");
    const duplicate = resolve(root, ".next/types/validator 2.ts");
    writeFileSync(canonical, "export const version = 1;\n", "utf8");
    writeFileSync(duplicate, "export const version = 2;\n", "utf8");

    expect(() => normalizeNextTypeCache(root)).toThrow(/differs/);
    expect(readFileSync(duplicate, "utf8")).toContain("version = 2");

    const orphan = resolve(root, ".next/types/orphan 2.ts");
    writeFileSync(orphan, "export {};\n", "utf8");
    expect(() => normalizeNextTypeCache(root)).toThrow(/differs|regular/);
    expect(readFileSync(orphan, "utf8")).toBe("export {};\n");
  });

  it("rejects symlinks and ignores similarly named files outside generated roots", () => {
    const root = makeRoot();
    const canonical = resolve(root, ".next/types/cache.ts");
    const duplicate = resolve(root, ".next/types/cache 2.ts");
    writeFileSync(canonical, "export {};\n", "utf8");
    symlinkSync(canonical, duplicate);
    const outside = resolve(root, "outside 2.ts");
    writeFileSync(outside, "keep\n", "utf8");

    expect(() => normalizeNextTypeCache(root)).toThrow(/regular/);
    expect(readFileSync(outside, "utf8")).toBe("keep\n");
  });

  it("rejects a generated-root symlink without deleting its external target", () => {
    const root = makeRoot();
    rmSync(resolve(root, ".next/types"), { recursive: true });
    const external = mkdtempSync(resolve(tmpdir(), "next-type-external-"));
    roots.push(external);
    const canonical = resolve(external, "routes.d.ts");
    const duplicate = resolve(external, "routes.d 2.ts");
    writeFileSync(canonical, "export type Route = '/';\n", "utf8");
    writeFileSync(duplicate, readFileSync(canonical));
    symlinkSync(external, resolve(root, ".next/types"), "dir");

    expect(() => normalizeNextTypeCache(root)).toThrow(/regular|escapes/);
    expect(readFileSync(duplicate, "utf8")).toBe("export type Route = '/';\n");
  });
});

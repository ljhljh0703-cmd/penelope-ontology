import {
  mkdirSync,
  mkdtempSync,
  existsSync,
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
  it("removes byte-identical numeric duplicates from both generated roots", () => {
    const root = makeRoot();
    const canonical = resolve(root, ".next/types/routes.d.ts");
    const duplicate = resolve(root, ".next/types/routes.d 3.ts");
    const devRoot = resolve(root, ".next/dev/types");
    mkdirSync(devRoot, { recursive: true });
    const devCanonical = resolve(devRoot, "validator.ts");
    const devDuplicate = resolve(devRoot, "validator 27.ts");
    writeFileSync(canonical, "export type Route = '/';\n", "utf8");
    writeFileSync(duplicate, readFileSync(canonical));
    writeFileSync(devCanonical, "export const valid = true;\n", "utf8");
    writeFileSync(devDuplicate, readFileSync(devCanonical));

    expect(normalizeNextTypeCache(root)).toBe(2);
    expect(existsSync(duplicate)).toBe(false);
    expect(existsSync(devDuplicate)).toBe(false);
    expect(readFileSync(canonical, "utf8")).toBe("export type Route = '/';\n");
    expect(readFileSync(devCanonical, "utf8")).toBe("export const valid = true;\n");
  });

  it("validates the full set before deleting any duplicate", () => {
    const root = makeRoot();
    const safeCanonical = resolve(root, ".next/types/routes.d.ts");
    const safeDuplicate = resolve(root, ".next/types/routes.d 2.ts");
    const canonical = resolve(root, ".next/types/validator.ts");
    const duplicate = resolve(root, ".next/types/validator 3.ts");
    writeFileSync(safeCanonical, "export type Route = '/';\n", "utf8");
    writeFileSync(safeDuplicate, readFileSync(safeCanonical));
    writeFileSync(canonical, "export const version = 1;\n", "utf8");
    writeFileSync(duplicate, "export const version = 2;\n", "utf8");

    expect(() => normalizeNextTypeCache(root)).toThrow(/differs/);
    expect(existsSync(safeDuplicate)).toBe(true);
    expect(readFileSync(duplicate, "utf8")).toContain("version = 2");
  });

  it("leaves an orphan numeric duplicate untouched when validation fails", () => {
    const root = makeRoot();

    const orphan = resolve(root, ".next/types/orphan 12.ts");
    writeFileSync(orphan, "export {};\n", "utf8");
    expect(() => normalizeNextTypeCache(root)).toThrow(/regular/);
    expect(readFileSync(orphan, "utf8")).toBe("export {};\n");
  });

  it("rejects symlinks and ignores similarly named files outside generated roots", () => {
    const root = makeRoot();
    const canonical = resolve(root, ".next/types/cache.ts");
    const duplicate = resolve(root, ".next/types/cache 4.ts");
    writeFileSync(canonical, "export {};\n", "utf8");
    symlinkSync(canonical, duplicate);
    const outside = resolve(root, "outside 4.ts");
    const nonNumeric = resolve(root, ".next/types/cache backup.ts");
    writeFileSync(outside, "keep\n", "utf8");
    writeFileSync(nonNumeric, "keep\n", "utf8");

    expect(() => normalizeNextTypeCache(root)).toThrow(/regular/);
    expect(readFileSync(outside, "utf8")).toBe("keep\n");
    expect(readFileSync(nonNumeric, "utf8")).toBe("keep\n");
  });

  it("rejects a generated-root symlink without deleting its external target", () => {
    const root = makeRoot();
    rmSync(resolve(root, ".next/types"), { recursive: true });
    const external = mkdtempSync(resolve(tmpdir(), "next-type-external-"));
    roots.push(external);
    const canonical = resolve(external, "routes.d.ts");
    const duplicate = resolve(external, "routes.d 3.ts");
    writeFileSync(canonical, "export type Route = '/';\n", "utf8");
    writeFileSync(duplicate, readFileSync(canonical));
    symlinkSync(external, resolve(root, ".next/types"), "dir");

    expect(() => normalizeNextTypeCache(root)).toThrow(/regular|escapes/);
    expect(readFileSync(duplicate, "utf8")).toBe("export type Route = '/';\n");
  });
});

#!/usr/bin/env node

import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DUPLICATE_NAME = /^(?<stem>.+) (?<copyIndex>(?:[2-9]|[1-9]\d+))\.ts$/u;

const walk = (directory: string): string[] => {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries.flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return [absolute];
  });
};

const assertRegularFile = (filePath: string, label: string): void => {
  try {
    const stat = lstatSync(filePath);
    if (stat.isFile() && !stat.isSymbolicLink()) return;
  } catch {
    // Emit the same stable error as a non-regular file without exposing a path.
  }
  throw new Error(`${label} must be a regular non-symlink file.`);
};

export const normalizeNextTypeCache = (root: string): number => {
  const realRoot = realpathSync(root);
  const generatedRoots = [".next/types", ".next/dev/types"].flatMap((relative) => {
    const directory = path.resolve(root, relative);
    try {
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error("Generated type root must be a regular directory.");
      }
      if (path.relative(realRoot, realpathSync(directory)) !== relative) {
        throw new Error("Generated type root escapes the repository.");
      }
      return [directory];
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  });
  const duplicates = generatedRoots
    .flatMap((directory) => walk(directory))
    .filter((filePath) => DUPLICATE_NAME.test(path.basename(filePath)));

  const canonicalByDuplicate = new Map<string, string>();

  for (const duplicate of duplicates) {
    const match = DUPLICATE_NAME.exec(path.basename(duplicate));
    const stem = match?.groups?.stem;
    if (!stem) throw new Error("Generated duplicate name is invalid.");
    const canonical = path.join(path.dirname(duplicate), `${stem}.ts`);
    assertRegularFile(duplicate, "Generated duplicate");
    assertRegularFile(canonical, "Canonical generated type");
    if (!readFileSync(duplicate).equals(readFileSync(canonical))) {
      throw new Error("Generated duplicate differs from its canonical type file.");
    }
    canonicalByDuplicate.set(duplicate, canonical);
  }

  // Delete only after the full set passes validation, so a mixed unsafe set is
  // left byte-for-byte untouched for diagnosis.
  for (const duplicate of duplicates) {
    const canonical = canonicalByDuplicate.get(duplicate);
    if (!canonical) throw new Error("Generated duplicate validation receipt is missing.");
    assertRegularFile(duplicate, "Generated duplicate");
    assertRegularFile(canonical, "Canonical generated type");
    if (!readFileSync(duplicate).equals(readFileSync(canonical))) {
      throw new Error("Generated duplicate changed after validation.");
    }
    unlinkSync(duplicate);
  }

  return duplicates.length;
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  try {
    const duplicates = normalizeNextTypeCache(process.cwd());
    process.stdout.write(`NEXT_TYPE_CACHE_NORMALIZED removed=${duplicates}\n`);
  } catch {
    process.stderr.write("NEXT_TYPE_CACHE_ERROR safety_check_failed\n");
    process.exitCode = 2;
  }
}

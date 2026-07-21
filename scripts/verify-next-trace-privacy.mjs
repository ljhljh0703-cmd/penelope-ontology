#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const normalize = (value) => value.split(path.sep).join("/");

const isPrivateLocator = (value) => {
  const normalized = normalize(value);
  const basename = normalized.split("/").at(-1) ?? "";
  return (
    /(?:^|\/)private-submission(?:\/|$)/u.test(normalized) ||
    /(?:^|\/)artifacts\/live(?:\/|$)/u.test(normalized) ||
    basename === ".env" ||
    basename === ".env.local" ||
    /^\.env\..+\.local$/u.test(basename) ||
    /(?:^|\/)Users\/[^/]+\//u.test(normalized) ||
    /^[A-Za-z]:\/Users\/[^/]+\//u.test(normalized)
  );
};

const walk = (directory, output = [], ignoredDirectory = null) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    const stat = lstatSync(candidate);
    if (candidate === ignoredDirectory && entry.isDirectory()) continue;
    if (stat.isSymbolicLink()) {
      throw new Error("next_trace_symlink");
    }
    if (entry.isDirectory()) walk(candidate, output, ignoredDirectory);
    else if (entry.isFile() && entry.name.endsWith(".nft.json")) output.push(candidate);
  }
  return output;
};

export const verifyNextTracePrivacy = (rootInput) => {
  const root = realpathSync(rootInput);
  const nextDirectory = path.join(root, ".next");
  const nextStat = lstatSync(nextDirectory);
  if (
    !nextStat.isDirectory() ||
    nextStat.isSymbolicLink() ||
    realpathSync(nextDirectory) !== nextDirectory
  ) {
    throw new Error("next_directory_unsafe");
  }
  // Vercel's Next adapter creates a derived `.next/output` bundle during
  // onBuildComplete and may place function symlinks inside it. The canonical
  // Next dependency traces remain elsewhere under `.next` and are still
  // required and scanned fail-closed.
  const manifests = walk(
    nextDirectory,
    [],
    path.join(nextDirectory, "output"),
  ).sort();
  if (manifests.length === 0) throw new Error("next_trace_missing");

  let files = 0;
  let findings = 0;
  for (const manifestPath of manifests) {
    const value = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!value || typeof value !== "object" || !Array.isArray(value.files)) {
      throw new Error("next_trace_invalid");
    }
    for (const entry of value.files) {
      if (typeof entry !== "string") throw new Error("next_trace_invalid");
      files += 1;
      const decoded = (() => {
        try {
          return decodeURIComponent(entry);
        } catch {
          return entry;
        }
      })();
      const resolved = path.resolve(path.dirname(manifestPath), decoded);
      const repositoryRelative = path.relative(root, resolved);
      if (isPrivateLocator(decoded) || isPrivateLocator(repositoryRelative)) {
        findings += 1;
      }
    }
  }
  return { manifests: manifests.length, files, findings };
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  try {
    const result = verifyNextTracePrivacy(process.cwd());
    if (result.findings > 0) {
      process.stderr.write(
        `NEXT_TRACE_PRIVACY_FAIL manifests=${result.manifests} findings=${result.findings}\n`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `NEXT_TRACE_PRIVACY_OK manifests=${result.manifests} files=${result.files}\n`,
      );
    }
  } catch {
    process.stderr.write("NEXT_TRACE_PRIVACY_ERROR invalid_or_missing_trace\n");
    process.exitCode = 2;
  }
}

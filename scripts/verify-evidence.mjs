#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const directory = path.join(root, "artifacts", "evidence");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const SHA256 = /^[a-f0-9]{64}$/;
const FILE_NAME = /^[a-z0-9][a-z0-9-]*\.json$/;
const BASELINE_FILES = new Set([
  "evidence-packet.json",
  "fixture-replay.json",
  "graph-descriptor.json",
  "live-readiness.json",
  "simulation-chain.json",
  "style-ablation-readiness.json",
  "style-harness.json",
]);
const OPTIONAL_FILE_GROUPS = [
  new Set(["live-sanitized.json", "live-capture-receipt.json"]),
  new Set(["codex-cli-sanitized.json", "codex-cli-capture-receipt.json"]),
  new Set(["live-harness.json"]),
  new Set(["style-ablation.json", "style-ablation-capture-receipt.json"]),
];
const ALLOWED_FILES = new Set([
  ...BASELINE_FILES,
  ...OPTIONAL_FILE_GROUPS.flatMap((group) => [...group]),
]);

const validateDirectory = async () => {
  const [rootReal, directoryReal, stat] = await Promise.all([
    realpath(root),
    realpath(directory),
    lstat(directory),
  ]);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    path.relative(rootReal, directoryReal) !== path.join("artifacts", "evidence")
  ) {
    throw new Error("evidence directory is not a regular repository directory");
  }
};

const parseManifest = async () => {
  const source = await readFile(path.join(directory, "manifest.json"), "utf8");
  const value = JSON.parse(source);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.files)
  ) {
    throw new Error("manifest shape is invalid");
  }
  const names = new Set();
  for (const entry of value.files) {
    const fileName =
      entry && typeof entry === "object" && typeof entry.path === "string"
        ? path.posix.basename(entry.path)
        : "";
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !FILE_NAME.test(fileName) ||
      fileName === "manifest.json" ||
      entry.path !== `artifacts/evidence/${fileName}` ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes <= 0 ||
      typeof entry.sha256 !== "string" ||
      !SHA256.test(entry.sha256) ||
      names.has(fileName) ||
      !ALLOWED_FILES.has(fileName)
    ) {
      throw new Error("manifest entry is invalid or non-canonical");
    }
    names.add(fileName);
  }
  for (const fileName of BASELINE_FILES) {
    if (!names.has(fileName)) {
      throw new Error("manifest is missing a mandatory baseline artifact");
    }
  }
  for (const group of OPTIONAL_FILE_GROUPS) {
    const present = [...group].filter((fileName) => names.has(fileName));
    if (present.length !== 0 && present.length !== group.size) {
      throw new Error("manifest optional evidence group is incomplete");
    }
  }
  return { value, names };
};

const main = async () => {
  await validateDirectory();
  const { value: manifest, names: expected } = await parseManifest();
  const actual = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.name.endsWith(".json") && entry.name !== "manifest.json")
    .map((entry) => entry.name)
    .sort();
  const failures = [];
  for (const entry of manifest.files) {
    const fileName = path.posix.basename(entry.path);
    const filePath = path.join(directory, fileName);
    const [buffer, stat, fileReal, directoryReal] = await Promise.all([
      readFile(filePath),
      lstat(filePath),
      realpath(filePath),
      realpath(directory),
    ]);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      path.relative(directoryReal, fileReal) !== fileName
    ) {
      failures.push(`${entry.path}: not a regular evidence file`);
      continue;
    }
    if (buffer.byteLength !== entry.bytes) failures.push(`${entry.path}: byte count mismatch`);
    if (sha256(buffer) !== entry.sha256) failures.push(`${entry.path}: SHA-256 mismatch`);
  }
  for (const fileName of actual) {
    if (!expected.has(fileName)) failures.push(`artifacts/evidence/${fileName}: missing manifest entry`);
  }
  for (const fileName of expected) {
    if (!actual.includes(fileName)) failures.push(`artifacts/evidence/${fileName}: missing file`);
  }
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`EVIDENCE_VERIFY_FAIL ${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`EVIDENCE_VERIFY_OK files=${manifest.files.length}\n`);
};

void main().catch(() => {
  process.stderr.write("EVIDENCE_VERIFY_ERROR invalid_evidence_tree\n");
  process.exitCode = 2;
});

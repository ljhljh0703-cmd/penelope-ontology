#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const directory = path.join(root, "artifacts", "evidence");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const main = async () => {
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  const expected = new Set(manifest.files.map(({ path: filePath }) => path.basename(filePath)));
  const actual = (await readdir(directory))
    .filter((fileName) => fileName.endsWith(".json") && fileName !== "manifest.json")
    .sort();
  const failures = [];
  for (const entry of manifest.files) {
    const buffer = await readFile(path.join(root, entry.path));
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

void main().catch((error) => {
  process.stderr.write(`EVIDENCE_VERIFY_ERROR ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});

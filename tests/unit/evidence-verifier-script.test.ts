import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const verifier = resolve(process.cwd(), "scripts/verify-evidence.mjs");
const baselineNames = [
  "evidence-packet.json",
  "fixture-replay.json",
  "graph-descriptor.json",
  "live-readiness.json",
  "simulation-chain.json",
  "style-ablation-readiness.json",
  "style-harness.json",
];

const makeRoot = (): string => {
  const root = mkdtempSync(resolve(tmpdir(), "evidence-verifier-"));
  roots.push(root);
  mkdirSync(resolve(root, "artifacts/evidence"), { recursive: true });
  return root;
};

const entryFor = (filePath: string, source: string) => ({
  path: filePath,
  bytes: Buffer.byteLength(source),
  sha256: createHash("sha256").update(source).digest("hex"),
});

const runVerifier = (root: string) =>
  spawnSync(process.execPath, [verifier], { cwd: root, encoding: "utf8" });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("public evidence verifier", () => {
  it("accepts a canonical manifest bound to exact artifact bytes", () => {
    const root = makeRoot();
    const files = baselineNames.map((fileName) => {
      const source = `${JSON.stringify({ fileName })}\n`;
      writeFileSync(resolve(root, `artifacts/evidence/${fileName}`), source);
      return entryFor(`artifacts/evidence/${fileName}`, source);
    });
    writeFileSync(
      resolve(root, "artifacts/evidence/manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, files })}\n`,
    );
    const result = runVerifier(root);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("EVIDENCE_VERIFY_OK files=7");
  });

  it("rejects a manifest path that escapes the evidence directory", () => {
    const root = makeRoot();
    const outsideSource = "{\"status\":\"outside\"}\n";
    const files = baselineNames.map((fileName) => {
      if (fileName === "evidence-packet.json") {
        writeFileSync(
          resolve(root, "artifacts/evidence/evidence-packet.json"),
          "{\"status\":\"tampered\"}\n",
        );
        return entryFor("artifacts/evidence/../evidence-packet.json", outsideSource);
      }
      const source = `${JSON.stringify({ fileName })}\n`;
      writeFileSync(resolve(root, `artifacts/evidence/${fileName}`), source);
      return entryFor(`artifacts/evidence/${fileName}`, source);
    });
    writeFileSync(resolve(root, "artifacts/evidence-packet.json"), outsideSource);
    writeFileSync(
      resolve(root, "artifacts/evidence/manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, files })}\n`,
    );
    const result = runVerifier(root);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain("EVIDENCE_VERIFY_OK");
  });

  it("rejects an invented claim artifact even when its bytes and hash verify", () => {
    const root = makeRoot();
    const files = [...baselineNames, "invented-verified-claim.json"].map(
      (fileName) => {
        const source = `${JSON.stringify({ fileName, status: "verified" })}\n`;
        writeFileSync(resolve(root, `artifacts/evidence/${fileName}`), source);
        return entryFor(`artifacts/evidence/${fileName}`, source);
      },
    );
    writeFileSync(
      resolve(root, "artifacts/evidence/manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, files })}\n`,
    );

    const result = runVerifier(root);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain("EVIDENCE_VERIFY_OK");
  });
});

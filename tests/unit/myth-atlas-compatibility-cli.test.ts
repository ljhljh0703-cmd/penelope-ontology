import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseMythAtlasCompatibilityArgs,
  runMythAtlasCompatibilityCli,
} from "@/scripts/report-myth-atlas-compatibility";
import { MYTH_ATLAS_PRIVATE_SCHEMA } from "@/src/integrations/myth-atlas/contracts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const sha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const makeHandoff = async ({ blocked = false }: { blocked?: boolean } = {}) => {
  const root = await mkdtemp(path.join(tmpdir(), "myth-atlas-compatibility-"));
  roots.push(root);
  await mkdir(path.join(root, "packs"));
  const claimProse = "PRIVATE CLAIM PROSE MUST NEVER REACH STDOUT";
  const relativePath = "packs/private-claims.json";
  await writeFile(path.join(root, relativePath), claimProse, "utf8");
  const manifest = {
    schemaId: "penelope.myth-atlas-handoff",
    schemaVersion: "1.0.0",
    pack: {
      id: "gr-odyssey-09-cyclops-v1",
      version: "1.0.1",
      sourceOntologySchemaVersion: MYTH_ATLAS_PRIVATE_SCHEMA,
    },
    verification: {
      provenanceAuthority: "producer_reported",
      exactPassageClaimCount: 10,
      videoReportedClaimCount: 5,
      pendingItemCount: 6,
    },
    governance: {
      rightsStatus: "private_reference_only",
      cultureStatus: "screening_required",
    },
    producerEligibility: {
      privateCreativeUse: !blocked,
      publicDemo: false,
    },
    assets: [
      {
        id: "cyclops-private-claims",
        role: "claim_pack",
        relativePath,
        bytes: Buffer.byteLength(claimProse),
        sha256: sha256(claimProse),
      },
    ],
  };
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
  return { root, manifestPath, claimProse, relativePath };
};

describe("Myth Atlas compatibility CLI", () => {
  it("accepts exactly one absolute root and manifest", () => {
    expect(
      parseMythAtlasCompatibilityArgs([
        "--manifest",
        "/tmp/handoff/manifest.json",
        "--root",
        "/tmp/handoff",
      ]),
    ).toEqual({
      root: "/tmp/handoff",
      manifestPath: "/tmp/handoff/manifest.json",
    });
    expect(() =>
      parseMythAtlasCompatibilityArgs([
        "--root",
        "/tmp/handoff",
        "--root",
        "/tmp/other",
      ]),
    ).toThrowError("arguments_invalid");
  });

  it("prints exactly one sanitized JSON report line to stdout", async () => {
    const { root, manifestPath, claimProse, relativePath } = await makeHandoff();
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(
      await runMythAtlasCompatibilityCli({
        args: ["--root", root, "--manifest", manifestPath],
        stdout,
        stderr,
      }),
    ).toBe(0);
    expect(stderr.write).not.toHaveBeenCalled();
    expect(stdout.write).toHaveBeenCalledTimes(1);
    const source = String(stdout.write.mock.calls[0]?.[0]);
    const report = JSON.parse(source) as Record<string, unknown>;
    expect(source).toBe(`${JSON.stringify(report)}\n`);
    expect(report).toMatchObject({
      schemaId: "penelope.myth-atlas-compatibility-report",
      decision: "analysis_only_no_import",
      evidenceCounts: {
        exactPassageClaims: 10,
        videoReportedClaims: 5,
        pendingItems: 6,
      },
    });
    expect(source).not.toContain(root);
    expect(source).not.toContain(manifestPath);
    expect(source).not.toContain(relativePath);
    expect(source).not.toContain(claimProse);
  });

  it("refuses a blocked private receipt with one path-free stderr line", async () => {
    const { root, manifestPath } = await makeHandoff({ blocked: true });
    const stdout = { write: vi.fn() };
    const stderr = { write: vi.fn() };

    expect(
      await runMythAtlasCompatibilityCli({
        args: ["--root", root, "--manifest", manifestPath],
        stdout,
        stderr,
      }),
    ).toBe(2);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledTimes(1);
    const source = String(stderr.write.mock.calls[0]?.[0]);
    expect(source).toBe(
      `${JSON.stringify({ schemaId: "penelope.myth-atlas-compatibility-error", schemaVersion: "1.0.0", code: "receipt_not_quarantined_private_reference" })}\n`,
    );
    expect(source).not.toContain(root);
    expect(source).not.toContain(manifestPath);
  });
});

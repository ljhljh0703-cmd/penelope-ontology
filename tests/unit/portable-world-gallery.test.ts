import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isValidSubmissionPng } from "@/scripts/verify-submission-readiness";

type PortableGalleryEntry = {
  fileName: string;
  phase: string;
  caption: string;
  path: string;
  bytes: number;
  sha256: string;
};

type PortableGalleryManifest = {
  schemaVersion: number;
  kind: string;
  fixtureOnly: boolean;
  evidenceScope: string;
  visuallyInspected: boolean;
  privacyInspected: boolean;
  files: PortableGalleryEntry[];
};

describe("portable World Pack product gallery", () => {
  it("binds three public-safe 1440x900 captures to exact bytes and hashes", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("docs/assets/demo/portable-world-manifest.json"), "utf8"),
    ) as PortableGalleryManifest;

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      kind: "supplementary_product_gallery",
      fixtureOnly: true,
      evidenceScope: "local_fixture_ui_capture_not_live_model_or_hosted_deployment_evidence",
      visuallyInspected: true,
      privacyInspected: true,
    });
    expect(manifest.files.map(({ fileName }) => fileName)).toEqual([
      "06-book19-world-pack.png",
      "07-oz-world-pack.png",
      "08-creator-pack-curtain.png",
    ]);

    for (const entry of manifest.files) {
      const file = readFileSync(resolve(entry.path));
      expect(entry.phase).toBe("portable-world");
      expect(entry.caption.length).toBeGreaterThanOrEqual(20);
      expect(entry.path).toBe(`docs/assets/demo/${entry.fileName}`);
      expect(file.byteLength).toBe(entry.bytes);
      expect(createHash("sha256").update(file).digest("hex")).toBe(entry.sha256);
      expect(isValidSubmissionPng(file)).toBe(true);
    }
  });
});

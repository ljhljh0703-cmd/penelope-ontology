import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDemoWorldPack } from "@/src/adapters/filesystem/demo-data";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import {
  MYTH_ATLAS_MAX_ASSET_BYTES,
  MYTH_ATLAS_PRIVATE_SCHEMA,
  MYTH_ATLAS_PUBLIC_SCHEMA,
  MythAtlasHandoffManifestSchema,
} from "@/src/integrations/myth-atlas/contracts";
import {
  inspectMythAtlasHandoff,
  mythAtlasManifestSha256,
} from "@/src/integrations/myth-atlas/intake";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const sha256 = (source: string): string =>
  createHash("sha256").update(source).digest("hex");

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penelope-myth-atlas-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "packs"));
  return root;
};

const writeAsset = async ({
  root,
  id,
  role,
  relativePath,
  source,
}: {
  root: string;
  id: string;
  role:
    | "claim_pack"
    | "source_registry"
    | "rights_culture_registry"
    | "verification_receipt";
  relativePath: string;
  source: string;
}) => {
  await writeFile(path.join(root, relativePath), source);
  return {
    id,
    role,
    relativePath,
    bytes: Buffer.byteLength(source),
    sha256: sha256(source),
  };
};

const makePrivateFixture = async () => {
  const root = await makeRoot();
  const relativePath = "packs/cyclops.json";
  const source = JSON.stringify({ claimState: "video_reported" });
  const asset = await writeAsset({
    root,
    id: "cyclops.claim-pack",
    role: "claim_pack",
    relativePath,
    source,
  });
  const manifest = {
    schemaId: "penelope.myth-atlas-handoff" as const,
    schemaVersion: "1.0.0" as const,
    pack: {
      id: "gr-odyssey-09-cyclops-v1",
      version: "1",
      sourceOntologySchemaVersion: MYTH_ATLAS_PRIVATE_SCHEMA,
    },
    verification: {
      provenanceAuthority: "producer_reported" as const,
      exactPassageClaimCount: 0,
      videoReportedClaimCount: 26,
      pendingItemCount: 10,
    },
    governance: {
      rightsStatus: "private_reference_only" as const,
      cultureStatus: "screening_required" as const,
    },
    producerEligibility: {
      privateCreativeUse: true,
      publicDemo: false,
    },
    assets: [asset],
  };
  return { root, manifest, source };
};

const makePublicFixture = async () => {
  const root = await makeRoot();
  const worldPack = await loadDemoWorldPack();
  const assets = await Promise.all([
    writeAsset({
      root,
      id: "odyssey.world-pack",
      role: "claim_pack",
      relativePath: "packs/world-pack.json",
      source: canonicalJson(worldPack),
    }),
    writeAsset({
      root,
      id: "odyssey.source-registry",
      role: "source_registry",
      relativePath: "packs/sources.json",
      source: "{}",
    }),
    writeAsset({
      root,
      id: "odyssey.rights-culture",
      role: "rights_culture_registry",
      relativePath: "packs/rights-culture.json",
      source: "{}",
    }),
    writeAsset({
      root,
      id: "odyssey.verification",
      role: "verification_receipt",
      relativePath: "packs/verification.json",
      source: "{}",
    }),
  ]);
  const manifest = {
    schemaId: "penelope.myth-atlas-handoff" as const,
    schemaVersion: "1.0.0" as const,
    pack: {
      id: worldPack.meta.id,
      version: worldPack.meta.version,
      sourceOntologySchemaVersion: MYTH_ATLAS_PUBLIC_SCHEMA,
    },
    verification: {
      provenanceAuthority: "independent_exact_passage_review" as const,
      exactPassageClaimCount: 12,
      videoReportedClaimCount: 0,
      pendingItemCount: 0,
    },
    governance: {
      rightsStatus: "cleared" as const,
      cultureStatus: "cleared" as const,
    },
    producerEligibility: { privateCreativeUse: true, publicDemo: true },
    assets,
  };
  return { root, manifest, worldPack };
};

describe("Myth Atlas intake boundary", () => {
  it("quarantines byte-verified producer reports as private reference material", async () => {
    const { root, manifest, source } = await makePrivateFixture();
    const receipt = await inspectMythAtlasHandoff({
      root,
      manifest,
      requestedUse: "private_creative_reference",
    });

    expect(receipt.decision).toBe("quarantined_private_reference");
    expect(receipt.blockers).toEqual([]);
    expect(receipt.warnings).toEqual([
      "creator_review_not_performed",
      "rights_not_cleared",
      "culture_not_cleared",
      "producer_reported_provenance_only",
      "video_reported_claims_present",
      "pending_items_present",
    ]);
    expect(receipt.trustBoundary).toBe("manifest_attestation_plus_byte_integrity_only");
    expect(receipt.rootAssumption).toBe("user_controlled_immutable_during_intake");
    expect(receipt.assets).toEqual([
      expect.objectContaining({ id: "cyclops.claim-pack", sha256: sha256(source) }),
    ]);
    expect(JSON.stringify(receipt)).not.toContain(root);
    expect(JSON.stringify(receipt)).not.toContain("packs/cyclops.json");
    expect(JSON.stringify(receipt)).not.toContain("claimState");
  });

  it("blocks producer-reported material from public canon without a separate review", async () => {
    const { root, manifest } = await makePrivateFixture();
    const receipt = await inspectMythAtlasHandoff({
      root,
      manifest,
      requestedUse: "public_canon_candidate",
    });

    expect(receipt.decision).toBe("blocked");
    expect(receipt.blockers).toEqual([
      "producer_public_demo_blocked",
      "public_source_schema_unsupported",
      "independent_exact_passage_review_missing",
      "verified_claim_missing",
      "video_reported_claims_present",
      "pending_items_present",
      "rights_not_cleared",
      "culture_not_cleared",
      "public_required_asset_missing",
      "public_supporting_artifact_validation_unavailable",
      "penelope_creator_review_gate_unavailable",
    ]);
  });

  it("validates a Penelope World Pack but keeps public canon blocked pending real review gates", async () => {
    const { root, manifest, worldPack } = await makePublicFixture();
    const receipt = await inspectMythAtlasHandoff({
      root,
      manifest,
      requestedUse: "public_canon_candidate",
    });

    expect(receipt.decision).toBe("blocked");
    expect(receipt.blockers).toEqual([
      "public_supporting_artifact_validation_unavailable",
      "penelope_creator_review_gate_unavailable",
    ]);
    expect(receipt.warnings).toEqual([]);
    expect(receipt.trustBoundary).toBe("manifest_attestation_plus_byte_integrity_only");
    expect(receipt.validatedWorldPackSha256).toBe(sha256Canonical(worldPack));
  });

  it("blocks an advertised pack version that differs from the parsed World Pack", async () => {
    const { root, manifest } = await makePublicFixture();
    const receipt = await inspectMythAtlasHandoff({
      root,
      manifest: { ...manifest, pack: { ...manifest.pack, version: "wrong-version" } },
      requestedUse: "public_canon_candidate",
    });

    expect(receipt.decision).toBe("blocked");
    expect(receipt.blockers).toContain("world_pack_version_mismatch");
  });

  it("normalizes asset order before hashing the manifest", async () => {
    const { manifest } = await makePublicFixture();
    expect(mythAtlasManifestSha256(manifest)).toBe(
      mythAtlasManifestSha256({ ...manifest, assets: [...manifest.assets].reverse() }),
    );
  });

  it("fails closed on a digest mismatch", async () => {
    const { root, manifest } = await makePrivateFixture();
    manifest.assets[0]!.sha256 = "0".repeat(64);

    await expect(
      inspectMythAtlasHandoff({
        root,
        manifest,
        requestedUse: "private_creative_reference",
      }),
    ).rejects.toMatchObject({
      code: "asset_sha256_mismatch",
      assetId: "cyclops.claim-pack",
    });
  });

  it("rejects an actual file larger than its declared size before accepting it", async () => {
    const { root, manifest } = await makePrivateFixture();
    manifest.assets[0]!.bytes = 1;

    await expect(
      inspectMythAtlasHandoff({
        root,
        manifest,
        requestedUse: "private_creative_reference",
      }),
    ).rejects.toMatchObject({
      code: "asset_byte_mismatch",
      assetId: "cyclops.claim-pack",
    });
  });

  it("rejects path traversal and unsupported source schemas before filesystem intake", async () => {
    const { manifest } = await makePrivateFixture();
    expect(
      MythAtlasHandoffManifestSchema.safeParse({
        ...manifest,
        assets: [{ ...manifest.assets[0], relativePath: "../private/story.md" }],
      }).success,
    ).toBe(false);
    expect(
      MythAtlasHandoffManifestSchema.safeParse({
        ...manifest,
        pack: { ...manifest.pack, sourceOntologySchemaVersion: "unknown-9.9" },
      }).success,
    ).toBe(false);
    expect(
      MythAtlasHandoffManifestSchema.safeParse({
        ...manifest,
        assets: [{ ...manifest.assets[0], bytes: MYTH_ATLAS_MAX_ASSET_BYTES + 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects symlinked assets even when the target stays inside the root", async () => {
    const { root, manifest, source } = await makePrivateFixture();
    await writeFile(path.join(root, "target.json"), source);
    await rm(path.join(root, manifest.assets[0]!.relativePath));
    await symlink(path.join(root, "target.json"), path.join(root, manifest.assets[0]!.relativePath));

    await expect(
      inspectMythAtlasHandoff({
        root,
        manifest,
        requestedUse: "private_creative_reference",
      }),
    ).rejects.toMatchObject({
      code: "asset_not_regular_file",
      assetId: "cyclops.claim-pack",
    });
  });
});

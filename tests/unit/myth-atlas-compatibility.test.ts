import { describe, expect, it } from "vitest";
import { loadDemoWorldPack } from "@/src/adapters/filesystem/demo-data";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  buildMythAtlasCompatibilityReport,
  MYTH_ATLAS_COMPATIBILITY_REQUIRED_GATES,
  MYTH_ATLAS_COMPATIBILITY_REQUIRED_MAPPINGS,
} from "@/src/integrations/myth-atlas/compatibility";
import {
  MYTH_ATLAS_PRIVATE_SCHEMA,
  MythAtlasIntakeReceiptSchema,
} from "@/src/integrations/myth-atlas/contracts";

const makeReceipt = () =>
  MythAtlasIntakeReceiptSchema.parse({
    schemaId: "penelope.myth-atlas-intake-receipt",
    schemaVersion: "1.0.0",
    pack: {
      id: "gr-odyssey-09-cyclops-v1",
      version: "1.0.1",
      sourceOntologySchemaVersion: MYTH_ATLAS_PRIVATE_SCHEMA,
    },
    requestedUse: "private_creative_reference",
    decision: "quarantined_private_reference",
    trustBoundary: "manifest_attestation_plus_byte_integrity_only",
    rootAssumption: "user_controlled_immutable_during_intake",
    manifestSha256: "1".repeat(64),
    validatedWorldPackSha256: null,
    assetCount: 1,
    totalBytes: 321,
    evidenceCounts: {
      exactPassageClaims: 10,
      videoReportedClaims: 5,
      pendingItems: 6,
    },
    governance: {
      provenanceAuthority: "producer_reported",
      rightsStatus: "private_reference_only",
      cultureStatus: "screening_required",
    },
    blockers: [],
    warnings: [
      "creator_review_not_performed",
      "rights_not_cleared",
      "culture_not_cleared",
      "producer_reported_provenance_only",
      "video_reported_claims_present",
      "pending_items_present",
    ],
    assets: [
      {
        id: "private-claim-pack-not-exported",
        role: "claim_pack",
        bytes: 321,
        sha256: "2".repeat(64),
      },
    ],
  });

describe("Myth Atlas private compatibility report", () => {
  it("builds one deterministic, path-free no-import report", async () => {
    const receipt = makeReceipt();
    const targetWorldPack = await loadDemoWorldPack();
    const first = buildMythAtlasCompatibilityReport({
      receipt,
      targetWorldPack,
    });
    const second = buildMythAtlasCompatibilityReport({
      receipt,
      targetWorldPack,
    });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first).toMatchObject({
      decision: "analysis_only_no_import",
      trustBoundary: "manifest_attestation_plus_byte_integrity_only",
      source: {
        intakeReceiptSha256: sha256Canonical(receipt),
        manifestSha256: receipt.manifestSha256,
      },
      target: {
        worldPackId: targetWorldPack.meta.id,
        worldPackVersion: targetWorldPack.meta.version,
        worldPackSha256: sha256Canonical(targetWorldPack),
      },
      evidenceCounts: {
        exactPassageClaims: 10,
        videoReportedClaims: 5,
        pendingItems: 6,
      },
      eligibility: {
        runtime: { eligible: false, eligibleClaimCount: 0 },
        modelInput: { eligible: false, eligibleClaimCount: 0 },
        canon: { eligible: false, eligibleClaimCount: 0 },
        public: { eligible: false, eligibleClaimCount: 0 },
      },
    });
    expect(first.requiredMappings).toEqual(
      MYTH_ATLAS_COMPATIBILITY_REQUIRED_MAPPINGS,
    );
    expect(first.requiredGates).toEqual(
      MYTH_ATLAS_COMPATIBILITY_REQUIRED_GATES,
    );
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("private-claim-pack-not-exported");
    expect(serialized).not.toContain("relativePath");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("claim prose");
  });

  it("refuses a blocked intake receipt", async () => {
    const receipt = makeReceipt();
    const targetWorldPack = await loadDemoWorldPack();
    expect(() =>
      buildMythAtlasCompatibilityReport({
        receipt: {
          ...receipt,
          decision: "blocked",
          blockers: ["producer_private_use_blocked"],
        },
        targetWorldPack,
      }),
    ).toThrowError("receipt_not_quarantined_private_reference");
  });
});

import { z } from "zod";
import {
  HashSchema,
  IdentifierSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";

export const MYTH_ATLAS_MAX_ASSETS = 64;
export const MYTH_ATLAS_MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const MYTH_ATLAS_MAX_TOTAL_BYTES = 32 * 1024 * 1024;
export const MYTH_ATLAS_PRIVATE_SCHEMA =
  "myth-atlas-micro-pack-0.1.0-provisional" as const;
export const MYTH_ATLAS_PUBLIC_SCHEMA = "penelope-world-pack-0.2.0" as const;

const PortableRelativeFileSchema = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => !value.includes("\\"), "Use portable forward-slash paths.")
  .refine((value) => !value.startsWith("/"), "Asset paths must be relative.")
  .refine(
    (value) =>
      value !== "." &&
      value !== ".." &&
      !value.split("/").some((segment) => segment === "" || segment === "." || segment === ".."),
    "Asset paths must be normalized and may not escape the handoff root.",
  );

export const MythAtlasUseModeSchema = z.enum([
  "private_creative_reference",
  "public_canon_candidate",
]);

export const MythAtlasHandoffAssetRoleSchema = z.enum([
  "claim_pack",
  "source_registry",
  "rights_culture_registry",
  "verification_receipt",
  "handoff_return",
  "supporting_evidence",
]);

export const MythAtlasHandoffAssetSchema = z
  .object({
    id: IdentifierSchema,
    role: MythAtlasHandoffAssetRoleSchema,
    relativePath: PortableRelativeFileSchema,
    bytes: z.number().int().positive().max(MYTH_ATLAS_MAX_ASSET_BYTES),
    sha256: HashSchema,
  })
  .strict();

export const MythAtlasHandoffManifestSchema = z
  .object({
    schemaId: z.literal("penelope.myth-atlas-handoff"),
    schemaVersion: z.literal("1.0.0"),
    pack: z
      .object({
        id: IdentifierSchema,
        version: z.string().min(1).max(80),
        sourceOntologySchemaVersion: z.enum([
          MYTH_ATLAS_PRIVATE_SCHEMA,
          MYTH_ATLAS_PUBLIC_SCHEMA,
        ]),
      })
      .strict(),
    verification: z
      .object({
        provenanceAuthority: z.enum([
          "producer_reported",
          "independent_exact_passage_review",
        ]),
        exactPassageClaimCount: z.number().int().nonnegative(),
        videoReportedClaimCount: z.number().int().nonnegative(),
        pendingItemCount: z.number().int().nonnegative(),
      })
      .strict(),
    governance: z
      .object({
        rightsStatus: z.enum([
          "cleared",
          "private_reference_only",
          "pending_review",
          "blocked",
        ]),
        cultureStatus: z.enum(["cleared", "screening_required", "blocked"]),
      })
      .strict(),
    producerEligibility: z
      .object({
        privateCreativeUse: z.boolean(),
        publicDemo: z.boolean(),
      })
      .strict(),
    assets: z
      .array(MythAtlasHandoffAssetSchema)
      .min(1)
      .max(MYTH_ATLAS_MAX_ASSETS),
  })
  .strict()
  .superRefine((manifest, context) => {
    addDuplicateIssues(
      manifest.assets.map(({ id }) => id),
      "Myth Atlas asset id",
      context,
    );
    addDuplicateIssues(
      manifest.assets.map(({ relativePath }) => relativePath),
      "Myth Atlas asset path",
      context,
    );
    if (
      manifest.assets.reduce((total, asset) => total + asset.bytes, 0) >
      MYTH_ATLAS_MAX_TOTAL_BYTES
    ) {
      context.addIssue({
        code: "custom",
        message: "Myth Atlas handoff exceeds the aggregate byte limit.",
      });
    }
  });

export const MythAtlasIntakeBlockerSchema = z.enum([
  "producer_private_use_blocked",
  "producer_public_demo_blocked",
  "rights_blocked",
  "rights_not_cleared",
  "culture_blocked",
  "culture_not_cleared",
  "independent_exact_passage_review_missing",
  "verified_claim_missing",
  "video_reported_claims_present",
  "pending_items_present",
  "public_source_schema_unsupported",
  "public_required_asset_missing",
  "public_required_asset_ambiguous",
  "penelope_creator_review_gate_unavailable",
  "public_supporting_artifact_validation_unavailable",
  "world_pack_schema_invalid",
  "world_pack_id_mismatch",
  "world_pack_version_mismatch",
]);

export const MythAtlasIntakeWarningSchema = z.enum([
  "producer_reported_provenance_only",
  "video_reported_claims_present",
  "pending_items_present",
  "rights_not_cleared",
  "culture_not_cleared",
  "creator_review_not_performed",
]);

export const MythAtlasIntakeReceiptSchema = z
  .object({
    schemaId: z.literal("penelope.myth-atlas-intake-receipt"),
    schemaVersion: z.literal("1.0.0"),
    pack: z
      .object({
        id: IdentifierSchema,
        version: z.string().min(1),
        sourceOntologySchemaVersion: z.enum([
          MYTH_ATLAS_PRIVATE_SCHEMA,
          MYTH_ATLAS_PUBLIC_SCHEMA,
        ]),
      })
      .strict(),
    requestedUse: MythAtlasUseModeSchema,
    decision: z.enum(["quarantined_private_reference", "blocked"]),
    trustBoundary: z.literal("manifest_attestation_plus_byte_integrity_only"),
    rootAssumption: z.literal("user_controlled_immutable_during_intake"),
    manifestSha256: HashSchema,
    validatedWorldPackSha256: HashSchema.nullable(),
    assetCount: z.number().int().positive(),
    totalBytes: z.number().int().positive(),
    evidenceCounts: z
      .object({
        exactPassageClaims: z.number().int().nonnegative(),
        videoReportedClaims: z.number().int().nonnegative(),
        pendingItems: z.number().int().nonnegative(),
      })
      .strict(),
    governance: z
      .object({
        provenanceAuthority: z.enum([
          "producer_reported",
          "independent_exact_passage_review",
        ]),
        rightsStatus: z.enum([
          "cleared",
          "private_reference_only",
          "pending_review",
          "blocked",
        ]),
        cultureStatus: z.enum(["cleared", "screening_required", "blocked"]),
      })
      .strict(),
    blockers: z.array(MythAtlasIntakeBlockerSchema),
    warnings: z.array(MythAtlasIntakeWarningSchema),
    assets: z
      .array(
        z
          .object({
            id: IdentifierSchema,
            role: MythAtlasHandoffAssetRoleSchema,
            bytes: z.number().int().positive(),
            sha256: HashSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const MythAtlasCompatibilityMappingSchema = z.enum([
  "private_schema_adapter",
  "pack_identity_mapping",
  "claim_semantics_mapping",
  "source_mapping",
  "entity_mapping",
  "phase_mapping",
  "knowledge_mapping",
]);

export const MythAtlasCompatibilityGateSchema = z.enum([
  "independent_exact_passage_review",
  "rights_clearance",
  "culture_review",
  "video_reported_claim_resolution",
  "pending_item_resolution",
  "creator_review",
]);

const MythAtlasIneligibleSurfaceSchema = z
  .object({
    eligible: z.literal(false),
    eligibleClaimCount: z.literal(0),
  })
  .strict();

export const MythAtlasCompatibilityReportSchema = z
  .object({
    schemaId: z.literal("penelope.myth-atlas-compatibility-report"),
    schemaVersion: z.literal("1.0.0"),
    decision: z.literal("analysis_only_no_import"),
    trustBoundary: z.literal("manifest_attestation_plus_byte_integrity_only"),
    source: z
      .object({
        intakeReceiptSha256: HashSchema,
        manifestSha256: HashSchema,
        packId: IdentifierSchema,
        packVersion: z.string().min(1).max(80),
        sourceOntologySchemaVersion: z.literal(MYTH_ATLAS_PRIVATE_SCHEMA),
      })
      .strict(),
    target: z
      .object({
        worldPackId: IdentifierSchema,
        worldPackVersion: z.string().min(1),
        worldPackSha256: HashSchema,
      })
      .strict(),
    evidenceCounts: z
      .object({
        exactPassageClaims: z.number().int().nonnegative(),
        videoReportedClaims: z.number().int().nonnegative(),
        pendingItems: z.number().int().nonnegative(),
      })
      .strict(),
    warnings: z.array(MythAtlasIntakeWarningSchema),
    eligibility: z
      .object({
        runtime: MythAtlasIneligibleSurfaceSchema,
        modelInput: MythAtlasIneligibleSurfaceSchema,
        canon: MythAtlasIneligibleSurfaceSchema,
        public: MythAtlasIneligibleSurfaceSchema,
      })
      .strict(),
    requiredMappings: z.tuple([
      z.literal("private_schema_adapter"),
      z.literal("pack_identity_mapping"),
      z.literal("claim_semantics_mapping"),
      z.literal("source_mapping"),
      z.literal("entity_mapping"),
      z.literal("phase_mapping"),
      z.literal("knowledge_mapping"),
    ]),
    requiredGates: z.tuple([
      z.literal("independent_exact_passage_review"),
      z.literal("rights_clearance"),
      z.literal("culture_review"),
      z.literal("video_reported_claim_resolution"),
      z.literal("pending_item_resolution"),
      z.literal("creator_review"),
    ]),
  })
  .strict();

export type MythAtlasUseMode = z.infer<typeof MythAtlasUseModeSchema>;
export type MythAtlasHandoffManifest = z.infer<typeof MythAtlasHandoffManifestSchema>;
export type MythAtlasIntakeBlocker = z.infer<typeof MythAtlasIntakeBlockerSchema>;
export type MythAtlasIntakeWarning = z.infer<typeof MythAtlasIntakeWarningSchema>;
export type MythAtlasIntakeReceipt = z.infer<typeof MythAtlasIntakeReceiptSchema>;
export type MythAtlasCompatibilityMapping = z.infer<
  typeof MythAtlasCompatibilityMappingSchema
>;
export type MythAtlasCompatibilityGate = z.infer<
  typeof MythAtlasCompatibilityGateSchema
>;
export type MythAtlasCompatibilityReport = z.infer<
  typeof MythAtlasCompatibilityReportSchema
>;

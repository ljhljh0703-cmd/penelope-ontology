import { sha256Canonical } from "@/src/domain/canonical-json";
import { WorldPackSchema, type WorldPack } from "@/src/domain/schemas";
import {
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  LIVE_RED_SAIL_WORLD_PACK_SHA256,
} from "@/src/evidence/live-scenario-contract";
import {
  MYTH_ATLAS_PRIVATE_SCHEMA,
  MythAtlasCompatibilityReportSchema,
  MythAtlasIntakeReceiptSchema,
  type MythAtlasCompatibilityGate,
  type MythAtlasCompatibilityMapping,
  type MythAtlasCompatibilityReport,
  type MythAtlasIntakeReceipt,
  type MythAtlasIntakeWarning,
} from "@/src/integrations/myth-atlas/contracts";

export type MythAtlasCompatibilityErrorCode =
  | "receipt_not_quarantined_private_reference"
  | "target_world_pack_not_registered";

export class MythAtlasCompatibilityError extends Error {
  constructor(readonly code: MythAtlasCompatibilityErrorCode) {
    super(code);
    this.name = "MythAtlasCompatibilityError";
  }
}

const WARNING_ORDER: readonly MythAtlasIntakeWarning[] = [
  "creator_review_not_performed",
  "rights_not_cleared",
  "culture_not_cleared",
  "producer_reported_provenance_only",
  "video_reported_claims_present",
  "pending_items_present",
];

export const MYTH_ATLAS_COMPATIBILITY_REQUIRED_MAPPINGS = [
  "private_schema_adapter",
  "pack_identity_mapping",
  "claim_semantics_mapping",
  "source_mapping",
  "entity_mapping",
  "phase_mapping",
  "knowledge_mapping",
] as const satisfies readonly MythAtlasCompatibilityMapping[];

export const MYTH_ATLAS_COMPATIBILITY_REQUIRED_GATES = [
  "independent_exact_passage_review",
  "rights_clearance",
  "culture_review",
  "video_reported_claim_resolution",
  "pending_item_resolution",
  "creator_review",
] as const satisfies readonly MythAtlasCompatibilityGate[];

const normalizeWarnings = (
  warnings: readonly MythAtlasIntakeWarning[],
): MythAtlasIntakeWarning[] =>
  WARNING_ORDER.filter((warning) => warnings.includes(warning));

const requireQuarantinedPrivateReceipt = (
  input: unknown,
): MythAtlasIntakeReceipt => {
  const receipt = MythAtlasIntakeReceiptSchema.parse(input);
  if (
    receipt.decision !== "quarantined_private_reference" ||
    receipt.requestedUse !== "private_creative_reference" ||
    receipt.pack.sourceOntologySchemaVersion !== MYTH_ATLAS_PRIVATE_SCHEMA ||
    receipt.blockers.length !== 0 ||
    receipt.validatedWorldPackSha256 !== null
  ) {
    throw new MythAtlasCompatibilityError(
      "receipt_not_quarantined_private_reference",
    );
  }
  return receipt;
};

const requireRegisteredDemoWorldPack = (input: unknown): WorldPack => {
  const worldPack = WorldPackSchema.parse(input);
  const worldPackSha256 = sha256Canonical(worldPack);
  if (
    worldPack.meta.id !== LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.id ||
    worldPack.meta.version !== LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.version ||
    worldPackSha256 !== LIVE_RED_SAIL_WORLD_PACK_SHA256
  ) {
    throw new MythAtlasCompatibilityError("target_world_pack_not_registered");
  }
  return worldPack;
};

export const buildMythAtlasCompatibilityReport = (input: {
  receipt: unknown;
  targetWorldPack: unknown;
}): MythAtlasCompatibilityReport => {
  const receipt = requireQuarantinedPrivateReceipt(input.receipt);
  const targetWorldPack = requireRegisteredDemoWorldPack(input.targetWorldPack);

  return MythAtlasCompatibilityReportSchema.parse({
    schemaId: "penelope.myth-atlas-compatibility-report",
    schemaVersion: "1.0.0",
    decision: "analysis_only_no_import",
    trustBoundary: "manifest_attestation_plus_byte_integrity_only",
    source: {
      intakeReceiptSha256: sha256Canonical(receipt),
      manifestSha256: receipt.manifestSha256,
      packId: receipt.pack.id,
      packVersion: receipt.pack.version,
      sourceOntologySchemaVersion: receipt.pack.sourceOntologySchemaVersion,
    },
    target: {
      worldPackId: targetWorldPack.meta.id,
      worldPackVersion: targetWorldPack.meta.version,
      worldPackSha256: sha256Canonical(targetWorldPack),
    },
    evidenceCounts: receipt.evidenceCounts,
    warnings: normalizeWarnings(receipt.warnings),
    eligibility: {
      runtime: { eligible: false, eligibleClaimCount: 0 },
      modelInput: { eligible: false, eligibleClaimCount: 0 },
      canon: { eligible: false, eligibleClaimCount: 0 },
      public: { eligible: false, eligibleClaimCount: 0 },
    },
    requiredMappings: MYTH_ATLAS_COMPATIBILITY_REQUIRED_MAPPINGS,
    requiredGates: MYTH_ATLAS_COMPATIBILITY_REQUIRED_GATES,
  });
};

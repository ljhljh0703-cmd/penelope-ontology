import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { WorldPackSchema } from "@/src/domain/schemas";
import {
  MYTH_ATLAS_PUBLIC_SCHEMA,
  MythAtlasHandoffManifestSchema,
  MythAtlasIntakeReceiptSchema,
  MythAtlasUseModeSchema,
  type MythAtlasHandoffManifest,
  type MythAtlasIntakeBlocker,
  type MythAtlasIntakeReceipt,
  type MythAtlasIntakeWarning,
  type MythAtlasUseMode,
} from "@/src/integrations/myth-atlas/contracts";

export type MythAtlasIntakeErrorCode =
  | "root_not_absolute"
  | "root_not_regular_directory"
  | "asset_not_regular_file"
  | "asset_path_escape"
  | "asset_byte_mismatch"
  | "asset_sha256_mismatch";

export class MythAtlasIntakeError extends Error {
  constructor(
    readonly code: MythAtlasIntakeErrorCode,
    readonly assetId: string | null = null,
  ) {
    super(assetId ? `${code}:${assetId}` : code);
    this.name = "MythAtlasIntakeError";
  }
}

type FileIdentity = { dev: number | bigint; ino: number | bigint };

type RootContext = {
  inputPath: string;
  realPath: string;
  handle: Awaited<ReturnType<typeof open>>;
  identity: FileIdentity;
};

type VerifiedAsset = {
  asset: MythAtlasHandoffManifest["assets"][number];
  claimPackContent: Buffer | null;
};

const sameFile = (left: FileIdentity, right: FileIdentity): boolean =>
  left.dev === right.dev && left.ino === right.ino;

const compareCodePoints = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const normalizeMythAtlasManifest = (
  input: unknown,
): MythAtlasHandoffManifest => {
  const manifest = MythAtlasHandoffManifestSchema.parse(input);
  return MythAtlasHandoffManifestSchema.parse({
    ...manifest,
    assets: [...manifest.assets].sort((left, right) =>
      compareCodePoints(left.id, right.id),
    ),
  });
};

export const mythAtlasManifestSha256 = (input: unknown): string =>
  sha256Canonical(normalizeMythAtlasManifest(input));

const verifyRoot = async (root: string): Promise<RootContext> => {
  if (!path.isAbsolute(root)) throw new MythAtlasIntakeError("root_not_absolute");
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(
      root,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    const [descriptorStat, pathStat, rootReal] = await Promise.all([
      handle.stat(),
      lstat(root),
      realpath(root),
    ]);
    if (
      !descriptorStat.isDirectory() ||
      !pathStat.isDirectory() ||
      pathStat.isSymbolicLink() ||
      !sameFile(descriptorStat, pathStat)
    ) {
      throw new MythAtlasIntakeError("root_not_regular_directory");
    }
    return { inputPath: root, realPath: rootReal, handle, identity: descriptorStat };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (error instanceof MythAtlasIntakeError) throw error;
    throw new MythAtlasIntakeError("root_not_regular_directory");
  }
};

const assertRootStable = async (root: RootContext): Promise<void> => {
  try {
    const [descriptorStat, pathStat, currentReal] = await Promise.all([
      root.handle.stat(),
      lstat(root.inputPath),
      realpath(root.inputPath),
    ]);
    if (
      !pathStat.isDirectory() ||
      pathStat.isSymbolicLink() ||
      currentReal !== root.realPath ||
      !sameFile(root.identity, descriptorStat) ||
      !sameFile(root.identity, pathStat)
    ) {
      throw new MythAtlasIntakeError("root_not_regular_directory");
    }
  } catch (error) {
    if (error instanceof MythAtlasIntakeError) throw error;
    throw new MythAtlasIntakeError("root_not_regular_directory");
  }
};

const verifyAsset = async (
  rootReal: string,
  asset: MythAtlasHandoffManifest["assets"][number],
): Promise<VerifiedAsset> => {
  const relativeNative = asset.relativePath.split("/").join(path.sep);
  const candidate = path.resolve(rootReal, relativeNative);
  if (path.relative(rootReal, candidate) !== relativeNative) {
    throw new MythAtlasIntakeError("asset_path_escape", asset.id);
  }

  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const descriptorStat = await handle.stat();
    const candidateReal = await realpath(candidate);
    const pathStatBefore = await lstat(candidate);
    const resolvedRelative = path.relative(rootReal, candidateReal);
    if (resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) {
      throw new MythAtlasIntakeError("asset_path_escape", asset.id);
    }
    if (
      !descriptorStat.isFile() ||
      !pathStatBefore.isFile() ||
      pathStatBefore.isSymbolicLink() ||
      resolvedRelative !== relativeNative ||
      !sameFile(descriptorStat, pathStatBefore)
    ) {
      throw new MythAtlasIntakeError("asset_not_regular_file", asset.id);
    }
    if (descriptorStat.size !== asset.bytes) {
      throw new MythAtlasIntakeError("asset_byte_mismatch", asset.id);
    }

    const digest = createHash("sha256");
    const claimChunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of handle.createReadStream({
      autoClose: false,
      start: 0,
    })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > asset.bytes) {
        throw new MythAtlasIntakeError("asset_byte_mismatch", asset.id);
      }
      digest.update(buffer);
      if (asset.role === "claim_pack") claimChunks.push(buffer);
    }

    const descriptorStatAfter = await handle.stat();
    const pathStatAfter = await lstat(candidate);
    if (
      !sameFile(descriptorStat, descriptorStatAfter) ||
      !sameFile(descriptorStat, pathStatAfter)
    ) {
      throw new MythAtlasIntakeError("asset_not_regular_file", asset.id);
    }
    if (bytes !== asset.bytes || descriptorStatAfter.size !== asset.bytes) {
      throw new MythAtlasIntakeError("asset_byte_mismatch", asset.id);
    }
    if (digest.digest("hex") !== asset.sha256) {
      throw new MythAtlasIntakeError("asset_sha256_mismatch", asset.id);
    }
    return {
      asset,
      claimPackContent:
        asset.role === "claim_pack" ? Buffer.concat(claimChunks) : null,
    };
  } catch (error) {
    if (error instanceof MythAtlasIntakeError) throw error;
    throw new MythAtlasIntakeError("asset_not_regular_file", asset.id);
  } finally {
    await handle?.close().catch(() => undefined);
  }
};

const addUnique = <T extends string>(values: T[], value: T): void => {
  if (!values.includes(value)) values.push(value);
};

const privateAssessment = (
  manifest: MythAtlasHandoffManifest,
): { blockers: MythAtlasIntakeBlocker[]; warnings: MythAtlasIntakeWarning[] } => {
  const blockers: MythAtlasIntakeBlocker[] = [];
  const warnings: MythAtlasIntakeWarning[] = ["creator_review_not_performed"];
  if (!manifest.producerEligibility.privateCreativeUse) {
    blockers.push("producer_private_use_blocked");
  }
  if (manifest.governance.rightsStatus === "blocked") blockers.push("rights_blocked");
  else if (manifest.governance.rightsStatus !== "cleared") {
    warnings.push("rights_not_cleared");
  }
  if (manifest.governance.cultureStatus === "blocked") blockers.push("culture_blocked");
  else if (manifest.governance.cultureStatus !== "cleared") {
    warnings.push("culture_not_cleared");
  }
  if (manifest.verification.provenanceAuthority === "producer_reported") {
    warnings.push("producer_reported_provenance_only");
  }
  if (manifest.verification.videoReportedClaimCount > 0) {
    warnings.push("video_reported_claims_present");
  }
  if (manifest.verification.pendingItemCount > 0) warnings.push("pending_items_present");
  return { blockers, warnings };
};

const producerPublicBlockers = (
  manifest: MythAtlasHandoffManifest,
): MythAtlasIntakeBlocker[] => {
  const blockers: MythAtlasIntakeBlocker[] = [];
  if (!manifest.producerEligibility.publicDemo) {
    blockers.push("producer_public_demo_blocked");
  }
  if (manifest.pack.sourceOntologySchemaVersion !== MYTH_ATLAS_PUBLIC_SCHEMA) {
    blockers.push("public_source_schema_unsupported");
  }
  if (manifest.verification.provenanceAuthority !== "independent_exact_passage_review") {
    blockers.push("independent_exact_passage_review_missing");
  }
  if (manifest.verification.exactPassageClaimCount === 0) {
    blockers.push("verified_claim_missing");
  }
  if (manifest.verification.videoReportedClaimCount > 0) {
    blockers.push("video_reported_claims_present");
  }
  if (manifest.verification.pendingItemCount > 0) blockers.push("pending_items_present");
  if (manifest.governance.rightsStatus !== "cleared") blockers.push("rights_not_cleared");
  if (manifest.governance.cultureStatus !== "cleared") {
    blockers.push("culture_not_cleared");
  }
  return blockers;
};

const requiredPublicAssets = (
  verifiedAssets: VerifiedAsset[],
  blockers: MythAtlasIntakeBlocker[],
): VerifiedAsset | null => {
  for (const role of [
    "source_registry",
    "rights_culture_registry",
    "verification_receipt",
  ] as const) {
    if (!verifiedAssets.some(({ asset }) => asset.role === role)) {
      addUnique(blockers, "public_required_asset_missing");
    }
  }
  const claimPacks = verifiedAssets.filter(({ asset }) => asset.role === "claim_pack");
  if (claimPacks.length === 0) {
    addUnique(blockers, "public_required_asset_missing");
    return null;
  }
  if (claimPacks.length !== 1) {
    addUnique(blockers, "public_required_asset_ambiguous");
    return null;
  }
  return claimPacks[0] ?? null;
};

const validatePublicWorldPack = (
  manifest: MythAtlasHandoffManifest,
  claimPack: VerifiedAsset | null,
  blockers: MythAtlasIntakeBlocker[],
): string | null => {
  if (
    manifest.pack.sourceOntologySchemaVersion !== MYTH_ATLAS_PUBLIC_SCHEMA ||
    !claimPack?.claimPackContent
  ) {
    return null;
  }
  let input: unknown;
  try {
    input = JSON.parse(claimPack.claimPackContent.toString("utf8")) as unknown;
  } catch {
    blockers.push("world_pack_schema_invalid");
    return null;
  }
  const parsed = WorldPackSchema.safeParse(input);
  if (!parsed.success) {
    blockers.push("world_pack_schema_invalid");
    return null;
  }
  if (parsed.data.meta.id !== manifest.pack.id) blockers.push("world_pack_id_mismatch");
  if (parsed.data.meta.version !== manifest.pack.version) {
    blockers.push("world_pack_version_mismatch");
  }
  return sha256Canonical(parsed.data);
};

export const inspectMythAtlasHandoff = async (input: {
  root: string;
  manifest: unknown;
  requestedUse: MythAtlasUseMode;
}): Promise<MythAtlasIntakeReceipt> => {
  const requestedUse = MythAtlasUseModeSchema.parse(input.requestedUse);
  const manifest = normalizeMythAtlasManifest(input.manifest);
  const root = await verifyRoot(input.root);
  try {
    const verifiedAssets: VerifiedAsset[] = [];
    for (const asset of manifest.assets) {
      verifiedAssets.push(await verifyAsset(root.realPath, asset));
    }
    await assertRootStable(root);

    let blockers: MythAtlasIntakeBlocker[];
    let warnings: MythAtlasIntakeWarning[];
    let validatedWorldPackSha256: string | null = null;
    if (requestedUse === "private_creative_reference") {
      ({ blockers, warnings } = privateAssessment(manifest));
    } else {
      blockers = producerPublicBlockers(manifest);
      warnings = [];
      const claimPack = requiredPublicAssets(verifiedAssets, blockers);
      validatedWorldPackSha256 = validatePublicWorldPack(
        manifest,
        claimPack,
        blockers,
      );
      blockers.push("public_supporting_artifact_validation_unavailable");
      blockers.push("penelope_creator_review_gate_unavailable");
    }

    return MythAtlasIntakeReceiptSchema.parse({
      schemaId: "penelope.myth-atlas-intake-receipt",
      schemaVersion: "1.0.0",
      pack: manifest.pack,
      requestedUse,
      decision:
        blockers.length > 0 ? "blocked" : "quarantined_private_reference",
      trustBoundary: "manifest_attestation_plus_byte_integrity_only",
      rootAssumption: "user_controlled_immutable_during_intake",
      manifestSha256: mythAtlasManifestSha256(manifest),
      validatedWorldPackSha256,
      assetCount: manifest.assets.length,
      totalBytes: manifest.assets.reduce((total, asset) => total + asset.bytes, 0),
      evidenceCounts: {
        exactPassageClaims: manifest.verification.exactPassageClaimCount,
        videoReportedClaims: manifest.verification.videoReportedClaimCount,
        pendingItems: manifest.verification.pendingItemCount,
      },
      governance: {
        provenanceAuthority: manifest.verification.provenanceAuthority,
        rightsStatus: manifest.governance.rightsStatus,
        cultureStatus: manifest.governance.cultureStatus,
      },
      blockers,
      warnings,
      assets: verifiedAssets.map(({ asset: { id, role, bytes, sha256 } }) => ({
        id,
        role,
        bytes,
        sha256,
      })),
    });
  } finally {
    await root.handle.close().catch(() => undefined);
  }
};

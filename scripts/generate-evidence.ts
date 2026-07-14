import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { buildPublicEvidence } from "@/src/evidence/build-public-evidence";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import {
  SanitizedLiveEvidenceSchema,
  buildLiveEvidenceAuthority,
} from "@/src/evidence/sanitize-live-evidence";
import {
  StyleAblationCaptureReceiptSchema,
  StyleAblationPlanSchema,
  StyleAblationPublicReportSchema,
} from "@/src/evaluation/style-ablation-contracts";

const outputDirectory = path.join(process.cwd(), "artifacts", "evidence");

const stablePrettyJson = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const buildPreservedEvidenceManifestEntry = (
  relativePath: string,
  exactSource: string,
): { path: string; sha256: string; bytes: number } => ({
  path: relativePath,
  sha256: sha256(exactSource),
  bytes: Buffer.byteLength(exactSource),
});

export const assertLiveEvidenceAuthorityBinding = (
  liveEvidence: ReturnType<typeof SanitizedLiveEvidenceSchema.parse>,
  expectedAuthority: ReturnType<typeof buildLiveEvidenceAuthority>,
): void => {
  if (
    sha256Canonical(liveEvidence.authority) !== sha256Canonical(expectedAuthority)
  ) {
    throw new Error(
      "The public live evidence is stale: its World Pack, overlay, style, or request authority changed.",
    );
  }
};

const main = async (): Promise<void> => {
  const [evidence, worldPack, overlay, snapshot] = await Promise.all([
    buildPublicEvidence(),
    loadDemoWorldPack(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
  ]);
  const styleAblationPlan = StyleAblationPlanSchema.parse(
    JSON.parse(
      await readFile(
        path.join(process.cwd(), "data", "evals", "style-ablation-plan.json"),
        "utf8",
      ),
    ) as unknown,
  );
  let liveSanitizedSource: string | null = null;
  let liveSanitized: ReturnType<typeof SanitizedLiveEvidenceSchema.parse> | null = null;
  try {
    liveSanitizedSource = await readFile(
      path.join(outputDirectory, "live-sanitized.json"),
      "utf8",
    );
    liveSanitized = SanitizedLiveEvidenceSchema.parse(
      JSON.parse(liveSanitizedSource) as unknown,
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const liveRunRequest = buildLiveEvidenceRunRequest({
    overlay,
    snapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
  });
  const expectedLiveAuthority = buildLiveEvidenceAuthority({
    worldPackId: worldPack.meta.id,
    worldPackSha256: sha256Canonical(worldPack),
    request: liveRunRequest,
  });
  if (liveSanitized) {
    assertLiveEvidenceAuthorityBinding(liveSanitized, expectedLiveAuthority);
  }
  let styleAblation: unknown = null;
  let styleAblationSource: string | null = null;
  try {
    styleAblationSource = await readFile(
      path.join(outputDirectory, "style-ablation.json"),
      "utf8",
    );
    styleAblation = StyleAblationPublicReportSchema.parse(
      JSON.parse(styleAblationSource) as unknown,
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const parsedStyleAblation = styleAblation
    ? StyleAblationPublicReportSchema.parse(styleAblation)
    : null;
  let styleAblationReceiptSource: string | null = null;
  let styleAblationReceipt: ReturnType<
    typeof StyleAblationCaptureReceiptSchema.parse
  > | null = null;
  try {
    styleAblationReceiptSource = await readFile(
      path.join(outputDirectory, "style-ablation-capture-receipt.json"),
      "utf8",
    );
    styleAblationReceipt = StyleAblationCaptureReceiptSchema.parse(
      JSON.parse(styleAblationReceiptSource) as unknown,
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const planSha256 = sha256Canonical(styleAblationPlan);
  if (
    styleAblationReceipt &&
    (styleAblationReceipt.evaluationId !== styleAblationPlan.evaluationId ||
      styleAblationReceipt.requestedModel !== styleAblationPlan.targetModel ||
      styleAblationReceipt.sourceDigests.planSha256 !== planSha256)
  ) {
    throw new Error("The public style-ablation receipt is not bound to the current plan.");
  }
  if (
    parsedStyleAblation &&
    (parsedStyleAblation.evaluationId !== styleAblationPlan.evaluationId ||
      parsedStyleAblation.requestedModel !== styleAblationPlan.targetModel ||
      parsedStyleAblation.sourceDigests.planSha256 !== planSha256)
  ) {
    throw new Error("The public style-ablation report is not bound to the current plan.");
  }
  if (parsedStyleAblation && !styleAblationReceipt) {
    throw new Error("A finalized style-ablation report requires its public capture receipt.");
  }
  if (
    parsedStyleAblation &&
    styleAblationReceipt &&
    parsedStyleAblation.sourceDigests.captureSha256 !==
      styleAblationReceipt.sourceDigests.captureSha256
  ) {
    throw new Error("The style-ablation report and capture receipt disagree.");
  }
  const liveReadiness = liveSanitized
    ? {
        evidenceType: "live_readiness",
        status: "verified",
        sanitizedEvidencePath: "artifacts/evidence/live-sanitized.json",
        requestedModel: liveSanitized.requestedModel,
        actualModel: liveSanitized.actualModel,
        authorityBindingVerified: true,
        worldPackSha256: liveSanitized.authority.worldPackSha256,
        requestSha256: liveSanitized.authority.requestSha256,
        rawResponsePersistedPublicly: false,
      }
    : evidence.liveReadiness;
  const styleAblationReadiness = parsedStyleAblation
    ? {
        evidenceType: "style_ablation_readiness",
        status: parsedStyleAblation.status,
        evaluationId: parsedStyleAblation.evaluationId,
        requestedModel: parsedStyleAblation.requestedModel,
        maxOutputTokens: parsedStyleAblation.maxOutputTokens,
        reportPath: "artifacts/evidence/style-ablation.json",
        planSha256,
        planBindingVerified: true,
        receiptStatus: styleAblationReceipt?.captureStatus ?? "missing",
        receiptPath: "artifacts/evidence/style-ablation-capture-receipt.json",
        receiptBindingVerified: true,
        rawNarrativePublic: false,
      }
    : {
        evidenceType: "style_ablation_readiness",
        status:
          styleAblationReceipt?.captureStatus === "complete"
            ? "captured_pending_finalization"
            : styleAblationReceipt?.captureStatus === "incomplete"
              ? "capture_incomplete"
              : "not_executed",
        reason: styleAblationReceipt
          ? "A write-once capture receipt exists, but no finalized public report exists."
          : "The preregistered protocol is implemented, but no live four-call capture exists.",
        evaluationId: styleAblationPlan.evaluationId,
        requestedModel: styleAblationPlan.targetModel,
        planPath: "data/evals/style-ablation-plan.json",
        planSha256,
        receiptStatus: styleAblationReceipt?.captureStatus ?? "not_present",
        receiptPath: styleAblationReceipt
          ? "artifacts/evidence/style-ablation-capture-receipt.json"
          : null,
        design: {
          pairs: styleAblationPlan.pairs.length,
          expectedCalls: styleAblationPlan.pairs.flatMap(({ order }) => order).length,
          maxOutputTokens: styleAblationPlan.maxOutputTokens,
          order: styleAblationPlan.pairs.map(({ order }) => order),
          control: "default_instruction_control",
          treatment: "profiled",
          noAutomaticRetries: true,
        },
      };
  const evidencePacket = {
    ...evidence.evidencePacket,
    liveEvidenceStatus: liveSanitized ? "verified" : evidence.evidencePacket.liveEvidenceStatus,
    styleAblationStatus:
      parsedStyleAblation?.status ??
      (styleAblationReceipt?.captureStatus === "complete"
        ? "captured_pending_finalization"
        : styleAblationReceipt?.captureStatus === "incomplete"
          ? "capture_incomplete"
          : "not_executed"),
  };
  const files: Record<string, unknown> = {
    "evidence-packet.json": evidencePacket,
    "fixture-replay.json": evidence.fixtureReplay,
    "graph-descriptor.json": evidence.graph,
    "simulation-chain.json": evidence.simulation,
    "style-ablation-readiness.json": styleAblationReadiness,
    "style-harness.json": evidence.styleHarness,
    "live-readiness.json": liveReadiness,
  };
  await mkdir(outputDirectory, { recursive: true });
  const manifestEntries: Array<{ path: string; sha256: string; bytes: number }> = [];
  for (const [fileName, value] of Object.entries(files).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const source = stablePrettyJson(value);
    await writeFile(path.join(outputDirectory, fileName), source, "utf8");
    manifestEntries.push({
      path: `artifacts/evidence/${fileName}`,
      sha256: sha256(source),
      bytes: Buffer.byteLength(source),
    });
  }
  if (parsedStyleAblation && styleAblationSource !== null) {
    manifestEntries.push(
      buildPreservedEvidenceManifestEntry(
        "artifacts/evidence/style-ablation.json",
        styleAblationSource,
      ),
    );
  }
  if (styleAblationReceipt && styleAblationReceiptSource !== null) {
    manifestEntries.push(
      buildPreservedEvidenceManifestEntry(
        "artifacts/evidence/style-ablation-capture-receipt.json",
        styleAblationReceiptSource,
      ),
    );
  }
  if (liveSanitized && liveSanitizedSource !== null) {
    manifestEntries.push(
      buildPreservedEvidenceManifestEntry(
        "artifacts/evidence/live-sanitized.json",
        liveSanitizedSource,
      ),
    );
  }
  manifestEntries.sort(({ path: left }, { path: right }) => left.localeCompare(right));
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    stablePrettyJson({ schemaVersion: 1, files: manifestEntries }),
    "utf8",
  );
  process.stdout.write(`EVIDENCE_OK files=${manifestEntries.length}\n`);
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown evidence generation failure.";
    process.stderr.write(`EVIDENCE_FAILED ${message}\n`);
    process.exitCode = 1;
  });
}

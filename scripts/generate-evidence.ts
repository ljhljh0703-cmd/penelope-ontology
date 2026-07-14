import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPublicEvidence } from "@/src/evidence/build-public-evidence";
import { canonicalJson } from "@/src/domain/canonical-json";
import { SanitizedLiveEvidenceSchema } from "@/src/evidence/sanitize-live-evidence";

const outputDirectory = path.join(process.cwd(), "artifacts", "evidence");

const stablePrettyJson = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const main = async (): Promise<void> => {
  const evidence = await buildPublicEvidence();
  let liveSanitized: unknown = null;
  try {
    liveSanitized = SanitizedLiveEvidenceSchema.parse(
      JSON.parse(
        await readFile(path.join(outputDirectory, "live-sanitized.json"), "utf8"),
      ) as unknown,
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const liveReadiness = liveSanitized
    ? {
        evidenceType: "live_readiness",
        status: "verified",
        sanitizedEvidencePath: "artifacts/evidence/live-sanitized.json",
        requestedModel: SanitizedLiveEvidenceSchema.parse(liveSanitized).requestedModel,
        actualModel: SanitizedLiveEvidenceSchema.parse(liveSanitized).actualModel,
        rawResponsePersistedPublicly: false,
      }
    : evidence.liveReadiness;
  const evidencePacket = liveSanitized
    ? { ...evidence.evidencePacket, liveEvidenceStatus: "verified" }
    : evidence.evidencePacket;
  const files: Record<string, unknown> = {
    "evidence-packet.json": evidencePacket,
    "fixture-replay.json": evidence.fixtureReplay,
    "graph-descriptor.json": evidence.graph,
    "simulation-chain.json": evidence.simulation,
    "style-harness.json": evidence.styleHarness,
    "live-readiness.json": liveReadiness,
  };
  if (liveSanitized) files["live-sanitized.json"] = liveSanitized;
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
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    stablePrettyJson({ schemaVersion: 1, files: manifestEntries }),
    "utf8",
  );
  process.stdout.write(`EVIDENCE_OK files=${manifestEntries.length}\n`);
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown evidence generation failure.";
  process.stderr.write(`EVIDENCE_FAILED ${message}\n`);
  process.exitCode = 1;
});

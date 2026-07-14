import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createOpenAiNarrativeModel } from "@/src/adapters/openai/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import { sanitizeLiveEvidence } from "@/src/evidence/sanitize-live-evidence";

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

const assertAbsent = async (filePath: string): Promise<void> => {
  try {
    await access(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing to replace existing live evidence: ${filePath}`);
};

const main = async (): Promise<void> => {
  const [worldPack, overlay, snapshot] = await Promise.all([
    loadDemoWorldPack(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
  ]);
  const liveModel = createOpenAiNarrativeModel({
    env: process.env,
    styleProfiles: worldPack.styleProfiles,
  });
  const run = createRunOrchestrator({ worldPack, fixtureModel: fixtureNarrativeModel, liveModel });
  const runRequest = buildLiveEvidenceRunRequest({
    overlay,
    snapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
  });
  const rawDirectory = path.join(process.cwd(), "artifacts", "live");
  const publicDirectory = path.join(process.cwd(), "artifacts", "evidence");
  const rawPath = path.join(rawDirectory, "live-run.json");
  const publicPath = path.join(publicDirectory, "live-sanitized.json");
  const lockPath = path.join(rawDirectory, "live-capture.lock.json");
  await Promise.all([
    mkdir(rawDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
  ]);
  await writeFile(
    lockPath,
    pretty({
      schemaVersion: 1,
      evidenceType: "live_capture_lock",
      reservedAt: new Date().toISOString(),
      writeOnce: true,
    }),
    { encoding: "utf8", flag: "wx" },
  );
  await Promise.all([assertAbsent(rawPath), assertAbsent(publicPath)]);
  const result = await run(runRequest);
  if (result.modelOutcome.outcome !== "completed" || result.modelOutcome.trace.mode !== "live") {
    throw new Error(`Live run did not complete: ${result.modelOutcome.outcome}`);
  }

  const capturedAt = new Date().toISOString();
  const sanitized = sanitizeLiveEvidence(result, capturedAt, {
    worldPackId: worldPack.meta.id,
    worldPackSha256: sha256Canonical(worldPack),
    request: runRequest,
  });
  await writeFile(rawPath, pretty(result), { encoding: "utf8", flag: "wx" });
  await writeFile(publicPath, pretty(sanitized), { encoding: "utf8", flag: "wx" });
  process.stdout.write(
    "LIVE_EVIDENCE_CAPTURED raw=artifacts/live/live-run.json public=artifacts/evidence/live-sanitized.json\n",
  );
  process.stdout.write("Run `npm run evidence` to refresh readiness and the evidence manifest.\n");
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown live evidence failure.";
  process.stderr.write(`LIVE_EVIDENCE_FAILED ${message}\n`);
  process.exitCode = 1;
});

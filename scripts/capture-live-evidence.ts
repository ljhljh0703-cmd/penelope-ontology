import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createOpenAiNarrativeModel } from "@/src/adapters/openai/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import { canonicalJson } from "@/src/domain/canonical-json";
import { sanitizeLiveEvidence } from "@/src/evidence/sanitize-live-evidence";

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

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
  const result = await run({
    modelMode: "live",
    overlay,
    snapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
    taskType: "scene",
    brief: "Let Penelope and Eurycleia discuss a rumor without revealing hidden facts.",
    participantIntents: [
      {
        intentId: "intent.penelope",
        participantId: "participant.one",
        controlledEntityIds: ["penelope"],
        intent: "Keep Penelope cautious and focused on what she can prepare.",
      },
      {
        intentId: "intent.eurycleia",
        participantId: "participant.two",
        controlledEntityIds: ["eurycleia"],
        intent: "Offer household support without claiming secret knowledge.",
      },
    ],
  });
  if (result.modelOutcome.outcome !== "completed" || result.modelOutcome.trace.mode !== "live") {
    throw new Error(`Live run did not complete: ${result.modelOutcome.outcome}`);
  }

  const capturedAt = new Date().toISOString();
  const sanitized = sanitizeLiveEvidence(result, capturedAt);
  const rawDirectory = path.join(process.cwd(), "artifacts", "live");
  const publicDirectory = path.join(process.cwd(), "artifacts", "evidence");
  await Promise.all([
    mkdir(rawDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(rawDirectory, "live-run.json"), pretty(result), "utf8"),
    writeFile(path.join(publicDirectory, "live-sanitized.json"), pretty(sanitized), "utf8"),
  ]);
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

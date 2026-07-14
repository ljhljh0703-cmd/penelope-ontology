#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const origin = process.argv[2] ?? "http://127.0.0.1:3000";
const outputDirectory = path.resolve(
  process.argv[3] ?? path.join("docs", "assets", "demo"),
);

const shots = [
  {
    fileName: "01-frozen-rehearsal.png",
    phase: "ready",
    caption: "Registered frozen participant intents and creator-owned style profile.",
  },
  {
    fileName: "02-knowledge-boundary.png",
    phase: "candidate",
    caption: "Narrator-visible, character-withheld, and character-uncertain knowledge.",
  },
  {
    fileName: "03-creator-gate.png",
    phase: "candidate",
    caption: "Structured candidate, style receipt, and creator decision before canon changes.",
  },
  {
    fileName: "04-two-step-replay.png",
    phase: "complete",
    caption: "Approved overlay, continuous two-step state chain, and replay result.",
  },
  {
    fileName: "05-production-review-packet.png",
    phase: "complete",
    caption: "Fixture evidence organized for human handoff without a production-readiness claim.",
  },
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const main = async () => {
  await mkdir(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByTestId("fixture-mode").waitFor();
    await page.screenshot({
      path: path.join(outputDirectory, shots[0].fileName),
      animations: "disabled",
    });

    await page.getByTestId("run-candidate").click();
    await page.getByTestId("decision-accept").waitFor();
    await page.getByTestId("knowledge-boundary").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(outputDirectory, shots[1].fileName),
      animations: "disabled",
    });
    await page.getByTestId("proposal").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(outputDirectory, shots[2].fileName),
      animations: "disabled",
    });

    await page.getByTestId("decision-accept").click();
    await page.getByTestId("advance-step-1").click();
    await page.getByTestId("advance-step-2").click();
    await page.getByTestId("completion-summary").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(outputDirectory, shots[3].fileName),
      animations: "disabled",
    });
    const reviewPacket = page.getByTestId("production-review-packet");
    await reviewPacket.locator("summary").click();
    await reviewPacket.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(outputDirectory, shots[4].fileName),
      animations: "disabled",
    });
  } finally {
    await browser.close();
  }

  const files = await Promise.all(
    shots.map(async (shot) => {
      const filePath = path.join(outputDirectory, shot.fileName);
      const [buffer, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
      return {
        ...shot,
        path: path.relative(process.cwd(), filePath),
        bytes: metadata.size,
        sha256: sha256(buffer),
      };
    }),
  );
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify({ schemaVersion: 1, fixtureOnly: true, files }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`SUBMISSION_GALLERY_OK files=${files.length}\n`);
};

void main().catch((error) => {
  process.stderr.write(
    `SUBMISSION_GALLERY_FAILED ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

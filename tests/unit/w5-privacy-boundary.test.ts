import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPrivateW5Path,
  assertW5PrivateCaptureIdsAvailable,
  assertW5PrivateFilesAvailable,
  assertW5PrivateJsonTargetCompatible,
  assertW5PrivateTextTargetCompatible,
  buildW5PublicManifest,
  parseW5PublicManifest,
  readW5PrivateCaptureReceipt,
  writePrivateJsonOnce,
  writeW5PrivateCapture,
  writeW5PrivateJsonOnce,
  writeW5PrivateJsonOnceOrMatch,
  writeW5PrivateTextOnce,
} from "@/scripts/w5/private-store";
import {
  assertW5PublicTargetsAvailable,
  assertW5PublicTargetMatches,
  writeW5PublicMarkdownOnce,
  writeW5PublicMarkdownOnceOrMatch,
} from "@/scripts/w5/public-store";
import {
  describeExactBytes,
  sha256Bytes,
  type W5RecordedProcessCall,
} from "@/scripts/w5/recording-process-runner";
import { assertW5PublicTextDoesNotQuoteCapturedProse } from "@/scripts/w5/public-text";
import { assertW5SampleRawBinding } from "@/scripts/w5/capture-binding";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const git = (root: string, args: readonly string[]) =>
  execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });

const makeRepository = async (ignore = "private-submission/\n") => {
  const root = await mkdtemp(path.join(tmpdir(), "w5-private-store-"));
  roots.push(root);
  git(root, ["init", "--quiet"]);
  await writeFile(path.join(root, ".gitignore"), ignore, "utf8");
  return root;
};

const capture = (): W5RecordedProcessCall => ({
  invocation: {
    command: "codex",
    args: ["exec", "--output-schema", "/private/schema", "--output-last-message", "/private/final"],
    cwd: "/private/workspace",
    timeoutMs: 1_000,
    outputLimitBytes: 1024,
  },
  processCompleted: true,
  processResult: {
    exitCode: 0,
    signal: null,
    stdout: "jsonl raw\n",
    stderr: "",
    timedOut: false,
  },
  prompt: describeExactBytes("raw prompt\n"),
  outputSchema: describeExactBytes('{"type":"object"}\n'),
  finalMessage: describeExactBytes('{"readerProse":"raw prose"}\n'),
  stdout: describeExactBytes("jsonl raw\n"),
  stderr: describeExactBytes(""),
});

describe("W5 private/public boundary", () => {
  it("writes exact raw bytes once under the ignored W5 private root", async () => {
    const root = await makeRepository();
    const stored = await writeW5PrivateCapture({
      root,
      captureId: "slot-01-call-01",
      capture: capture(),
    });

    expect(stored.artifacts.length).toBeGreaterThanOrEqual(5);
    expect(
      await readFile(
        path.join(root, "private-submission/w5-ab/slot-01-call-01/01-prompt.bin"),
        "utf8",
      ),
    ).toBe("raw prompt\n");
    expect(
      await readFile(
        path.join(root, "private-submission/w5-ab/slot-01-call-01/03-final.bin"),
        "utf8",
      ),
    ).toContain("raw prose");
    expect(
      await readW5PrivateCaptureReceipt({
        root,
        captureId: "slot-01-call-01",
      }),
    ).toEqual(stored);

    await expect(
      writeW5PrivateCapture({
        root,
        captureId: "slot-01-call-01",
        capture: capture(),
      }),
    ).rejects.toThrow("w5_private_capture_exists");
  });

  it("writes an arbitrary private JSON record once without exposing its path", async () => {
    const root = await makeRepository();
    const receipt = await writePrivateJsonOnce({
      root,
      fileName: "session-map.json",
      value: { raw: "private" },
    });
    expect(receipt.artifactId).toBe("session-map");
    expect(await readFile(await assertPrivateW5Path({ root, fileName: "session-map.json" }), "utf8"))
      .toBe('{"raw":"private"}\n');
    await expect(
      writePrivateJsonOnce({ root, fileName: "session-map.json", value: {} }),
    ).rejects.toThrow("w5_private_target_exists");
    const second = await writeW5PrivateJsonOnce({
      root,
      relativeName: "blind-packet.json",
      value: { slots: [] },
    });
    expect(second.artifactId).toBe("blind-packet");
    await expect(
      assertPrivateW5Path({ root, fileName: "../escape.json" }),
    ).rejects.toThrow("w5_private_file_name_invalid");
  });

  it("reserves private targets before a model call and resumes only exact JSON", async () => {
    const root = await makeRepository();
    await assertW5PrivateFilesAvailable({
      root,
      relativeNames: ["reservation.json", "result.json"],
    });
    await assertW5PrivateCaptureIdsAvailable({
      root,
      captureIds: ["capture-01"],
    });
    await writeW5PrivateJsonOnce({
      root,
      relativeName: "reservation.json",
      value: { state: "reserved" },
    });
    await expect(
      assertW5PrivateFilesAvailable({
        root,
        relativeNames: ["reservation.json"],
      }),
    ).rejects.toThrow("w5_private_target_exists");

    const first = await writeW5PrivateJsonOnceOrMatch({
      root,
      relativeName: "result.json",
      value: { immutable: true },
    });
    const resumed = await writeW5PrivateJsonOnceOrMatch({
      root,
      relativeName: "result.json",
      value: { immutable: true },
    });
    expect(resumed.sha256).toBe(first.sha256);
    await expect(
      assertW5PrivateJsonTargetCompatible({
        root,
        relativeName: "result.json",
        value: { immutable: false },
      }),
    ).rejects.toThrow("w5_private_target_conflict");
  });

  it("preflights public targets and permits only exact-byte finalization resume", async () => {
    const root = await makeRepository();
    await expect(
      assertW5PublicTargetMatches({
        repoRoot: root,
        fileName: "W5-MISSING.md",
        source: "Required evidence.",
      }),
    ).rejects.toThrow("w5_public_target_missing");
    await assertW5PublicTargetsAvailable({
      repoRoot: root,
      fileNames: ["W5-REVIEW.md"],
    });
    const first = await writeW5PublicMarkdownOnceOrMatch({
      repoRoot: root,
      fileName: "W5-REVIEW.md",
      markdown: "Safe creator summary.",
    });
    const resumed = await writeW5PublicMarkdownOnceOrMatch({
      repoRoot: root,
      fileName: "W5-REVIEW.md",
      markdown: "Safe creator summary.",
    });
    expect(resumed.sha256).toBe(first.sha256);
    await expect(
      assertW5PublicTargetMatches({
        repoRoot: root,
        fileName: "W5-REVIEW.md",
        source: "Safe creator summary.",
      }),
    ).resolves.toMatchObject({ sha256: first.sha256 });
    await expect(
      writeW5PublicMarkdownOnceOrMatch({
        repoRoot: root,
        fileName: "W5-REVIEW.md",
        markdown: "Conflicting creator summary.",
      }),
    ).rejects.toThrow("w5_public_target_conflict");
    await expect(
      writeW5PublicMarkdownOnce({
        repoRoot: root,
        fileName: "W5-LEAK.md",
        markdown: `Local path ${["", "Users", "example", "private.txt"].join("/")}`,
      }),
    ).rejects.toThrow("w5_public_content_forbidden");
  });

  it("rejects normalized captured-prose excerpts in creator-approved public text", () => {
    const captured =
      "Penelope lifts the basin and watches the old nurse cross the room.";
    expect(() =>
      assertW5PublicTextDoesNotQuoteCapturedProse({
        publicTexts: [
          "Penelope lifts the basin, and watches the old nurse cross the room.",
        ],
        capturedProse: [captured],
      }),
    ).toThrow("w5_public_creator_text_quotes_captured_prose");
    expect(() =>
      assertW5PublicTextDoesNotQuoteCapturedProse({
        publicTexts: ["The scene keeps cause and reaction legible."],
        capturedProse: [captured],
      }),
    ).not.toThrow();
  });

  it("binds the reviewed baseline prose to exact private final bytes", () => {
    const prose = Array.from({ length: 120 }, () => "Penelope").join(" ");
    const rawFinalBytes = Buffer.from(
      `${JSON.stringify({
        title: "The Washing",
        prose,
        segments: [
          {
            segmentId: "segment.turn",
            text: prose,
            grounding: { factIds: ["fact.room"], eventIds: [] },
          },
        ],
        grounding: { factIds: ["fact.room"], eventIds: [] },
        nextActions: [],
      })}\n`,
      "utf8",
    );
    const finalOutputSha256 = sha256Bytes(rawFinalBytes);
    expect(() =>
      assertW5SampleRawBinding({
        harnessId: "baseline_a",
        finalOutputSha256,
        finalProse: prose,
        rawFinalBytes,
      }),
    ).not.toThrow();
    expect(() =>
      assertW5SampleRawBinding({
        harnessId: "baseline_a",
        finalOutputSha256,
        finalProse: `${prose} edited`,
        rawFinalBytes,
      }),
    ).toThrow("w5_raw_final_prose_mismatch");
  });

  it("checks the actual Markdown path rather than a JSON substitute", async () => {
    const root = await makeRepository("private-submission/w5-ab/*.json\n");
    await expect(
      writeW5PrivateTextOnce({
        root,
        relativeName: "blind-review.md",
        text: "private prose",
      }),
    ).rejects.toThrow("w5_private_tree_not_ignored");
  });

  it("binds the private creator packet to exact reviewed bytes", async () => {
    const root = await makeRepository();
    await writeW5PrivateTextOnce({
      root,
      relativeName: "blind-review.md",
      text: "Reviewed private prose.",
    });
    await expect(
      assertW5PrivateTextTargetCompatible({
        root,
        relativeName: "blind-review.md",
        text: "Reviewed private prose.",
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertW5PrivateTextTargetCompatible({
        root,
        relativeName: "blind-review.md",
        text: "Different private prose.",
      }),
    ).rejects.toThrow("w5_private_target_conflict");
  });

  it("fails closed for traversal, symlinked ancestors, unignored or tracked private trees", async () => {
    const traversalRoot = await makeRepository();
    await expect(
      writeW5PrivateCapture({ root: traversalRoot, captureId: "../escape", capture: capture() }),
    ).rejects.toThrow("w5_private_capture_id_invalid");

    const symlinkRoot = await makeRepository();
    const external = await mkdtemp(path.join(tmpdir(), "w5-private-external-"));
    roots.push(external);
    await symlink(external, path.join(symlinkRoot, "private-submission"));
    await expect(
      writeW5PrivateCapture({ root: symlinkRoot, captureId: "slot-01", capture: capture() }),
    ).rejects.toThrow("w5_private_path_unsafe");

    const publicRoot = await makeRepository("# not ignored\n");
    await expect(
      writeW5PrivateCapture({ root: publicRoot, captureId: "slot-01", capture: capture() }),
    ).rejects.toThrow("w5_private_tree_not_ignored");

    const trackedRoot = await makeRepository();
    await mkdir(path.join(trackedRoot, "private-submission"));
    await writeFile(path.join(trackedRoot, "private-submission/tracked.txt"), "tracked\n");
    git(trackedRoot, ["add", "-f", "private-submission/tracked.txt"]);
    await expect(
      writeW5PrivateCapture({ root: trackedRoot, captureId: "slot-01", capture: capture() }),
    ).rejects.toThrow("w5_private_tree_tracked");
  });

  it("projects only opaque masked slots and exact-byte hashes", async () => {
    const root = await makeRepository();
    const stored = await writeW5PrivateCapture({
      root,
      captureId: "slot-01-call-01",
      capture: capture(),
    });
    const manifest = buildW5PublicManifest({
      manifestId: "manifest.0123456789abcdef",
      sourceRevision: "1".repeat(40),
      maskCommitmentSha256: "2".repeat(64),
      slots: [{ maskedSlotId: "slot.01", captures: [stored] }],
    });
    const serialized = JSON.stringify(manifest);

    expect(serialized).not.toMatch(
      /raw prompt|raw prose|private|response|model|condition|critic/iu,
    );
    expect(manifest.artifacts.map((entry) => entry.sha256)).toEqual(
      stored.artifacts.map((entry) => entry.sha256),
    );
    expect(parseW5PublicManifest(manifest)).toEqual(manifest);
  });

  it.each([
    ["prose", { prose: "A sentence escaped." }],
    ["prompt", { prompt: "secret" }],
    ["private path", { privatePath: "/tmp/raw" }],
    ["response", { response: "raw" }],
    ["model", { model: "requested-model" }],
    ["condition label", { conditionLabel: "A" }],
  ])("rejects a public manifest containing %s", (_name, leak) => {
    const base = {
      schemaVersion: "w5-public-manifest.v1",
      manifestId: "manifest.0123456789abcdef",
      sourceRevision: "1".repeat(40),
      maskCommitmentSha256: "2".repeat(64),
      slots: [
        {
          maskedSlotId: "slot.01",
          artifactIds: ["artifact.001"],
          callCount: 1,
        },
      ],
      artifacts: [{ artifactId: "artifact.001", bytes: 1, sha256: "3".repeat(64) }],
      ...leak,
    };
    expect(() => parseW5PublicManifest(base)).toThrow();
  });

  it("rejects condition labels hidden in otherwise valid identifier fields", () => {
    expect(() =>
      parseW5PublicManifest({
        schemaVersion: "w5-public-manifest.v1",
        manifestId: "manifest.0123456789abcdef",
        sourceRevision: "1".repeat(40),
        maskCommitmentSha256: "2".repeat(64),
        slots: [
          {
            maskedSlotId: "slot.01",
            artifactIds: ["artifact.condition-a"],
            callCount: 1,
          },
        ],
        artifacts: [
          { artifactId: "artifact.condition-a", bytes: 1, sha256: "3".repeat(64) },
        ],
      }),
    ).toThrow("w5_public_manifest_forbidden_value");
  });
});

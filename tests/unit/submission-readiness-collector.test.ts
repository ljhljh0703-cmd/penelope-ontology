import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  hasTrustedGithubVerifyCheck,
  hasValidDevpostOwnerReadback,
  inspectTrackedReleaseCopy,
  isValidSubmissionPng,
  isPrivateIgnoredRecord,
  isTrustedGithubWorkflowRun,
  parseReleaseRecord,
  readSubmissionClaimContract,
  submissionClaimContractMatches,
  verifyEvidenceManifest,
  verifyGalleryManifest,
  type ReleaseRecord,
} from "@/scripts/verify-submission-readiness";
import {
  ExternalSubmissionRecordSchema,
  inspectReleaseClaimLanguage,
} from "@/src/submission/readiness";

const roots: string[] = [];

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const pngCrc = (buffer: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const insertAncillaryChunk = (png: Buffer): Buffer => {
  const type = Buffer.from("ruSt", "ascii");
  const payload = Buffer.from("hidden-payload", "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc(Buffer.concat([type, payload])));
  return Buffer.concat([
    png.subarray(0, -12),
    length,
    type,
    payload,
    crc,
    png.subarray(-12),
  ]);
};

const appendHiddenIdatBytes = (png: Buffer): Buffer => {
  let offset = 8;
  let lastIdatOffset = -1;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") lastIdatOffset = offset;
    offset += length + 12;
  }
  if (lastIdatOffset < 0) throw new Error("PNG test fixture has no IDAT chunk.");
  const originalLength = png.readUInt32BE(lastIdatOffset);
  const type = png.subarray(lastIdatOffset + 4, lastIdatOffset + 8);
  const originalData = png.subarray(
    lastIdatOffset + 8,
    lastIdatOffset + 8 + originalLength,
  );
  const hidden = Buffer.from("PRIVATE_USER=hidden", "utf8");
  const data = Buffer.concat([originalData, hidden]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc(Buffer.concat([type, data])));
  return Buffer.concat([
    png.subarray(0, lastIdatOffset),
    length,
    type,
    data,
    crc,
    png.subarray(lastIdatOffset + originalLength + 12),
  ]);
};

const buildPngChunk = (typeName: "IHDR" | "IDAT" | "IEND", data: Buffer): Buffer => {
  const type = Buffer.from(typeName, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
};

const recompressPng = (png: Buffer, level: number): Buffer => {
  let offset = 8;
  let header: Buffer | null = null;
  const compressed: Buffer[] = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = Buffer.from(data);
    if (type === "IDAT") compressed.push(Buffer.from(data));
    offset += length + 12;
  }
  if (header === null || compressed.length === 0) {
    throw new Error("PNG test fixture is missing required chunks.");
  }
  const filteredPixels = inflateSync(Buffer.concat(compressed));
  return Buffer.concat([
    png.subarray(0, 8),
    buildPngChunk("IHDR", header),
    buildPngChunk("IDAT", deflateSync(filteredPixels, { level })),
    buildPngChunk("IEND", Buffer.alloc(0)),
  ]);
};

const git = (cwd: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const makeRepository = (): string => {
  const root = mkdtempSync(join(tmpdir(), "narrative-submission-gate-"));
  roots.push(root);
  git(root, ["init"]);
  git(root, ["config", "user.name", "Submission Gate Test"]);
  git(root, ["config", "user.email", "submission-gate@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  writeFileSync(resolve(root, ".gitignore"), "private-submission/\n", "utf8");
  git(root, ["add", ".gitignore"]);
  git(root, ["commit", "-m", "test root"]);
  return root;
};

const passRecord = (unitTestFiles = 35) => ({
  identifiedSource: "pass",
  unitTestFiles,
  unitTests: 179,
  privacyCandidates: 176,
  productionBuild: "pass",
  productionBrowserTests: 10,
  deploymentSmoke: "pass",
  lint: "pass",
  typecheck: "pass",
});

const buildReleaseRecord = (): ReleaseRecord => ({
  commitSha: "a".repeat(40),
  evidence: {
    manifestPath: "artifacts/evidence/manifest.json",
    manifestSha256: "b".repeat(64),
    manifestFiles: 7,
    submissionGallery: {
      manifestPath: "docs/assets/demo/manifest.json",
      manifestSha256: "c".repeat(64),
      files: 5,
      visuallyInspected: true,
      privacyInspected: true,
    },
  },
  verification: {
    currentRepository: passRecord(),
    cleanClone: {
      ...passRecord(),
      npmAuditVulnerabilities: 0,
    },
    claimParity: "zero_drift",
  },
});

const evidenceBaselineNames = [
  "evidence-packet.json",
  "fixture-replay.json",
  "graph-descriptor.json",
  "live-readiness.json",
  "simulation-chain.json",
  "style-ablation-readiness.json",
  "style-harness.json",
] as const;

const writeEvidenceTree = (root: string) => {
  const evidenceDirectory = resolve(root, "artifacts/evidence");
  const scriptsDirectory = resolve(root, "scripts");
  mkdirSync(evidenceDirectory, { recursive: true });
  mkdirSync(scriptsDirectory, { recursive: true });
  copyFileSync(
    resolve(process.cwd(), "scripts/verify-evidence.mjs"),
    resolve(scriptsDirectory, "verify-evidence.mjs"),
  );
  const files = evidenceBaselineNames.map((fileName) => {
    const source = `${JSON.stringify({ fileName })}\n`;
    const locator = `artifacts/evidence/${fileName}`;
    writeFileSync(resolve(root, locator), source, "utf8");
    return {
      path: locator,
      bytes: Buffer.byteLength(source),
      sha256: createHash("sha256").update(source).digest("hex"),
    };
  });
  const manifestPath = resolve(evidenceDirectory, "manifest.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ schemaVersion: 1, files })}\n`,
    "utf8",
  );
  return { files, manifestPath };
};

const bindReleaseRecordToHead = (
  root: string,
  manifestPath: string,
): ReleaseRecord => {
  const releaseRecord = buildReleaseRecord();
  releaseRecord.commitSha = git(root, ["rev-parse", "HEAD"]);
  releaseRecord.evidence.manifestSha256 = createHash("sha256")
    .update(readFileSync(manifestPath))
    .digest("hex");
  return releaseRecord;
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("submission readiness collectors", () => {
  it("keeps tracked public release surfaces inside the no-live-generation boundary", () => {
    const locators = execFileSync(
      "git",
      ["ls-files", "-z", "--", "README.md", "docs", "app", "components"],
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\0")
      .filter((locator) => /\.(?:md|mdx|tsx)$/i.test(locator));
    for (const locator of locators) {
      expect(
        inspectReleaseClaimLanguage([readFileSync(locator, "utf8")])
          .liveGpt56NarrativeGeneration,
        locator,
      ).toBe(false);
    }
    expect(inspectTrackedReleaseCopy(process.cwd())).toMatchObject({
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: false,
      crossModelSuperiority: false,
    });
  });

  it("parses the tracked claim contract v2 strictly and fails closed", () => {
    const root = makeRepository();
    const directory = resolve(root, "docs/submission");
    const locator = resolve(directory, "CLAIM-CONTRACT.json");
    mkdirSync(directory, { recursive: true });
    const validContract = {
      schemaVersion: 2,
      liveGpt56NarrativeGeneration: false,
      measuredStyleControl: false,
      boundary:
        "Codex plus feedback is required, while live GPT-5.6 narrative generation remains unclaimed without matching evidence.",
    };
    writeFileSync(locator, `${JSON.stringify(validContract)}\n`, "utf8");
    git(root, ["add", "docs/submission/CLAIM-CONTRACT.json"]);
    git(root, ["commit", "-m", "claim contract"]);

    expect(readSubmissionClaimContract(root)).toEqual({
      liveGpt56NarrativeGeneration: false,
      measuredStyleControl: false,
    });

    writeFileSync(
      locator,
      `${JSON.stringify({ ...validContract, unexpected: true })}\n`,
      "utf8",
    );
    expect(readSubmissionClaimContract(root)).toBeNull();

    writeFileSync(
      locator,
      `${JSON.stringify({ ...validContract, schemaVersion: 1 })}\n`,
      "utf8",
    );
    expect(readSubmissionClaimContract(root)).toBeNull();
  });

  it("requires exact parity between the tracked live-claim flag and release copy", () => {
    const contract = {
      liveGpt56NarrativeGeneration: false,
      measuredStyleControl: false,
    };
    const releaseCopy = {
      complete: true,
      liveGpt56NarrativeGeneration: false,
      measuredStyleEffect: false,
      crossModelSuperiority: false,
    };
    expect(
      submissionClaimContractMatches(contract, releaseCopy, false),
    ).toBe(true);
    expect(
      submissionClaimContractMatches(
        contract,
        { ...releaseCopy, liveGpt56NarrativeGeneration: true },
        false,
      ),
    ).toBe(false);
    expect(
      submissionClaimContractMatches(
        { ...contract, liveGpt56NarrativeGeneration: true },
        releaseCopy,
        false,
      ),
    ).toBe(false);
    expect(submissionClaimContractMatches(null, releaseCopy, false)).toBe(
      false,
    );
  });

  it("accepts only ignored regular records inside private-submission", () => {
    const root = makeRepository();
    const privateDirectory = resolve(root, "private-submission");
    mkdirSync(privateDirectory);
    const privateRecord = resolve(privateDirectory, "submission-record.json");
    writeFileSync(privateRecord, "{}\n", "utf8");
    expect(isPrivateIgnoredRecord(root, privateRecord)).toBe(true);

    const trackedRecord = resolve(root, "tracked-record.json");
    writeFileSync(trackedRecord, "{}\n", "utf8");
    git(root, ["add", "tracked-record.json"]);
    git(root, ["commit", "-m", "tracked record"]);
    expect(isPrivateIgnoredRecord(root, trackedRecord)).toBe(false);

    const symlink = resolve(privateDirectory, "linked-record.json");
    symlinkSync(trackedRecord, symlink);
    expect(isPrivateIgnoredRecord(root, symlink)).toBe(false);

    const symlinkRoot = makeRepository();
    const externalDirectory = resolve(symlinkRoot, "external-private");
    mkdirSync(externalDirectory);
    const externalRecord = resolve(externalDirectory, "submission-record.json");
    writeFileSync(externalRecord, "{}\n", "utf8");
    symlinkSync(externalDirectory, resolve(symlinkRoot, "private-submission"), "dir");
    expect(
      isPrivateIgnoredRecord(
        symlinkRoot,
        resolve(symlinkRoot, "private-submission/submission-record.json"),
      ),
    ).toBe(false);
  });

  it("requires matching current and clean-clone release counts", () => {
    expect(parseReleaseRecord(buildReleaseRecord())).not.toBeNull();
    const liveEvidenceCount = buildReleaseRecord();
    liveEvidenceCount.evidence.manifestFiles = 9;
    expect(parseReleaseRecord(liveEvidenceCount)).not.toBeNull();
    const mismatched = buildReleaseRecord();
    mismatched.verification.cleanClone.unitTests = 168;
    expect(parseReleaseRecord(mismatched)).toBeNull();
    const fractional = buildReleaseRecord();
    fractional.verification.currentRepository.unitTests = 167.5;
    fractional.verification.cleanClone.unitTests = 167.5;
    expect(parseReleaseRecord(fractional)).toBeNull();
    const regressed = buildReleaseRecord();
    regressed.verification.currentRepository.unitTestFiles = 1;
    regressed.verification.cleanClone.unitTestFiles = 1;
    regressed.verification.currentRepository.unitTests = 1;
    regressed.verification.cleanClone.unitTests = 1;
    regressed.verification.currentRepository.privacyCandidates = 1;
    regressed.verification.cleanClone.privacyCandidates = 1;
    expect(parseReleaseRecord(regressed)).toBeNull();
  });

  it("requires each evidence child to be tracked even when ignored children leave a clean status", () => {
    const root = makeRepository();
    writeFileSync(
      resolve(root, ".gitignore"),
      "private-submission/\nartifacts/evidence/*.json\n!artifacts/evidence/manifest.json\n",
      "utf8",
    );
    const { manifestPath } = writeEvidenceTree(root);
    git(root, [
      "add",
      ".gitignore",
      "scripts/verify-evidence.mjs",
      "artifacts/evidence/manifest.json",
    ]);
    git(root, ["commit", "-m", "tracked manifest with ignored children"]);

    expect(git(root, ["status", "--porcelain", "--untracked-files=all"])).toBe("");
    const byteVerifier = spawnSync(
      process.execPath,
      [resolve(root, "scripts/verify-evidence.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    expect(byteVerifier.status).toBe(0);
    expect(
      verifyEvidenceManifest(root, bindReleaseRecordToHead(root, manifestPath)),
    ).toBe(false);
  });

  it("binds evidence child bytes to the release HEAD rather than only the working tree", () => {
    const root = makeRepository();
    const { files, manifestPath } = writeEvidenceTree(root);
    git(root, ["add", "scripts/verify-evidence.mjs", "artifacts/evidence"]);
    git(root, ["commit", "-m", "canonical evidence"]);
    expect(
      verifyEvidenceManifest(root, bindReleaseRecordToHead(root, manifestPath)),
    ).toBe(true);

    const changedSource = '{"status":"working-tree-only"}\n';
    const changed = files[0]!;
    writeFileSync(resolve(root, changed.path), changedSource, "utf8");
    changed.bytes = Buffer.byteLength(changedSource);
    changed.sha256 = createHash("sha256").update(changedSource).digest("hex");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ schemaVersion: 1, files })}\n`,
      "utf8",
    );
    git(root, ["add", "artifacts/evidence/manifest.json"]);
    git(root, ["commit", "-m", "manifest points at uncommitted child bytes"]);

    const byteVerifier = spawnSync(
      process.execPath,
      [resolve(root, "scripts/verify-evidence.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    expect(byteVerifier.status).toBe(0);
    expect(
      verifyEvidenceManifest(root, bindReleaseRecordToHead(root, manifestPath)),
    ).toBe(false);
  });

  it("validates every tracked gallery child, byte count, hash, and dimension", () => {
    const root = makeRepository();
    const directory = resolve(root, "docs/assets/demo");
    mkdirSync(directory, { recursive: true });
    const sourceNames = [
      "01-frozen-rehearsal.png",
      "02-knowledge-boundary.png",
      "03-creator-gate.png",
      "04-two-step-replay.png",
      "05-production-review-packet.png",
    ];
    const phases = ["ready", "candidate", "candidate", "complete", "complete"];
    const files = sourceNames.map((fileName, index) => {
      const relativePath = `docs/assets/demo/${fileName}`;
      copyFileSync(resolve(process.cwd(), relativePath), resolve(root, relativePath));
      const buffer = readFileSync(resolve(root, relativePath));
      return {
        fileName,
        phase: phases[index],
        caption: `Public-safe inspected fixture screenshot number ${index + 1}.`,
        path: relativePath,
        bytes: buffer.length,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    });
    const manifestPath = resolve(directory, "manifest.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ schemaVersion: 1, fixtureOnly: true, files }, null, 2)}\n`,
      "utf8",
    );
    git(root, ["add", "docs/assets/demo"]);
    git(root, ["commit", "-m", "gallery"]);
    const releaseRecord = buildReleaseRecord();
    releaseRecord.evidence.submissionGallery.manifestSha256 = createHash("sha256")
      .update(readFileSync(manifestPath))
      .digest("hex");
    expect(verifyGalleryManifest(root, releaseRecord)).toBe(true);
    expect(isValidSubmissionPng(readFileSync(resolve(root, files[0].path)))).toBe(true);
    expect(
      isValidSubmissionPng(
        insertAncillaryChunk(readFileSync(resolve(root, files[0].path))),
      ),
    ).toBe(false);
    expect(
      isValidSubmissionPng(
        appendHiddenIdatBytes(readFileSync(resolve(root, files[0].path))),
      ),
    ).toBe(false);

    const sharedPixels = readFileSync(resolve(root, files[0].path));
    const levelZero = recompressPng(sharedPixels, 0);
    const levelNine = recompressPng(sharedPixels, 9);
    expect(createHash("sha256").update(levelZero).digest("hex")).not.toBe(
      createHash("sha256").update(levelNine).digest("hex"),
    );
    for (const [index, replacement] of [levelZero, levelNine].entries()) {
      writeFileSync(resolve(root, files[index].path), replacement);
      files[index].bytes = replacement.length;
      files[index].sha256 = createHash("sha256").update(replacement).digest("hex");
    }
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ schemaVersion: 1, fixtureOnly: true, files }, null, 2)}\n`,
      "utf8",
    );
    releaseRecord.evidence.submissionGallery.manifestSha256 = createHash("sha256")
      .update(readFileSync(manifestPath))
      .digest("hex");
    expect(verifyGalleryManifest(root, releaseRecord)).toBe(false);

    writeFileSync(resolve(root, files[0].path), Buffer.alloc(24));
    expect(verifyGalleryManifest(root, releaseRecord)).toBe(false);
  });

  it("trusts only the GitHub Actions verify check for the exact SHA and repository", () => {
    const sha = "a".repeat(40);
    const check = {
      name: "verify",
      conclusion: "success",
      head_sha: sha,
      details_url: "https://github.com/example/narrative-harness/actions/runs/123/job/456",
    };
    expect(
      hasTrustedGithubVerifyCheck(
        { check_runs: [{ ...check, app: { slug: "third-party-ci" } }] },
        "example/narrative-harness",
        sha,
      ),
    ).toBe(false);
    expect(
      hasTrustedGithubVerifyCheck(
        { check_runs: [{ ...check, app: { slug: "github-actions" } }] },
        "example/narrative-harness",
        sha,
      ),
    ).toBe(true);
    const workflowRun = {
      id: 123,
      name: "ci",
      path: ".github/workflows/ci.yml",
      event: "push",
      head_branch: "main",
      head_sha: sha,
      conclusion: "success",
      html_url: "https://github.com/example/narrative-harness/actions/runs/123",
      repository: { full_name: "example/narrative-harness" },
    };
    expect(
      isTrustedGithubWorkflowRun(
        workflowRun,
        "example/narrative-harness",
        sha,
        123,
      ),
    ).toBe(true);
    expect(
      isTrustedGithubWorkflowRun(
        { ...workflowRun, path: ".github/workflows/unrelated.yml" },
        "example/narrative-harness",
        sha,
        123,
      ),
    ).toBe(false);
    expect(
      isTrustedGithubWorkflowRun(
        { ...workflowRun, event: "pull_request", head_branch: "feature" },
        "example/narrative-harness",
        sha,
        123,
      ),
    ).toBe(false);
  });

  it("labels Devpost completion as an owner/plugin readback and rejects future receipts", () => {
    const record = ExternalSubmissionRecordSchema.parse({
      schemaVersion: 1,
      final: {
        projectName: "Narrative Knowledge Harness",
        track: "Work & Productivity",
        descriptionFinal: true,
      },
      publicRepository: { url: null, branch: "main" },
      hostedDemo: { url: null },
      video: {
        url: null,
        narrationConfirmed: false,
        productDemoConfirmed: false,
        codexUseExplained: false,
        gpt56UseExplained: false,
      },
      feedback: { sessionId: null, taskModel: null },
      devpost: {
        projectUrl: "https://devpost.com/software/narrative-ontology-harness",
        trackConfirmed: true,
        submittedAt: "2026-07-15T00:00:00.000Z",
        submissionUrl: "https://devpost.com/software/narrative-ontology-harness",
        submissionReadbackMethod: "devpost_plugin",
        readback: {
          projectName: "Narrative Knowledge Harness",
          track: "Work & Productivity",
          descriptionSha256: "d".repeat(64),
          repositoryUrl: null,
          hostedDemoUrl: null,
          videoUrl: null,
        },
      },
      claims: { measuredStyleControl: false },
    });
    expect(
      hasValidDevpostOwnerReadback(
        record,
        true,
        "d".repeat(64),
        Date.parse("2026-07-16"),
      ),
    ).toBe(true);
    expect(
      hasValidDevpostOwnerReadback(
        record,
        true,
        "d".repeat(64),
        Date.parse("2026-07-14"),
      ),
    ).toBe(false);
    expect(
      hasValidDevpostOwnerReadback(
        {
          ...record,
          devpost: {
            ...record.devpost,
            readback: { ...record.devpost.readback, track: null },
          },
        },
        true,
        "d".repeat(64),
        Date.parse("2026-07-16"),
      ),
    ).toBe(false);
  });

  it("fails closed at the CLI boundary without reflecting private record values", () => {
    const root = makeRepository();
    const privateDirectory = resolve(root, "private-submission");
    mkdirSync(privateDirectory);
    const privateToken = "private-feedback-token-should-never-print";
    const privateUrl = "https://github.com/private-owner/private-repository";
    writeFileSync(
      resolve(privateDirectory, "submission-record.json"),
      `${JSON.stringify({ privateToken, privateUrl })}\n`,
      "utf8",
    );
    writeFileSync(
      resolve(privateDirectory, "release-record.json"),
      `${JSON.stringify({ privateToken })}\n`,
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(process.cwd(), "scripts/verify-submission-readiness.ts"),
        "--root",
        root,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 20_000,
      },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain("SUBMISSION_READINESS_BLOCKED");
    expect(output).not.toContain(privateToken);
    expect(output).not.toContain(privateUrl);
  });
});

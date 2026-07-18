#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { verifyLocalLiveEvidenceProof } from "@/src/evidence/live-evidence-verifier";
import {
  STYLE_ABLATION_EVIDENCE_LOCATORS,
  verifyStyleAblationEvidenceFiles,
  verifyStyleAblationLocalProof,
} from "@/src/evaluation/style-ablation-evidence-verifier";
import {
  evaluateSubmissionReadiness,
  ExternalSubmissionRecordSchema,
  formatSubmissionReadiness,
  hasFinalProjectDescription,
  hasStructuredProjectNameParity,
  inspectReleaseClaimLanguage,
  type ExternalSubmissionRecord,
  type SubmissionObservation,
  type SubmissionPhase,
} from "@/src/submission/readiness";

export type ReleaseRecord = {
  commitSha: string;
  evidence: {
    manifestPath: string;
    manifestSha256: string;
    manifestFiles: number;
    submissionGallery: {
      manifestPath: string;
      manifestSha256: string;
      files: number;
      visuallyInspected: boolean;
      privacyInspected: boolean;
    };
  };
  verification: {
    currentRepository: Record<string, unknown>;
    cleanClone: Record<string, unknown>;
    claimParity: string;
  };
};

type Arguments = {
  phase: SubmissionPhase;
  root: string;
  recordPath: string;
  releaseRecordPath: string;
};

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const NETWORK_TIMEOUT_MS = 15_000;
const MIN_RELEASE_COUNTS = {
  unitTestFiles: 35,
  unitTests: 179,
  privacyCandidates: 176,
  productionBrowserTests: 10,
} as const;
const BASELINE_EVIDENCE_PATHS = [
  "artifacts/evidence/evidence-packet.json",
  "artifacts/evidence/fixture-replay.json",
  "artifacts/evidence/graph-descriptor.json",
  "artifacts/evidence/live-readiness.json",
  "artifacts/evidence/simulation-chain.json",
  "artifacts/evidence/style-ablation-readiness.json",
  "artifacts/evidence/style-harness.json",
] as const;

const parseArguments = (args: string[]): Arguments => {
  let phase: SubmissionPhase = "pre-submit";
  let root = process.cwd();
  let recordPath: string | undefined;
  let releaseRecordPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--phase" && (value === "pre-submit" || value === "post-submit")) {
      phase = value;
      index += 1;
    } else if (argument === "--root" && value) {
      root = path.resolve(value);
      index += 1;
    } else if (argument === "--record" && value) {
      recordPath = value;
      index += 1;
    } else if (argument === "--release-record" && value) {
      releaseRecordPath = value;
      index += 1;
    } else {
      throw new Error(
        "Usage: verify-submission-readiness.ts [--phase pre-submit|post-submit] [--root <repo>] [--record <private-json>] [--release-record <private-json>]",
      );
    }
  }

  return {
    phase,
    root,
    recordPath: path.resolve(root, recordPath ?? "private-submission/submission-record.json"),
    releaseRecordPath: path.resolve(
      root,
      releaseRecordPath ?? "private-submission/release-record.json",
    ),
  };
};

const readJson = (filePath: string): unknown =>
  JSON.parse(readFileSync(filePath, "utf8")) as unknown;

const git = (root: string, args: string[], timeout = NETWORK_TIMEOUT_MS): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  }).trim();

const hashFile = (filePath: string): string =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

export const isPrivateIgnoredRecord = (
  root: string,
  filePath: string,
): boolean => {
  const privateRoot = path.resolve(root, "private-submission");
  const resolved = path.resolve(filePath);
  if (!existsSync(privateRoot) || !existsSync(resolved)) return false;
  const privateRootStat = lstatSync(privateRoot);
  if (!privateRootStat.isDirectory() || privateRootStat.isSymbolicLink()) return false;
  const privateRelative = path.relative(privateRoot, resolved);
  if (
    !privateRelative ||
    privateRelative.startsWith("..") ||
    path.isAbsolute(privateRelative)
  ) {
    return false;
  }
  const realRoot = realpathSync(root);
  const realPrivateRoot = realpathSync(privateRoot);
  if (path.relative(realRoot, realPrivateRoot) !== "private-submission") return false;
  const realResolved = realpathSync(resolved);
  const realRelative = path.relative(realPrivateRoot, realResolved);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) return false;
  const stat = lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) return false;
  const repositoryRelative = path.relative(root, resolved).split(path.sep).join("/");
  try {
    git(root, ["ls-files", "--error-unmatch", "--", repositoryRelative]);
    return false;
  } catch {
    // Expected: private records must not be tracked.
  }
  try {
    git(root, ["check-ignore", "-q", "--", repositoryRelative]);
    return true;
  } catch {
    return false;
  }
};

const resolvePublicArtifact = (root: string, locator: string): string | null => {
  if (!locator || path.isAbsolute(locator)) return null;
  const resolved = path.resolve(root, locator);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
};

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

const isPassRecord = (value: Record<string, unknown>, cleanClone = false): boolean =>
  value.identifiedSource === "pass" &&
  isPositiveSafeInteger(value.unitTestFiles) &&
  value.unitTestFiles >= MIN_RELEASE_COUNTS.unitTestFiles &&
  isPositiveSafeInteger(value.unitTests) &&
  value.unitTests >= MIN_RELEASE_COUNTS.unitTests &&
  isPositiveSafeInteger(value.privacyCandidates) &&
  value.privacyCandidates >= MIN_RELEASE_COUNTS.privacyCandidates &&
  value.productionBuild === "pass" &&
  isPositiveSafeInteger(value.productionBrowserTests) &&
  value.productionBrowserTests >= MIN_RELEASE_COUNTS.productionBrowserTests &&
  value.deploymentSmoke === "pass" &&
  (cleanClone
    ? value.npmAuditVulnerabilities === 0
    : value.lint === "pass" && value.typecheck === "pass");

export const parseReleaseRecord = (value: unknown): ReleaseRecord | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Partial<ReleaseRecord>;
  const evidence = candidate.evidence;
  const verification = candidate.verification;
  if (
    !SHA40.test(candidate.commitSha ?? "") ||
    !evidence ||
    typeof evidence.manifestPath !== "string" ||
    !SHA256.test(evidence.manifestSha256 ?? "") ||
    !isPositiveSafeInteger(evidence.manifestFiles) ||
    !evidence.submissionGallery ||
    typeof evidence.submissionGallery.manifestPath !== "string" ||
    !SHA256.test(evidence.submissionGallery.manifestSha256 ?? "") ||
    evidence.submissionGallery.files !== 5 ||
    evidence.submissionGallery.visuallyInspected !== true ||
    evidence.submissionGallery.privacyInspected !== true ||
    !verification ||
    !verification.currentRepository ||
    !verification.cleanClone ||
    verification.claimParity !== "zero_drift" ||
    !isPassRecord(verification.currentRepository) ||
    !isPassRecord(verification.cleanClone, true) ||
    verification.currentRepository.unitTestFiles !==
      verification.cleanClone.unitTestFiles ||
    verification.currentRepository.unitTests !== verification.cleanClone.unitTests ||
    verification.currentRepository.privacyCandidates !==
      verification.cleanClone.privacyCandidates ||
    verification.currentRepository.productionBrowserTests !==
      verification.cleanClone.productionBrowserTests
  ) {
    return null;
  }
  return candidate as ReleaseRecord;
};

const readSubmissionRecord = (
  filePath: string,
): { record: ExternalSubmissionRecord | null; valid: boolean } => {
  try {
    const parsed = ExternalSubmissionRecordSchema.safeParse(readJson(filePath));
    return parsed.success
      ? { record: parsed.data, valid: true }
      : { record: null, valid: false };
  } catch {
    return { record: null, valid: false };
  }
};

const readReleaseRecord = (
  filePath: string,
): { record: ReleaseRecord | null; valid: boolean } => {
  try {
    const record = parseReleaseRecord(readJson(filePath));
    return { record, valid: record !== null };
  } catch {
    return { record: null, valid: false };
  }
};

const isTrackedRegularFile = (root: string, locator: string): boolean => {
  const filePath = resolvePublicArtifact(root, locator);
  if (!filePath || !existsSync(filePath)) return false;
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) return false;
  try {
    return git(root, ["ls-files", "--error-unmatch", "--", locator]) === locator;
  } catch {
    return false;
  }
};

const readTrackedHeadRegularFile = (
  root: string,
  locator: string,
  expectedCommitSha: string,
): Buffer | null => {
  if (!isTrackedRegularFile(root, locator)) return null;
  try {
    const filePath = resolvePublicArtifact(root, locator);
    if (!filePath) return null;
    const realRoot = realpathSync(root);
    const realFile = realpathSync(filePath);
    const expectedRelative = locator.split("/").join(path.sep);
    if (path.relative(realRoot, realFile) !== expectedRelative) return null;

    const treeOutput = execFileSync(
      "git",
      ["ls-tree", "-z", expectedCommitSha, "--", locator],
      {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: NETWORK_TIMEOUT_MS,
      },
    ).toString("utf8");
    const entries = treeOutput.split("\0").filter(Boolean);
    if (entries.length !== 1) return null;
    const match = entries[0]?.match(
      /^(100644|100755) blob ([a-f0-9]{40,64})\t(.+)$/u,
    );
    if (!match || match[3] !== locator) return null;

    const headBuffer = execFileSync("git", ["cat-file", "blob", match[2]!], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: NETWORK_TIMEOUT_MS,
    });
    const workingBuffer = readFileSync(filePath);
    return workingBuffer.equals(headBuffer) ? workingBuffer : null;
  } catch {
    return null;
  }
};

export const verifyEvidenceManifest = (
  root: string,
  releaseRecord: ReleaseRecord | null,
): boolean => {
  const locator = "artifacts/evidence/manifest.json";
  let head = "";
  try {
    head = git(root, ["rev-parse", "HEAD"]);
  } catch {
    return false;
  }
  const manifestBuffer = releaseRecord
    ? readTrackedHeadRegularFile(root, locator, releaseRecord.commitSha)
    : null;
  if (
    !releaseRecord ||
    head !== releaseRecord.commitSha ||
    releaseRecord.evidence.manifestPath !== locator ||
    !isPositiveSafeInteger(releaseRecord.evidence.manifestFiles) ||
    manifestBuffer === null ||
    createHash("sha256").update(manifestBuffer).digest("hex") !==
      releaseRecord.evidence.manifestSha256
  ) {
    return false;
  }
  try {
    const manifest = JSON.parse(manifestBuffer.toString("utf8")) as {
      schemaVersion?: unknown;
      files?: Array<{ path?: unknown; bytes?: unknown; sha256?: unknown }>;
    };
    if (
      manifest.schemaVersion !== 1 ||
      !Array.isArray(manifest.files) ||
      manifest.files.length !== releaseRecord.evidence.manifestFiles ||
      !BASELINE_EVIDENCE_PATHS.every((required) =>
        manifest.files?.some((entry) => entry.path === required),
      )
    ) {
      return false;
    }
    for (const entry of manifest.files) {
      if (
        typeof entry.path !== "string" ||
        typeof entry.bytes !== "number" ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes <= 0 ||
        typeof entry.sha256 !== "string" ||
        !SHA256.test(entry.sha256)
      ) {
        return false;
      }
      const childBuffer = readTrackedHeadRegularFile(
        root,
        entry.path,
        releaseRecord.commitSha,
      );
      if (
        childBuffer === null ||
        childBuffer.byteLength !== entry.bytes ||
        createHash("sha256").update(childBuffer).digest("hex") !== entry.sha256
      ) {
        return false;
      }
    }
  } catch {
    return false;
  }
  const result = spawnSync(
    process.execPath,
    [path.resolve(root, "scripts/verify-evidence.mjs")],
    { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
  );
  return result.status === 0;
};

type GalleryManifestEntry = {
  fileName?: unknown;
  phase?: unknown;
  caption?: unknown;
  path?: unknown;
  bytes?: unknown;
  sha256?: unknown;
};

const PNG_SIGNATURE = "89504e470d0a1a0a";
const ALLOWED_PNG_CHUNKS = new Set(["IHDR", "IDAT", "IEND"]);
const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const crc32 = (buffer: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const paethPredictor = (left: number, up: number, upperLeft: number): number => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
};

const decodeSubmissionPngPixels = (
  buffer: Buffer,
  expectedWidth = 1440,
  expectedHeight = 900,
): Buffer | null => {
  try {
    if (buffer.length < 45 || buffer.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
      return null;
    }
    let offset = 8;
    let sawHeader = false;
    let sawEnd = false;
    const compressed: Buffer[] = [];
    while (offset < buffer.length) {
      if (offset + 12 > buffer.length) return null;
      const length = buffer.readUInt32BE(offset);
      const chunkEnd = offset + 12 + length;
      if (chunkEnd > buffer.length) return null;
      const typeBuffer = buffer.subarray(offset + 4, offset + 8);
      const type = typeBuffer.toString("ascii");
      if (!/^[A-Za-z]{4}$/.test(type)) return null;
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
      if (crc32(Buffer.concat([typeBuffer, data])) !== expectedCrc) return null;
      if (!sawHeader) {
        if (
          type !== "IHDR" ||
          length !== 13 ||
          data.readUInt32BE(0) !== expectedWidth ||
          data.readUInt32BE(4) !== expectedHeight ||
          data[8] !== 8 ||
          data[9] !== 2 ||
          data[10] !== 0 ||
          data[11] !== 0 ||
          data[12] !== 0
        ) {
          return null;
        }
        sawHeader = true;
      } else if (type === "IHDR") {
        return null;
      }
      if (!ALLOWED_PNG_CHUNKS.has(type)) return null;
      if (type === "IDAT") compressed.push(Buffer.from(data));
      if (type === "IEND") {
        if (length !== 0 || chunkEnd !== buffer.length) return null;
        sawEnd = true;
      }
      offset = chunkEnd;
    }
    if (!sawHeader || !sawEnd || compressed.length === 0) return null;
    const rowBytes = expectedWidth * 3;
    const expectedOutputLength = (rowBytes + 1) * expectedHeight;
    const compressedSource = Buffer.concat(compressed);
    const inflated = inflateSync(compressedSource, {
      info: true,
      maxOutputLength: expectedOutputLength,
    }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    const pixels = inflated.buffer;
    if (
      inflated.engine.bytesWritten !== compressedSource.length ||
      pixels.length !== expectedOutputLength
    ) {
      return null;
    }
    const decoded = Buffer.allocUnsafe(rowBytes * expectedHeight);
    const bytesPerPixel = 3;
    for (let row = 0; row < expectedHeight; row += 1) {
      const filteredRowStart = row * (rowBytes + 1);
      const decodedRowStart = row * rowBytes;
      const filter = pixels[filteredRowStart];
      if (filter === undefined || filter > 4) return null;
      for (let column = 0; column < rowBytes; column += 1) {
        const filteredByte = pixels[filteredRowStart + 1 + column];
        if (filteredByte === undefined) return null;
        const left =
          column >= bytesPerPixel ? decoded[decodedRowStart + column - bytesPerPixel]! : 0;
        const up = row > 0 ? decoded[decodedRowStart - rowBytes + column]! : 0;
        const upperLeft =
          row > 0 && column >= bytesPerPixel
            ? decoded[decodedRowStart - rowBytes + column - bytesPerPixel]!
            : 0;
        let predictor = 0;
        if (filter === 1) predictor = left;
        else if (filter === 2) predictor = up;
        else if (filter === 3) predictor = Math.floor((left + up) / 2);
        else if (filter === 4) predictor = paethPredictor(left, up, upperLeft);
        decoded[decodedRowStart + column] = (filteredByte + predictor) & 0xff;
      }
    }
    return decoded;
  } catch {
    return null;
  }
};

export const isValidSubmissionPng = (
  buffer: Buffer,
  expectedWidth = 1440,
  expectedHeight = 900,
): boolean => decodeSubmissionPngPixels(buffer, expectedWidth, expectedHeight) !== null;

const EXPECTED_GALLERY = [
  ["01-frozen-rehearsal.png", "ready"],
  ["02-knowledge-boundary.png", "candidate"],
  ["03-creator-gate.png", "candidate"],
  ["04-two-step-replay.png", "complete"],
  ["05-production-review-packet.png", "complete"],
] as const;

export const verifyGalleryManifest = (
  root: string,
  releaseRecord: ReleaseRecord | null,
): boolean => {
  const locator = "docs/assets/demo/manifest.json";
  const gallery = releaseRecord?.evidence.submissionGallery;
  if (
    !gallery ||
    gallery.manifestPath !== locator ||
    gallery.files !== 5 ||
    gallery.visuallyInspected !== true ||
    gallery.privacyInspected !== true ||
    !isTrackedRegularFile(root, locator) ||
    hashFile(path.resolve(root, locator)) !== gallery.manifestSha256
  ) {
    return false;
  }
  try {
    const manifest = readJson(path.resolve(root, locator)) as {
      schemaVersion?: unknown;
      fixtureOnly?: unknown;
      files?: GalleryManifestEntry[];
    };
    if (
      manifest.schemaVersion !== 1 ||
      manifest.fixtureOnly !== true ||
      !Array.isArray(manifest.files) ||
      manifest.files.length !== gallery.files
    ) {
      return false;
    }
    const names = new Set<string>();
    const hashes = new Set<string>();
    const pixelHashes = new Set<string>();
    for (const [index, entry] of manifest.files.entries()) {
      const expected = EXPECTED_GALLERY[index];
      if (
        !expected ||
        typeof entry.fileName !== "string" ||
        entry.fileName !== expected[0] ||
        entry.phase !== expected[1] ||
        typeof entry.caption !== "string" ||
        entry.caption.trim().length < 20 ||
        typeof entry.path !== "string" ||
        entry.path !== `docs/assets/demo/${entry.fileName}` ||
        typeof entry.bytes !== "number" ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes <= 0 ||
        typeof entry.sha256 !== "string" ||
        !SHA256.test(entry.sha256) ||
        names.has(entry.fileName) ||
        hashes.has(entry.sha256) ||
        !isTrackedRegularFile(root, entry.path)
      ) {
        return false;
      }
      names.add(entry.fileName);
      hashes.add(entry.sha256);
      const filePath = path.resolve(root, entry.path);
      const buffer = readFileSync(filePath);
      const decodedPixels = decodeSubmissionPngPixels(buffer);
      if (
        buffer.length !== entry.bytes ||
        hashFile(filePath) !== entry.sha256 ||
        decodedPixels === null
      ) {
        return false;
      }
      const pixelHash = createHash("sha256").update(decodedPixels).digest("hex");
      if (pixelHashes.has(pixelHash)) return false;
      pixelHashes.add(pixelHash);
    }
    return (
      names.size === gallery.files &&
      hashes.size === gallery.files &&
      pixelHashes.size === gallery.files
    );
  } catch {
    return false;
  }
};

const normalizeGitHubSlug = (value: string): string | null => {
  const ssh = value.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (ssh) return `${ssh[1]}/${ssh[2]}`.toLowerCase();
  try {
    const url = new URL(value);
    if (url.hostname !== "github.com" || url.username || url.password) return null;
    const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    return parts.length === 2 ? `${parts[0]}/${parts[1]}`.toLowerCase() : null;
  } catch {
    return null;
  }
};

const verifyPublicRemote = (
  root: string,
  repositoryUrl: string | null,
  branch: string,
  expectedSha: string,
): boolean => {
  if (!repositoryUrl) return false;
  try {
    const origin = git(root, ["remote", "get-url", "origin"]);
    if (normalizeGitHubSlug(origin) !== normalizeGitHubSlug(repositoryUrl)) return false;
    const remoteLine = git(root, ["ls-remote", "--exit-code", "origin", `refs/heads/${branch}`]);
    return remoteLine.split(/\s+/)[0] === expectedSha;
  } catch {
    return false;
  }
};

type GithubCheckRunsPayload = {
  check_runs?: Array<{
    name?: string;
    conclusion?: string;
    head_sha?: string;
    details_url?: string;
    app?: { slug?: string };
  }>;
};

export const getTrustedGithubVerifyRunId = (
  payload: GithubCheckRunsPayload,
  repositorySlug: string,
  expectedSha: string,
): number | null => {
  for (const check of payload.check_runs ?? []) {
    if (
      check.name !== "verify" ||
      check.conclusion !== "success" ||
      check.head_sha !== expectedSha ||
      check.app?.slug !== "github-actions" ||
      typeof check.details_url !== "string"
    ) {
      continue;
    }
    try {
      const details = new URL(check.details_url);
      const parts = details.pathname.split("/").filter(Boolean);
      const [owner, repository] = repositorySlug.split("/");
      const runId = Number(parts[4]);
      if (
        details.protocol === "https:" &&
        details.hostname === "github.com" &&
        details.search === "" &&
        details.hash === "" &&
        parts.length === 7 &&
        parts[0]?.toLowerCase() === owner?.toLowerCase() &&
        parts[1]?.toLowerCase() === repository?.toLowerCase() &&
        parts[2] === "actions" &&
        parts[3] === "runs" &&
        Number.isSafeInteger(runId) &&
        runId > 0 &&
        parts[5] === "job" &&
        /^\d+$/.test(parts[6] ?? "")
      ) {
        return runId;
      }
    } catch {
      // Continue looking for another exact check-run match.
    }
  }
  return null;
};

export const hasTrustedGithubVerifyCheck = (
  payload: GithubCheckRunsPayload,
  repositorySlug: string,
  expectedSha: string,
): boolean => getTrustedGithubVerifyRunId(payload, repositorySlug, expectedSha) !== null;

type GithubWorkflowRunPayload = {
  id?: number;
  name?: string;
  path?: string;
  event?: string;
  head_branch?: string;
  head_sha?: string;
  conclusion?: string;
  html_url?: string;
  repository?: { full_name?: string };
};

export const isTrustedGithubWorkflowRun = (
  payload: GithubWorkflowRunPayload,
  repositorySlug: string,
  expectedSha: string,
  expectedRunId: number,
): boolean => {
  if (
    payload.id !== expectedRunId ||
    payload.name !== "ci" ||
    payload.path !== ".github/workflows/ci.yml" ||
    payload.event !== "push" ||
    payload.head_branch !== "main" ||
    payload.head_sha !== expectedSha ||
    payload.conclusion !== "success" ||
    payload.repository?.full_name?.toLowerCase() !== repositorySlug.toLowerCase() ||
    typeof payload.html_url !== "string"
  ) {
    return false;
  }
  try {
    const htmlUrl = new URL(payload.html_url);
    return (
      htmlUrl.protocol === "https:" &&
      htmlUrl.hostname === "github.com" &&
      htmlUrl.search === "" &&
      htmlUrl.hash === "" &&
      htmlUrl.pathname.toLowerCase() ===
        `/${repositorySlug.toLowerCase()}/actions/runs/${expectedRunId}`
    );
  } catch {
    return false;
  }
};

const verifyGithubCi = async (
  repositoryUrl: string | null,
  expectedSha: string,
): Promise<boolean> => {
  if (!repositoryUrl) return false;
  const slug = normalizeGitHubSlug(repositoryUrl);
  if (!slug) return false;
  try {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": "narrative-knowledge-harness-submission-gate",
      "x-github-api-version": "2022-11-28",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const response = await fetch(
      `https://api.github.com/repos/${slug}/commits/${expectedSha}/check-runs?per_page=100`,
      { headers, redirect: "error", signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) },
    );
    if (!response.ok) return false;
    const payload = (await response.json()) as GithubCheckRunsPayload;
    const runId = getTrustedGithubVerifyRunId(payload, slug, expectedSha);
    if (runId === null) return false;
    const runResponse = await fetch(
      `https://api.github.com/repos/${slug}/actions/runs/${runId}`,
      { headers, redirect: "error", signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) },
    );
    if (!runResponse.ok) return false;
    return isTrustedGithubWorkflowRun(
      (await runResponse.json()) as GithubWorkflowRunPayload,
      slug,
      expectedSha,
      runId,
    );
  } catch {
    return false;
  }
};

const verifyHostedDemo = (
  root: string,
  url: string | null,
  expectedSha: string,
): boolean => {
  if (!url) return false;
  const result = spawnSync(
    process.execPath,
    [path.resolve(root, "scripts/smoke-deployment.mjs"), url, expectedSha],
    { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  );
  return result.status === 0;
};

const verifyYoutubeVideo = (url: string | null): boolean => {
  if (!url) return false;
  const result = spawnSync(
    "yt-dlp",
    ["--dump-single-json", "--skip-download", "--no-warnings", "--no-playlist", url],
    { encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) return false;
  try {
    const metadata = JSON.parse(result.stdout) as {
      availability?: string;
      duration?: number;
      extractor?: string;
      extractor_key?: string;
    };
    const isYoutube =
      metadata.extractor_key === "Youtube" || metadata.extractor === "youtube";
    return (
      isYoutube &&
      metadata.availability === "public" &&
      typeof metadata.duration === "number" &&
      metadata.duration > 0 &&
      metadata.duration < 180
    );
  } catch {
    return false;
  }
};

const verifyDevpostPage = async (
  url: string,
  projectName: string | null,
): Promise<boolean> => {
  if (!projectName) return false;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
    });
    if (!response.ok || new URL(response.url).hostname !== "devpost.com") return false;
    return (await response.text()).includes(projectName);
  } catch {
    return false;
  }
};

const normalizedDevpostProject = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.hostname !== "devpost.com") return null;
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
};

export const hasValidDevpostOwnerReadback = (
  record: ExternalSubmissionRecord | null,
  submissionPageReachable: boolean,
  expectedDescriptionSha256: string,
  now = Date.now(),
): boolean => {
  const devpost = record?.devpost;
  if (
    !record ||
    !devpost?.submittedAt ||
    !devpost.submissionUrl ||
    !devpost.submissionReadbackMethod ||
    !submissionPageReachable
  ) {
    return false;
  }
  const submittedAt = Date.parse(devpost.submittedAt);
  const readback = devpost.readback;
  return (
    Number.isFinite(submittedAt) &&
    submittedAt <= now &&
    normalizedDevpostProject(devpost.projectUrl) ===
      normalizedDevpostProject(devpost.submissionUrl) &&
    readback.projectName === record.final.projectName &&
    readback.track === record.final.track &&
    readback.descriptionSha256 === expectedDescriptionSha256 &&
    readback.repositoryUrl === record.publicRepository.url &&
    readback.hostedDemoUrl === record.hostedDemo.url &&
    readback.videoUrl === record.video.url
  );
};

const isTrackedFile = (root: string, locator: string): boolean => {
  if (!existsSync(path.resolve(root, locator))) return false;
  try {
    return git(root, ["ls-files", "--error-unmatch", locator]) === locator;
  } catch {
    return false;
  }
};

const hasFinalNameParity = (
  root: string,
  projectName: string | null,
): boolean => {
  if (!projectName) return false;
  const locators = {
    readme: "README.md",
    appLayout: "app/layout.tsx",
    devpostDraft: "docs/submission/DEVPOST-DRAFT.md",
    submissionFields: "docs/submission/SUBMISSION-FIELDS.md",
    videoNarration: "docs/submission/VIDEO-NARRATION.md",
    startHere: "docs/START-HERE.md",
  } as const;
  if (Object.values(locators).some((locator) => !isTrackedRegularFile(root, locator))) {
    return false;
  }
  return hasStructuredProjectNameParity(
    projectName,
    Object.fromEntries(
      Object.entries(locators).map(([key, locator]) => [
        key,
        readFileSync(path.resolve(root, locator), "utf8"),
      ]),
    ) as Record<keyof typeof locators, string>,
  );
};

const projectDescriptionIsFinal = (
  root: string,
  projectName: string | null,
): boolean => {
  const locator = "docs/submission/DEVPOST-DRAFT.md";
  return (
    projectName !== null &&
    isTrackedRegularFile(root, locator) &&
    hasFinalProjectDescription(
      projectName,
      readFileSync(path.resolve(root, locator), "utf8"),
    )
  );
};

export const styleAblationVerified = (root: string): boolean =>
  Object.values(STYLE_ABLATION_EVIDENCE_LOCATORS).every((locator) =>
    isTrackedRegularFile(root, locator),
  ) &&
  verifyStyleAblationEvidenceFiles(root) &&
  verifyStyleAblationLocalProof(root);

export const readSubmissionClaimContract = (
  root: string,
): {
  liveGpt56NarrativeGeneration: boolean;
  measuredStyleControl: boolean;
} | null => {
  const locator = "docs/submission/CLAIM-CONTRACT.json";
  if (!isTrackedRegularFile(root, locator)) return null;
  try {
    const value = readJson(path.resolve(root, locator));
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    if (
      candidate.schemaVersion !== 2 ||
      typeof candidate.liveGpt56NarrativeGeneration !== "boolean" ||
      typeof candidate.measuredStyleControl !== "boolean" ||
      typeof candidate.boundary !== "string" ||
      candidate.boundary.trim().length < 40 ||
      Object.keys(candidate).sort().join(",") !==
        "boundary,liveGpt56NarrativeGeneration,measuredStyleControl,schemaVersion"
    ) {
      return null;
    }
    return {
      liveGpt56NarrativeGeneration:
        candidate.liveGpt56NarrativeGeneration,
      measuredStyleControl: candidate.measuredStyleControl,
    };
  } catch {
    return null;
  }
};

export const inspectTrackedReleaseCopy = (
  root: string,
): {
  complete: boolean;
  liveGpt56NarrativeGeneration: boolean;
  measuredStyleEffect: boolean;
  crossModelSuperiority: boolean;
} => {
  const requiredLocators = [
    "README.md",
    "docs/submission/DEVPOST-DRAFT.md",
    "docs/submission/SUBMISSION-FIELDS.md",
    "docs/submission/VIDEO-NARRATION.md",
    "docs/JUDGE-GUIDE.md",
    "components/table/TableWorkbench.tsx",
  ];
  let publicLocators = requiredLocators;
  try {
    const tracked = execFileSync(
      "git",
      ["ls-files", "-z", "--", "README.md", "docs", "app", "components"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
      .split("\0")
      .filter((locator) => /\.(?:md|mdx|tsx)$/i.test(locator));
    publicLocators = [...new Set([...requiredLocators, ...tracked])].sort();
  } catch {
    // Required locators below still fail closed.
  }
  const complete = requiredLocators.every((locator) =>
    isTrackedRegularFile(root, locator),
  );
  const sources = publicLocators.flatMap((locator) =>
    isTrackedRegularFile(root, locator)
      ? [readFileSync(path.resolve(root, locator), "utf8")]
      : [],
  );
  return { complete, ...inspectReleaseClaimLanguage(sources) };
};

export const submissionClaimContractMatches = (
  contract: ReturnType<typeof readSubmissionClaimContract>,
  releaseCopyClaims: ReturnType<typeof inspectTrackedReleaseCopy>,
  measuredStyleControl: boolean | undefined,
): boolean =>
  contract !== null &&
  releaseCopyClaims.complete &&
  measuredStyleControl === contract.measuredStyleControl &&
  contract.liveGpt56NarrativeGeneration ===
    releaseCopyClaims.liveGpt56NarrativeGeneration &&
  (contract.measuredStyleControl || !releaseCopyClaims.measuredStyleEffect);

export const collectSubmissionObservation = async (
  args: Arguments,
): Promise<SubmissionObservation> => {
  const submissionPathSafe = isPrivateIgnoredRecord(args.root, args.recordPath);
  const releasePathSafe = isPrivateIgnoredRecord(args.root, args.releaseRecordPath);
  const submission = submissionPathSafe
    ? readSubmissionRecord(args.recordPath)
    : { record: null, valid: false };
  const release = releasePathSafe
    ? readReleaseRecord(args.releaseRecordPath)
    : { record: null, valid: false };
  const record = submission.record;
  const releaseRecord = release.record;
  let head = "";
  let worktreeClean = false;
  let privatePathsUntracked = false;
  try {
    head = git(args.root, ["rev-parse", "HEAD"]);
    worktreeClean = git(args.root, ["status", "--porcelain", "--untracked-files=all"]) === "";
    privatePathsUntracked =
      submissionPathSafe &&
      releasePathSafe &&
      git(args.root, ["ls-files", "--", "private-submission", "artifacts/live"]) === "";
  } catch {
    // Fail closed below.
  }

  const privacy = spawnSync(
    process.execPath,
    [path.resolve(args.root, "scripts/privacy-scan.mjs"), "--root", args.root],
    { cwd: args.root, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
  );

  const repositoryUrl = record?.publicRepository.url ?? null;
  const hostedUrl = record?.hostedDemo.url ?? null;
  const videoUrl = record?.video.url ?? null;
  const expectedSha = releaseRecord?.commitSha ?? "";
  const submissionClaimContract = readSubmissionClaimContract(args.root);
  const releaseCopyClaims = inspectTrackedReleaseCopy(args.root);
  const descriptionLocator = path.resolve(
    args.root,
    "docs/submission/DEVPOST-DRAFT.md",
  );
  const expectedDescriptionSha256 = existsSync(descriptionLocator)
    ? hashFile(descriptionLocator)
    : "";
  const [publicCiPassed, devpostPageReachable, devpostSubmissionPageReachable] =
    await Promise.all([
    verifyGithubCi(repositoryUrl, expectedSha),
    record
      ? verifyDevpostPage(record.devpost.projectUrl, record.final.projectName)
      : Promise.resolve(false),
    record?.devpost.submissionUrl
      ? verifyDevpostPage(record.devpost.submissionUrl, record.final.projectName)
      : Promise.resolve(false),
    ]);

  return {
    submissionRecordValid: submission.valid,
    releaseRecordValid: release.valid,
    worktreeClean,
    releaseShaMatchesHead:
      releaseRecord !== null && head !== "" && releaseRecord.commitSha === head,
    privatePathsUntracked,
    evidenceManifestMatches: verifyEvidenceManifest(args.root, releaseRecord),
    galleryManifestMatches: verifyGalleryManifest(args.root, releaseRecord),
    privacyScanPassed: privacy.status === 0,
    liveEvidenceVerified: verifyLocalLiveEvidenceProof(args.root),
    liveGpt56NarrativeClaimRequested:
      (submissionClaimContract?.liveGpt56NarrativeGeneration ?? true) ||
      releaseCopyClaims.liveGpt56NarrativeGeneration,
    // This verifies the private record's explicit task designation and UUID
    // presence. It does not independently identify the serving model.
    codexGpt56TaskDesignationPresent:
      Boolean(record?.feedback.sessionId) &&
      record?.feedback.taskModel === "gpt-5.6",
    finalNameParity: hasFinalNameParity(args.root, record?.final.projectName ?? null),
    projectDescriptionFinal:
      record?.final.descriptionFinal === true &&
      projectDescriptionIsFinal(args.root, record.final.projectName),
    readmePresent: isTrackedFile(args.root, "README.md"),
    licensePresent: isTrackedRegularFile(args.root, "LICENSE"),
    publicRemoteHeadMatches:
      expectedSha !== "" &&
      verifyPublicRemote(
        args.root,
        repositoryUrl,
        record?.publicRepository.branch ?? "main",
        expectedSha,
      ),
    publicCiPassed,
    hostedDemoSmokePassed:
      expectedSha !== "" && verifyHostedDemo(args.root, hostedUrl, expectedSha),
    youtubePublicUnderThreeMinutes: verifyYoutubeVideo(videoUrl),
    youtubeNarrationConfirmed: record?.video.narrationConfirmed === true,
    youtubeRequiredContentConfirmed:
      record?.video.productDemoConfirmed === true &&
      record.video.codexUseExplained === true &&
      record.video.gpt56UseExplained === true,
    feedbackSessionPresent: Boolean(record?.feedback.sessionId),
    devpostPageReachable,
    devpostTrackConfirmed: record?.devpost.trackConfirmed === true,
    styleClaimContractMatches: submissionClaimContractMatches(
      submissionClaimContract,
      releaseCopyClaims,
      record?.claims.measuredStyleControl,
    ),
    crossModelSuperiorityClaimAbsent:
      releaseCopyClaims.complete && !releaseCopyClaims.crossModelSuperiority,
    measuredStyleClaimRequested:
      (submissionClaimContract?.measuredStyleControl ?? true) ||
      releaseCopyClaims.measuredStyleEffect,
    styleAblationVerified: styleAblationVerified(args.root),
    devpostSubmitted: hasValidDevpostOwnerReadback(
      record,
      devpostSubmissionPageReachable,
      expectedDescriptionSha256,
    ),
  };
};

const main = async (): Promise<void> => {
  let args: Arguments;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Invalid arguments."}\n`);
    process.exitCode = 2;
    return;
  }
  const observation = await collectSubmissionObservation(args);
  const result = evaluateSubmissionReadiness(args.phase, observation);
  process.stdout.write(`${formatSubmissionReadiness(result)}\n`);
  if (!result.ready) process.exitCode = 1;
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void main().catch(() => {
    process.stderr.write("SUBMISSION_READINESS_ERROR internal_verification_failure\n");
    process.exitCode = 2;
  });
}

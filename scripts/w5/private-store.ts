import { execFileSync } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  describeExactBytes,
  sha256Bytes,
  type W5ExactBytes,
  type W5RecordedProcessCall,
} from "@/scripts/w5/recording-process-runner";

const PRIVATE_ROOT_SEGMENTS = ["private-submission", "w5-ab"] as const;
const PRIVATE_CAPTURE_ID = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u;
const PRIVATE_JSON_NAME = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?\.json$/u;
const PRIVATE_TEXT_NAME = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?\.md$/u;
const PRIVATE_FILE_NAME = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?\.(?:json|md)$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PUBLIC_ID = /^(?:manifest|slot|artifact)\.[a-z0-9][a-z0-9._-]{0,94}$/u;
const FORBIDDEN_PUBLIC_TOKEN =
  /(?:^|[._-])(?:a|b|condition|model|path|private|prompt|prose|response)(?:$|[._-])/iu;

export type W5PrivateArtifactReceipt = {
  artifactId: string;
  byteLength: number;
  sha256: string;
};

export type W5PrivateCaptureReceipt = {
  captureId: string;
  artifacts: readonly W5PrivateArtifactReceipt[];
  receiptSha256: string;
};

const PublicArtifactSchema = z
  .object({
    artifactId: z.string().regex(PUBLIC_ID),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(SHA256),
  })
  .strict();

const PublicSlotSchema = z
  .object({
    maskedSlotId: z.string().regex(/^slot\.[0-9]{2}$/u),
    artifactIds: z.array(z.string().regex(PUBLIC_ID)).min(1).max(64),
    callCount: z.number().int().positive().max(16),
  })
  .strict();

export const W5PublicManifestSchema = z
  .object({
    schemaVersion: z.literal("w5-public-manifest.v1"),
    manifestId: z.string().regex(/^manifest\.[a-f0-9]{16}$/u),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    maskCommitmentSha256: z.string().regex(SHA256),
    slots: z.array(PublicSlotSchema).min(1).max(16),
    artifacts: z.array(PublicArtifactSchema).min(1).max(256),
  })
  .strict()
  .superRefine((manifest, context) => {
    const artifactIds = new Set<string>();
    manifest.artifacts.forEach((artifact, index) => {
      if (artifactIds.has(artifact.artifactId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", index, "artifactId"],
          message: "Duplicate public artifact ID.",
        });
      }
      artifactIds.add(artifact.artifactId);
    });

    const slotIds = new Set<string>();
    const referencedIds = new Set<string>();
    manifest.slots.forEach((slot, slotIndex) => {
      if (slotIds.has(slot.maskedSlotId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", slotIndex, "maskedSlotId"],
          message: "Duplicate masked slot ID.",
        });
      }
      slotIds.add(slot.maskedSlotId);
      slot.artifactIds.forEach((artifactId, artifactIndex) => {
        if (!artifactIds.has(artifactId) || referencedIds.has(artifactId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["slots", slotIndex, "artifactIds", artifactIndex],
            message: "Public artifact reference is missing or reused.",
          });
        }
        referencedIds.add(artifactId);
      });
    });
    if (referencedIds.size !== artifactIds.size) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifacts"],
        message: "Every public artifact must be referenced exactly once.",
      });
    }
  });

export type W5PublicManifest = z.infer<typeof W5PublicManifestSchema>;

const assertNoForbiddenPublicTokens = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenPublicTokens);
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => {
      if (FORBIDDEN_PUBLIC_TOKEN.test(key)) {
        throw new Error("w5_public_manifest_forbidden_field");
      }
      assertNoForbiddenPublicTokens(nested);
    });
    return;
  }
  if (typeof value === "string" && FORBIDDEN_PUBLIC_TOKEN.test(value)) {
    throw new Error("w5_public_manifest_forbidden_value");
  }
};

export const parseW5PublicManifest = (value: unknown): W5PublicManifest => {
  assertNoForbiddenPublicTokens(value);
  return W5PublicManifestSchema.parse(value);
};

const git = (root: string, args: readonly string[]): string =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

const existsByLstat = async (target: string): Promise<boolean> => {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const readRegularFile = async (target: string): Promise<Buffer> => {
  const stat = await lstat(target);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 1 ||
    stat.size > 16 * 1024 * 1024
  ) {
    throw new Error("w5_private_read_invalid");
  }
  return readFile(target);
};

const assertRepositoryRoot = async (root: string): Promise<string> => {
  const resolved = path.resolve(root);
  const stat = await lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("w5_private_repository_unsafe");
  }
  const real = await realpath(resolved);
  if (path.resolve(git(real, ["rev-parse", "--show-toplevel"])) !== real) {
    throw new Error("w5_private_repository_unsafe");
  }
  return real;
};

const assertDirectorySafe = async (target: string): Promise<void> => {
  const stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("w5_private_path_unsafe");
  }
  const realParent = await realpath(path.dirname(target));
  if ((await realpath(target)) !== path.join(realParent, path.basename(target))) {
    throw new Error("w5_private_path_unsafe");
  }
};

const preparePrivateRoot = async (rootInput: string, captureId: string) => {
  if (!PRIVATE_CAPTURE_ID.test(captureId) || captureId.includes("..")) {
    throw new Error("w5_private_capture_id_invalid");
  }
  const root = await assertRepositoryRoot(rootInput);
  let existingAncestor = root;
  for (const segment of PRIVATE_ROOT_SEGMENTS) {
    existingAncestor = path.join(existingAncestor, segment);
    if (await existsByLstat(existingAncestor)) {
      await assertDirectorySafe(existingAncestor);
    } else {
      break;
    }
  }
  const relativeTarget = [...PRIVATE_ROOT_SEGMENTS, captureId, "00-metadata.json"]
    .join("/");
  if (git(root, ["ls-files", "--", PRIVATE_ROOT_SEGMENTS[0]]) !== "") {
    throw new Error("w5_private_tree_tracked");
  }
  try {
    git(root, ["check-ignore", "-q", "--", relativeTarget]);
  } catch {
    throw new Error("w5_private_tree_not_ignored");
  }

  let current = root;
  for (const segment of PRIVATE_ROOT_SEGMENTS) {
    current = path.join(current, segment);
    if (await existsByLstat(current)) await assertDirectorySafe(current);
    else {
      await mkdir(current);
      await assertDirectorySafe(current);
    }
  }

  const captureDirectory = path.join(current, captureId);
  if (await existsByLstat(captureDirectory)) {
    throw new Error("w5_private_capture_exists");
  }
  await mkdir(captureDirectory);
  await assertDirectorySafe(captureDirectory);
  return captureDirectory;
};

export const assertPrivateW5Path = async ({
  root: rootInput,
  fileName,
}: {
  root: string;
  fileName: string;
}): Promise<string> => {
  if (!PRIVATE_FILE_NAME.test(fileName) || fileName.includes("..")) {
    throw new Error("w5_private_file_name_invalid");
  }
  const root = await assertRepositoryRoot(rootInput);
  let current = root;
  for (const segment of PRIVATE_ROOT_SEGMENTS) {
    current = path.join(current, segment);
    if (await existsByLstat(current)) await assertDirectorySafe(current);
    else break;
  }
  const repositoryRelative = [...PRIVATE_ROOT_SEGMENTS, fileName].join("/");
  if (git(root, ["ls-files", "--", PRIVATE_ROOT_SEGMENTS[0]]) !== "") {
    throw new Error("w5_private_tree_tracked");
  }
  try {
    git(root, ["check-ignore", "-q", "--", repositoryRelative]);
  } catch {
    throw new Error("w5_private_tree_not_ignored");
  }
  current = root;
  for (const segment of PRIVATE_ROOT_SEGMENTS) {
    current = path.join(current, segment);
    if (await existsByLstat(current)) await assertDirectorySafe(current);
    else {
      await mkdir(current);
      await assertDirectorySafe(current);
    }
  }
  const target = path.join(current, fileName);
  if (await existsByLstat(target)) {
    const stat = await lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("w5_private_path_unsafe");
    }
  }
  return target;
};

export const assertW5PrivateFilesAvailable = async ({
  root,
  relativeNames,
}: {
  root: string;
  relativeNames: readonly string[];
}): Promise<void> => {
  if (new Set(relativeNames).size !== relativeNames.length) {
    throw new Error("w5_private_target_list_invalid");
  }
  for (const relativeName of relativeNames) {
    const target = await assertPrivateW5Path({ root, fileName: relativeName });
    if (await existsByLstat(target)) {
      throw new Error(`w5_private_target_exists:${relativeName}`);
    }
  }
};

export const assertW5PrivateCaptureIdsAvailable = async ({
  root: rootInput,
  captureIds,
}: {
  root: string;
  captureIds: readonly string[];
}): Promise<void> => {
  if (new Set(captureIds).size !== captureIds.length) {
    throw new Error("w5_private_capture_list_invalid");
  }
  const root = await assertRepositoryRoot(rootInput);
  const privateRoot = path.join(root, ...PRIVATE_ROOT_SEGMENTS);
  if (await existsByLstat(privateRoot)) await assertDirectorySafe(privateRoot);
  for (const captureId of captureIds) {
    if (!PRIVATE_CAPTURE_ID.test(captureId) || captureId.includes("..")) {
      throw new Error("w5_private_capture_id_invalid");
    }
    const relativeTarget = [
      ...PRIVATE_ROOT_SEGMENTS,
      captureId,
      "00-metadata.json",
    ].join("/");
    try {
      git(root, ["check-ignore", "-q", "--", relativeTarget]);
    } catch {
      throw new Error("w5_private_tree_not_ignored");
    }
    if (await existsByLstat(path.join(privateRoot, captureId))) {
      throw new Error(`w5_private_capture_exists:${captureId}`);
    }
  }
};

export const readW5PrivateCaptureFinal = async ({
  root: rootInput,
  captureId,
}: {
  root: string;
  captureId: string;
}): Promise<Buffer> => {
  if (!PRIVATE_CAPTURE_ID.test(captureId) || captureId.includes("..")) {
    throw new Error("w5_private_capture_id_invalid");
  }
  const root = await assertRepositoryRoot(rootInput);
  const relativeTarget = [
    ...PRIVATE_ROOT_SEGMENTS,
    captureId,
    "03-final.bin",
  ].join("/");
  try {
    git(root, ["check-ignore", "-q", "--", relativeTarget]);
  } catch {
    throw new Error("w5_private_tree_not_ignored");
  }
  const privateRoot = path.join(root, ...PRIVATE_ROOT_SEGMENTS);
  const captureDirectory = path.join(privateRoot, captureId);
  await assertDirectorySafe(privateRoot);
  await assertDirectorySafe(captureDirectory);
  return readRegularFile(path.join(captureDirectory, "03-final.bin"));
};

const PRIVATE_CAPTURE_ARTIFACT_FILES = [
  "00-metadata.json",
  "01-prompt.bin",
  "02-schema.bin",
  "03-final.bin",
  "04-stdout.bin",
  "05-stderr.bin",
] as const;

const REQUIRED_PRIVATE_CAPTURE_ARTIFACT_FILES = new Set([
  "00-metadata.json",
  "01-prompt.bin",
  "02-schema.bin",
  "03-final.bin",
]);

export const readW5PrivateCaptureReceipt = async ({
  root: rootInput,
  captureId,
}: {
  root: string;
  captureId: string;
}): Promise<W5PrivateCaptureReceipt> => {
  if (!PRIVATE_CAPTURE_ID.test(captureId) || captureId.includes("..")) {
    throw new Error("w5_private_capture_id_invalid");
  }
  const root = await assertRepositoryRoot(rootInput);
  const relativeTarget = [
    ...PRIVATE_ROOT_SEGMENTS,
    captureId,
    "00-metadata.json",
  ].join("/");
  try {
    git(root, ["check-ignore", "-q", "--", relativeTarget]);
  } catch {
    throw new Error("w5_private_tree_not_ignored");
  }
  const privateRoot = path.join(root, ...PRIVATE_ROOT_SEGMENTS);
  const captureDirectory = path.join(privateRoot, captureId);
  await assertDirectorySafe(privateRoot);
  await assertDirectorySafe(captureDirectory);
  const entries = await readdir(captureDirectory, { withFileTypes: true });
  const allowed = new Set<string>(PRIVATE_CAPTURE_ARTIFACT_FILES);
  if (
    entries.some((entry) => !allowed.has(entry.name) || !entry.isFile()) ||
    [...REQUIRED_PRIVATE_CAPTURE_ARTIFACT_FILES].some(
      (required) => !entries.some(({ name }) => name === required),
    )
  ) {
    throw new Error("w5_private_capture_artifacts_invalid");
  }
  const artifacts: W5PrivateArtifactReceipt[] = [];
  for (const { name } of [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const target = path.join(captureDirectory, name);
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024 * 1024) {
      throw new Error("w5_private_capture_artifacts_invalid");
    }
    const bytes = await readFile(target);
    artifacts.push({
      artifactId: name.replace(/\.[^.]+$/u, ""),
      byteLength: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    });
  }
  return {
    captureId,
    artifacts,
    receiptSha256: sha256Bytes(
      Buffer.from(JSON.stringify({ captureId, artifacts }), "utf8"),
    ),
  };
};

const privateJsonBytes = (value: unknown): Buffer =>
  Buffer.from(`${JSON.stringify(value)}\n`, "utf8");

const privateTextBytes = (text: string): Buffer =>
  Buffer.from(text.endsWith("\n") ? text : `${text}\n`, "utf8");

export const assertW5PrivateJsonTargetCompatible = async ({
  root,
  relativeName,
  value,
}: {
  root: string;
  relativeName: string;
  value: unknown;
}): Promise<void> => {
  if (!PRIVATE_JSON_NAME.test(relativeName)) {
    throw new Error("w5_private_file_name_invalid");
  }
  const target = await assertPrivateW5Path({ root, fileName: relativeName });
  if (!(await existsByLstat(target))) return;
  const expected = privateJsonBytes(value);
  const actual = await readRegularFile(target);
  if (!actual.equals(expected)) {
    throw new Error("w5_private_target_conflict");
  }
};

export const assertW5PrivateTextTargetCompatible = async ({
  root,
  relativeName,
  text,
}: {
  root: string;
  relativeName: string;
  text: string;
}): Promise<void> => {
  if (!PRIVATE_TEXT_NAME.test(relativeName)) {
    throw new Error("w5_private_file_name_invalid");
  }
  const target = await assertPrivateW5Path({ root, fileName: relativeName });
  if (!(await existsByLstat(target))) {
    throw new Error("w5_private_target_missing");
  }
  if (!(await readRegularFile(target)).equals(privateTextBytes(text))) {
    throw new Error("w5_private_target_conflict");
  }
};

export const writePrivateJsonOnce = async ({
  root,
  fileName,
  value,
}: {
  root: string;
  fileName: string;
  value: unknown;
}): Promise<W5PrivateArtifactReceipt> => {
  if (!PRIVATE_JSON_NAME.test(fileName)) {
    throw new Error("w5_private_file_name_invalid");
  }
  const target = await assertPrivateW5Path({ root, fileName });
  if (await existsByLstat(target)) {
    throw new Error("w5_private_target_exists");
  }
  const source = privateJsonBytes(value);
  try {
    await writeFile(target, source, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error("w5_private_target_exists");
    }
    throw error;
  }
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== source.byteLength) {
    throw new Error("w5_private_write_invalid");
  }
  return {
    artifactId: fileName.replace(/\.json$/u, ""),
    byteLength: source.byteLength,
    sha256: sha256Bytes(source),
  };
};

export const writeW5PrivateJsonOnce = ({
  root,
  relativeName,
  value,
}: {
  root: string;
  relativeName: string;
  value: unknown;
}): Promise<W5PrivateArtifactReceipt> =>
  writePrivateJsonOnce({ root, fileName: relativeName, value });

export const writeW5PrivateJsonOnceOrMatch = async ({
  root,
  relativeName,
  value,
}: {
  root: string;
  relativeName: string;
  value: unknown;
}): Promise<W5PrivateArtifactReceipt> => {
  await assertW5PrivateJsonTargetCompatible({ root, relativeName, value });
  const target = await assertPrivateW5Path({ root, fileName: relativeName });
  const source = privateJsonBytes(value);
  if (!(await existsByLstat(target))) {
    try {
      await writeFile(target, source, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
    }
  }
  const actual = await readRegularFile(target);
  if (!actual.equals(source)) throw new Error("w5_private_target_conflict");
  return {
    artifactId: relativeName.replace(/\.json$/u, ""),
    byteLength: source.byteLength,
    sha256: sha256Bytes(source),
  };
};

export const readW5PrivateJsonWithReceipt = async ({
  root,
  relativeName,
}: {
  root: string;
  relativeName: string;
}): Promise<{ value: unknown; receipt: W5PrivateArtifactReceipt }> => {
  if (!PRIVATE_JSON_NAME.test(relativeName)) {
    throw new Error("w5_private_file_name_invalid");
  }
  const target = await assertPrivateW5Path({ root, fileName: relativeName });
  const source = await readRegularFile(target);
  return {
    value: JSON.parse(source.toString("utf8")) as unknown,
    receipt: {
      artifactId: relativeName.replace(/\.json$/u, ""),
      byteLength: source.byteLength,
      sha256: sha256Bytes(source),
    },
  };
};

export const readW5PrivateJson = async ({
  root,
  relativeName,
}: {
  root: string;
  relativeName: string;
}): Promise<unknown> =>
  (await readW5PrivateJsonWithReceipt({ root, relativeName })).value;

export const readW5PrivateJsonIfExists = async ({
  root,
  relativeName,
}: {
  root: string;
  relativeName: string;
}): Promise<unknown | null> => {
  if (!PRIVATE_JSON_NAME.test(relativeName)) {
    throw new Error("w5_private_file_name_invalid");
  }
  const target = await assertPrivateW5Path({ root, fileName: relativeName });
  if (!(await existsByLstat(target))) return null;
  return JSON.parse((await readRegularFile(target)).toString("utf8")) as unknown;
};

export const writeW5PrivateTextOnce = async ({
  root,
  relativeName,
  text,
}: {
  root: string;
  relativeName: string;
  text: string;
}): Promise<W5PrivateArtifactReceipt> => {
  if (!PRIVATE_TEXT_NAME.test(relativeName) || relativeName.includes("..")) {
    throw new Error("w5_private_file_name_invalid");
  }
  const markdownTarget = await assertPrivateW5Path({
    root,
    fileName: relativeName,
  });
  if (await existsByLstat(markdownTarget)) {
    throw new Error("w5_private_target_exists");
  }
  const source = privateTextBytes(text);
  await writeFile(markdownTarget, source, { flag: "wx" });
  const stat = await lstat(markdownTarget);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== source.byteLength) {
    throw new Error("w5_private_write_invalid");
  }
  return {
    artifactId: relativeName.replace(/\.md$/u, ""),
    byteLength: source.byteLength,
    sha256: sha256Bytes(source),
  };
};

export const writeW5PrivateTextOnceOrMatch = async ({
  root,
  relativeName,
  text,
}: {
  root: string;
  relativeName: string;
  text: string;
}): Promise<W5PrivateArtifactReceipt> => {
  if (!PRIVATE_TEXT_NAME.test(relativeName) || relativeName.includes("..")) {
    throw new Error("w5_private_file_name_invalid");
  }
  const target = await assertPrivateW5Path({ root, fileName: relativeName });
  const source = privateTextBytes(text);
  if (!(await existsByLstat(target))) {
    try {
      await writeFile(target, source, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
    }
  }
  if (!(await readRegularFile(target)).equals(source)) {
    throw new Error("w5_private_target_conflict");
  }
  return {
    artifactId: relativeName.replace(/\.md$/u, ""),
    byteLength: source.byteLength,
    sha256: sha256Bytes(source),
  };
};

const metadataBytes = (capture: W5RecordedProcessCall): Buffer =>
  Buffer.from(
    `${JSON.stringify({
      invocation: capture.invocation,
      processCompleted: capture.processCompleted,
      processResult: capture.processResult,
    })}\n`,
    "utf8",
  );

const privateArtifacts = (
  capture: W5RecordedProcessCall,
): Array<{ fileName: string; source: W5ExactBytes }> => [
  { fileName: "00-metadata.json", source: describeExactBytes(metadataBytes(capture)) },
  { fileName: "01-prompt.bin", source: capture.prompt },
  { fileName: "02-schema.bin", source: capture.outputSchema },
  ...(capture.finalMessage
    ? [{ fileName: "03-final.bin", source: capture.finalMessage }]
    : []),
  ...(capture.stdout ? [{ fileName: "04-stdout.bin", source: capture.stdout }] : []),
  ...(capture.stderr ? [{ fileName: "05-stderr.bin", source: capture.stderr }] : []),
];

export const writeW5PrivateCapture = async ({
  root,
  captureId,
  capture,
}: {
  root: string;
  captureId: string;
  capture: W5RecordedProcessCall;
}): Promise<W5PrivateCaptureReceipt> => {
  const captureDirectory = await preparePrivateRoot(root, captureId);
  const artifacts = privateArtifacts(capture);
  const receipts: W5PrivateArtifactReceipt[] = [];
  for (const artifact of artifacts) {
    if (
      artifact.source.byteLength !== artifact.source.bytes.byteLength ||
      artifact.source.sha256 !== sha256Bytes(artifact.source.bytes)
    ) {
      throw new Error("w5_private_capture_hash_mismatch");
    }
    const target = path.join(captureDirectory, artifact.fileName);
    await writeFile(target, artifact.source.bytes, { flag: "wx" });
    receipts.push({
      artifactId: artifact.fileName.replace(/\.[^.]+$/u, ""),
      byteLength: artifact.source.byteLength,
      sha256: artifact.source.sha256,
    });
  }
  return {
    captureId,
    artifacts: receipts,
    receiptSha256: sha256Bytes(
      Buffer.from(JSON.stringify({ captureId, artifacts: receipts }), "utf8"),
    ),
  };
};

export const buildW5PublicManifest = ({
  manifestId,
  sourceRevision,
  maskCommitmentSha256,
  slots,
}: {
  manifestId: string;
  sourceRevision: string;
  maskCommitmentSha256: string;
  slots: ReadonlyArray<{
    maskedSlotId: string;
    captures: readonly W5PrivateCaptureReceipt[];
  }>;
}): W5PublicManifest => {
  const artifacts: W5PublicManifest["artifacts"] = [];
  const publicSlots: W5PublicManifest["slots"] = slots.map((slot) => {
    const artifactIds: string[] = [];
    for (const capture of slot.captures) {
      for (const artifact of capture.artifacts) {
        const artifactId = `artifact.${String(artifacts.length + 1).padStart(3, "0")}`;
        artifacts.push({
          artifactId,
          bytes: artifact.byteLength,
          sha256: artifact.sha256,
        });
        artifactIds.push(artifactId);
      }
    }
    return {
      maskedSlotId: slot.maskedSlotId,
      artifactIds,
      callCount: slot.captures.length,
    };
  });
  return parseW5PublicManifest({
    schemaVersion: "w5-public-manifest.v1",
    manifestId,
    sourceRevision,
    maskCommitmentSha256,
    slots: publicSlots,
    artifacts,
  });
};

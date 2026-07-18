import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "@/src/domain/canonical-json";
import { sha256Bytes, type W5ExactBytes } from "@/scripts/w5/recording-process-runner";

export const W5_PUBLIC_SESSION_DIRECTORY =
  "_dev/dispatch-2026-07-18/ab-session" as const;

export const w5PublicCaptureFileNames = (maskCommitmentSha256: string) => {
  if (!/^[a-f0-9]{64}$/u.test(maskCommitmentSha256)) {
    throw new Error("w5_public_mask_commitment_invalid");
  }
  const token = maskCommitmentSha256.slice(0, 12).toUpperCase();
  return {
    planCommitment: `W5-PLAN-COMMITMENT-${token}.json`,
    blindCommitments: `W5-BLIND-COMMITMENTS-${token}.json`,
    creatorRatingSheet: `W5-CREATOR-RATING-SHEET-${token}.md`,
  } as const;
};

const PUBLIC_FILE_NAME = /^[A-Z0-9][A-Z0-9._-]{1,94}\.(?:json|md)$/u;
const FORBIDDEN_PUBLIC_CONTENT = [
  "WORLD_NARRATION_REQUEST_JSON",
  "INVARIANT_RECORDS_JSON",
  "PRIOR_MODEL_OUTPUT_JSON",
  "secretMaskSeedHex",
  "private-submission/w5-ab",
] as const;
const FORBIDDEN_PUBLIC_PATTERN =
  /(?:file:\/\/|\/Users\/|\/private\/(?:tmp|var)\/|[A-Za-z]:\\Users\\)/iu;

const exists = async (target: string): Promise<boolean> => {
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

const assertDirectory = async (target: string): Promise<void> => {
  const stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("w5_public_path_unsafe");
  }
  const parent = await realpath(path.dirname(target));
  if ((await realpath(target)) !== path.join(parent, path.basename(target))) {
    throw new Error("w5_public_path_unsafe");
  }
};

const resolvePublicTarget = async ({
  repoRoot,
  fileName,
}: {
  repoRoot: string;
  fileName: string;
}): Promise<string> => {
  if (!PUBLIC_FILE_NAME.test(fileName) || fileName.includes("..")) {
    throw new Error("w5_public_file_name_invalid");
  }
  let current = repoRoot;
  for (const segment of W5_PUBLIC_SESSION_DIRECTORY.split("/")) {
    current = path.join(current, segment);
    if (await exists(current)) await assertDirectory(current);
    else {
      await mkdir(current);
      await assertDirectory(current);
    }
  }
  return path.join(current, fileName);
};

const assertPublicContent = (source: string): void => {
  if (
    FORBIDDEN_PUBLIC_CONTENT.some((marker) => source.includes(marker)) ||
    FORBIDDEN_PUBLIC_PATTERN.test(source)
  ) {
    throw new Error("w5_public_content_forbidden");
  }
};

const publicBytes = (source: string): Buffer =>
  Buffer.from(source.endsWith("\n") ? source : `${source}\n`, "utf8");

const assertRegularPublicFile = async (target: string): Promise<Buffer> => {
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 4_000_000) {
    throw new Error("w5_public_path_unsafe");
  }
  return readFile(target);
};

export const assertW5PublicTargetsAvailable = async ({
  repoRoot,
  fileNames,
}: {
  repoRoot: string;
  fileNames: readonly string[];
}): Promise<void> => {
  if (new Set(fileNames).size !== fileNames.length) {
    throw new Error("w5_public_target_list_invalid");
  }
  for (const fileName of fileNames) {
    const target = await resolvePublicTarget({ repoRoot, fileName });
    if (await exists(target)) throw new Error(`w5_public_target_exists:${fileName}`);
  }
};

export const assertW5PublicWriteCompatible = async ({
  repoRoot,
  fileName,
  source,
}: {
  repoRoot: string;
  fileName: string;
  source: string;
}): Promise<void> => {
  assertPublicContent(source);
  const target = await resolvePublicTarget({ repoRoot, fileName });
  if (!(await exists(target))) return;
  if (!(await assertRegularPublicFile(target)).equals(publicBytes(source))) {
    throw new Error(`w5_public_target_conflict:${fileName}`);
  }
};

export const assertW5PublicTargetMatches = async ({
  repoRoot,
  fileName,
  source,
}: {
  repoRoot: string;
  fileName: string;
  source: string;
}): Promise<W5ExactBytes> => {
  assertPublicContent(source);
  const target = await resolvePublicTarget({ repoRoot, fileName });
  if (!(await exists(target))) {
    throw new Error(`w5_public_target_missing:${fileName}`);
  }
  const expected = publicBytes(source);
  const actual = await assertRegularPublicFile(target);
  if (!actual.equals(expected)) {
    throw new Error(`w5_public_target_conflict:${fileName}`);
  }
  return {
    bytes: actual,
    byteLength: actual.byteLength,
    sha256: sha256Bytes(actual),
  };
};

const writePublicOnce = async ({
  repoRoot,
  fileName,
  source,
}: {
  repoRoot: string;
  fileName: string;
  source: string;
}): Promise<W5ExactBytes> => {
  assertPublicContent(source);
  const target = await resolvePublicTarget({ repoRoot, fileName });
  if (await exists(target)) throw new Error("w5_public_target_exists");
  const bytes = publicBytes(source);
  await writeFile(target, bytes, { flag: "wx" });
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes.byteLength) {
    throw new Error("w5_public_write_invalid");
  }
  return { bytes, byteLength: bytes.byteLength, sha256: sha256Bytes(bytes) };
};

const writePublicOnceOrMatch = async ({
  repoRoot,
  fileName,
  source,
}: {
  repoRoot: string;
  fileName: string;
  source: string;
}): Promise<W5ExactBytes> => {
  await assertW5PublicWriteCompatible({ repoRoot, fileName, source });
  const target = await resolvePublicTarget({ repoRoot, fileName });
  const bytes = publicBytes(source);
  if (!(await exists(target))) {
    try {
      await writeFile(target, bytes, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
    }
  }
  if (!(await assertRegularPublicFile(target)).equals(bytes)) {
    throw new Error(`w5_public_target_conflict:${fileName}`);
  }
  return { bytes, byteLength: bytes.byteLength, sha256: sha256Bytes(bytes) };
};

export const writeW5PublicJsonOnce = ({
  repoRoot,
  fileName,
  value,
}: {
  repoRoot: string;
  fileName: string;
  value: unknown;
}): Promise<W5ExactBytes> =>
  writePublicOnce({ repoRoot, fileName, source: canonicalJson(value) });

export const writeW5PublicMarkdownOnce = ({
  repoRoot,
  fileName,
  markdown,
}: {
  repoRoot: string;
  fileName: string;
  markdown: string;
}): Promise<W5ExactBytes> =>
  writePublicOnce({ repoRoot, fileName, source: markdown });

export const writeW5PublicJsonOnceOrMatch = ({
  repoRoot,
  fileName,
  value,
}: {
  repoRoot: string;
  fileName: string;
  value: unknown;
}): Promise<W5ExactBytes> =>
  writePublicOnceOrMatch({ repoRoot, fileName, source: canonicalJson(value) });

export const writeW5PublicMarkdownOnceOrMatch = ({
  repoRoot,
  fileName,
  markdown,
}: {
  repoRoot: string;
  fileName: string;
  markdown: string;
}): Promise<W5ExactBytes> =>
  writePublicOnceOrMatch({ repoRoot, fileName, source: markdown });

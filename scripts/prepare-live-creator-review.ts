import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, link, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPrivateLiveCreatorReview } from "@/src/application/live-creator-review";
import { RunResultSchema } from "@/src/contracts/run";
import { canonicalJson } from "@/src/domain/canonical-json";
import { verifyLocalLiveEvidenceProof } from "@/src/evidence/live-evidence-verifier";

const LOCATORS = {
  rawRun: "artifacts/live/live-run.json",
  review: "artifacts/live/creator-review.md",
  decision: "artifacts/live/creator-decision.json",
} as const;

export type LiveCreatorReviewPreparationCode =
  | "repository_root_invalid"
  | "local_live_proof_invalid"
  | "private_path_unsafe"
  | "private_path_not_ignored"
  | "review_target_exists"
  | "live_result_invalid"
  | "review_pair_write_failed"
  | "review_pair_rollback_failed";

export class LiveCreatorReviewPreparationError extends Error {
  constructor(readonly code: LiveCreatorReviewPreparationCode) {
    super(code);
    this.name = "LiveCreatorReviewPreparationError";
  }
}

type ReviewFileSystem = {
  lstat: typeof lstat;
  link: typeof link;
  readFile: typeof readFile;
  realpath: typeof realpath;
  rm: typeof rm;
  writeFile: typeof writeFile;
};

const nodeFileSystem: ReviewFileSystem = {
  lstat,
  link,
  readFile,
  realpath,
  rm,
  writeFile,
};

const fail = (code: LiveCreatorReviewPreparationCode): never => {
  throw new LiveCreatorReviewPreparationError(code);
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const gitOk = (root: string, args: string[]): boolean =>
  spawnSync("git", ["-C", root, ...args], { stdio: "ignore" }).status === 0;

const isIgnoredAndUntracked = (root: string, locator: string): boolean =>
  gitOk(root, ["check-ignore", "-q", "--", locator]) &&
  !gitOk(root, ["ls-files", "--error-unmatch", "--", locator]);

const assertExactRepositoryRoot = async (
  root: string,
  fileSystem: ReviewFileSystem,
): Promise<string> => {
  try {
    const suppliedStat = await fileSystem.lstat(root);
    if (!suppliedStat.isDirectory() || suppliedStat.isSymbolicLink()) {
      return fail("repository_root_invalid");
    }
    const realRoot = await fileSystem.realpath(root);
    if (path.resolve(root) !== realRoot) return fail("repository_root_invalid");
    const result = spawnSync("git", ["-C", realRoot, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (
      result.status !== 0 ||
      typeof result.stdout !== "string" ||
      (await fileSystem.realpath(result.stdout.trim())) !== realRoot
    ) {
      return fail("repository_root_invalid");
    }
    return realRoot;
  } catch (error) {
    if (error instanceof LiveCreatorReviewPreparationError) throw error;
    return fail("repository_root_invalid");
  }
};

const assertRegularPrivateFile = async ({
  root,
  locator,
  fileSystem,
}: {
  root: string;
  locator: string;
  fileSystem: ReviewFileSystem;
}): Promise<void> => {
  try {
    const filePath = path.resolve(root, locator);
    const stat = await fileSystem.lstat(filePath);
    const relative = path
      .relative(root, await fileSystem.realpath(filePath))
      .split(path.sep)
      .join("/");
    if (!stat.isFile() || stat.isSymbolicLink() || relative !== locator) {
      return fail("private_path_unsafe");
    }
  } catch (error) {
    if (error instanceof LiveCreatorReviewPreparationError) throw error;
    return fail("private_path_unsafe");
  }
  if (!isIgnoredAndUntracked(root, locator)) {
    fail("private_path_not_ignored");
  }
};

const assertSafeAbsentPrivateTarget = async ({
  root,
  locator,
  fileSystem,
}: {
  root: string;
  locator: string;
  fileSystem: ReviewFileSystem;
}): Promise<void> => {
  const target = path.resolve(root, locator);
  const parent = path.dirname(target);
  try {
    const parentStat = await fileSystem.lstat(parent);
    const parentRelative = path
      .relative(root, await fileSystem.realpath(parent))
      .split(path.sep)
      .join("/");
    if (
      !parentStat.isDirectory() ||
      parentStat.isSymbolicLink() ||
      parentRelative !== path.posix.dirname(locator)
    ) {
      return fail("private_path_unsafe");
    }
  } catch (error) {
    if (error instanceof LiveCreatorReviewPreparationError) throw error;
    return fail("private_path_unsafe");
  }
  try {
    await fileSystem.lstat(target);
    fail("review_target_exists");
  } catch (error) {
    if (error instanceof LiveCreatorReviewPreparationError) throw error;
    if (!isMissing(error)) fail("private_path_unsafe");
  }
  if (!isIgnoredAndUntracked(root, locator)) {
    fail("private_path_not_ignored");
  }
};

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

const writeReviewPair = async ({
  root,
  reviewSource,
  fileSystem,
}: {
  root: string;
  reviewSource: string;
  fileSystem: ReviewFileSystem;
}): Promise<void> => {
  const nonce = randomUUID();
  const reviewTarget = path.resolve(root, LOCATORS.review);
  const decisionTarget = path.resolve(root, LOCATORS.decision);
  const reviewTemporary = `${reviewTarget}.${nonce}.tmp`;
  const decisionTemporary = `${decisionTarget}.${nonce}.tmp`;
  let reviewLinked = false;
  let decisionLinked = false;
  let rollbackFailed = false;
  try {
    await fileSystem.writeFile(reviewTemporary, reviewSource, {
      encoding: "utf8",
      flag: "wx",
    });
    await fileSystem.writeFile(decisionTemporary, pretty({ action: "pending" }), {
      encoding: "utf8",
      flag: "wx",
    });
    await fileSystem.link(reviewTemporary, reviewTarget);
    reviewLinked = true;
    await fileSystem.link(decisionTemporary, decisionTarget);
    decisionLinked = true;
  } catch {
    if (decisionLinked) {
      await fileSystem.rm(decisionTarget, { force: false }).catch(() => {
        rollbackFailed = true;
      });
    }
    if (reviewLinked) {
      await fileSystem.rm(reviewTarget, { force: false }).catch(() => {
        rollbackFailed = true;
      });
    }
    if (rollbackFailed) fail("review_pair_rollback_failed");
    fail("review_pair_write_failed");
  } finally {
    await Promise.all([
      fileSystem.rm(reviewTemporary, { force: true }).catch(() => undefined),
      fileSystem.rm(decisionTemporary, { force: true }).catch(() => undefined),
    ]);
  }
};

export const prepareLiveCreatorReview = async ({
  root = process.cwd(),
  verifyLocalProof = verifyLocalLiveEvidenceProof,
  renderReview = renderPrivateLiveCreatorReview,
  fileSystem: fileSystemOverrides = {},
}: {
  root?: string;
  verifyLocalProof?: (root: string) => boolean;
  renderReview?: (input: unknown) => string;
  fileSystem?: Partial<ReviewFileSystem>;
} = {}): Promise<void> => {
  const fileSystem = { ...nodeFileSystem, ...fileSystemOverrides };
  const realRoot = await assertExactRepositoryRoot(root, fileSystem);
  if (!verifyLocalProof(realRoot)) fail("local_live_proof_invalid");
  await assertRegularPrivateFile({
    root: realRoot,
    locator: LOCATORS.rawRun,
    fileSystem,
  });
  await Promise.all(
    [LOCATORS.review, LOCATORS.decision].map((locator) =>
      assertSafeAbsentPrivateTarget({ root: realRoot, locator, fileSystem }),
    ),
  );

  let rawSource: string;
  let reviewSource: string;
  try {
    rawSource = await fileSystem.readFile(
      path.resolve(realRoot, LOCATORS.rawRun),
      "utf8",
    );
    const liveRun = RunResultSchema.parse(JSON.parse(rawSource) as unknown);
    reviewSource = renderReview(liveRun);
  } catch {
    return fail("live_result_invalid");
  }

  const currentRawSource = await fileSystem
    .readFile(path.resolve(realRoot, LOCATORS.rawRun), "utf8")
    .catch(() => fail("live_result_invalid"));
  if (currentRawSource !== rawSource || !verifyLocalProof(realRoot)) {
    fail("local_live_proof_invalid");
  }
  await Promise.all(
    [LOCATORS.review, LOCATORS.decision].map((locator) =>
      assertSafeAbsentPrivateTarget({ root: realRoot, locator, fileSystem }),
    ),
  );
  await writeReviewPair({ root: realRoot, reviewSource, fileSystem });
};

export const formatLiveCreatorReviewLine = (
  result:
    | { ok: true; status: "awaiting_creator_decision" }
    | { ok: false; code: LiveCreatorReviewPreparationCode | "unexpected_failure" },
): string =>
  `${JSON.stringify({
    schemaVersion: 1,
    evidenceType: "private_live_creator_review",
    ...result,
  })}\n`;

export const runLiveCreatorReviewCli = async ({
  root = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  verifyLocalProof,
  renderReview,
  fileSystem,
}: {
  root?: string;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  verifyLocalProof?: (root: string) => boolean;
  renderReview?: (input: unknown) => string;
  fileSystem?: Partial<ReviewFileSystem>;
} = {}): Promise<number> => {
  try {
    await prepareLiveCreatorReview({
      root,
      verifyLocalProof,
      renderReview,
      fileSystem,
    });
    stdout.write(
      formatLiveCreatorReviewLine({
        ok: true,
        status: "awaiting_creator_decision",
      }),
    );
    return 0;
  } catch (error) {
    const code =
      error instanceof LiveCreatorReviewPreparationError
        ? error.code
        : "unexpected_failure";
    stderr.write(formatLiveCreatorReviewLine({ ok: false, code }));
    return 1;
  }
};

export const isDirectLiveCreatorReviewExecution = (
  moduleUrl: string,
  entryPath: string | undefined = process.argv[1],
): boolean =>
  entryPath !== undefined &&
  path.resolve(entryPath) === path.resolve(fileURLToPath(moduleUrl));

if (isDirectLiveCreatorReviewExecution(import.meta.url)) {
  void runLiveCreatorReviewCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

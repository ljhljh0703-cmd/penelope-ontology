import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCodexCliCaptureAttempt,
  parseCodexCliCaptureModeArgs,
  type CodexCliCaptureMode,
} from "@/src/adapters/codex-cli/attempt";
import {
  buildCodexCliAuthorityBundle,
  buildCodexCliReviewPacket,
} from "@/src/adapters/codex-cli/authority";
import {
  loadRegisteredCodexCliInput,
  loadCodexCliPreviousReceiptBinding,
  type CodexCliPreflightLoaders,
} from "@/src/adapters/codex-cli/preflight";
import { canonicalJson } from "@/src/domain/canonical-json";
import {
  CodexCliCommandResolutionError,
  resolveCodexCliCommand,
} from "@/src/adapters/codex-cli/command";

export class CodexCliReviewError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CodexCliReviewError";
  }
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const gitOk = (root: string, args: string[]): boolean =>
  spawnSync("git", ["-C", root, ...args], { stdio: "ignore" }).status === 0;

const exactRoot = async (root: string): Promise<string> => {
  try {
    const realRoot = await realpath(root);
    const stat = await lstat(root);
    const result = spawnSync(
      "git",
      ["-C", realRoot, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      result.status !== 0 ||
      typeof result.stdout !== "string" ||
      (await realpath(result.stdout.trim())) !== realRoot
    ) {
      throw new Error("invalid root");
    }
    return realRoot;
  } catch {
    throw new CodexCliReviewError("repository_root_invalid");
  }
};

const assertPrivateLocator = (root: string, locator: string): void => {
  if (
    !gitOk(root, ["check-ignore", "-q", "--", locator]) ||
    gitOk(root, ["ls-files", "--error-unmatch", "--", locator])
  ) {
    throw new CodexCliReviewError("review_not_private");
  }
};

export const prepareCodexCliReview = async ({
  root,
  command = "codex",
  loaders,
  mode = "primary",
}: {
  root: string;
  command?: string;
  loaders?: CodexCliPreflightLoaders;
  mode?: CodexCliCaptureMode;
}): Promise<{ approvalAuthoritySha256: string }> => {
  const realRoot = await exactRoot(root);
  const attempt = getCodexCliCaptureAttempt(mode);
  assertPrivateLocator(realRoot, attempt.reviewLocator);
  const reviewPath = path.resolve(realRoot, attempt.reviewLocator);
  const approvalPath = path.resolve(
    realRoot,
    attempt.approvalLocator,
  );
  if (
    !reviewPath.startsWith(`${realRoot}${path.sep}`) ||
    !approvalPath.startsWith(`${realRoot}${path.sep}`)
  ) {
    throw new CodexCliReviewError("review_path_unsafe");
  }
  for (const target of [reviewPath, approvalPath]) {
    try {
      await lstat(target);
      throw new CodexCliReviewError(
        target === reviewPath ? "review_exists" : "approval_exists",
      );
    } catch (error) {
      if (error instanceof CodexCliReviewError) throw error;
      if (!isMissing(error)) {
        throw new CodexCliReviewError("review_path_unsafe");
      }
    }
  }

  const input = await loadRegisteredCodexCliInput(loaders);
  const previousAttemptReceiptSha256 = loadCodexCliPreviousReceiptBinding({
    root: realRoot,
    mode,
    input,
  });
  const bundle = buildCodexCliAuthorityBundle({
    ...input,
    command,
    mode,
    previousAttemptReceiptSha256,
  });
  const packet = buildCodexCliReviewPacket(bundle);
  const directory = path.dirname(reviewPath);
  await mkdir(directory, { recursive: true });
  const directoryStat = await lstat(directory);
  if (
    !directoryStat.isDirectory() ||
    directoryStat.isSymbolicLink() ||
    (await realpath(directory)) !== directory
  ) {
    throw new CodexCliReviewError("review_path_unsafe");
  }
  try {
    await writeFile(
      reviewPath,
      `${JSON.stringify(JSON.parse(canonicalJson(packet)), null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new CodexCliReviewError("review_exists");
    }
    throw new CodexCliReviewError("review_write_failed");
  }
  return { approvalAuthoritySha256: bundle.approvalAuthoritySha256 };
};

export const runCodexCliReviewCli = async ({
  args = process.argv.slice(2),
  root = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  args?: readonly string[];
  root?: string;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
} = {}): Promise<number> => {
  try {
    const mode = parseCodexCliCaptureModeArgs(args);
    const command = await resolveCodexCliCommand();
    const result = await prepareCodexCliReview({ root, mode, command });
    stdout.write(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_review", created: true, approvalAuthoritySha256: result.approvalAuthoritySha256 })}\n`,
    );
    return 0;
  } catch (error) {
    const code = error instanceof CodexCliReviewError
      ? error.code
      : error instanceof CodexCliCommandResolutionError
        ? error.code
      : "unexpected_failure";
    stderr.write(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_review", created: false, code })}\n`,
    );
    return 1;
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void runCodexCliReviewCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

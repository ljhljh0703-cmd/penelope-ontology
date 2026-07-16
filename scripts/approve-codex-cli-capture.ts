import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCodexCliCaptureApproval } from "@/src/adapters/codex-cli/approval";
import {
  getCodexCliCaptureAttempt,
  type CodexCliCaptureMode,
} from "@/src/adapters/codex-cli/attempt";
import {
  buildCodexCliAuthorityBundle,
  isCodexCliReviewPacketBound,
} from "@/src/adapters/codex-cli/authority";
import { CodexCliReviewPacketSchema } from "@/src/adapters/codex-cli/contracts";
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

export class CodexCliApprovalError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CodexCliApprovalError";
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
    throw new CodexCliApprovalError("repository_root_invalid");
  }
};

export const createCodexCliCaptureApproval = async ({
  root,
  authoritySha256,
  command = "codex",
  loaders,
  mode = "primary",
}: {
  root: string;
  authoritySha256: string;
  command?: string;
  loaders?: CodexCliPreflightLoaders;
  mode?: CodexCliCaptureMode;
}): Promise<void> => {
  const realRoot = await exactRoot(root);
  const input = await loadRegisteredCodexCliInput(loaders);
  const attempt = getCodexCliCaptureAttempt(mode);
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
  if (authoritySha256 !== bundle.approvalAuthoritySha256) {
    throw new CodexCliApprovalError("approval_authority_hash_mismatch");
  }
  if (
    !gitOk(realRoot, [
      "check-ignore",
      "-q",
      "--",
      attempt.approvalLocator,
    ]) ||
    gitOk(realRoot, [
      "ls-files",
      "--error-unmatch",
      "--",
      attempt.approvalLocator,
    ])
  ) {
    throw new CodexCliApprovalError("approval_not_private");
  }
  if (
    !gitOk(realRoot, [
      "check-ignore",
      "-q",
      "--",
      attempt.reviewLocator,
    ]) ||
    gitOk(realRoot, [
      "ls-files",
      "--error-unmatch",
      "--",
      attempt.reviewLocator,
    ])
  ) {
    throw new CodexCliApprovalError("review_not_private");
  }
  const reviewPath = path.resolve(realRoot, attempt.reviewLocator);
  try {
    const reviewStat = await lstat(reviewPath);
    if (!reviewStat.isFile() || reviewStat.isSymbolicLink()) {
      throw new Error("unsafe review file");
    }
    const review = CodexCliReviewPacketSchema.parse(
      JSON.parse(await readFile(reviewPath, "utf8")) as unknown,
    );
    if (!isCodexCliReviewPacketBound({ packet: review, bundle })) {
      throw new Error("review binding mismatch");
    }
  } catch (error) {
    if (isMissing(error)) {
      throw new CodexCliApprovalError("review_missing");
    }
    throw new CodexCliApprovalError("review_invalid");
  }
  const target = path.resolve(realRoot, attempt.approvalLocator);
  const directory = path.dirname(target);
  try {
    const artifactsDirectory = path.resolve(realRoot, "artifacts");
    const artifactsStat = await lstat(artifactsDirectory);
    if (
      !artifactsStat.isDirectory() ||
      artifactsStat.isSymbolicLink() ||
      (await realpath(artifactsDirectory)) !== artifactsDirectory
    ) {
      throw new Error("unsafe artifacts directory");
    }
    await mkdir(directory, { recursive: true });
    const stat = await lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(directory)) !== directory ||
      !directory.startsWith(`${realRoot}${path.sep}`)
    ) {
      throw new Error("unsafe approval directory");
    }
    await lstat(target);
    throw new CodexCliApprovalError("approval_exists");
  } catch (error) {
    if (error instanceof CodexCliApprovalError) throw error;
    if (!isMissing(error)) {
      throw new CodexCliApprovalError("approval_path_unsafe");
    }
  }
  const source = `${JSON.stringify(
    JSON.parse(
      canonicalJson(
        buildCodexCliCaptureApproval({
          authority: bundle.authority,
          approvalAuthoritySha256: bundle.approvalAuthoritySha256,
        }),
      ),
    ),
    null,
    2,
  )}\n`;
  try {
    await writeFile(target, source, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new CodexCliApprovalError("approval_exists");
    }
    throw new CodexCliApprovalError("approval_write_failed");
  }
};

export const parseCodexCliApprovalArgs = (
  args: readonly string[],
): { mode: CodexCliCaptureMode; authoritySha256: string } => {
  const mode = args[0] === "--retry" ? "retry" : "primary";
  const authorityArgs = mode === "retry" ? args.slice(1) : args;
  if (
    authorityArgs.length !== 2 ||
    authorityArgs[0] !== "--authority-sha" ||
    !authorityArgs[1]
  ) {
    throw new CodexCliApprovalError("arguments_invalid");
  }
  return { mode, authoritySha256: authorityArgs[1] };
};

export const runCodexCliApprovalCli = async ({
  args = process.argv.slice(2),
  root = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  command,
}: {
  args?: readonly string[];
  root?: string;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  command?: string;
} = {}): Promise<number> => {
  try {
    const { mode, authoritySha256 } = parseCodexCliApprovalArgs(args);
    const resolvedCommand = command ?? await resolveCodexCliCommand();
    await createCodexCliCaptureApproval({
      root,
      authoritySha256,
      mode,
      command: resolvedCommand,
    });
    stdout.write(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_approval", created: true, approvalAuthoritySha256: authoritySha256 })}\n`,
    );
    return 0;
  } catch (error) {
    const code = error instanceof CodexCliApprovalError
      ? error.code
      : error instanceof CodexCliCommandResolutionError
        ? error.code
      : "unexpected_failure";
    stderr.write(
      `${JSON.stringify({ evidenceType: "codex_cli_capture_approval", created: false, code })}\n`,
    );
    return 1;
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void runCodexCliApprovalCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

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
import { canonicalJson } from "@/src/domain/canonical-json";
import {
  buildLiveCaptureApproval,
  LiveCaptureApprovalSchema,
} from "@/src/evidence/live-capture-approval";
import {
  LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
} from "@/src/evidence/live-scenario-contract";

export const LIVE_CAPTURE_APPROVAL_LOCATORS = {
  primary: "artifacts/live/live-capture-approval.json",
  retry: "artifacts/live/live-retry-approval.json",
} as const;

export type LiveCaptureApprovalMode = keyof typeof LIVE_CAPTURE_APPROVAL_LOCATORS;

export class LiveCaptureApprovalError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "LiveCaptureApprovalError";
  }
}

const gitOk = (root: string, args: string[]): boolean =>
  spawnSync("git", ["-C", root, ...args], { stdio: "ignore" }).status === 0;

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const assertExactRepositoryRoot = async (root: string): Promise<string> => {
  try {
    const suppliedStat = await lstat(root);
    if (!suppliedStat.isDirectory() || suppliedStat.isSymbolicLink()) {
      throw new Error("invalid supplied root");
    }
    const realRoot = await realpath(root);
    const stat = await lstat(realRoot);
    const result = spawnSync("git", ["-C", realRoot, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
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
    throw new LiveCaptureApprovalError("repository_root_invalid");
  }
};

const attemptIdFor = (mode: LiveCaptureApprovalMode) =>
  mode === "primary"
    ? LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID
    : LIVE_RED_SAIL_RETRY_ATTEMPT_ID;

export const createLiveCaptureApproval = async ({
  root,
  mode,
  requestSha256,
}: {
  root: string;
  mode: LiveCaptureApprovalMode;
  requestSha256: string;
}): Promise<{ mode: LiveCaptureApprovalMode; requestSha256: string }> => {
  if (requestSha256 !== LIVE_RED_SAIL_REQUEST_SHA256) {
    throw new LiveCaptureApprovalError("request_hash_mismatch");
  }
  const realRoot = await assertExactRepositoryRoot(root);
  const locator = LIVE_CAPTURE_APPROVAL_LOCATORS[mode];
  const liveDirectory = path.resolve(realRoot, "artifacts/live");
  const artifactsDirectory = path.resolve(realRoot, "artifacts");
  try {
    const artifactsStat = await lstat(artifactsDirectory);
    if (!artifactsStat.isDirectory() || artifactsStat.isSymbolicLink()) {
      throw new Error("unsafe artifacts directory");
    }
    try {
      const liveStat = await lstat(liveDirectory);
      if (!liveStat.isDirectory() || liveStat.isSymbolicLink()) {
        throw new Error("unsafe live directory");
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      await mkdir(liveDirectory);
    }
    if ((await realpath(liveDirectory)) !== liveDirectory) {
      throw new Error("live directory escaped root");
    }
  } catch {
    throw new LiveCaptureApprovalError("approval_path_unsafe");
  }

  const target = path.resolve(realRoot, locator);
  try {
    await lstat(target);
    throw new LiveCaptureApprovalError("approval_exists");
  } catch (error) {
    if (error instanceof LiveCaptureApprovalError) throw error;
    if (!isMissing(error)) {
      throw new LiveCaptureApprovalError("approval_path_unsafe");
    }
  }
  if (
    !gitOk(realRoot, ["check-ignore", "-q", "--", locator]) ||
    gitOk(realRoot, ["ls-files", "--error-unmatch", "--", locator])
  ) {
    throw new LiveCaptureApprovalError("approval_not_private");
  }

  const approval = buildLiveCaptureApproval(attemptIdFor(mode));
  const source = `${JSON.stringify(JSON.parse(canonicalJson(approval)), null, 2)}\n`;
  try {
    await writeFile(target, source, { encoding: "utf8", flag: "wx" });
    LiveCaptureApprovalSchema.parse(JSON.parse(await readFile(target, "utf8")) as unknown);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new LiveCaptureApprovalError("approval_exists");
    }
    throw new LiveCaptureApprovalError("approval_write_failed");
  }
  return { mode, requestSha256 };
};

export const parseLiveCaptureApprovalArgs = (
  args: readonly string[],
): { mode: LiveCaptureApprovalMode; requestSha256: string } => {
  let mode: LiveCaptureApprovalMode | null = null;
  let requestSha256: string | null = null;
  let sawMode = false;
  let sawRequestSha = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--mode") {
      if (sawMode) throw new LiveCaptureApprovalError("arguments_invalid");
      const value = args[index + 1];
      if (value !== "primary" && value !== "retry") {
        throw new LiveCaptureApprovalError("arguments_invalid");
      }
      mode = value;
      sawMode = true;
      index += 1;
    } else if (args[index] === "--request-sha") {
      if (sawRequestSha) throw new LiveCaptureApprovalError("arguments_invalid");
      requestSha256 = args[index + 1] ?? null;
      sawRequestSha = true;
      index += 1;
    } else {
      throw new LiveCaptureApprovalError("arguments_invalid");
    }
  }
  if (!mode || !requestSha256) {
    throw new LiveCaptureApprovalError("arguments_invalid");
  }
  return { mode, requestSha256 };
};

export const runLiveCaptureApprovalCli = async ({
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
    const input = parseLiveCaptureApprovalArgs(args);
    const result = await createLiveCaptureApproval({ root, ...input });
    stdout.write(
      `${JSON.stringify({ evidenceType: "live_capture_approval", created: true, mode: result.mode, requestSha256: result.requestSha256 })}\n`,
    );
    return 0;
  } catch (error) {
    const code =
      error instanceof LiveCaptureApprovalError ? error.code : "unexpected_failure";
    stderr.write(
      `${JSON.stringify({ evidenceType: "live_capture_approval", created: false, code })}\n`,
    );
    return 1;
  }
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void runLiveCaptureApprovalCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

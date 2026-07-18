import { execFileSync, spawnSync } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export const W5_CRITICAL_PATHS = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "app/api/world",
  "src/adapters/codex-cli",
  "src/adapters/fixtures/odyssey-world-simulation.ts",
  "src/application/world-narration-pipeline.ts",
  "src/application/world-simulation-service.ts",
  "src/contracts",
  "src/domain",
  "src/ports/world-narrator.ts",
  "scripts/prepare-w5-ab.ts",
  "scripts/capture-w5-ab.ts",
  "scripts/finalize-w5-ab.ts",
  "scripts/w5",
  "tests/unit/w5-baseline-pin.test.ts",
  "tests/unit/w5-cli-runtime.test.ts",
  "tests/unit/w5-common-authority.test.ts",
  "tests/unit/w5-privacy-boundary.test.ts",
  "tests/unit/w5-recording-runner.test.ts",
  "tests/unit/w5-session-orchestration.test.ts",
  "tests/unit/codex-cli-preflight.test.ts",
  "tests/unit/odyssey-world-simulation.test.ts",
  "tests/unit/world-api-routes.test.ts",
  "tests/unit/world-simulation-narration-pipeline.test.ts",
  "tests/unit/world-simulation-service.test.ts",
  "_dev/dispatch-2026-07-18/DISPATCH-COMMON-RULES.md",
  "_dev/dispatch-2026-07-18/DISPATCH-W5-ab-session.md",
  "_dev/dispatch-2026-07-18/contracts",
] as const;

export const W5_LANE_D_BASE_REVISION =
  "2bc6c8e0bbb07c9ac46bb83d6ab86cddf7fd27d5" as const;

const git = (root: string, args: readonly string[]): string =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

export const resolveW5RepositoryRoot = async (
  rootInput: string,
): Promise<string> => {
  const resolved = path.resolve(rootInput);
  const stat = await lstat(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("w5_repository_root_unsafe");
  }
  const real = await realpath(resolved);
  if (path.resolve(git(real, ["rev-parse", "--show-toplevel"])) !== real) {
    throw new Error("w5_repository_root_unsafe");
  }
  return real;
};

export const currentW5Revision = (repoRoot: string): string => {
  const revision = git(repoRoot, ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/u.test(revision)) {
    throw new Error("w5_source_revision_invalid");
  }
  return revision;
};

export const assertW5CriticalTreeClean = ({
  repoRoot,
  expectedRevision,
  requiredAncestorRevision = W5_LANE_D_BASE_REVISION,
}: {
  repoRoot: string;
  expectedRevision?: string;
  requiredAncestorRevision?: string;
}): string => {
  const revision = currentW5Revision(repoRoot);
  if (expectedRevision !== undefined && revision !== expectedRevision) {
    throw new Error(
      `w5_source_revision_changed:${expectedRevision}:${revision}`,
    );
  }
  if (!/^[a-f0-9]{40}$/u.test(requiredAncestorRevision)) {
    throw new Error("w5_required_ancestor_invalid");
  }
  const ancestor = spawnSync(
    "git",
    ["-C", repoRoot, "merge-base", "--is-ancestor", requiredAncestorRevision, revision],
    { stdio: "ignore" },
  );
  if (ancestor.status !== 0) {
    throw new Error(
      `w5_lane_d_ancestor_missing:${requiredAncestorRevision}:${revision}`,
    );
  }
  const status = git(repoRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...W5_CRITICAL_PATHS,
  ]);
  if (status !== "") {
    throw new Error(`w5_critical_tree_dirty:${status.replaceAll("\n", "|")}`);
  }
  return revision;
};

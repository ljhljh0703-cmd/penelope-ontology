import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/assert-clean-build.mjs");
const directories: string[] = [];

const git = (cwd: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

const makeRepository = (): { cwd: string; sha: string; tracked: string } => {
  const cwd = mkdtempSync(join(tmpdir(), "narrative-build-source-"));
  directories.push(cwd);
  git(cwd, ["init"]);
  git(cwd, ["config", "user.name", "Build Source Test"]);
  git(cwd, ["config", "user.email", "build-source@example.invalid"]);
  git(cwd, ["config", "commit.gpgsign", "false"]);
  const tracked = join(cwd, "tracked.txt");
  writeFileSync(tracked, "committed\n", "utf8");
  git(cwd, ["add", "tracked.txt"]);
  git(cwd, ["commit", "-m", "test fixture"]);
  return { cwd, sha: git(cwd, ["rev-parse", "HEAD"]), tracked };
};

const check = (cwd: string, sha: string) => {
  const baseEnvironment = { ...process.env };
  delete baseEnvironment.GITHUB_SHA;
  delete baseEnvironment.VERCEL_GIT_COMMIT_SHA;
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    env: { ...baseEnvironment, BUILD_SHA: sha },
  });
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("identified build source gate", () => {
  it("accepts only the exact clean commit", () => {
    const { cwd, sha } = makeRepository();
    const result = check(cwd, sha);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`BUILD_SOURCE_OK ${sha}`);
  });

  it("rejects a mismatched SHA and tracked or untracked changes", () => {
    const { cwd, sha, tracked } = makeRepository();
    const mismatch = check(cwd, "a".repeat(40));
    expect(mismatch.status).toBe(1);
    expect(mismatch.stderr).toContain("does not match repository HEAD");

    writeFileSync(tracked, "dirty\n", "utf8");
    const trackedDirty = check(cwd, sha);
    expect(trackedDirty.status).toBe(1);
    expect(trackedDirty.stderr).toContain("tracked or untracked changes");

    git(cwd, ["restore", "tracked.txt"]);
    writeFileSync(join(cwd, "untracked.txt"), "dirty\n", "utf8");
    const untrackedDirty = check(cwd, sha);
    expect(untrackedDirty.status).toBe(1);
    expect(untrackedDirty.stderr).toContain("tracked or untracked changes");
  });
});

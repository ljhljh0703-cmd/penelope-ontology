#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const fail = (message) => {
  console.error(`BUILD_SOURCE_FAIL ${message}`);
  process.exitCode = 1;
};

const expectedSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.BUILD_SHA;

if (!expectedSha || !/^[a-f0-9]{40}$/.test(expectedSha)) {
  fail("A trusted exact 40-character build SHA is required.");
} else {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (head !== expectedSha) {
      fail("The expected build SHA does not match repository HEAD.");
    } else {
      const status = execFileSync(
        "git",
        ["status", "--porcelain", "--untracked-files=all"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim();
      if (status) {
        fail("The worktree has tracked or untracked changes.");
      } else {
        console.log(`BUILD_SOURCE_OK ${head}`);
      }
    }
  } catch {
    fail("Git source identity could not be verified.");
  }
}

import { spawnSync } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLiveCaptureApproval,
  LiveCaptureApprovalSchema,
} from "@/src/evidence/live-capture-approval";
import {
  LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
} from "@/src/evidence/live-scenario-contract";
import {
  createLiveCaptureApproval,
  LIVE_CAPTURE_APPROVAL_LOCATORS,
  LiveCaptureApprovalError,
  parseLiveCaptureApprovalArgs,
  runLiveCaptureApprovalCli,
} from "@/scripts/create-live-capture-approval";

const temporaryPaths: string[] = [];
const secret = `sk-proj-${"s".repeat(32)}`;
const personalPath = ["", "Users", "approval-test-user", "private", "key.txt"].join(
  "/",
);

const git = (root: string, args: string[]): void => {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git failed: ${result.stderr}`);
  }
};

const makeRepository = async (
  ignoreSource = "artifacts/live/\n",
): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "live-capture-approval-"));
  temporaryPaths.push(root);
  git(root, ["init", "--quiet"]);
  await mkdir(path.join(root, "artifacts"));
  await writeFile(path.join(root, ".gitignore"), ignoreSource, "utf8");
  return root;
};

const expectCode = async (
  promise: Promise<unknown>,
  code: string,
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    name: "LiveCaptureApprovalError",
    code,
  });
};

const readApproval = async (root: string, locator: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(root, locator), "utf8")) as unknown;

afterEach(async () => {
  await Promise.all(
    temporaryPaths
      .splice(0)
      .reverse()
      .map((candidate) => rm(candidate, { recursive: true, force: true })),
  );
});

describe("live capture approval contract", () => {
  it("accepts only the exact registered primary or retry approval shape", () => {
    const primary = buildLiveCaptureApproval(LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID);
    const retry = buildLiveCaptureApproval(LIVE_RED_SAIL_RETRY_ATTEMPT_ID);

    expect(primary).toEqual({
      schemaVersion: 1,
      evidenceType: "live_capture_approval",
      scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      attemptId: LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
      approved: true,
    });
    expect(LiveCaptureApprovalSchema.parse(retry)).toEqual(retry);

    for (const invalid of [
      { ...primary, approved: false },
      { ...primary, requestSha256: "f".repeat(64) },
      { ...primary, scenarioContractId: "live.unregistered" },
      { ...primary, attemptId: "live-gpt56-retry-2" },
      { ...primary, unexpected: true },
    ]) {
      expect(LiveCaptureApprovalSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("parses either exact CLI mode and rejects incomplete or ambiguous arguments", () => {
    expect(
      parseLiveCaptureApprovalArgs([
        "--mode",
        "primary",
        "--request-sha",
        LIVE_RED_SAIL_REQUEST_SHA256,
      ]),
    ).toEqual({ mode: "primary", requestSha256: LIVE_RED_SAIL_REQUEST_SHA256 });
    expect(
      parseLiveCaptureApprovalArgs([
        "--request-sha",
        LIVE_RED_SAIL_REQUEST_SHA256,
        "--mode",
        "retry",
      ]),
    ).toEqual({ mode: "retry", requestSha256: LIVE_RED_SAIL_REQUEST_SHA256 });

    for (const args of [
      [],
      ["--mode", "primary"],
      ["--request-sha", LIVE_RED_SAIL_REQUEST_SHA256],
      ["--mode", "other", "--request-sha", LIVE_RED_SAIL_REQUEST_SHA256],
      ["--unknown", "value"],
      [
        "--mode",
        "primary",
        "--mode",
        "retry",
        "--request-sha",
        LIVE_RED_SAIL_REQUEST_SHA256,
      ],
      [
        "--mode",
        "primary",
        "--request-sha",
        LIVE_RED_SAIL_REQUEST_SHA256,
        "--request-sha",
        LIVE_RED_SAIL_REQUEST_SHA256,
      ],
    ]) {
      expect(() => parseLiveCaptureApprovalArgs(args)).toThrow(
        LiveCaptureApprovalError,
      );
    }
  });
});

describe("live capture approval write gate", () => {
  it("creates exact ignored primary and retry approvals once each", async () => {
    const root = await makeRepository();

    await expect(
      createLiveCaptureApproval({
        root,
        mode: "primary",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
    ).resolves.toEqual({
      mode: "primary",
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
    });
    expect(
      LiveCaptureApprovalSchema.parse(
        await readApproval(root, LIVE_CAPTURE_APPROVAL_LOCATORS.primary),
      ).attemptId,
    ).toBe(LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID);
    await expectCode(
      createLiveCaptureApproval({
        root,
        mode: "primary",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
      "approval_exists",
    );

    await expect(
      createLiveCaptureApproval({
        root,
        mode: "retry",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
    ).resolves.toEqual({
      mode: "retry",
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
    });
    expect(
      LiveCaptureApprovalSchema.parse(
        await readApproval(root, LIVE_CAPTURE_APPROVAL_LOCATORS.retry),
      ).attemptId,
    ).toBe(LIVE_RED_SAIL_RETRY_ATTEMPT_ID);
    await expectCode(
      createLiveCaptureApproval({
        root,
        mode: "retry",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
      "approval_exists",
    );
  });

  it("rejects the wrong request hash before creating a private target", async () => {
    const root = await makeRepository();

    await expectCode(
      createLiveCaptureApproval({
        root,
        mode: "primary",
        requestSha256: secret,
      }),
      "request_hash_mismatch",
    );
    await expect(
      lstat(path.join(root, LIVE_CAPTURE_APPROVAL_LOCATORS.primary)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an approval path that is not gitignored", async () => {
    const root = await makeRepository("# approval is intentionally public\n");

    await expectCode(
      createLiveCaptureApproval({
        root,
        mode: "primary",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
      "approval_not_private",
    );
  });

  it("rejects symlinked ancestors and a symlinked repository root", async () => {
    const ancestorRoot = await makeRepository();
    const external = await mkdtemp(path.join(tmpdir(), "live-approval-external-"));
    temporaryPaths.push(external);
    await symlink(external, path.join(ancestorRoot, "artifacts", "live"));
    await expectCode(
      createLiveCaptureApproval({
        root: ancestorRoot,
        mode: "primary",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
      "approval_path_unsafe",
    );

    const realRoot = await makeRepository();
    const linkedRoot = `${realRoot}-link`;
    temporaryPaths.push(linkedRoot);
    await symlink(realRoot, linkedRoot);
    await expectCode(
      createLiveCaptureApproval({
        root: linkedRoot,
        mode: "primary",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
      "repository_root_invalid",
    );
  });

  it("treats an existing file or dangling target symlink as write-once", async () => {
    const fileRoot = await makeRepository();
    await mkdir(path.join(fileRoot, "artifacts", "live"));
    await writeFile(
      path.join(fileRoot, LIVE_CAPTURE_APPROVAL_LOCATORS.primary),
      "reserved\n",
      "utf8",
    );
    await expectCode(
      createLiveCaptureApproval({
        root: fileRoot,
        mode: "primary",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
      "approval_exists",
    );

    const linkRoot = await makeRepository();
    await mkdir(path.join(linkRoot, "artifacts", "live"));
    await symlink(
      path.join(linkRoot, "missing-target"),
      path.join(linkRoot, LIVE_CAPTURE_APPROVAL_LOCATORS.primary),
    );
    await expectCode(
      createLiveCaptureApproval({
        root: linkRoot,
        mode: "primary",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
      "approval_exists",
    );
  });

  it("requires the exact repository root rather than a nested directory", async () => {
    const root = await makeRepository();
    const nested = path.join(root, "nested");
    await mkdir(nested);

    await expectCode(
      createLiveCaptureApproval({
        root: nested,
        mode: "primary",
        requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      }),
      "repository_root_invalid",
    );
  });
});

describe("live capture approval CLI output", () => {
  it("emits one stable public-safe JSON line on success", async () => {
    const root = await makeRepository();
    let stdout = "";
    let stderr = "";

    const exitCode = await runLiveCaptureApprovalCli({
      root,
      args: [
        "--mode",
        "primary",
        "--request-sha",
        LIVE_RED_SAIL_REQUEST_SHA256,
      ],
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(
      `${JSON.stringify({ evidenceType: "live_capture_approval", created: true, mode: "primary", requestSha256: LIVE_RED_SAIL_REQUEST_SHA256 })}\n`,
    );
    expect(stdout).not.toContain(root);
    expect(stdout).not.toContain(secret);
    expect(stdout).not.toContain(personalPath);
  });

  it("redacts a secret or absolute-path request value to one stable error code", async () => {
    const root = await makeRepository();

    for (const privateValue of [secret, personalPath]) {
      let stdout = "";
      let stderr = "";
      const exitCode = await runLiveCaptureApprovalCli({
        root,
        args: ["--mode", "primary", "--request-sha", privateValue],
        stdout: { write: (value) => ((stdout += String(value)), true) },
        stderr: { write: (value) => ((stderr += String(value)), true) },
      });

      expect(exitCode).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toBe(
        `${JSON.stringify({ evidenceType: "live_capture_approval", created: false, code: "request_hash_mismatch" })}\n`,
      );
      expect(stderr).not.toContain(root);
      expect(stderr).not.toContain(secret);
      expect(stderr).not.toContain(personalPath);
    }
  });
});

import { spawnSync } from "node:child_process";
import {
  link as fsLink,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  loadDemoWorldPack,
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import type { RunResult } from "@/src/contracts/run";
import { canonicalJson } from "@/src/domain/canonical-json";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import type { NarrativeModel } from "@/src/ports/narrative-model";
import {
  formatLiveCreatorReviewLine,
  isDirectLiveCreatorReviewExecution,
  prepareLiveCreatorReview,
  runLiveCreatorReviewCli,
} from "@/scripts/prepare-live-creator-review";

const PRIVATE_RESPONSE_ID = "resp_private_review_preparation_test";
const PRIVATE_NARRATIVE_MARKER =
  "The red sail remained a question, not an answer.";
const PRIVATE_NARRATIVE_FRAGMENT = "The red sail remained a question";
const roots: string[] = [];

let verifiedLiveRun: RunResult;

const git = (root: string, args: string[]): string => {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git failed: ${result.stderr}`);
  }
  return result.stdout;
};

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

const makeRoot = async ({
  ignoreSource = "artifacts/live/\n",
  rawRun = verifiedLiveRun,
}: {
  ignoreSource?: string;
  rawRun?: unknown;
} = {}): Promise<string> => {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "live-creator-review-")),
  );
  roots.push(root);
  git(root, ["init", "--quiet"]);
  await mkdir(path.join(root, "artifacts", "live"), { recursive: true });
  await Promise.all([
    writeFile(path.join(root, ".gitignore"), ignoreSource, "utf8"),
    writeFile(
      path.join(root, "artifacts", "live", "live-run.json"),
      pretty(rawRun),
      "utf8",
    ),
  ]);
  return root;
};

const outputPaths = (root: string) => ({
  rawPath: path.join(root, "artifacts", "live", "live-run.json"),
  reviewPath: path.join(root, "artifacts", "live", "creator-review.md"),
  decisionPath: path.join(root, "artifacts", "live", "creator-decision.json"),
});

const expectReviewPairAbsent = async (root: string): Promise<void> => {
  const { reviewPath, decisionPath } = outputPaths(root);
  await expect(readFile(reviewPath)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(decisionPath)).rejects.toMatchObject({ code: "ENOENT" });
};

beforeAll(async () => {
  const [worldPack, overlay, snapshot, baseDraft] = await Promise.all([
    loadDemoWorldPack(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
    loadDraftFixture("draft.red_sail_proposal"),
  ]);
  const liveModel: NarrativeModel = {
    async generate() {
      return {
        outcome: "completed",
        draft: {
          ...baseDraft,
          narrative: PRIVATE_NARRATIVE_MARKER,
        },
        trace: {
          mode: "live",
          outcome: "completed",
          requestedModel: "gpt-5.6",
          actualModel: "gpt-5.6-2026-07-01",
          responseId: PRIVATE_RESPONSE_ID,
          inputTokens: 450,
          outputTokens: 180,
        },
      };
    },
  };
  verifiedLiveRun = await createRunOrchestrator({
    worldPack,
    fixtureModel: fixtureNarrativeModel,
    liveModel,
  })(
    buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    }),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("private live creator-review preparation", () => {
  it("writes one ignored review and exact pending decision without network access", async () => {
    const root = await makeRoot();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network access is forbidden in review preparation"));

    await prepareLiveCreatorReview({ root, verifyLocalProof: () => true });

    expect(fetchSpy).not.toHaveBeenCalled();
    const { reviewPath, decisionPath } = outputPaths(root);
    const reviewSource = await readFile(reviewPath, "utf8");
    const decisionSource = await readFile(decisionPath, "utf8");
    expect(reviewSource).toContain("# Private Creator Review — Red-Sail Scene");
    expect(reviewSource).toContain(PRIVATE_NARRATIVE_FRAGMENT);
    expect(reviewSource).toContain("`accept`");
    expect(reviewSource).toContain("`edit`");
    expect(reviewSource).toContain("`reject`");
    expect(reviewSource).not.toContain(PRIVATE_RESPONSE_ID);
    expect(decisionSource).toBe(pretty({ action: "pending" }));
    expect(git(root, ["check-ignore", "--", "artifacts/live/creator-review.md"]))
      .toBe("artifacts/live/creator-review.md\n");
    expect(
      git(root, ["check-ignore", "--", "artifacts/live/creator-decision.json"]),
    ).toBe("artifacts/live/creator-decision.json\n");
    expect(git(root, ["ls-files", "--", "artifacts/live"])).toBe("");

    await expect(
      prepareLiveCreatorReview({ root, verifyLocalProof: () => true }),
    ).rejects.toMatchObject({ code: "review_target_exists" });
    expect(await readFile(reviewPath, "utf8")).toBe(reviewSource);
    expect(await readFile(decisionPath, "utf8")).toBe(decisionSource);
  });

  it("fails closed when the local proof is invalid", async () => {
    const root = await makeRoot();

    await expect(
      prepareLiveCreatorReview({ root, verifyLocalProof: () => false }),
    ).rejects.toMatchObject({ code: "local_live_proof_invalid" });
    await expectReviewPairAbsent(root);
  });

  it.each([
    {
      label: "malformed",
      source: "{not-json\n",
    },
    {
      label: "schema-valid but semantically tampered",
      source: pretty({ ...verifiedLiveRun, hardViolations: [] }),
    },
  ])("rejects a $label raw run before writing the pair", async ({ source }) => {
    const root = await makeRoot();
    const { rawPath } = outputPaths(root);
    await writeFile(rawPath, source, "utf8");

    await expect(
      prepareLiveCreatorReview({ root, verifyLocalProof: () => true }),
    ).rejects.toMatchObject({ code: "live_result_invalid" });
    await expectReviewPairAbsent(root);
  });

  it("requires the raw run and both absent targets to be ignored and untracked", async () => {
    const rawNotIgnored = await makeRoot({ ignoreSource: "" });
    await expect(
      prepareLiveCreatorReview({
        root: rawNotIgnored,
        verifyLocalProof: () => true,
      }),
    ).rejects.toMatchObject({ code: "private_path_not_ignored" });

    const targetsNotIgnored = await makeRoot({
      ignoreSource: "artifacts/live/live-run.json\n",
    });
    await expect(
      prepareLiveCreatorReview({
        root: targetsNotIgnored,
        verifyLocalProof: () => true,
      }),
    ).rejects.toMatchObject({ code: "private_path_not_ignored" });

    await expectReviewPairAbsent(rawNotIgnored);
    await expectReviewPairAbsent(targetsNotIgnored);
  });

  it("rejects a symlinked raw run without reading the external target", async () => {
    const root = await makeRoot();
    const externalRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), "live-review-external-")),
    );
    roots.push(externalRoot);
    const externalRaw = path.join(externalRoot, "external-live-run.json");
    await writeFile(externalRaw, pretty(verifiedLiveRun), "utf8");
    const { rawPath } = outputPaths(root);
    await rm(rawPath);
    await symlink(externalRaw, rawPath);

    await expect(
      prepareLiveCreatorReview({ root, verifyLocalProof: () => true }),
    ).rejects.toMatchObject({ code: "private_path_unsafe" });
    await expectReviewPairAbsent(root);
  });

  it("never overwrites either write-once target", async () => {
    for (const target of ["review", "decision"] as const) {
      const root = await makeRoot();
      const { reviewPath, decisionPath } = outputPaths(root);
      const targetPath = target === "review" ? reviewPath : decisionPath;
      const sentinel = `keep-existing-${target}\n`;
      await writeFile(targetPath, sentinel, "utf8");

      await expect(
        prepareLiveCreatorReview({ root, verifyLocalProof: () => true }),
      ).rejects.toMatchObject({ code: "review_target_exists" });
      expect(await readFile(targetPath, "utf8")).toBe(sentinel);
      const otherPath = target === "review" ? decisionPath : reviewPath;
      await expect(readFile(otherPath)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("rejects a nested checkout path and a symlink supplied as the repository root", async () => {
    const root = await makeRoot();
    const nested = path.join(root, "nested");
    await mkdir(nested);
    await expect(
      prepareLiveCreatorReview({ root: nested, verifyLocalProof: () => true }),
    ).rejects.toMatchObject({ code: "repository_root_invalid" });

    const rootLink = path.join(tmpdir(), `live-review-root-link-${path.basename(root)}`);
    roots.push(rootLink);
    await symlink(root, rootLink);
    await expect(
      prepareLiveCreatorReview({ root: rootLink, verifyLocalProof: () => true }),
    ).rejects.toMatchObject({ code: "repository_root_invalid" });
    await expectReviewPairAbsent(root);
  });

  it("rolls back the first link and removes both temporary files after a second-link failure", async () => {
    const root = await makeRoot();
    let linkCalls = 0;

    await expect(
      prepareLiveCreatorReview({
        root,
        verifyLocalProof: () => true,
        fileSystem: {
          link: async (existingPath, newPath) => {
            linkCalls += 1;
            if (linkCalls === 2) {
              throw Object.assign(new Error("injected second-link failure"), {
                code: "EIO",
              });
            }
            return fsLink(existingPath, newPath);
          },
        },
      }),
    ).rejects.toMatchObject({ code: "review_pair_write_failed" });

    expect(linkCalls).toBe(2);
    await expectReviewPairAbsent(root);
    expect(
      (await readdir(path.join(root, "artifacts", "live"))).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });
});

describe("private live creator-review CLI", () => {
  it("is import-safe and emits one stable redacted success line", async () => {
    const modulePath = path.resolve("scripts/prepare-live-creator-review.ts");
    expect(
      isDirectLiveCreatorReviewExecution(pathToFileURL(modulePath).href, modulePath),
    ).toBe(true);
    expect(
      isDirectLiveCreatorReviewExecution(
        pathToFileURL(modulePath).href,
        path.resolve("tests/fake-entry.ts"),
      ),
    ).toBe(false);

    const root = await makeRoot();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network access is forbidden in review preparation"));
    let stdout = "";
    let stderr = "";
    const exitCode = await runLiveCreatorReviewCli({
      root,
      verifyLocalProof: () => true,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });

    expect(exitCode).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stderr).toBe("");
    expect(stdout).toBe(
      formatLiveCreatorReviewLine({
        ok: true,
        status: "awaiting_creator_decision",
      }),
    );
    expect(stdout.split("\n")).toHaveLength(2);
    expect(stdout).not.toContain(PRIVATE_NARRATIVE_FRAGMENT);
    expect(stdout).not.toContain(PRIVATE_RESPONSE_ID);
    expect(stdout).not.toContain(root);
  });

  it("emits one stable error code without private details", async () => {
    const root = await makeRoot();
    let stdout = "";
    let stderr = "";
    const exitCode = await runLiveCreatorReviewCli({
      root,
      verifyLocalProof: () => false,
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      formatLiveCreatorReviewLine({
        ok: false,
        code: "local_live_proof_invalid",
      }),
    );
    expect(stderr.split("\n")).toHaveLength(2);
    expect(stderr).not.toContain(PRIVATE_NARRATIVE_FRAGMENT);
    expect(stderr).not.toContain(PRIVATE_RESPONSE_ID);
    expect(stderr).not.toContain(root);
  });
});

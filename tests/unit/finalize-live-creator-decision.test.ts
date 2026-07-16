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
  loadDemoBundle,
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import type { RunResult } from "@/src/contracts/run";
import { canonicalJson } from "@/src/domain/canonical-json";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import { LiveHarnessEvidenceSchema } from "@/src/evidence/live-harness-evidence";
import type { NarrativeModel } from "@/src/ports/narrative-model";
import {
  finalizeLiveCreatorDecision,
  formatLiveCreatorFinalizationLine,
  isDirectLiveCreatorFinalizationExecution,
  runLiveCreatorFinalizationCli,
  type LiveCreatorDecisionFinalizationDependencies,
  type RegisteredFinalizationAuthority,
} from "@/scripts/finalize-live-creator-decision";

const PRIVATE_RESPONSE_ID = "resp_private_finalize_cli_test";
const PRIVATE_DISPLAY_TEXT =
  "The red sail signals a harbor watch; it does not prove a return.";
const PRIVATE_NARRATIVE_MARKER = "The red sail remained a question, not an answer.";
const roots: string[] = [];

let verifiedLiveRun: RunResult;
let authority: RegisteredFinalizationAuthority;

const git = (root: string, args: string[]): void => {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git failed: ${result.stderr}`);
  }
};

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

const makeRoot = async ({
  decision = { action: "accept" },
  ignoreSource = "artifacts/live/\n",
  rawRun = verifiedLiveRun,
}: {
  decision?: unknown;
  ignoreSource?: string;
  rawRun?: unknown;
} = {}): Promise<string> => {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "live-creator-finalize-")),
  );
  roots.push(root);
  git(root, ["init", "--quiet"]);
  await Promise.all([
    mkdir(path.join(root, "artifacts", "live"), { recursive: true }),
    mkdir(path.join(root, "artifacts", "evidence"), { recursive: true }),
    writeFile(path.join(root, ".gitignore"), ignoreSource, "utf8"),
  ]);
  await Promise.all([
    writeFile(
      path.join(root, "artifacts", "live", "live-run.json"),
      pretty(rawRun),
      "utf8",
    ),
    writeFile(
      path.join(root, "artifacts", "live", "creator-decision.json"),
      pretty(decision),
      "utf8",
    ),
  ]);
  return root;
};

const dependencies = (
  verifyLocalProof: (root: string) => boolean = () => true,
): Partial<LiveCreatorDecisionFinalizationDependencies> => ({
  verifyLocalProof,
  loadAuthority: async () => authority,
});

const outputPaths = (root: string) => ({
  privatePath: path.join(root, "artifacts", "live", "creator-finalization.json"),
  publicPath: path.join(root, "artifacts", "evidence", "live-harness.json"),
});

beforeAll(async () => {
  const [{ worldPack, replayCases }, overlay, snapshot, baseDraft] = await Promise.all([
    loadDemoBundle(),
    loadOverlayFixture("overlay.v0"),
    loadSnapshotFixture("snapshot.s0"),
    loadDraftFixture("draft.red_sail_proposal"),
  ]);
  const draft = {
    ...baseDraft,
    narrative: PRIVATE_NARRATIVE_MARKER,
  };
  const liveRequest = buildLiveEvidenceRunRequest({
    overlay,
    snapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
  });
  const liveModel: NarrativeModel = {
    async generate() {
      return {
        outcome: "completed",
        draft,
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
    fixtureModel: liveModel,
    liveModel,
  })(liveRequest);
  authority = {
    worldPack,
    replayCases,
    overlay,
    snapshot,
    liveRequest,
    fixtureModel: fixtureNarrativeModel,
  };
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("local live creator-decision finalization", () => {
  it.each([
    { action: "accept" as const, status: "applied" as const },
    { action: "reject" as const, status: "rejected" as const },
    { action: "edit" as const, status: "applied" as const },
  ])("finalizes $action without a model or network call", async ({ action, status }) => {
    const decision =
      action === "edit"
        ? { action, displayDescription: PRIVATE_DISPLAY_TEXT }
        : { action };
    const root = await makeRoot({ decision });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await finalizeLiveCreatorDecision({
      root,
      dependencies: dependencies(),
    });

    expect(result).toMatchObject({ action, status });
    expect(fetchSpy).not.toHaveBeenCalled();
    const { privatePath, publicPath } = outputPaths(root);
    const privateSource = await readFile(privatePath, "utf8");
    const publicSource = await readFile(publicPath, "utf8");
    const publicEvidence = LiveHarnessEvidenceSchema.parse(JSON.parse(publicSource));
    expect(publicEvidence.finalizationStatus).toBe(status);
    expect(publicEvidence.decision.action).toBe(action);
    expect(privateSource).toContain(PRIVATE_NARRATIVE_MARKER);
    expect(privateSource).toContain(PRIVATE_RESPONSE_ID);
    if (action === "edit") expect(privateSource).toContain(PRIVATE_DISPLAY_TEXT);
    expect(publicSource).not.toContain(PRIVATE_NARRATIVE_MARKER);
    expect(publicSource).not.toContain(PRIVATE_RESPONSE_ID);
    expect(publicSource).not.toContain(PRIVATE_DISPLAY_TEXT);
    expect(publicSource).not.toContain(root);
  });

  it.each([
    { label: "pending", source: pretty({ action: "pending" }) },
    { label: "malformed", source: "{not-json\n" },
  ])("fails closed for a $label decision before writing evidence", async ({ source }) => {
    const root = await makeRoot();
    await writeFile(
      path.join(root, "artifacts", "live", "creator-decision.json"),
      source,
      "utf8",
    );

    await expect(
      finalizeLiveCreatorDecision({ root, dependencies: dependencies() }),
    ).rejects.toMatchObject({ code: "creator_decision_invalid" });
    const { privatePath, publicPath } = outputPaths(root);
    await expect(readFile(privatePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(publicPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires the local proof and rejects a schema-valid tampered run", async () => {
    const proofFailureRoot = await makeRoot();
    await expect(
      finalizeLiveCreatorDecision({
        root: proofFailureRoot,
        dependencies: dependencies(() => false),
      }),
    ).rejects.toMatchObject({ code: "local_live_proof_invalid" });

    const tamperedRoot = await makeRoot({
      rawRun: { ...verifiedLiveRun, hardViolations: [] },
    });
    await expect(
      finalizeLiveCreatorDecision({
        root: tamperedRoot,
        dependencies: dependencies(),
      }),
    ).rejects.toMatchObject({ code: "creator_decision_invalid" });
    for (const root of [proofFailureRoot, tamperedRoot]) {
      const { privatePath, publicPath } = outputPaths(root);
      await expect(readFile(privatePath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(publicPath)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("never overwrites either write-once target", async () => {
    const root = await makeRoot();
    const { privatePath, publicPath } = outputPaths(root);
    const sentinel = "keep-existing-public-evidence\n";
    await writeFile(publicPath, sentinel, "utf8");

    await expect(
      finalizeLiveCreatorDecision({ root, dependencies: dependencies() }),
    ).rejects.toMatchObject({ code: "finalization_target_exists" });
    expect(await readFile(publicPath, "utf8")).toBe(sentinel);
    await expect(readFile(privatePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked output ancestry and a non-root repository path", async () => {
    const root = await makeRoot();
    const external = await mkdtemp(path.join(tmpdir(), "live-finalize-external-"));
    roots.push(external);
    await rm(path.join(root, "artifacts", "evidence"), { recursive: true });
    await symlink(external, path.join(root, "artifacts", "evidence"));

    await expect(
      finalizeLiveCreatorDecision({ root, dependencies: dependencies() }),
    ).rejects.toMatchObject({ code: "public_path_unsafe" });

    const nested = path.join(root, "nested");
    await mkdir(nested);
    await expect(
      finalizeLiveCreatorDecision({ root: nested, dependencies: dependencies() }),
    ).rejects.toMatchObject({ code: "repository_root_invalid" });
  });

  it("requires private paths to be ignored and the public target to remain public", async () => {
    const privateUnsafe = await makeRoot({ ignoreSource: "" });
    await expect(
      finalizeLiveCreatorDecision({
        root: privateUnsafe,
        dependencies: dependencies(),
      }),
    ).rejects.toMatchObject({ code: "private_path_not_ignored" });

    const publicIgnored = await makeRoot({
      ignoreSource: "artifacts/live/\nartifacts/evidence/live-harness.json\n",
    });
    await expect(
      finalizeLiveCreatorDecision({
        root: publicIgnored,
        dependencies: dependencies(),
      }),
    ).rejects.toMatchObject({ code: "public_path_ignored" });
  });

  it("rolls back the first link when the evidence pair cannot be completed", async () => {
    const root = await makeRoot();
    let linkCalls = 0;
    await expect(
      finalizeLiveCreatorDecision({
        root,
        dependencies: dependencies(),
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
    ).rejects.toMatchObject({ code: "evidence_pair_write_failed" });

    const { privatePath, publicPath } = outputPaths(root);
    await expect(readFile(privatePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(publicPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (await readdir(path.dirname(privatePath))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    expect(
      (await readdir(path.dirname(publicPath))).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });
});

describe("live creator-decision finalization CLI", () => {
  it("is import-safe and emits one redacted success line", async () => {
    const modulePath = path.resolve("scripts/finalize-live-creator-decision.ts");
    expect(
      isDirectLiveCreatorFinalizationExecution(
        pathToFileURL(modulePath).href,
        modulePath,
      ),
    ).toBe(true);
    expect(
      isDirectLiveCreatorFinalizationExecution(
        pathToFileURL(modulePath).href,
        path.resolve("tests/fake-entry.ts"),
      ),
    ).toBe(false);

    const root = await makeRoot({
      decision: { action: "edit", displayDescription: PRIVATE_DISPLAY_TEXT },
    });
    let stdout = "";
    let stderr = "";
    const exitCode = await runLiveCreatorFinalizationCli({
      root,
      dependencies: dependencies(),
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe(
      formatLiveCreatorFinalizationLine({
        ok: true,
        status: "applied",
        action: "edit",
      }),
    );
    expect(stdout.split("\n")).toHaveLength(2);
    expect(stdout).not.toContain(PRIVATE_DISPLAY_TEXT);
    expect(stdout).not.toContain(PRIVATE_RESPONSE_ID);
    expect(stdout).not.toContain(PRIVATE_NARRATIVE_MARKER);
    expect(stdout).not.toContain(root);
  });

  it("emits one stable error code without private details", async () => {
    const root = await makeRoot();
    let stdout = "";
    let stderr = "";
    const exitCode = await runLiveCreatorFinalizationCli({
      root,
      dependencies: dependencies(() => false),
      stdout: { write: (value) => ((stdout += String(value)), true) },
      stderr: { write: (value) => ((stderr += String(value)), true) },
    });

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toBe(
      formatLiveCreatorFinalizationLine({
        ok: false,
        code: "local_live_proof_invalid",
      }),
    );
    expect(stderr.split("\n")).toHaveLength(2);
    expect(stderr).not.toContain(PRIVATE_DISPLAY_TEXT);
    expect(stderr).not.toContain(PRIVATE_RESPONSE_ID);
    expect(stderr).not.toContain(PRIVATE_NARRATIVE_MARKER);
    expect(stderr).not.toContain(root);
  });
});

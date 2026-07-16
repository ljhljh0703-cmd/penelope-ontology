import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  link,
  lstat,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { bindSimpleCreatorDecision } from "@/src/application/live-creator-review";
import {
  finalizeVerifiedLiveCreatorDecision,
  type LiveCreatorFinalizationResult,
} from "@/src/application/live-creator-finalizer";
import { CanonOverlaySchema, type CanonOverlay } from "@/src/contracts/canon-overlay";
import {
  FixtureRegistrySchema,
  type FixtureRegistry,
} from "@/src/contracts/fixture-registry";
import { ModelDraftSchema } from "@/src/contracts/model-draft";
import { ReplayCaseSetSchema, type ReplayCase } from "@/src/contracts/replay";
import { RunResultSchema, type RunRequest } from "@/src/contracts/run";
import {
  SimulationSnapshotSchema,
  type SimulationSnapshot,
} from "@/src/contracts/simulation";
import { canonicalJson, sha256Canonical } from "@/src/domain/canonical-json";
import { WorldPackSchema, type WorldPack } from "@/src/domain/schemas";
import { buildLiveEvidenceRunRequest } from "@/src/evidence/live-evidence-request";
import { verifyLocalLiveEvidenceProof } from "@/src/evidence/live-evidence-verifier";
import {
  buildLiveHarnessEvidence,
  type LiveHarnessEvidence,
} from "@/src/evidence/live-harness-evidence";
import type { NarrativeModel } from "@/src/ports/narrative-model";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

const LOCATORS = {
  rawRun: "artifacts/live/live-run.json",
  creatorDecision: "artifacts/live/creator-decision.json",
  privateFinalization: "artifacts/live/creator-finalization.json",
  publicEvidence: "artifacts/evidence/live-harness.json",
  world: "data/world-packs/trojan-returns/world.json",
  overlay: "data/world-packs/trojan-returns/overlays/overlay.v0.json",
  snapshot: "data/world-packs/trojan-returns/snapshots/s0.json",
  replayCases: "data/world-packs/trojan-returns/replay-cases.json",
  fixtureRegistry: "data/world-packs/trojan-returns/fixture-registry.json",
  packDirectory: "data/world-packs/trojan-returns",
} as const;

export type LiveCreatorDecisionFinalizationCode =
  | "repository_root_invalid"
  | "local_live_proof_invalid"
  | "private_path_unsafe"
  | "private_path_not_ignored"
  | "public_path_unsafe"
  | "public_path_ignored"
  | "finalization_target_exists"
  | "creator_decision_invalid"
  | "registered_authority_invalid"
  | "live_finalization_failed"
  | "evidence_pair_write_failed"
  | "evidence_pair_rollback_failed";

export class LiveCreatorDecisionFinalizationError extends Error {
  constructor(
    readonly code: LiveCreatorDecisionFinalizationCode,
    message: string,
  ) {
    super(message);
    this.name = "LiveCreatorDecisionFinalizationError";
  }
}

type FinalizationFileSystem = {
  link: typeof link;
  lstat: typeof lstat;
  readFile: typeof readFile;
  rm: typeof rm;
  writeFile: typeof writeFile;
};

const nodeFileSystem: FinalizationFileSystem = {
  link,
  lstat,
  readFile,
  rm,
  writeFile,
};

export type RegisteredFinalizationAuthority = {
  worldPack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  replayCases: ReplayCase[];
  liveRequest: LiveRunRequest;
  fixtureModel: NarrativeModel;
};

export type LiveCreatorDecisionFinalizationDependencies = {
  verifyLocalProof: (root: string) => boolean;
  loadAuthority: (root: string) => Promise<RegisteredFinalizationAuthority>;
  finalize: typeof finalizeVerifiedLiveCreatorDecision;
  buildEvidence: typeof buildLiveHarnessEvidence;
};

const fail = (
  code: LiveCreatorDecisionFinalizationCode,
  message: string,
): never => {
  throw new LiveCreatorDecisionFinalizationError(code, message);
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const isExactRepositoryRoot = (root: string): boolean => {
  try {
    const stat = lstatSync(root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      path.resolve(root) !== realpathSync(root)
    ) {
      return false;
    }
    const result = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return (
      result.status === 0 &&
      typeof result.stdout === "string" &&
      realpathSync(result.stdout.trim()) === realpathSync(root)
    );
  } catch {
    return false;
  }
};

const gitMatches = (root: string, args: string[]): boolean => {
  const result = spawnSync("git", ["-C", root, ...args], { stdio: "ignore" });
  return result.status === 0;
};

const isIgnoredAndUntracked = (root: string, locator: string): boolean =>
  !gitMatches(root, ["ls-files", "--error-unmatch", "--", locator]) &&
  gitMatches(root, ["check-ignore", "-q", "--", locator]);

const isIgnored = (root: string, locator: string): boolean =>
  gitMatches(root, ["check-ignore", "-q", "--", locator]);

const isTracked = (root: string, locator: string): boolean =>
  gitMatches(root, ["ls-files", "--error-unmatch", "--", locator]);

const relativeRealPath = (root: string, filePath: string): string =>
  path.relative(realpathSync(root), realpathSync(filePath)).split(path.sep).join("/");

const assertRegularPrivateInput = async (
  root: string,
  locator: string,
  fileSystem: FinalizationFileSystem,
): Promise<void> => {
  const filePath = path.resolve(root, locator);
  try {
    const stat = await fileSystem.lstat(filePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      relativeRealPath(root, filePath) !== locator
    ) {
      fail("private_path_unsafe", "A private input is not one exact regular repository file.");
    }
  } catch (error) {
    if (error instanceof LiveCreatorDecisionFinalizationError) throw error;
    fail("private_path_unsafe", "A required private input is unavailable or unsafe.");
  }
  if (!isIgnoredAndUntracked(root, locator)) {
    fail("private_path_not_ignored", "A private input is tracked or not gitignored.");
  }
};

const assertSafeOutputTarget = async ({
  root,
  locator,
  privateTarget,
  fileSystem,
}: {
  root: string;
  locator: string;
  privateTarget: boolean;
  fileSystem: FinalizationFileSystem;
}): Promise<void> => {
  const targetPath = path.resolve(root, locator);
  const parentPath = path.dirname(targetPath);
  try {
    const parentStat = await fileSystem.lstat(parentPath);
    if (
      !parentStat.isDirectory() ||
      parentStat.isSymbolicLink() ||
      relativeRealPath(root, parentPath) !== path.dirname(locator).split(path.sep).join("/")
    ) {
      fail(
        privateTarget ? "private_path_unsafe" : "public_path_unsafe",
        "An evidence output directory is unsafe.",
      );
    }
  } catch (error) {
    if (error instanceof LiveCreatorDecisionFinalizationError) throw error;
    fail(
      privateTarget ? "private_path_unsafe" : "public_path_unsafe",
      "An evidence output directory is unavailable or unsafe.",
    );
  }

  try {
    await fileSystem.lstat(targetPath);
    fail("finalization_target_exists", "A write-once evidence target already exists.");
  } catch (error) {
    if (error instanceof LiveCreatorDecisionFinalizationError) throw error;
    if (!isMissing(error)) {
      fail(
        privateTarget ? "private_path_unsafe" : "public_path_unsafe",
        "An evidence target could not be inspected safely.",
      );
    }
  }

  if (privateTarget) {
    if (!isIgnoredAndUntracked(root, locator)) {
      fail("private_path_not_ignored", "The private output is tracked or not gitignored.");
    }
  } else if (isIgnored(root, locator)) {
    fail("public_path_ignored", "The public evidence target is gitignored.");
  } else if (isTracked(root, locator)) {
    fail("finalization_target_exists", "The public evidence target is already tracked.");
  }
};

const readRegularJson = async (
  root: string,
  locator: string,
  fileSystem: FinalizationFileSystem = nodeFileSystem,
): Promise<unknown> => {
  const filePath = path.resolve(root, locator);
  const stat = await fileSystem.lstat(filePath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    relativeRealPath(root, filePath) !== locator
  ) {
    throw new Error("Repository JSON source is not one exact regular file.");
  }
  return JSON.parse(await fileSystem.readFile(filePath, "utf8")) as unknown;
};

const fixturePath = (
  registry: FixtureRegistry,
  root: string,
  id: string,
): string => {
  const reference = registry.drafts.find((candidate) => candidate.id === id);
  if (!reference) throw new Error("Registered draft fixture is unavailable.");
  const locator = path.posix.normalize(`${LOCATORS.packDirectory}/${reference.path}`);
  if (!locator.startsWith(`${LOCATORS.packDirectory}/`)) {
    throw new Error("Registered draft fixture escapes its World Pack.");
  }
  return path.resolve(root, locator);
};

export const loadRegisteredFinalizationAuthority = async (
  root: string,
): Promise<RegisteredFinalizationAuthority> => {
  if (realpathSync(root) !== realpathSync(process.cwd())) {
    throw new Error("Registered fixture finalization must run from its repository root.");
  }
  const [worldInput, overlayInput, snapshotInput, replayInput, registryInput] =
    await Promise.all([
      readRegularJson(root, LOCATORS.world),
      readRegularJson(root, LOCATORS.overlay),
      readRegularJson(root, LOCATORS.snapshot),
      readRegularJson(root, LOCATORS.replayCases),
      readRegularJson(root, LOCATORS.fixtureRegistry),
    ]);
  const worldPack = WorldPackSchema.parse(worldInput);
  const overlay = CanonOverlaySchema.parse(overlayInput);
  const snapshot = SimulationSnapshotSchema.parse(snapshotInput);
  const replayCases = ReplayCaseSetSchema.parse(replayInput);
  const registry = FixtureRegistrySchema.parse(registryInput);
  const fixtureModel = createFixtureNarrativeModel(async (id) => {
    const absolutePath = fixturePath(registry, root, id);
    const locator = path.relative(root, absolutePath).split(path.sep).join("/");
    return ModelDraftSchema.parse(await readRegularJson(root, locator));
  });
  return {
    worldPack,
    overlay,
    snapshot,
    replayCases,
    liveRequest: buildLiveEvidenceRunRequest({
      overlay,
      snapshot,
      styleProfileId: worldPack.defaultStyleProfileId,
    }),
    fixtureModel,
  };
};

const defaultDependencies: LiveCreatorDecisionFinalizationDependencies = {
  verifyLocalProof: verifyLocalLiveEvidenceProof,
  loadAuthority: loadRegisteredFinalizationAuthority,
  finalize: finalizeVerifiedLiveCreatorDecision,
  buildEvidence: buildLiveHarnessEvidence,
};

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

const writeEvidencePair = async ({
  root,
  privateSource,
  publicSource,
  fileSystem,
}: {
  root: string;
  privateSource: string;
  publicSource: string;
  fileSystem: FinalizationFileSystem;
}): Promise<void> => {
  const nonce = randomUUID();
  const privateTarget = path.resolve(root, LOCATORS.privateFinalization);
  const publicTarget = path.resolve(root, LOCATORS.publicEvidence);
  const privateTemporary = `${privateTarget}.${nonce}.tmp`;
  const publicTemporary = `${publicTarget}.${nonce}.tmp`;
  let privateLinked = false;
  let publicLinked = false;
  let rollbackFailed = false;

  try {
    await fileSystem.writeFile(privateTemporary, privateSource, {
      encoding: "utf8",
      flag: "wx",
    });
    await fileSystem.writeFile(publicTemporary, publicSource, {
      encoding: "utf8",
      flag: "wx",
    });
    await fileSystem.link(privateTemporary, privateTarget);
    privateLinked = true;
    await fileSystem.link(publicTemporary, publicTarget);
    publicLinked = true;
  } catch {
    if (publicLinked) {
      await fileSystem.rm(publicTarget, { force: false }).catch(() => {
        rollbackFailed = true;
      });
    }
    if (privateLinked) {
      await fileSystem.rm(privateTarget, { force: false }).catch(() => {
        rollbackFailed = true;
      });
    }
    if (rollbackFailed) {
      fail(
        "evidence_pair_rollback_failed",
        "The incomplete evidence pair could not be rolled back.",
      );
    }
    fail("evidence_pair_write_failed", "The evidence pair could not be committed.");
  } finally {
    await Promise.all([
      fileSystem.rm(privateTemporary, { force: true }).catch(() => undefined),
      fileSystem.rm(publicTemporary, { force: true }).catch(() => undefined),
    ]);
  }
};

export type LiveCreatorDecisionFinalizationResult = {
  status: LiveCreatorFinalizationResult["status"];
  action: "accept" | "edit" | "reject";
  publicEvidence: LiveHarnessEvidence;
};

export const finalizeLiveCreatorDecision = async ({
  root = process.cwd(),
  dependencies: dependencyOverrides = {},
  fileSystem: fileSystemOverrides = {},
}: {
  root?: string;
  dependencies?: Partial<LiveCreatorDecisionFinalizationDependencies>;
  fileSystem?: Partial<FinalizationFileSystem>;
} = {}): Promise<LiveCreatorDecisionFinalizationResult> => {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  const fileSystem = { ...nodeFileSystem, ...fileSystemOverrides };

  if (!isExactRepositoryRoot(root)) {
    fail("repository_root_invalid", "Finalization requires the exact Git repository root.");
  }
  if (!dependencies.verifyLocalProof(root)) {
    fail("local_live_proof_invalid", "The local live evidence proof did not verify.");
  }

  await Promise.all([
    assertRegularPrivateInput(root, LOCATORS.rawRun, fileSystem),
    assertRegularPrivateInput(root, LOCATORS.creatorDecision, fileSystem),
  ]);
  await Promise.all([
    assertSafeOutputTarget({
      root,
      locator: LOCATORS.privateFinalization,
      privateTarget: true,
      fileSystem,
    }),
    assertSafeOutputTarget({
      root,
      locator: LOCATORS.publicEvidence,
      privateTarget: false,
      fileSystem,
    }),
  ]);

  const [verifiedLiveRun, authority] = await Promise.all([
      readRegularJson(root, LOCATORS.rawRun, fileSystem).then((input) =>
        RunResultSchema.parse(input),
      ),
      dependencies.loadAuthority(root),
    ]).catch(() =>
      fail("registered_authority_invalid", "A registered finalization input is invalid."),
    );
  const simpleDecision = await readRegularJson(
    root,
    LOCATORS.creatorDecision,
    fileSystem,
  ).catch(() =>
    fail(
      "creator_decision_invalid",
      "The creator decision is pending, malformed, or unbound.",
    ),
  );

  const creatorDecision = (() => {
    try {
      return bindSimpleCreatorDecision({
        liveRun: verifiedLiveRun,
        decision: simpleDecision,
      });
    } catch {
      return fail(
        "creator_decision_invalid",
        "The creator decision is pending, malformed, or unbound.",
      );
    }
  })();

  const [finalization, publicEvidence] = await (async () => {
    try {
      const completedFinalization = await dependencies.finalize({
        worldPack: authority.worldPack,
        replayCases: authority.replayCases,
        fixtureModel: authority.fixtureModel,
        liveRequest: authority.liveRequest,
        verifiedLiveRun,
        exactOverlay: authority.overlay,
        exactSnapshot: authority.snapshot,
        creatorDecision,
      });
      const evidence = dependencies.buildEvidence({
        liveRequest: authority.liveRequest,
        verifiedLiveRun,
        creatorDecision,
        finalization: completedFinalization,
      });
      return [completedFinalization, evidence] as const;
    } catch {
      return fail(
        "live_finalization_failed",
        "The registered finalization or evidence gate failed.",
      );
    }
  })();

  const privateSource = pretty({
    schemaVersion: 1,
    evidenceType: "private_live_creator_finalization",
    requestSha256: sha256Canonical(authority.liveRequest),
    creatorDecision,
    finalization,
  });

  // Re-read every mutable local authority immediately before committing the pair.
  // The finalizer is pure, so any drift aborts without leaving state or evidence.
  const [currentRawRun, currentSimpleDecision, currentAuthority] = await Promise.all([
    readRegularJson(root, LOCATORS.rawRun, fileSystem),
    readRegularJson(root, LOCATORS.creatorDecision, fileSystem),
    dependencies.loadAuthority(root),
  ]).catch(() =>
    fail("registered_authority_invalid", "Finalization authority changed before commit."),
  );
  if (
    canonicalJson(currentRawRun) !== canonicalJson(verifiedLiveRun) ||
    canonicalJson(currentSimpleDecision) !== canonicalJson(simpleDecision)
  ) {
    fail("creator_decision_invalid", "The private live input changed before commit.");
  }
  if (
    canonicalJson(currentAuthority.worldPack) !== canonicalJson(authority.worldPack) ||
    canonicalJson(currentAuthority.overlay) !== canonicalJson(authority.overlay) ||
    canonicalJson(currentAuthority.snapshot) !== canonicalJson(authority.snapshot) ||
    canonicalJson(currentAuthority.replayCases) !== canonicalJson(authority.replayCases) ||
    canonicalJson(currentAuthority.liveRequest) !== canonicalJson(authority.liveRequest)
  ) {
    fail("registered_authority_invalid", "Registered authority changed before commit.");
  }
  if (!dependencies.verifyLocalProof(root)) {
    fail("local_live_proof_invalid", "The local live proof changed before commit.");
  }
  await Promise.all([
    assertSafeOutputTarget({
      root,
      locator: LOCATORS.privateFinalization,
      privateTarget: true,
      fileSystem,
    }),
    assertSafeOutputTarget({
      root,
      locator: LOCATORS.publicEvidence,
      privateTarget: false,
      fileSystem,
    }),
  ]);
  await writeEvidencePair({
    root,
    privateSource,
    publicSource: pretty(publicEvidence),
    fileSystem,
  });

  return {
    status: finalization.status,
    action: creatorDecision.action,
    publicEvidence,
  };
};

type CliCode = LiveCreatorDecisionFinalizationCode | "unexpected_failure";

export const formatLiveCreatorFinalizationLine = (
  result:
    | { ok: true; status: "applied" | "rejected"; action: "accept" | "edit" | "reject" }
    | { ok: false; code: CliCode },
): string =>
  `${JSON.stringify({
    schemaVersion: 1,
    evidenceType: "live_creator_finalization",
    ...result,
  })}\n`;

export const runLiveCreatorFinalizationCli = async ({
  root = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  dependencies,
  fileSystem,
}: {
  root?: string;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  dependencies?: Partial<LiveCreatorDecisionFinalizationDependencies>;
  fileSystem?: Partial<FinalizationFileSystem>;
} = {}): Promise<number> => {
  try {
    const result = await finalizeLiveCreatorDecision({
      root,
      dependencies,
      fileSystem,
    });
    stdout.write(
      formatLiveCreatorFinalizationLine({
        ok: true,
        status: result.status,
        action: result.action,
      }),
    );
    return 0;
  } catch (error) {
    const code =
      error instanceof LiveCreatorDecisionFinalizationError
        ? error.code
        : "unexpected_failure";
    stderr.write(formatLiveCreatorFinalizationLine({ ok: false, code }));
    return 1;
  }
};

export const isDirectLiveCreatorFinalizationExecution = (
  moduleUrl: string,
  entryPath: string | undefined = process.argv[1],
): boolean =>
  entryPath !== undefined &&
  path.resolve(entryPath) === path.resolve(fileURLToPath(moduleUrl));

if (isDirectLiveCreatorFinalizationExecution(import.meta.url)) {
  void runLiveCreatorFinalizationCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

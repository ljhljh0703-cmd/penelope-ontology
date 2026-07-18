import { createHash, randomUUID } from "node:crypto";
import {
  WorldSimulationSessionSchema,
  type WorldSimulationSession,
} from "@/src/contracts/world-runtime";

const MAX_WORLD_SESSION_CHECKPOINTS = 64;
const WORLD_SESSION_TTL_MS = 30 * 60 * 1_000;

export type WorldSessionCheckpoint = {
  sessionId: string;
  parentCheckpointId: string | null;
  session: WorldSimulationSession;
  previousVisibleSceneSummary: string | null;
  createdAtMs: number;
};

type StoredWorldSessionCheckpoint = WorldSessionCheckpoint & {
  turnInFlight: boolean;
  mainlineAdvanced: boolean;
  creatorAccessTokenHash: string;
};

const checkpoints = new Map<string, StoredWorldSessionCheckpoint>();

const publicCheckpoint = (
  checkpoint: StoredWorldSessionCheckpoint,
): WorldSessionCheckpoint => {
  const {
    turnInFlight,
    mainlineAdvanced,
    creatorAccessTokenHash,
    ...view
  } = checkpoint;
  void turnInFlight;
  void mainlineAdvanced;
  void creatorAccessTokenHash;
  return structuredClone(view);
};

const hashCreatorAccessToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

const prune = (nowMs: number): void => {
  for (const [id, checkpoint] of checkpoints) {
    if (nowMs - checkpoint.createdAtMs > WORLD_SESSION_TTL_MS) checkpoints.delete(id);
  }
  while (checkpoints.size >= MAX_WORLD_SESSION_CHECKPOINTS) {
    const oldest = [...checkpoints.values()].sort(
      (left, right) => left.createdAtMs - right.createdAtMs,
    )[0];
    if (!oldest) break;
    checkpoints.delete(oldest.sessionId);
  }
};

export const saveWorldSessionCheckpoint = ({
  session,
  parentCheckpointId,
  previousVisibleSceneSummary,
  creatorAccessToken,
  nowMs = Date.now(),
  idFactory = randomUUID,
}: {
  session: WorldSimulationSession;
  parentCheckpointId: string | null;
  previousVisibleSceneSummary: string | null;
  creatorAccessToken?: string;
  nowMs?: number;
  idFactory?: () => string;
}): WorldSessionCheckpoint => {
  prune(nowMs);
  const parent = parentCheckpointId
    ? checkpoints.get(parentCheckpointId)
    : null;
  if (parentCheckpointId && !parent) {
    throw new Error("The parent world checkpoint is missing or expired.");
  }
  if (!parent && !creatorAccessToken) {
    throw new Error("A root world checkpoint requires creator capability authority.");
  }
  const sessionId = idFactory();
  if (checkpoints.has(sessionId)) throw new Error("World session checkpoint identifier collision.");
  const checkpoint = {
    sessionId,
    parentCheckpointId,
    session: WorldSimulationSessionSchema.parse(structuredClone(session)),
    previousVisibleSceneSummary,
    createdAtMs: nowMs,
    turnInFlight: false,
    mainlineAdvanced: false,
    creatorAccessTokenHash:
      parent?.creatorAccessTokenHash ??
      hashCreatorAccessToken(creatorAccessToken ?? ""),
  };
  checkpoints.set(sessionId, checkpoint);
  return publicCheckpoint(checkpoint);
};

export const loadWorldSessionCheckpoint = (
  sessionId: string,
  nowMs = Date.now(),
): WorldSessionCheckpoint | null => {
  prune(nowMs);
  const checkpoint = checkpoints.get(sessionId);
  return checkpoint ? publicCheckpoint(checkpoint) : null;
};

export const loadWorldCreatorCheckpoint = ({
  sessionId,
  creatorAccessToken,
  nowMs = Date.now(),
}: {
  sessionId: string;
  creatorAccessToken: string;
  nowMs?: number;
}): WorldSessionCheckpoint | null => {
  prune(nowMs);
  const checkpoint = checkpoints.get(sessionId);
  if (
    !checkpoint ||
    checkpoint.creatorAccessTokenHash !==
      hashCreatorAccessToken(creatorAccessToken)
  ) {
    return null;
  }
  return publicCheckpoint(checkpoint);
};

export type WorldSessionTurnReservation =
  | { status: "reserved"; checkpoint: WorldSessionCheckpoint }
  | { status: "missing" }
  | { status: "stale" }
  | { status: "busy" }
  | { status: "mainline_advanced" };

export const reserveWorldSessionTurn = ({
  sessionId,
  expectedStateHash,
  forkBeforeAction,
  nowMs = Date.now(),
}: {
  sessionId: string;
  expectedStateHash: string;
  forkBeforeAction: boolean;
  nowMs?: number;
}): WorldSessionTurnReservation => {
  prune(nowMs);
  const checkpoint = checkpoints.get(sessionId);
  if (!checkpoint) return { status: "missing" };
  if (checkpoint.session.state.stateHash !== expectedStateHash) {
    return { status: "stale" };
  }
  if (checkpoint.turnInFlight) return { status: "busy" };
  if (!forkBeforeAction && checkpoint.mainlineAdvanced) {
    return { status: "mainline_advanced" };
  }
  checkpoint.turnInFlight = true;
  return { status: "reserved", checkpoint: publicCheckpoint(checkpoint) };
};

export const releaseWorldSessionTurn = ({
  sessionId,
  commitMainlineAdvance,
}: {
  sessionId: string;
  commitMainlineAdvance: boolean;
}): void => {
  const checkpoint = checkpoints.get(sessionId);
  if (!checkpoint || !checkpoint.turnInFlight) return;
  checkpoint.turnInFlight = false;
  if (commitMainlineAdvance) checkpoint.mainlineAdvanced = true;
};

export const existingWorldBranchIds = (): Set<string> =>
  new Set([...checkpoints.values()].map(({ session }) => session.cursor.branchId));

export const resetWorldSessionStoreForTests = (): void => checkpoints.clear();

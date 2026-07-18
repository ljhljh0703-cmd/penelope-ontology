import { createHash, randomUUID } from "node:crypto";
import type {
  ResolvedNarrationPipelineArtifacts,
  WorldNarrationPipelineResult,
} from "@/src/application/world-narration-pipeline";
import {
  projectModelNarrationOutputForWorldApi,
  WorldNarrationDraftAuthoritySchema,
  WorldPresentationTransportSchema,
  type WorldNarrationDraftAuthority,
  type WorldPresentationTransport,
} from "@/src/contracts/world-api";
import {
  ModelNarrationOutputSchema,
  NarrationRendererTraceSchema,
  type ModelNarrationOutput,
  type NarrationRendererTrace,
} from "@/src/contracts/world-narrator";
import {
  WorldSimulationSessionSchema,
  WorldTurnReceiptSchema,
  type WorldSimulationSession,
  type WorldTurnReceipt,
} from "@/src/contracts/world-runtime";
import { sha256Canonical } from "@/src/domain/canonical-json";

const MAX_WORLD_SESSION_CHECKPOINTS = 64;
const WORLD_SESSION_TTL_MS = 30 * 60 * 1_000;
const MAX_WORLD_NARRATION_PENDING_DRAFTS = 64;
const WORLD_NARRATION_PENDING_DRAFT_TTL_MS = 10 * 60 * 1_000;
const WORLD_NARRATION_PENDING_DRAFT_RETENTION_MS = 30 * 60 * 1_000;

export type WorldSessionCheckpoint = {
  sessionId: string;
  parentCheckpointId: string | null;
  session: WorldSimulationSession;
  transport: WorldPresentationTransport;
  previousVisibleSceneSummary: string | null;
  narrationDecisionReceipt: WorldNarrationHumanDecisionReceipt | null;
  createdAtMs: number;
};

type StoredWorldSessionCheckpoint = WorldSessionCheckpoint & {
  turnInFlight: boolean;
  mainlineAdvanced: boolean;
  creatorAccessTokenHash: string;
};

const checkpoints = new Map<string, StoredWorldSessionCheckpoint>();

export type WorldNarrationPendingDraftReceipt = {
  draftId: string;
  draftHash: string;
  baseCheckpointId: string;
  baseStateHash: string;
  candidateStateHash: string;
  receiptHash: string;
  modelOutputHash: string;
  artifactsHash: string;
  traceHash: string;
  transport: WorldPresentationTransport;
  forkBeforeAction: boolean;
  creatorReviewRuleIds: string[];
  createdAtMs: number;
  expiresAtMs: number;
  consumed: false;
};

export type WorldNarrationDraftDecisionAuthority =
  WorldNarrationDraftAuthority;

export type WorldNarrationHumanDecisionReceiptPayload = {
  receiptId: string;
  decision: "approve" | "edit" | "reject";
  draftId: string;
  draftHash: string;
  baseCheckpointId: string;
  baseStateHash: string;
  candidateStateHash: string;
  candidateReceiptHash: string;
  originalModelOutputHash: string;
  approvedModelOutputHash: string | null;
  originalCreatorReviewRuleIds: string[];
  satisfiedCreatorReviewRuleIds: string[];
  decidedAtMs: number;
};

export type WorldNarrationHumanDecisionReceipt =
  WorldNarrationHumanDecisionReceiptPayload & {
    receiptHash: string;
  };

type StoredWorldNarrationPendingDraft = Omit<
  WorldNarrationPendingDraftReceipt,
  "consumed"
> & {
  consumed: boolean;
  decisionReservationId: string | null;
  creatorAccessTokenHash: string;
  candidateSession: WorldSimulationSession;
  candidateReceipt: WorldTurnReceipt;
  modelOutput: ModelNarrationOutput;
  trace: NarrationRendererTrace;
  artifacts: ResolvedNarrationPipelineArtifacts;
};

export type ReservedWorldNarrationPendingDraft =
  WorldNarrationDraftDecisionAuthority & {
    decisionReservationId: string;
    candidateSession: WorldSimulationSession;
    candidateReceipt: WorldTurnReceipt;
    modelOutput: ModelNarrationOutput;
    trace: NarrationRendererTrace;
    artifacts: ResolvedNarrationPipelineArtifacts;
  };

export type WorldNarrationDraftReservationResult =
  | { status: "reserved"; draft: ReservedWorldNarrationPendingDraft }
  | { status: "missing" }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "busy" }
  | { status: "unauthorized" }
  | { status: "tampered" }
  | { status: "stale" };

const pendingNarrationDrafts = new Map<
  string,
  StoredWorldNarrationPendingDraft
>();
const pendingNarrationDraftByBaseCheckpoint = new Map<string, string>();

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

const sortedUnique = (values: ReadonlyArray<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const receiptPayloadHash = (receipt: WorldTurnReceipt): string => {
  const { receiptHash, ...payload } = receipt;
  void receiptHash;
  return sha256Canonical(payload);
};

const validateNarrationDecisionReceipt = ({
  receipt,
  session,
}: {
  receipt: WorldNarrationHumanDecisionReceipt;
  session: WorldSimulationSession;
}): WorldNarrationHumanDecisionReceipt => {
  const { receiptHash, ...payload } = structuredClone(receipt);
  const hashes = [
    receiptHash,
    payload.draftHash,
    payload.baseStateHash,
    payload.candidateStateHash,
    payload.candidateReceiptHash,
    payload.originalModelOutputHash,
    payload.approvedModelOutputHash,
  ].filter((value): value is string => value !== null);
  if (
    payload.decision === "reject" ||
    payload.approvedModelOutputHash === null ||
    payload.receiptId.length === 0 ||
    payload.draftId.length === 0 ||
    payload.baseCheckpointId.length === 0 ||
    !hashes.every((value) => /^[a-f0-9]{64}$/u.test(value)) ||
    payload.candidateStateHash !== session.state.stateHash ||
    payload.candidateReceiptHash !== session.turns.at(-1)?.receiptHash ||
    payload.originalCreatorReviewRuleIds.length === 0 ||
    JSON.stringify(payload.originalCreatorReviewRuleIds) !==
      JSON.stringify(sortedUnique(payload.originalCreatorReviewRuleIds)) ||
    JSON.stringify(payload.satisfiedCreatorReviewRuleIds) !==
      JSON.stringify(sortedUnique(payload.satisfiedCreatorReviewRuleIds)) ||
    sha256Canonical(payload) !== receiptHash
  ) {
    throw new Error("The narration decision receipt is invalid for this checkpoint.");
  }
  return { ...payload, receiptHash };
};

const pendingDraftHashPayload = (
  draft: Omit<
    StoredWorldNarrationPendingDraft,
    | "draftHash"
    | "candidateSession"
    | "candidateReceipt"
    | "modelOutput"
    | "trace"
    | "artifacts"
    | "decisionReservationId"
    | "consumed"
  >,
) => ({
  schemaVersion: 1,
  draftId: draft.draftId,
  baseCheckpointId: draft.baseCheckpointId,
  baseStateHash: draft.baseStateHash,
  candidateStateHash: draft.candidateStateHash,
  receiptHash: draft.receiptHash,
  modelOutputHash: draft.modelOutputHash,
  artifactsHash: draft.artifactsHash,
  traceHash: draft.traceHash,
  transport: draft.transport,
  forkBeforeAction: draft.forkBeforeAction,
  creatorReviewRuleIds: draft.creatorReviewRuleIds,
  createdAtMs: draft.createdAtMs,
  expiresAtMs: draft.expiresAtMs,
  creatorAccessTokenHash: draft.creatorAccessTokenHash,
});

const publicPendingDraftReceipt = (
  draft: StoredWorldNarrationPendingDraft,
): WorldNarrationPendingDraftReceipt => ({
  draftId: draft.draftId,
  draftHash: draft.draftHash,
  baseCheckpointId: draft.baseCheckpointId,
  baseStateHash: draft.baseStateHash,
  candidateStateHash: draft.candidateStateHash,
  receiptHash: draft.receiptHash,
  modelOutputHash: draft.modelOutputHash,
  artifactsHash: draft.artifactsHash,
  traceHash: draft.traceHash,
  transport: draft.transport,
  forkBeforeAction: draft.forkBeforeAction,
  creatorReviewRuleIds: [...draft.creatorReviewRuleIds],
  createdAtMs: draft.createdAtMs,
  expiresAtMs: draft.expiresAtMs,
  consumed: false,
});

const decisionAuthorityMatches = (
  draft: StoredWorldNarrationPendingDraft,
  authority: WorldNarrationDraftDecisionAuthority,
): boolean =>
  draft.draftId === authority.draftId &&
  draft.draftHash === authority.draftHash &&
  draft.baseCheckpointId === authority.baseCheckpointId &&
  draft.baseStateHash === authority.baseStateHash &&
  draft.candidateStateHash === authority.candidateStateHash &&
  draft.receiptHash === authority.receiptHash &&
  draft.modelOutputHash === authority.modelOutputHash &&
  draft.artifactsHash === authority.artifactsHash &&
  draft.traceHash === authority.traceHash &&
  draft.transport === authority.transport &&
  draft.forkBeforeAction === authority.forkBeforeAction &&
  draft.expiresAtMs === authority.expiresAtMs &&
  JSON.stringify(draft.creatorReviewRuleIds) ===
    JSON.stringify(authority.creatorReviewRuleIds);

const storedPendingDraftIntegrityValid = (
  draft: StoredWorldNarrationPendingDraft,
): boolean => {
  const hashPayload = pendingDraftHashPayload(draft);
  return (
    draft.draftHash === sha256Canonical(hashPayload) &&
    draft.candidateSession.state.stateHash === draft.candidateStateHash &&
    draft.candidateReceipt.receiptHash === draft.receiptHash &&
    draft.candidateReceipt.beforeStateHash === draft.baseStateHash &&
    draft.candidateReceipt.afterStateHash === draft.candidateStateHash &&
    draft.candidateSession.turns.at(-1)?.receiptHash === draft.receiptHash &&
    receiptPayloadHash(draft.candidateReceipt) === draft.receiptHash &&
    sha256Canonical(draft.modelOutput) === draft.modelOutputHash &&
    sha256Canonical(draft.artifacts) === draft.artifactsHash &&
    sha256Canonical(draft.trace) === draft.traceHash &&
    draft.creatorReviewRuleIds.length > 0 &&
    JSON.stringify(draft.creatorReviewRuleIds) ===
      JSON.stringify(sortedUnique(draft.creatorReviewRuleIds))
  );
};

const consumePendingDraft = (draft: StoredWorldNarrationPendingDraft): void => {
  draft.consumed = true;
  draft.decisionReservationId = null;
  if (
    pendingNarrationDraftByBaseCheckpoint.get(draft.baseCheckpointId) ===
    draft.draftId
  ) {
    pendingNarrationDraftByBaseCheckpoint.delete(draft.baseCheckpointId);
  }
};

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
  for (const [draftId, draft] of pendingNarrationDrafts) {
    if (
      nowMs - draft.expiresAtMs >
      WORLD_NARRATION_PENDING_DRAFT_RETENTION_MS
    ) {
      pendingNarrationDrafts.delete(draftId);
      if (
        pendingNarrationDraftByBaseCheckpoint.get(draft.baseCheckpointId) ===
        draftId
      ) {
        pendingNarrationDraftByBaseCheckpoint.delete(draft.baseCheckpointId);
      }
    }
  }
  while (pendingNarrationDrafts.size >= MAX_WORLD_NARRATION_PENDING_DRAFTS) {
    const oldest = [...pendingNarrationDrafts.values()].sort(
      (left, right) => left.createdAtMs - right.createdAtMs,
    )[0];
    if (!oldest) break;
    pendingNarrationDrafts.delete(oldest.draftId);
    if (
      pendingNarrationDraftByBaseCheckpoint.get(oldest.baseCheckpointId) ===
      oldest.draftId
    ) {
      pendingNarrationDraftByBaseCheckpoint.delete(oldest.baseCheckpointId);
    }
  }
};

export const saveWorldSessionCheckpoint = ({
  session,
  transport: transportInput,
  parentCheckpointId,
  previousVisibleSceneSummary,
  narrationDecisionReceipt = null,
  narrationDecisionReservation = null,
  creatorAccessToken,
  nowMs = Date.now(),
  idFactory = randomUUID,
}: {
  session: WorldSimulationSession;
  transport: WorldPresentationTransport;
  parentCheckpointId: string | null;
  previousVisibleSceneSummary: string | null;
  narrationDecisionReceipt?: WorldNarrationHumanDecisionReceipt | null;
  narrationDecisionReservation?: {
    draftId: string;
    decisionReservationId: string;
  } | null;
  creatorAccessToken?: string;
  nowMs?: number;
  idFactory?: () => string;
}): WorldSessionCheckpoint => {
  prune(nowMs);
  const transport = WorldPresentationTransportSchema.parse(transportInput);
  const parent = parentCheckpointId
    ? checkpoints.get(parentCheckpointId)
    : null;
  if (parentCheckpointId && !parent) {
    throw new Error("The parent world checkpoint is missing or expired.");
  }
  if (!parent && !creatorAccessToken) {
    throw new Error("A root world checkpoint requires creator capability authority.");
  }
  if (parent && parent.transport !== transport) {
    throw new Error("A child world checkpoint must preserve its transport authority.");
  }
  if (Boolean(narrationDecisionReceipt) !== Boolean(narrationDecisionReservation)) {
    throw new Error(
      "An approved narration checkpoint requires its decision receipt and reservation together.",
    );
  }
  const sessionId = idFactory();
  if (checkpoints.has(sessionId)) throw new Error("World session checkpoint identifier collision.");
  const parsedSession = WorldSimulationSessionSchema.parse(
    structuredClone(session),
  );
  const parsedNarrationDecisionReceipt = narrationDecisionReceipt
    ? validateNarrationDecisionReceipt({
        receipt: narrationDecisionReceipt,
        session: parsedSession,
      })
    : null;
  const narrationDraftToCommit = narrationDecisionReservation
    ? pendingNarrationDrafts.get(narrationDecisionReservation.draftId)
    : null;
  if (narrationDecisionReservation) {
    if (
      !narrationDraftToCommit ||
      narrationDraftToCommit.consumed ||
      narrationDraftToCommit.expiresAtMs <= nowMs ||
      narrationDraftToCommit.decisionReservationId !==
        narrationDecisionReservation.decisionReservationId ||
      !parsedNarrationDecisionReceipt ||
      !parent ||
      !parent.turnInFlight ||
      parent.session.state.stateHash !== narrationDraftToCommit.baseStateHash ||
      transport !== narrationDraftToCommit.transport ||
      parentCheckpointId !== narrationDraftToCommit.baseCheckpointId ||
      sha256Canonical(parsedSession) !==
        sha256Canonical(narrationDraftToCommit.candidateSession) ||
      parsedNarrationDecisionReceipt.draftId !== narrationDraftToCommit.draftId ||
      parsedNarrationDecisionReceipt.draftHash !== narrationDraftToCommit.draftHash ||
      parsedNarrationDecisionReceipt.baseCheckpointId !==
        narrationDraftToCommit.baseCheckpointId ||
      parsedNarrationDecisionReceipt.baseStateHash !==
        narrationDraftToCommit.baseStateHash ||
      parsedNarrationDecisionReceipt.candidateStateHash !==
        narrationDraftToCommit.candidateStateHash ||
      parsedNarrationDecisionReceipt.candidateReceiptHash !==
        narrationDraftToCommit.receiptHash ||
      parsedNarrationDecisionReceipt.originalModelOutputHash !==
        narrationDraftToCommit.modelOutputHash ||
      JSON.stringify(parsedNarrationDecisionReceipt.originalCreatorReviewRuleIds) !==
        JSON.stringify(narrationDraftToCommit.creatorReviewRuleIds)
    ) {
      throw new Error(
        "The approved narration checkpoint does not bind its held draft decision.",
      );
    }
  }
  const checkpoint = {
    sessionId,
    parentCheckpointId,
    session: parsedSession,
    transport,
    previousVisibleSceneSummary,
    narrationDecisionReceipt: parsedNarrationDecisionReceipt,
    createdAtMs: nowMs,
    turnInFlight: false,
    mainlineAdvanced: false,
    creatorAccessTokenHash:
      parent?.creatorAccessTokenHash ??
      hashCreatorAccessToken(creatorAccessToken ?? ""),
  };
  checkpoints.set(sessionId, checkpoint);
  if (narrationDraftToCommit) consumePendingDraft(narrationDraftToCommit);
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
  | { status: "pending_creator_review" }
  | { status: "mainline_advanced" };

export const reserveWorldSessionTurn = ({
  sessionId,
  expectedStateHash,
  forkBeforeAction,
  narrationDecisionReservation,
  nowMs = Date.now(),
}: {
  sessionId: string;
  expectedStateHash: string;
  forkBeforeAction: boolean;
  narrationDecisionReservation?: {
    draftId: string;
    decisionReservationId: string;
  };
  nowMs?: number;
}): WorldSessionTurnReservation => {
  prune(nowMs);
  const checkpoint = checkpoints.get(sessionId);
  if (!checkpoint) return { status: "missing" };
  if (checkpoint.session.state.stateHash !== expectedStateHash) {
    return { status: "stale" };
  }
  const pendingDraftId = pendingNarrationDraftByBaseCheckpoint.get(sessionId);
  const pendingDraft = pendingDraftId
    ? pendingNarrationDrafts.get(pendingDraftId)
    : null;
  if (
    pendingDraft &&
    !pendingDraft.consumed &&
    pendingDraft.expiresAtMs > nowMs &&
    !(
      narrationDecisionReservation?.draftId === pendingDraft.draftId &&
      narrationDecisionReservation.decisionReservationId ===
        pendingDraft.decisionReservationId
    )
  ) {
    return { status: "pending_creator_review" };
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

export const createWorldNarrationPendingDraft = ({
  baseCheckpointId,
  baseStateHash,
  candidateSession: candidateSessionInput,
  candidateReceipt: candidateReceiptInput,
  modelOutput: modelOutputInput,
  trace: traceInput,
  artifacts: artifactsInput,
  transport: transportInput,
  forkBeforeAction,
  creatorReviewRuleIds: creatorReviewRuleIdsInput,
  pipeline,
  creatorAccessToken,
  nowMs = Date.now(),
  idFactory = randomUUID,
}: {
  baseCheckpointId: string;
  baseStateHash: string;
  candidateSession: WorldSimulationSession;
  candidateReceipt: WorldTurnReceipt;
  modelOutput: ModelNarrationOutput;
  trace: NarrationRendererTrace;
  artifacts: ResolvedNarrationPipelineArtifacts;
  transport: WorldPresentationTransport;
  forkBeforeAction: boolean;
  creatorReviewRuleIds: ReadonlyArray<string>;
  pipeline: WorldNarrationPipelineResult;
  creatorAccessToken: string;
  nowMs?: number;
  idFactory?: () => string;
}): WorldNarrationPendingDraftReceipt => {
  prune(nowMs);
  const baseCheckpoint = checkpoints.get(baseCheckpointId);
  if (!baseCheckpoint) {
    throw new Error("The base world checkpoint is missing or expired.");
  }
  if (
    baseCheckpoint.session.state.stateHash !== baseStateHash ||
    !baseCheckpoint.turnInFlight
  ) {
    throw new Error("The base world checkpoint is not reserved at the expected state.");
  }
  if (
    baseCheckpoint.creatorAccessTokenHash !==
    hashCreatorAccessToken(creatorAccessToken)
  ) {
    throw new Error("The creator capability does not authorize this checkpoint.");
  }

  const existingDraftId = pendingNarrationDraftByBaseCheckpoint.get(
    baseCheckpointId,
  );
  const existingDraft = existingDraftId
    ? pendingNarrationDrafts.get(existingDraftId)
    : null;
  if (
    existingDraft &&
    !existingDraft.consumed &&
    existingDraft.expiresAtMs > nowMs
  ) {
    throw new Error("The base world checkpoint already has a pending narration draft.");
  }
  if (existingDraft) consumePendingDraft(existingDraft);

  const candidateSession = WorldSimulationSessionSchema.parse(
    structuredClone(candidateSessionInput),
  );
  const candidateReceipt = WorldTurnReceiptSchema.parse(
    structuredClone(candidateReceiptInput),
  );
  const modelOutput = ModelNarrationOutputSchema.parse(
    structuredClone(modelOutputInput),
  );
  projectModelNarrationOutputForWorldApi(modelOutput);
  const trace = NarrationRendererTraceSchema.parse(structuredClone(traceInput));
  const artifacts = structuredClone(artifactsInput);
  const transport = WorldPresentationTransportSchema.parse(transportInput);
  if (transport !== baseCheckpoint.transport) {
    throw new Error("The narration draft must preserve base transport authority.");
  }
  const creatorReviewRuleIds = sortedUnique(creatorReviewRuleIdsInput);
  const validatedCreatorReviewRuleIds = sortedUnique(
    pipeline.validation?.findings
      .filter(({ severity }) => severity === "creator_review")
      .map(({ ruleId }) => ruleId) ?? [],
  );
  if (
    creatorReviewRuleIds.length === 0 ||
    creatorReviewRuleIds.length !== creatorReviewRuleIdsInput.length ||
    pipeline.disposition !== "creator_review" ||
    pipeline.validation?.hardPass !== true ||
    pipeline.validation.findings.some(
      ({ severity }) => severity === "hard_fail",
    ) ||
    !pipeline.modelOutput ||
    !pipeline.trace ||
    sha256Canonical(pipeline.modelOutput) !== sha256Canonical(modelOutput) ||
    sha256Canonical(pipeline.trace) !== sha256Canonical(trace) ||
    JSON.stringify(validatedCreatorReviewRuleIds) !==
      JSON.stringify(creatorReviewRuleIds)
  ) {
    throw new Error(
      "A pending narration draft requires one exact hard-passing creator-review result.",
    );
  }
  if (
    candidateReceipt.beforeStateHash !== baseStateHash ||
    candidateReceipt.afterStateHash !== candidateSession.state.stateHash ||
    candidateSession.turns.at(-1)?.receiptHash !== candidateReceipt.receiptHash ||
    receiptPayloadHash(candidateReceipt) !== candidateReceipt.receiptHash
  ) {
    throw new Error("The narration candidate does not bind the reserved base state.");
  }

  const draftId = `draft.world_narration.${idFactory()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9_-]/gu, "")}`;
  if (pendingNarrationDrafts.has(draftId)) {
    throw new Error("World narration draft identifier collision.");
  }
  const createdAtMs = nowMs;
  const expiresAtMs = nowMs + WORLD_NARRATION_PENDING_DRAFT_TTL_MS;
  const draftWithoutHash = {
    draftId,
    baseCheckpointId,
    baseStateHash,
    candidateStateHash: candidateSession.state.stateHash,
    receiptHash: candidateReceipt.receiptHash,
    modelOutputHash: sha256Canonical(modelOutput),
    artifactsHash: sha256Canonical(artifacts),
    traceHash: sha256Canonical(trace),
    transport,
    forkBeforeAction,
    creatorReviewRuleIds,
    createdAtMs,
    expiresAtMs,
    creatorAccessTokenHash: baseCheckpoint.creatorAccessTokenHash,
  };
  const draft: StoredWorldNarrationPendingDraft = {
    ...draftWithoutHash,
    draftHash: sha256Canonical(pendingDraftHashPayload(draftWithoutHash)),
    consumed: false,
    decisionReservationId: null,
    candidateSession,
    candidateReceipt,
    modelOutput,
    trace,
    artifacts,
  };
  if (!storedPendingDraftIntegrityValid(draft)) {
    throw new Error("The narration draft failed its server-side integrity check.");
  }
  pendingNarrationDrafts.set(draftId, draft);
  pendingNarrationDraftByBaseCheckpoint.set(baseCheckpointId, draftId);
  return publicPendingDraftReceipt(draft);
};

export const reserveWorldNarrationDraftDecision = ({
  authority,
  creatorAccessToken,
  nowMs = Date.now(),
}: {
  authority: WorldNarrationDraftDecisionAuthority;
  creatorAccessToken: string;
  nowMs?: number;
}): WorldNarrationDraftReservationResult => {
  prune(nowMs);
  const parsedAuthority = WorldNarrationDraftAuthoritySchema.safeParse(authority);
  if (!parsedAuthority.success) return { status: "tampered" };
  const checkedAuthority = parsedAuthority.data;
  const draft = pendingNarrationDrafts.get(checkedAuthority.draftId);
  if (!draft) return { status: "missing" };
  if (draft.consumed) return { status: "consumed" };
  if (draft.expiresAtMs <= nowMs) {
    consumePendingDraft(draft);
    return { status: "expired" };
  }
  if (
    draft.creatorAccessTokenHash !== hashCreatorAccessToken(creatorAccessToken)
  ) {
    return { status: "unauthorized" };
  }
  if (!decisionAuthorityMatches(draft, checkedAuthority)) {
    return { status: "tampered" };
  }
  if (!storedPendingDraftIntegrityValid(draft)) {
    consumePendingDraft(draft);
    return { status: "tampered" };
  }
  const baseCheckpoint = checkpoints.get(draft.baseCheckpointId);
  if (
    !baseCheckpoint ||
    baseCheckpoint.session.state.stateHash !== draft.baseStateHash ||
    (!draft.forkBeforeAction && baseCheckpoint.mainlineAdvanced)
  ) {
    consumePendingDraft(draft);
    return { status: "stale" };
  }
  if (draft.decisionReservationId) return { status: "busy" };
  draft.decisionReservationId = randomUUID();
  return {
    status: "reserved",
    draft: {
      draftId: draft.draftId,
      draftHash: draft.draftHash,
      baseCheckpointId: draft.baseCheckpointId,
      baseStateHash: draft.baseStateHash,
      candidateStateHash: draft.candidateStateHash,
      receiptHash: draft.receiptHash,
      modelOutputHash: draft.modelOutputHash,
      artifactsHash: draft.artifactsHash,
      traceHash: draft.traceHash,
      transport: draft.transport,
      forkBeforeAction: draft.forkBeforeAction,
      creatorReviewRuleIds: [...draft.creatorReviewRuleIds],
      expiresAtMs: draft.expiresAtMs,
      decisionReservationId: draft.decisionReservationId,
      candidateSession: structuredClone(draft.candidateSession),
      candidateReceipt: structuredClone(draft.candidateReceipt),
      modelOutput: structuredClone(draft.modelOutput),
      trace: structuredClone(draft.trace),
      artifacts: structuredClone(draft.artifacts),
    },
  };
};

export const commitWorldNarrationDraftDecision = ({
  draftId,
  decisionReservationId,
}: {
  draftId: string;
  decisionReservationId: string;
}): boolean => {
  const draft = pendingNarrationDrafts.get(draftId);
  if (
    !draft ||
    draft.consumed ||
    draft.decisionReservationId !== decisionReservationId
  ) {
    return false;
  }
  consumePendingDraft(draft);
  return true;
};

export const releaseWorldNarrationDraftDecision = ({
  draftId,
  decisionReservationId,
}: {
  draftId: string;
  decisionReservationId: string;
}): boolean => {
  const draft = pendingNarrationDrafts.get(draftId);
  if (
    !draft ||
    draft.consumed ||
    draft.decisionReservationId !== decisionReservationId
  ) {
    return false;
  }
  draft.decisionReservationId = null;
  return true;
};

export const existingWorldBranchIds = (): Set<string> =>
  new Set([...checkpoints.values()].map(({ session }) => session.cursor.branchId));

export const resetWorldSessionStoreForTests = (): void => {
  checkpoints.clear();
  pendingNarrationDrafts.clear();
  pendingNarrationDraftByBaseCheckpoint.clear();
};

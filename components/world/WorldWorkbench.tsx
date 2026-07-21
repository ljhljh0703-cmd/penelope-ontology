"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "@/components/world/WorldWorkbench.module.css";
import { FateFrame } from "@/components/world/FateFrame";
import { WorldForge } from "@/components/world/WorldForge";
import {
  compareWorldLines,
  deriveWorldPulse,
  type WorldPulseCheckpoint,
} from "@/components/world/world-delta";
import {
  WORLD_CREATOR_ACCESS_HEADER,
  WORLD_LIVE_TOKEN_HEADER,
  type WorldApiError,
  type WorldCreatorReceipt,
  type WorldCreatorDialogueResponse,
  type WorldCreatorTacitKnowledgeAnswer,
  type WorldEffect,
  type WorldEvent,
  type WorldNarrationDraftDecisionRequest,
  type WorldNarrationDraftDecisionResponse,
  type WorldPendingNarrationDraft,
  type WorldSessionView,
  type WorldTransport,
  type WorldTurnRequest,
} from "@/components/world/api-types";
import { selectVisualMomentTrigger } from "@/src/domain/visual-moment";

type Checkpoint = {
  sequence: number;
  view: WorldSessionView;
  creatorReceipt: WorldCreatorReceipt | null;
  creatorStatus: "loading" | "ready" | "locked";
  creatorError: string | null;
};

type JsonResponse<T> = {
  data: T;
  response: Response;
};

type WorldTurnResponse =
  | WorldSessionView
  | WorldPendingNarrationDraft
  | WorldCreatorDialogueResponse;

type StartWorldSessionOptions =
  | {
      packId?: string;
      creatorPackDefinition?: never;
      signal?: AbortSignal;
    }
  | {
      packId?: never;
      creatorPackDefinition: unknown;
      signal?: AbortSignal;
    };

const MAX_CREATOR_PACK_BYTES = 262_144;
const SESSION_PRIVATE_PACK_VALUE = "__session_private_pack__";

const isPendingNarrationDraft = (
  value: WorldTurnResponse,
): value is WorldPendingNarrationDraft =>
  "kind" in value && value.kind === "creator_review";

const isCreatorDialogueResponse = (
  value: WorldTurnResponse,
): value is WorldCreatorDialogueResponse =>
  "kind" in value &&
  [
    "creator_clarification",
    "creator_confirmation",
    "creator_blocked",
    "creator_expansion_required",
  ].includes(value.kind);

const humanizeId = (value: string): string =>
  value
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const shortHash = (value: string | null): string =>
  value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "None";

const testIdToken = (value: string): string =>
  value.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "").toLowerCase();

const branchLabel = (view: WorldSessionView): string => {
  if (
    view.cursor.parentBranchId === null ||
    view.cursor.branchId.startsWith("branch.canon_")
  ) {
    return "Baseline";
  }
  return `IF · ${view.cursor.branchId.split(".").slice(-1)[0] ?? "branch"}`;
};

const requestJson = async <T,>(
  path: string,
  body: unknown,
  token: string,
  signal?: AbortSignal,
  additionalHeaders: HeadersInit = {},
): Promise<JsonResponse<T>> => {
  const response = await fetch(path, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      ...(token ? { [WORLD_LIVE_TOKEN_HEADER]: token } : {}),
      ...additionalHeaders,
    },
    body: JSON.stringify(body),
  });

  let payload: T | WorldApiError;
  try {
    payload = (await response.json()) as T | WorldApiError;
  } catch {
    throw new Error(`${path} returned an unreadable response (${response.status}).`);
  }

  if (!response.ok) {
    const error = (payload as WorldApiError).error;
    const message =
      typeof error === "string"
        ? error
        : error?.message ?? `World request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return { data: payload as T, response };
};

const provenanceCopy = (view: WorldSessionView): string => {
  if (view.narratorTrace.provenance === "fixture") {
    return `Fixture narration · deterministic adapter ${view.narratorTrace.adapterId} · no model call`;
  }
  return `Model narration · local Codex CLI adapter ${view.narratorTrace.adapterId} · exact model identity is not reported by this trace`;
};

const movementEffects = (
  events: ReadonlyArray<WorldEvent>,
): Array<{ event: WorldEvent; effect: Extract<WorldEffect, { kind: "move_actor" }> }> =>
  events.flatMap((event) =>
    event.effects
      .filter(
        (effect): effect is Extract<WorldEffect, { kind: "move_actor" }> =>
          effect.kind === "move_actor",
      )
      .map((effect) => ({ event, effect })),
  );

const findCommonAncestor = (
  left: WorldPulseCheckpoint,
  right: WorldPulseCheckpoint,
  checkpoints: ReadonlyArray<Checkpoint>,
): Checkpoint | null => {
  const byId = new Map(
    checkpoints.map((checkpoint) => [checkpoint.view.sessionId, checkpoint]),
  );
  const leftAncestors = new Set<string>();
  let cursor = byId.get(left.view.sessionId);
  while (cursor) {
    leftAncestors.add(cursor.view.sessionId);
    const parentId = cursor.view.parentCheckpointId;
    cursor = parentId ? byId.get(parentId) : undefined;
  }

  cursor = byId.get(right.view.sessionId);
  while (cursor) {
    if (leftAncestors.has(cursor.view.sessionId)) return cursor;
    const parentId = cursor.view.parentCheckpointId;
    cursor = parentId ? byId.get(parentId) : undefined;
  }
  return null;
};

export function WorldWorkbench() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transport, setTransport] = useState<WorldTransport>("fixture");
  const [liveToken, setLiveToken] = useState("");
  const [action, setAction] = useState("");
  const [selectedCandidateActionId, setSelectedCandidateActionId] =
    useState<string | null>(null);
  const [creatorDialogue, setCreatorDialogue] =
    useState<WorldCreatorDialogueResponse | null>(null);
  const [creatorAnswer, setCreatorAnswer] = useState("");
  const [forkBeforeAction, setForkBeforeAction] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] =
    useState<WorldPendingNarrationDraft | null>(null);
  const [draftParagraphs, setDraftParagraphs] = useState<
    WorldPendingNarrationDraft["narration"]["paragraphs"]
  >([]);
  const autoStarted = useRef(false);
  const creatorCapability = useRef<string | null>(null);
  const importedCreatorPack = useRef<unknown | null>(null);
  const sceneHeadingRef = useRef<HTMLHeadingElement>(null);

  const activeCheckpoint = useMemo(
    () => checkpoints.find(({ view }) => view.sessionId === selectedId) ?? null,
    [checkpoints, selectedId],
  );
  const active = activeCheckpoint?.view ?? null;

  const selectedSequence = useMemo(
    () => checkpoints.find(({ view }) => view.sessionId === selectedId)?.sequence ?? null,
    [checkpoints, selectedId],
  );

  const loadCreatorReceipt = useCallback(
    async (
      view: WorldSessionView,
      capability: string | null,
      signal?: AbortSignal,
    ) => {
      if (!capability) {
        setCheckpoints((current) =>
          current.map((checkpoint) =>
            checkpoint.view.sessionId === view.sessionId
              ? {
                  ...checkpoint,
                  creatorStatus: "locked",
                  creatorError:
                    "Creator-view capability was not returned for this local session.",
                }
              : checkpoint,
          ),
        );
        return;
      }

      try {
        const { data } = await requestJson<WorldCreatorReceipt>(
          "/api/world/creator",
          {
            sessionId: view.sessionId,
            expectedStateHash: view.stateHash,
          },
          "",
          signal,
          { [WORLD_CREATOR_ACCESS_HEADER]: capability },
        );
        setCheckpoints((current) =>
          current.map((checkpoint) =>
            checkpoint.view.sessionId === view.sessionId
              ? {
                  ...checkpoint,
                  creatorReceipt: data,
                  creatorStatus: "ready",
                  creatorError: null,
                }
              : checkpoint,
          ),
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setCheckpoints((current) =>
          current.map((checkpoint) =>
            checkpoint.view.sessionId === view.sessionId
              ? {
                  ...checkpoint,
                  creatorReceipt: null,
                  creatorStatus: "locked",
                  creatorError:
                    caught instanceof Error
                      ? caught.message
                      : "The creator workbench projection could not be loaded.",
                }
              : checkpoint,
          ),
        );
      }
    },
    [],
  );

  const startSession = useCallback(
    async (
      nextTransport: WorldTransport,
      token: string,
      options: StartWorldSessionOptions = {},
    ) => {
      const { packId, creatorPackDefinition, signal } = options;
      setLoading(true);
      setError(null);
      try {
        const { data: view, response } = await requestJson<WorldSessionView>(
          "/api/world/session",
          {
            transport: nextTransport,
            ...(packId ? { packId } : {}),
            ...(creatorPackDefinition !== undefined
              ? { creatorPackDefinition }
              : {}),
          },
          nextTransport === "codex_cli" ? token : "",
          signal,
        );
        const capability = response.headers.get(WORLD_CREATOR_ACCESS_HEADER);
        creatorCapability.current = capability;
        setCheckpoints([
          {
            sequence: 1,
            view,
            creatorReceipt: null,
            creatorStatus: capability ? "loading" : "locked",
            creatorError: capability
              ? null
              : "Creator-view capability was not returned for this local session.",
          },
        ]);
        setSelectedId(view.sessionId);
        setPendingDraft(null);
        setDraftParagraphs([]);
        setAction("");
        setSelectedCandidateActionId(null);
        setCreatorDialogue(null);
        setCreatorAnswer("");
        setForkBeforeAction(false);
        setCompareLeftId(null);
        setCompareRightId(null);
        setTransport(nextTransport);
        await loadCreatorReceipt(view, capability, signal);
        return true;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return false;
        setError(caught instanceof Error ? caught.message : "The world session could not be opened.");
        return false;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [loadCreatorReceipt],
  );

  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    const controller = new AbortController();
    void startSession("fixture", "", { signal: controller.signal });
    return () => controller.abort();
  }, [startSession]);

  const selectCheckpoint = (sessionId: string) => {
    setSelectedId(sessionId);
    setAction("");
    setSelectedCandidateActionId(null);
    setCreatorDialogue(null);
    setCreatorAnswer("");
    setForkBeforeAction(false);
    setError(null);
    window.requestAnimationFrame(() => sceneHeadingRef.current?.focus());
  };

  const restartSession = async () => {
    if (transport === "codex_cli" && liveToken.trim().length === 0) {
      setError("Enter the local narration token before starting Codex CLI mode.");
      return;
    }
    if (active?.worldPack.availability === "session_private") {
      if (importedCreatorPack.current === null) {
        setError("Re-import the creator-owned JSON pack before restarting this private world.");
        return;
      }
      await startSession(transport, liveToken.trim(), {
        creatorPackDefinition: importedCreatorPack.current,
      });
      return;
    }
    await startSession(transport, liveToken.trim(), {
      ...(active ? { packId: active.worldPack.packId } : {}),
    });
  };

  const switchWorldPack = async (packId: string) => {
    if (packId === SESSION_PRIVATE_PACK_VALUE) return;
    if (transport === "codex_cli" && liveToken.trim().length === 0) {
      setError("Enter the local narration token before opening a world in Codex CLI mode.");
      return;
    }
    const started = await startSession(transport, liveToken.trim(), { packId });
    if (started) {
      importedCreatorPack.current = null;
      setImportError(null);
    }
  };

  const importCreatorPack = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setImportError(null);
    if (!file.name.toLowerCase().endsWith(".json")) {
      setImportError("Choose a .json world-pack file.");
      input.value = "";
      return;
    }
    if (file.size === 0) {
      setImportError("The selected JSON file is empty.");
      input.value = "";
      return;
    }
    if (file.size > MAX_CREATOR_PACK_BYTES) {
      setImportError(
        "The entire session-start request must be 262,144 bytes or smaller; choose a smaller pack file.",
      );
      input.value = "";
      return;
    }
    if (transport === "codex_cli" && liveToken.trim().length === 0) {
      setImportError("Enter the local narration token before importing in Codex CLI mode.");
      input.value = "";
      return;
    }

    let definition: unknown;
    try {
      definition = JSON.parse(await file.text()) as unknown;
    } catch {
      setImportError("This file is not valid JSON.");
      input.value = "";
      return;
    }

    const started = await startSession(transport, liveToken.trim(), {
      creatorPackDefinition: definition,
    });
    if (started) {
      importedCreatorPack.current = definition;
      setImportError(null);
    } else {
      setImportError("The JSON was read, but it was not accepted as a Penelope world pack.");
    }
    input.value = "";
  };

  const openForgedWorld = useCallback(
    async (definition: unknown): Promise<boolean> => {
      if (transport === "codex_cli" && liveToken.trim().length === 0) {
        setError("Enter the local narration token before opening a forged world in Codex CLI mode.");
        return false;
      }
      const started = await startSession(transport, liveToken.trim(), {
        creatorPackDefinition: definition,
      });
      if (started) {
        importedCreatorPack.current = definition;
        setImportError(null);
      }
      return started;
    },
    [liveToken, startSession, transport],
  );

  const sendWorldTurnRequest = async (request: WorldTurnRequest) => {
    setBusy(true);
    setError(null);
    try {
      const { data: next } = await requestJson<WorldTurnResponse>(
        "/api/world/turn",
        request,
        request.transport === "codex_cli" ? liveToken.trim() : "",
        undefined,
        (request.transport === "codex_cli" ||
          request.creatorDialogue?.confirmedProposalHash !== undefined) &&
        creatorCapability.current
          ? { [WORLD_CREATOR_ACCESS_HEADER]: creatorCapability.current }
          : {},
      );
      if (isCreatorDialogueResponse(next)) {
        setCreatorDialogue(next);
        setCreatorAnswer("");
        return;
      }
      if (isPendingNarrationDraft(next)) {
        setPendingDraft(next);
        setDraftParagraphs(
          next.narration.paragraphs.map((paragraph) => ({ ...paragraph })),
        );
        return;
      }
      setCheckpoints((current) => [
        ...current,
        {
          sequence: current.length + 1,
          view: next,
          creatorReceipt: null,
          creatorStatus: creatorCapability.current ? "loading" : "locked",
          creatorError: creatorCapability.current
            ? null
            : "Creator-view capability is unavailable for this local session.",
        },
      ]);
      setSelectedId(next.sessionId);
      setPendingDraft(null);
      setDraftParagraphs([]);
      setAction("");
      setSelectedCandidateActionId(null);
      setCreatorDialogue(null);
      setCreatorAnswer("");
      setForkBeforeAction(false);
      window.requestAnimationFrame(() => sceneHeadingRef.current?.focus());
      await loadCreatorReceipt(next, creatorCapability.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The world could not resolve this action.");
    } finally {
      setBusy(false);
    }
  };

  const submitTurn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || active.status === "complete" || action.trim().length === 0) return;

    await sendWorldTurnRequest({
      sessionId: active.sessionId,
      expectedStateHash: active.stateHash,
      action: action.trim(),
      forkBeforeAction,
      transport: active.transport,
      ...(selectedCandidateActionId === null
        ? { creatorDialogue: { answers: [] } }
        : { preparedActionId: selectedCandidateActionId }),
    });
  };

  const submitCreatorAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !active ||
      creatorDialogue?.kind !== "creator_clarification" ||
      creatorAnswer.trim().length < 2
    ) {
      return;
    }
    const answers: WorldCreatorTacitKnowledgeAnswer[] = [
      ...creatorDialogue.answers,
      {
        questionId: creatorDialogue.question.questionId,
        answer: creatorAnswer.trim(),
      },
    ];
    await sendWorldTurnRequest({
      sessionId: active.sessionId,
      expectedStateHash: active.stateHash,
      action: creatorDialogue.originalAction,
      forkBeforeAction,
      transport: active.transport,
      creatorDialogue: { answers },
    });
  };

  const confirmCreatorProposal = async () => {
    if (!active || creatorDialogue?.kind !== "creator_confirmation") return;
    await sendWorldTurnRequest({
      sessionId: active.sessionId,
      expectedStateHash: active.stateHash,
      action: creatorDialogue.originalAction,
      forkBeforeAction,
      transport: active.transport,
      creatorDialogue: {
        answers: creatorDialogue.answers,
        confirmedProposalHash: creatorDialogue.proposal.proposalHash,
      },
    });
  };

  const reviseCreatorDirection = () => {
    setCreatorDialogue(null);
    setCreatorAnswer("");
    setSelectedCandidateActionId(null);
    setError(null);
  };

  const loadGuidedCreatorMove = () => {
    if (!active || active.status === "complete" || busy) return;
    setAction(active.worldPack.guidedCreatorMove.actionText);
    setSelectedCandidateActionId(null);
    setCreatorDialogue(null);
    setCreatorAnswer("");
    setForkBeforeAction(true);
    setError(null);
    window.requestAnimationFrame(() => {
      document.getElementById("action-heading")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const decideNarrationDraft = async (
    action: "approve" | "edit" | "reject",
  ) => {
    if (!pendingDraft) return;
    const capability = creatorCapability.current;
    if (!capability) {
      setError("Creator approval is unavailable because this session has no creator capability.");
      return;
    }

    setBusy(true);
    setError(null);
    const decision: WorldNarrationDraftDecisionRequest["decision"] =
      action === "edit"
        ? { action, paragraphs: draftParagraphs }
        : { action };
    try {
      const { data: result } =
        await requestJson<WorldNarrationDraftDecisionResponse>(
          "/api/world/narration-draft",
          { authority: pendingDraft.authority, decision },
          "",
          undefined,
          { [WORLD_CREATOR_ACCESS_HEADER]: capability },
        );
      if (result.status === "rejected") {
        setPendingDraft(null);
        setDraftParagraphs([]);
        setAction("");
        setSelectedCandidateActionId(null);
        setCreatorDialogue(null);
        setCreatorAnswer("");
        setForkBeforeAction(false);
        return;
      }

      const next = result.session;
      setCheckpoints((current) => [
        ...current,
        {
          sequence: current.length + 1,
          view: next,
          creatorReceipt: null,
          creatorStatus: "loading",
          creatorError: null,
        },
      ]);
      setSelectedId(next.sessionId);
      setPendingDraft(null);
      setDraftParagraphs([]);
      setAction("");
      setSelectedCandidateActionId(null);
      setCreatorDialogue(null);
      setCreatorAnswer("");
      setForkBeforeAction(false);
      window.requestAnimationFrame(() => sceneHeadingRef.current?.focus());
      await loadCreatorReceipt(next, capability);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The narration decision could not be applied.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading && !active) {
    return (
      <main id="main-content" className={styles.loading} aria-busy="true">
        <p className={styles.eyebrow}>Penelope Ontology · World-first rehearsal</p>
        <h1>Opening a world</h1>
        <p>Loading a bounded world pack and assigning each character only what they can know.</p>
        <span className={styles.loadingMark} aria-hidden="true" />
      </main>
    );
  }

  if (!active) {
    return (
      <main id="main-content" className={styles.loading}>
        <p className={styles.eyebrow}>Penelope Ontology · Session unavailable</p>
        <h1>The world did not open.</h1>
        <p role="alert">{error ?? "An unknown error prevented the fixture from starting."}</p>
        <button type="button" onClick={() => void startSession("fixture", "")}>
          Try the fixture again
        </button>
      </main>
    );
  }

  const creatorReceipt = activeCheckpoint?.creatorReceipt ?? null;
  const parentCheckpoint = active.parentCheckpointId
    ? checkpoints.find(
        ({ view }) => view.sessionId === active.parentCheckpointId,
      ) ?? null
    : null;
  const worldPulse =
    activeCheckpoint && creatorReceipt && parentCheckpoint?.creatorReceipt
      ? deriveWorldPulse(parentCheckpoint, activeCheckpoint)
      : null;
  const participantActions =
    creatorReceipt?.events.filter(({ source }) => source.kind === "participant") ?? [];
  const parentRiskIds = new Set(
    parentCheckpoint?.creatorReceipt?.behindCurtainRisks.map(({ riskId }) => riskId) ?? [],
  );
  const newBehindCurtainRisks =
    creatorReceipt?.behindCurtainRisks.filter(
      ({ riskId }) => !parentRiskIds.has(riskId),
    ) ?? [];
  const comparableCheckpoints = checkpoints.filter(
    (checkpoint): checkpoint is Checkpoint & { creatorReceipt: WorldCreatorReceipt } =>
      checkpoint.creatorReceipt !== null,
  );
  const terminalCheckpoints = comparableCheckpoints.filter(
    ({ view }) => view.status === "complete",
  );
  const defaultCompareLeft =
    terminalCheckpoints.length >= 2
      ? terminalCheckpoints.at(-2) ?? null
      : comparableCheckpoints[0] ?? null;
  const defaultCompareRight =
    terminalCheckpoints.at(-1) ??
    comparableCheckpoints.find(({ view }) => view.sessionId === active.sessionId) ??
    comparableCheckpoints.at(-1) ??
    null;
  const compareLeft =
    comparableCheckpoints.find(({ view }) => view.sessionId === compareLeftId) ??
    defaultCompareLeft;
  const compareRight =
    comparableCheckpoints.find(({ view }) => view.sessionId === compareRightId) ??
    defaultCompareRight;
  const worldComparison =
    compareLeft && compareRight
      ? compareWorldLines(compareLeft, compareRight)
      : null;
  const commonAncestor =
    compareLeft && compareRight
      ? findCommonAncestor(compareLeft, compareRight, checkpoints)
      : null;
  const compareLeftRiskIds = new Set(
    compareLeft?.creatorReceipt.behindCurtainRisks.map(({ riskId }) => riskId) ?? [],
  );
  const comparisonRightOnlyRisks =
    compareRight?.creatorReceipt.behindCurtainRisks.filter(
      ({ riskId }) => !compareLeftRiskIds.has(riskId),
    ) ?? [];
  const movements = creatorReceipt ? movementEffects(creatorReceipt.events) : [];
  const isCreatorEventVisible = (event: WorldEvent): boolean =>
    event.visibleToEntityIds.includes(active.focalActor.entityId);
  const parentSequence = parentCheckpoint?.sequence ?? null;
  const activePendingDraft =
    pendingDraft?.authority.baseCheckpointId === active.sessionId
      ? pendingDraft
      : null;
  const draftTextChanged = activePendingDraft
    ? activePendingDraft.narration.paragraphs.some(
        (paragraph, index) =>
          draftParagraphs[index]?.paragraphId !== paragraph.paragraphId ||
          draftParagraphs[index]?.text !== paragraph.text,
      )
    : false;
  const visualMomentTrigger = selectVisualMomentTrigger({
    status: active.status,
    forked: active.forked,
    turn: active.turn,
    ending: active.ending,
  });

  return (
    <main id="main-content" className={styles.page}>
      <header className={styles.header}>
        <div className={styles.topline}>
          <a className={styles.brand} href="#world-scene" aria-label="Penelope Ontology world scene">
            <span aria-hidden="true">P</span>
            Penelope Ontology
          </a>
          <div className={styles.modeLine}>
            <span className={styles.statusDot} data-status={active.status} aria-hidden="true" />
            {active.status === "active" ? "World in motion" : "Branch complete"}
          </div>
        </div>

        <WorldForge
          disabled={busy || loading}
          onOpenPack={openForgedWorld}
        />

        <div className={styles.worldPackTools}>
          <label className={styles.worldPackPicker} htmlFor="world-pack-picker">
            <span>World pack</span>
            <select
              id="world-pack-picker"
              value={
                active.worldPack.availability === "session_private"
                  ? SESSION_PRIVATE_PACK_VALUE
                  : active.worldPack.packId
              }
              onChange={(event) => void switchWorldPack(event.target.value)}
              disabled={busy || loading}
              data-testid="world-pack-picker"
            >
              {active.worldPack.availability === "session_private" ? (
                <optgroup label="Current creator-owned pack">
                  <option value={SESSION_PRIVATE_PACK_VALUE}>
                    {active.worldPack.publicTitle} · Session private
                  </option>
                </optgroup>
              ) : null}
              <optgroup label="Registered demo packs">
                {active.availableWorldPacks
                  .filter(({ availability }) => availability === "registered")
                  .map((pack) => (
                    <option key={pack.packId} value={pack.packId}>
                      {pack.publicTitle} · {pack.publicSubtitle}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <label className={styles.worldPackImport} htmlFor="creator-pack-json">
            <span>Import creator pack</span>
            <input
              id="creator-pack-json"
              type="file"
              accept=".json,application/json"
              onChange={(event) => void importCreatorPack(event)}
              disabled={busy || loading}
              data-testid="world-pack-import"
            />
          </label>
          <p className={styles.worldPackPrivacy}>
            Creator-owned pack · session-scoped server memory only · not persisted · expires after 30 minutes. Do not upload sensitive or unreleased IP to this hosted demo.
          </p>
          {importError ? (
            <p className={styles.worldPackImportError} role="alert">
              {importError}
            </p>
          ) : null}
        </div>

        <div className={styles.titleGrid}>
          <div>
            <p className={styles.eyebrow}>{active.worldPack.sourceEyebrow}</p>
            <h1>
              {active.worldPack.publicTitle}
              <span>{active.worldPack.publicSubtitle}</span>
            </h1>
          </div>
          <div className={styles.intro}>
            <p>{active.participantSummary}</p>
            <dl>
              <div>
                <dt>You enter as</dt>
                <dd>{active.focalActor.label}</dd>
              </div>
              <div>
                <dt>Bound</dt>
                <dd>{active.maxTurns} turns</dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <section className={styles.provenanceStrip} aria-label="Narration provenance">
        <strong>{active.transport === "fixture" ? "Public-safe fixture" : "Local Codex CLI"}</strong>
        <span data-testid="world-provenance">{provenanceCopy(active)}</span>
      </section>

      <section className={styles.thesisStrip} aria-labelledby="product-thesis-heading">
        <div>
          <p className={styles.eyebrow}>Source context</p>
          <p>{active.worldPack.sourceIntroduction}</p>
        </div>
        <div>
          <p className={styles.eyebrow}>Product thesis</p>
          <h2 id="product-thesis-heading">{active.worldPack.productThesis}</h2>
          <button
            type="button"
            onClick={loadGuidedCreatorMove}
            disabled={busy || active.status === "complete"}
            data-testid="world-guided-demo-load"
          >
            Load the guided creator move
          </button>
          <small>{active.worldPack.guidedCreatorMove.helperText}</small>
        </div>
      </section>

      <div className={styles.workspace}>
        <aside className={styles.timeline} aria-labelledby="checkpoint-heading">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Ephemeral session checkpoints</p>
            <h2 id="checkpoint-heading">World lines</h2>
          </div>
          <ol data-testid="world-checkpoints">
            {checkpoints.map(({ sequence, view }) => {
              const parent = view.parentCheckpointId
                ? checkpoints.find(({ view: candidate }) => candidate.sessionId === view.parentCheckpointId)?.sequence
                : null;
              return (
                <li key={view.sessionId}>
                  <button
                    type="button"
                    className={view.sessionId === active.sessionId ? styles.checkpointActive : ""}
                    onClick={() => selectCheckpoint(view.sessionId)}
                    aria-current={view.sessionId === active.sessionId ? "step" : undefined}
                    data-testid={`world-checkpoint-${sequence}`}
                  >
                    <span className={styles.checkpointNumber}>{String(sequence).padStart(2, "0")}</span>
                    <span>
                      <strong>{branchLabel(view)}</strong>
                      <small>
                        Turn {view.turn}/{view.maxTurns}
                        {parent ? ` · from ${String(parent).padStart(2, "0")}` : " · opening"}
                      </small>
                    </span>
                    <i data-status={view.status}>{view.status === "complete" ? "End" : "Live"}</i>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className={styles.timelineNote}>
            Checkpoints stay in this browser view. Return to an earlier one to test a different consequence.
          </p>
        </aside>

        <div className={styles.storyColumn}>
          <div
            className={
              visualMomentTrigger
                ? styles.fateStage
                : styles.fateStageInactive
            }
          >
            <FateFrame view={active} trigger={visualMomentTrigger} />
          <article
            id="world-scene"
            className={styles.scene}
            aria-labelledby="world-scene-title"
            data-testid="world-scene"
          >
            <header className={styles.sceneHeader}>
              <div>
                <p className={styles.eyebrow}>
                  Checkpoint {selectedSequence} · Turn {active.turn} of {active.maxTurns} · {branchLabel(active)}
                </p>
                <h2 id="world-scene-title" ref={sceneHeadingRef} tabIndex={-1}>
                  {active.title}
                </h2>
              </div>
              {active.forked ? <span className={styles.ifBadge}>IF branch</span> : null}
            </header>

            <p className={styles.draftNotice}>
              Narration draft · the typed world state and causal receipt remain authoritative
            </p>

            <div className={styles.prose} data-testid="world-prose">
              {active.narration.paragraphs.map((paragraph) => (
                <p key={paragraph.paragraphId}>{paragraph.text}</p>
              ))}
            </div>

            <footer className={styles.sceneFooter}>
              <span>Visible context: {active.visibleFacts.length} facts</span>
              <span>{active.visibleEvents.length} resolved events visible</span>
            </footer>
          </article>
          </div>

          <section
            className={styles.worldPulse}
            aria-labelledby="world-pulse-heading"
            data-testid="world-pulse"
          >
            <div className={styles.pulseHeading}>
              <div>
                <p className={styles.eyebrow}>Creator view · derived from the causal receipt</p>
                <h2 id="world-pulse-heading">World Pulse</h2>
              </div>
              <span>{worldPulse ? worldPulse.summary : "Bounded world state"}</span>
            </div>

            {!creatorReceipt ? (
              <p className={styles.pulseLoading}>Loading the creator-visible world state…</p>
            ) : !worldPulse ? (
              <div className={styles.pulseBaseline} data-testid="world-pulse-baseline">
                <strong>The world is armed before the first choice.</strong>
                <p>
                  {creatorReceipt.actors.length} actors hold separate knowledge and
                  agendas. {creatorReceipt.clocks.length} pressure clocks wait at their
                  verified starting values. No consequence is inferred from the prose.
                </p>
              </div>
            ) : (
              <ol className={styles.causalChain}>
                <li data-testid="world-pulse-action">
                  <span>01 · Creator choice</span>
                  <strong>
                    {participantActions[0]?.summary ?? "The selected action resolved."}
                  </strong>
                  <small>The participant event is read from the receipt, not reconstructed from narration.</small>
                </li>
                <li>
                  <span>02 · World response</span>
                  {worldPulse.causalRules.length > 0 ? (
                    <ul>
                      {worldPulse.causalRules.map((rule) => (
                        <li
                          key={`${rule.ruleId}-${rule.eventId ?? "rule"}`}
                          data-testid={`world-pulse-event-${testIdToken(rule.eventId ?? rule.ruleId)}`}
                        >
                          <strong>{rule.eventSummary ?? humanizeId(rule.ruleId)}</strong>
                          <small>{rule.label} · {humanizeId(rule.ruleId)}</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <strong>No declared reaction fired at this checkpoint.</strong>
                  )}
                </li>
                <li>
                  <span>03 · State change</span>
                  <div className={styles.deltaGrid}>
                    {worldPulse.movements.map((movement) => (
                      <article
                        key={`${movement.actorId}-${movement.toZoneId}`}
                        data-testid={`world-pulse-actor-${testIdToken(movement.actorId)}`}
                      >
                        <small>{movement.offstage ? "Offstage movement" : "Movement"}</small>
                        <strong>{movement.actorName}</strong>
                        <p>{humanizeId(movement.fromZoneId)} → {humanizeId(movement.toZoneId)}</p>
                      </article>
                    ))}
                    {worldPulse.clocks.map((clock) => (
                      <article
                        key={clock.clockId}
                        data-testid={`world-pulse-clock-${testIdToken(clock.clockId)}`}
                      >
                        <small>Pressure clock</small>
                        <strong>{clock.label}</strong>
                        <p>{clock.beforeValue} → {clock.afterValue} / {clock.maxValue}</p>
                      </article>
                    ))}
                    {worldPulse.knowledge.map((knowledge) => (
                      <article key={knowledge.actorId}>
                        <small>Knowledge boundary</small>
                        <strong>{knowledge.actorName}</strong>
                        <p>{knowledge.summary}</p>
                      </article>
                    ))}
                    {newBehindCurtainRisks.map((risk) => (
                      <article
                        key={risk.riskId}
                        data-testid={`world-pulse-risk-${testIdToken(risk.riskId)}`}
                      >
                        <small>Behind the curtain</small>
                        <strong>Latent risk</strong>
                        <p>{risk.summary}</p>
                      </article>
                    ))}
                    {worldPulse.movements.length === 0 &&
                    worldPulse.clocks.length === 0 &&
                    worldPulse.knowledge.length === 0 &&
                    newBehindCurtainRisks.length === 0 ? (
                      <p className={styles.noDelta}>No creator-visible state field changed.</p>
                    ) : null}
                  </div>
                </li>
                <li data-testid="world-pulse-ending">
                  <span>04 · Story pressure</span>
                  <strong>{worldPulse.ending.summary}</strong>
                  <small>
                    {active.ending
                      ? "This branch is now closed; its siblings remain available."
                      : "The branch remains open, but the next turn inherits every change above."}
                  </small>
                </li>
              </ol>
            )}
          </section>

          <section
            className={styles.npcMotion}
            aria-labelledby="npc-motion-heading"
            data-testid="world-npc-motion"
          >
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>Small cast · independent motives</p>
              <h2 id="npc-motion-heading">NPCs in motion</h2>
            </div>
            <p className={styles.sectionLead}>
              Each card is the current simulated state. An NPC may react outside
              the focal character&apos;s scene, but only through an approved rule and bounded agenda.
            </p>
            {creatorReceipt ? (
              <div className={styles.npcGrid}>
                {creatorReceipt.actors
                  .filter(({ simulationRole }) => simulationRole === "npc")
                  .map((actor) => {
                    const focalZone = creatorReceipt.actors.find(
                      ({ entityId }) => entityId === active.focalActor.entityId,
                    )?.zoneId;
                    const proximityLabel =
                      actor.zoneId === focalZone
                        ? "Same scene"
                        : "Different zone / offstage";
                    return (
                      <article
                        key={actor.entityId}
                        data-testid={`world-npc-card-${testIdToken(actor.entityId)}`}
                      >
                        <header>
                          <div>
                            <span>{proximityLabel}</span>
                            <h3>{actor.creatorName}</h3>
                          </div>
                          <i data-state={actor.agendaState}>{actor.agendaState}</i>
                        </header>
                        <dl>
                          <div>
                            <dt>Wants</dt>
                            <dd>{actor.agendaDesire}</dd>
                          </div>
                          <div>
                            <dt>Avoids</dt>
                            <dd>{actor.agendaAvoids}</dd>
                          </div>
                          <div data-testid={`world-npc-zone-${testIdToken(actor.entityId)}`}>
                            <dt>Position</dt>
                            <dd>{humanizeId(actor.zoneId)}</dd>
                          </div>
                          <div data-testid={`world-npc-agenda-${testIdToken(actor.entityId)}`}>
                            <dt>Private knowledge</dt>
                            <dd>{actor.knownPremiseIds.length} premise{actor.knownPremiseIds.length === 1 ? "" : "s"}</dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
              </div>
            ) : (
              <p className={styles.pulseLoading}>NPC agendas remain hidden until creator access is verified.</p>
            )}
          </section>

          <section
            className={styles.forkCompare}
            aria-labelledby="fork-compare-heading"
            data-testid="world-fork-compare"
          >
            <div className={styles.compareHeading}>
              <div className={styles.sectionHeading}>
                <p className={styles.eyebrow}>Same world · different responsibility</p>
                <h2 id="fork-compare-heading">Fork Compare</h2>
              </div>
              <p>
                Compare state, not prose. The tool shows only knowledge, position,
                pressure, fired rules, latent risks, and endings recorded by each world line.
              </p>
            </div>

            {comparableCheckpoints.length >= 2 && compareLeft && compareRight && worldComparison ? (
              <>
                <div className={styles.compareControls}>
                  <label htmlFor="world-compare-left">
                    Left world line
                    <select
                      id="world-compare-left"
                      value={compareLeft.view.sessionId}
                      onChange={(event) => setCompareLeftId(event.target.value)}
                      data-testid="world-compare-left"
                    >
                      {comparableCheckpoints.map((checkpoint) => (
                        <option key={checkpoint.view.sessionId} value={checkpoint.view.sessionId}>
                          {String(checkpoint.sequence).padStart(2, "0")} · {branchLabel(checkpoint.view)} · {checkpoint.view.ending ? humanizeId(checkpoint.view.ending.kind) : "Open"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span aria-hidden="true">versus</span>
                  <label htmlFor="world-compare-right">
                    Right world line
                    <select
                      id="world-compare-right"
                      value={compareRight.view.sessionId}
                      onChange={(event) => setCompareRightId(event.target.value)}
                      data-testid="world-compare-right"
                    >
                      {comparableCheckpoints.map((checkpoint) => (
                        <option key={checkpoint.view.sessionId} value={checkpoint.view.sessionId}>
                          {String(checkpoint.sequence).padStart(2, "0")} · {branchLabel(checkpoint.view)} · {checkpoint.view.ending ? humanizeId(checkpoint.view.ending.kind) : "Open"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p
                  className={styles.commonAncestor}
                  data-testid="world-compare-common-ancestor"
                >
                  {commonAncestor
                    ? `Shared source checkpoint ${String(commonAncestor.sequence).padStart(2, "0")} · ${branchLabel(commonAncestor.view)}`
                    : worldComparison.summary}
                </p>

                <div className={styles.compareSummary}>
                  <article>
                    <span>Left</span>
                    <strong>{compareLeft.view.ending ? humanizeId(compareLeft.view.ending.kind) : "World still open"}</strong>
                    <small>Checkpoint {String(compareLeft.sequence).padStart(2, "0")} · {branchLabel(compareLeft.view)}</small>
                  </article>
                  <article>
                    <span>Right</span>
                    <strong>{compareRight.view.ending ? humanizeId(compareRight.view.ending.kind) : "World still open"}</strong>
                    <small>Checkpoint {String(compareRight.sequence).padStart(2, "0")} · {branchLabel(compareRight.view)}</small>
                  </article>
                </div>

                <div className={styles.compareDeltas}>
                  {worldComparison.knowledge.map((delta) => (
                    <article key={`knowledge-${delta.actorId}`} data-testid="world-compare-delta-knowledge">
                      <span>Knowledge</span><strong>{delta.summary}</strong>
                    </article>
                  ))}
                  {worldComparison.movements.map((delta) => (
                    <article key={`movement-${delta.actorId}`} data-testid="world-compare-delta-position">
                      <span>Position</span><strong>{delta.summary}</strong>
                    </article>
                  ))}
                  {worldComparison.clocks.map((delta) => (
                    <article key={delta.clockId} data-testid={`world-compare-delta-${testIdToken(delta.clockId)}`}>
                      <span>Pressure</span><strong>{delta.summary}</strong>
                    </article>
                  ))}
                  {worldComparison.causalRules.map((delta) => (
                    <article key={delta.ruleId} data-testid="world-compare-delta-rule">
                      <span>Rule</span><strong>{delta.summary}</strong>
                    </article>
                  ))}
                  {comparisonRightOnlyRisks.map((risk) => (
                    <article key={risk.riskId} data-testid="world-compare-delta-risk">
                      <span>Latent risk on right</span><strong>{risk.summary}</strong>
                    </article>
                  ))}
                  <article data-testid="world-compare-delta-ending">
                    <span>Ending</span><strong>{worldComparison.ending.summary}</strong>
                  </article>
                </div>
              </>
            ) : (
              <p className={styles.pulseLoading}>
                Create an IF branch to compare outcomes. The opening world remains untouched until a consequence is confirmed.
              </p>
            )}
          </section>

          {activePendingDraft ? (
            <section
              className={styles.actionPanel}
              aria-labelledby="narration-review-heading"
              data-testid="world-narration-review"
            >
              <div className={styles.sectionHeading}>
                <p className={styles.eyebrow}>Creator decision · world state unchanged</p>
                <h2 id="narration-review-heading">{activePendingDraft.question}</h2>
              </div>
              <p>
                The action already has consequences in the simulation, but this wording will not
                join the story until you approve it.
              </p>
              <details data-testid="world-pending-draft">
                <summary>Review the narration candidate</summary>
                <div className={styles.prose}>
                  {draftParagraphs.map((paragraph, index) => (
                    <label key={paragraph.paragraphId}>
                      Paragraph {index + 1}
                      <textarea
                        value={paragraph.text}
                        rows={5}
                        maxLength={2_400}
                        disabled={busy}
                        onChange={(event) =>
                          setDraftParagraphs((current) =>
                            current.map((candidate) =>
                              candidate.paragraphId === paragraph.paragraphId
                                ? { ...candidate, text: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                        data-testid={`world-draft-paragraph-${index + 1}`}
                      />
                    </label>
                  ))}
                </div>
                <small>
                  Review requested by {activePendingDraft.authority.creatorReviewRuleIds.join(", ")}.
                  Editing changes prose only; resolved events and causal receipts stay locked.
                </small>
              </details>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              <div className={styles.actionMeta}>
                <button
                  type="button"
                  disabled={busy || draftTextChanged}
                  onClick={() => void decideNarrationDraft("approve")}
                  data-testid="world-draft-approve"
                >
                  Approve &amp; continue
                </button>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !draftTextChanged ||
                    draftParagraphs.some(({ text }) => text.trim().length === 0)
                  }
                  onClick={() => void decideNarrationDraft("edit")}
                  data-testid="world-draft-edit"
                >
                  Edit text &amp; approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decideNarrationDraft("reject")}
                  data-testid="world-draft-reject"
                >
                  Discard
                </button>
              </div>
            </section>
          ) : active.ending ? (
            <section className={styles.ending} role="status" data-testid="world-ending">
              <p className={styles.eyebrow}>This branch has reached an ending</p>
              <div>
                <h2>{humanizeId(active.ending.kind)}</h2>
                <span>{branchLabel(active)}</span>
              </div>
              <p>{active.ending.summary}</p>
              <small>
                The branch is closed. Its parent and every sibling checkpoint remain available in World lines.
              </small>
            </section>
          ) : (
            <section className={styles.actionPanel} aria-labelledby="action-heading">
              <div className={styles.sectionHeading}>
                <p className={styles.eyebrow}>The world waits for one deliberate action</p>
                <h2 id="action-heading">What does {active.focalActor.label} do?</h2>
              </div>

              <div className={styles.candidates} aria-label="Suggested actions">
                {active.nextActions.slice(0, 2).map((candidate, index) => (
                  <button
                    key={candidate.actionId}
                    type="button"
                    onClick={() => {
                      setAction(candidate.suggestedInput);
                      setSelectedCandidateActionId(candidate.actionId);
                      setCreatorDialogue(null);
                      setCreatorAnswer("");
                      setError(null);
                    }}
                    aria-pressed={selectedCandidateActionId === candidate.actionId}
                    disabled={busy}
                    data-testid={`world-candidate-${index + 1}`}
                  >
                    <span>{index === 0 ? "A · Recommended" : "B · Alternate"}</span>
                    <strong>{candidate.label}</strong>
                    <small>{candidate.suggestedInput}</small>
                  </button>
                ))}
              </div>

              {creatorDialogue?.kind === "creator_clarification" ? (
                <section
                  className={styles.creatorDialogue}
                  data-testid="world-creator-dialogue"
                  aria-labelledby="creator-question-heading"
                >
                  <p className={styles.eyebrow}>
                    C · Creator interview · {creatorDialogue.progress.answered + 1}/{creatorDialogue.progress.total}
                  </p>
                  <h3 id="creator-question-heading">{creatorDialogue.question.prompt}</h3>
                  <p>{creatorDialogue.question.whyItMatters}</p>
                  <form onSubmit={(event) => void submitCreatorAnswer(event)}>
                    <label htmlFor="world-creator-answer">Your answer</label>
                    <textarea
                      id="world-creator-answer"
                      value={creatorAnswer}
                      onChange={(event) => setCreatorAnswer(event.target.value)}
                      maxLength={600}
                      rows={3}
                      disabled={busy}
                      data-testid="world-creator-answer"
                    />
                    <div className={styles.creatorDialogueActions}>
                      <button
                        type="button"
                        onClick={reviseCreatorDirection}
                        disabled={busy}
                      >
                        Revise the original direction
                      </button>
                      <button
                        type="submit"
                        disabled={busy || creatorAnswer.trim().length < 2}
                        data-testid="world-creator-answer-submit"
                      >
                        {busy ? "Listening…" : "Continue"}
                      </button>
                    </div>
                  </form>
                </section>
              ) : creatorDialogue?.kind === "creator_confirmation" ? (
                <section
                  className={styles.creatorDialogue}
                  data-testid="world-creator-confirmation"
                  aria-labelledby="creator-confirmation-heading"
                >
                  <p className={styles.eyebrow}>C · Intent recovered · world ruling ready</p>
                  <h3 id="creator-confirmation-heading">A cause the world can carry</h3>
                  <p className={styles.creatorPraise}>{creatorDialogue.praise}</p>
                  <dl className={styles.creatorProposal}>
                    <div>
                      <dt>What you proposed</dt>
                      <dd>{creatorDialogue.originalAction}</dd>
                    </div>
                    <div>
                      <dt>Your intent</dt>
                      <dd>{creatorDialogue.proposal.preservedIntent}</dd>
                    </div>
                    <div>
                      <dt>World-compatible action</dt>
                      <dd>
                        <strong>{creatorDialogue.proposal.label}</strong>
                        {creatorDialogue.proposal.worldCompatibleExecution}
                      </dd>
                    </div>
                    <div>
                      <dt>Why the character acts</dt>
                      <dd>{creatorDialogue.proposal.characterMotive}</dd>
                    </div>
                    <div>
                      <dt>Accepted cost</dt>
                      <dd>{creatorDialogue.proposal.acceptedCost}</dd>
                    </div>
                    <div>
                      <dt>World ruling</dt>
                      <dd>{creatorDialogue.proposal.worldMeaning}</dd>
                    </div>
                    <div>
                      <dt>Ruling basis</dt>
                      <dd>
                        <details className={styles.rulingBasis}>
                          <summary>Show the mapping evidence</summary>
                          <p>{creatorDialogue.proposal.mappingBasis.join(" ")}</p>
                        </details>
                      </dd>
                    </div>
                    <div>
                      <dt>Execution line</dt>
                      <dd>
                        {creatorDialogue.proposal.forkBeforeAction
                          ? "A new IF branch; the current checkpoint remains intact."
                          : "The current mainline; this checkpoint will advance after approval."}
                      </dd>
                    </div>
                    <div>
                      <dt>State-bound receipt</dt>
                      <dd>
                        <code data-testid="world-creator-proposal-hash">
                          {creatorDialogue.proposal.proposalHash.slice(0, 12)}…
                        </code>{" "}
                        This receipt changes if the proposed execution changes.
                      </dd>
                    </div>
                  </dl>
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  <div className={styles.creatorDialogueActions}>
                    <button type="button" onClick={reviseCreatorDirection} disabled={busy}>
                      Revise
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmCreatorProposal()}
                      disabled={busy}
                      data-testid="world-creator-confirm"
                    >
                      {busy ? "Resolving consequences…" : "Proceed with this consequence"}
                    </button>
                  </div>
                </section>
              ) : creatorDialogue ? (
                <section
                  className={styles.creatorDialogue}
                  data-testid="world-creator-boundary"
                  aria-labelledby="creator-boundary-heading"
                >
                  <p className={styles.eyebrow}>
                    C · {creatorDialogue.kind === "creator_expansion_required" ? "World expansion needed" : "Actor boundary"}
                  </p>
                  <h3 id="creator-boundary-heading">The intention survives; the unsupported mechanism does not.</h3>
                  <dl className={styles.creatorProposal}>
                    <div>
                      <dt>Your intent</dt>
                      <dd>{creatorDialogue.preservedIntent}</dd>
                    </div>
                    <div>
                      <dt>Current boundary</dt>
                      <dd>
                        {creatorDialogue.kind === "creator_expansion_required"
                          ? creatorDialogue.missingWorldSupport
                          : creatorDialogue.boundary}
                      </dd>
                    </div>
                    <div>
                      <dt>Question to continue</dt>
                      <dd>{creatorDialogue.nextQuestion}</dd>
                    </div>
                  </dl>
                  {creatorDialogue.alternatives.length > 0 ? (
                    <div className={styles.creatorAlternatives}>
                      <h4>Actions already supported by this world</h4>
                      <ul>
                        {creatorDialogue.alternatives.map((alternative) => (
                          <li key={alternative.registeredActionId}>
                            <strong>{alternative.label}</strong>
                            <span>{alternative.why}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className={styles.creatorDialogueActions}>
                    <button type="button" onClick={reviseCreatorDirection} disabled={busy}>
                      Revise my direction
                    </button>
                  </div>
                </section>
              ) : (
                <form onSubmit={(event) => void submitTurn(event)}>
                  <label htmlFor="world-action">C · Shape another direction</label>
                  <textarea
                    id="world-action"
                    value={action}
                    onChange={(event) => {
                      setAction(event.target.value);
                      setSelectedCandidateActionId(null);
                      setCreatorDialogue(null);
                      setCreatorAnswer("");
                    }}
                    maxLength={800}
                    rows={4}
                    placeholder={`Describe what ${active.focalActor.label} tries. Penelope will ask what they want, why they act, and what cost they accept before the world moves.`}
                    data-testid="world-action"
                    disabled={busy}
                  />
                  <div className={styles.actionMeta}>
                    <label className={styles.forkControl} htmlFor="world-fork">
                      <input
                        id="world-fork"
                        type="checkbox"
                        checked={forkBeforeAction}
                        onChange={(event) => setForkBeforeAction(event.target.checked)}
                        disabled={busy}
                        data-testid="world-fork"
                      />
                      <span>
                        <strong>Fork this action as an IF</strong>
                        <small>
                          The current checkpoint remains intact. This action opens a child world line from it.
                        </small>
                      </span>
                    </label>
                    <span>{action.length}/800</span>
                  </div>
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  <button
                    className={styles.resolveButton}
                    type="submit"
                    disabled={busy || action.trim().length === 0}
                    data-testid="world-resolve"
                  >
                    {busy
                      ? "Listening for intent…"
                      : selectedCandidateActionId
                        ? "Commit this prepared action"
                        : "Let Penelope ask what you mean"}
                  </button>
                </form>
              )}
            </section>
          )}

          <section className={styles.participantEvidence} aria-labelledby="participant-evidence-heading">
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>Participant boundary</p>
              <h2 id="participant-evidence-heading">What {active.focalActor.label} can use</h2>
            </div>
            <div className={styles.evidenceGrid}>
              <div>
                <h3>Visible facts</h3>
                <ul>
                  {active.visibleFacts.map((fact) => (
                    <li key={fact.id}>{fact.summary}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Resolved in this checkpoint</h3>
                <ul>
                  {active.visibleEvents.map((event) => (
                    <li key={event.eventId}>{event.summary}</li>
                  ))}
                </ul>
                {active.hiddenEventCount > 0 ? (
                  <p className={styles.withheldNotice}>
                    {active.hiddenEventCount} world event{active.hiddenEventCount === 1 ? " is" : "s are"} outside this character&apos;s view.
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <details className={styles.inspector} data-testid="creator-inspector">
            <summary>
              <span>
                <strong>Open creator inspector</strong>
                <small>Same-user creator projection: private knowledge, agendas, clocks, movements, and proof hashes</small>
              </span>
              <i aria-hidden="true">+</i>
            </summary>
            <div className={styles.inspectorBody}>
              {creatorReceipt ? (
                <>
                  <div className={styles.inspectorNotice}>
                    <strong>Creator-view capability accepted.</strong>
                    <p>Private premise data arrived from a separate projection endpoint. This local workbench separation is not account authentication.</p>
                  </div>

                  <section aria-labelledby="actor-state-heading">
                    <h3 id="actor-state-heading">Actors and private knowledge</h3>
                    <div className={styles.actorGrid}>
                      {creatorReceipt.actors.map((actor) => (
                        <article key={actor.entityId}>
                          <header>
                            <div>
                              <strong>{actor.creatorName}</strong>
                              <small>Participant label: {actor.participantLabel}</small>
                            </div>
                            <span data-state={actor.agendaState}>{actor.agendaState}</span>
                          </header>
                          <dl>
                            <div>
                              <dt>Actor ID</dt>
                              <dd><code>{actor.entityId}</code></dd>
                            </div>
                            <div>
                              <dt>Zone</dt>
                              <dd><code>{actor.zoneId}</code></dd>
                            </div>
                          </dl>
                          <p>Known premise IDs</p>
                          {actor.knownPremiseIds.length > 0 ? (
                            <ul className={styles.idList}>
                              {actor.knownPremiseIds.map((premiseId) => <li key={premiseId}><code>{premiseId}</code></li>)}
                            </ul>
                          ) : <small>None recorded.</small>}
                        </article>
                      ))}
                    </div>
                  </section>

                  <div className={styles.stateGrid}>
                    <section aria-labelledby="flags-heading">
                      <h3 id="flags-heading">World flags</h3>
                      <ul className={styles.stateList}>
                        {creatorReceipt.flags.map((flag) => (
                          <li key={flag.id}>
                            <code>{flag.id}</code>
                            <span data-value={String(flag.value)}>{flag.value ? "true" : "false"}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <section aria-labelledby="clocks-heading">
                      <h3 id="clocks-heading">Pressure clocks</h3>
                      <ul className={styles.clockList}>
                        {creatorReceipt.clocks.map((clock) => (
                          <li key={clock.id}>
                            <div><strong>{clock.label}</strong><span>{clock.value}/{clock.maxValue}</span></div>
                            <meter min={0} max={clock.maxValue} value={clock.value}>{clock.value} of {clock.maxValue}</meter>
                            <code>{clock.id}</code>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <section aria-labelledby="rule-review-heading">
                    <h3 id="rule-review-heading">Rule provenance</h3>
                    <p>
                      Source canon, creator-approved additions, and pending proposals remain visibly separate.
                    </p>
                    <div className={styles.stateGrid}>
                      <div>
                        <strong>Source-grounded</strong>
                        <ul className={styles.idList}>
                          {creatorReceipt.ruleReview.sourceGroundedIds.map((ruleId) => (
                            <li key={ruleId}><code>{ruleId}</code></li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong>Creator-approved · not source canon</strong>
                        <ul className={styles.idList}>
                          {creatorReceipt.ruleReview.creatorApprovedNotSourceCanonIds.map((ruleId) => (
                            <li key={ruleId}><code>{ruleId}</code></li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <strong>Creator review required</strong>
                        <ul className={styles.idList}>
                          {creatorReceipt.ruleReview.creatorReviewRequiredIds.map((ruleId) => (
                            <li key={ruleId}><code>{ruleId}</code></li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    {creatorReceipt.narrationDecisionProof ? (
                      <p data-testid="world-narration-decision-proof">
                        <strong>
                          {creatorReceipt.narrationDecisionProof.decision === "edit"
                            ? "Narration edited and approved"
                            : "Narration approved"}
                        </strong>{" "}
                        · {creatorReceipt.narrationDecisionProof.satisfiedCreatorReviewRuleIds.length} creator-review rule
                        {creatorReceipt.narrationDecisionProof.satisfiedCreatorReviewRuleIds.length === 1 ? "" : "s"} bound
                        · receipt <code>{shortHash(creatorReceipt.narrationDecisionProof.receiptHash)}</code>
                      </p>
                    ) : null}
                  </section>

                  {creatorReceipt.creatorDirections.length > 0 ? (
                    <section
                      aria-labelledby="creator-direction-audit-heading"
                      data-testid="creator-direction-audit"
                    >
                      <h3 id="creator-direction-audit-heading">Creator C receipts</h3>
                      <p>
                        Private proof that a committed world action came from an
                        explicitly reviewed creator direction, not a hidden prepared route.
                      </p>
                      <ol className={styles.eventAudit}>
                        {creatorReceipt.creatorDirections.map((direction) => (
                          <li key={direction.proposalHash}>
                            <span>
                              {direction.forkBeforeAction ? "Creator C · IF" : "Creator C · mainline"}
                            </span>
                            <strong>{direction.originalAction}</strong>
                            <small>
                              Mapped to {direction.registeredActionId} · accepted cost: {direction.acceptedCost}
                            </small>
                            <code>{shortHash(direction.proposalHash)}</code>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ) : null}

                  <section
                    aria-labelledby="behind-curtain-premises-heading"
                    data-testid="behind-curtain-premises"
                  >
                    <h3 id="behind-curtain-premises-heading">The curtain ledger · creator only</h3>
                    <p>
                      These concealed premises govern the scene. They stay out of participant prose until a registered event makes them observable.
                    </p>
                    <ul className={styles.behindCurtainList}>
                      {creatorReceipt.behindCurtainPremises.map((premise) => (
                        <li key={premise.premiseId}>
                          <span>
                            {premise.approvalStatus === "source_verified"
                              ? "Source-grounded"
                              : "Creator-approved"}
                          </span>
                          <strong>{premise.summary}</strong>
                          <small>Meaning: {premise.meaning}</small>
                          <small>Grounding: {premise.sourceGrounding}</small>
                          <small>Withheld because: {premise.whyWithheld}</small>
                          <code>{premise.premiseId}</code>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section
                    aria-labelledby="behind-curtain-heading"
                    data-testid="behind-curtain-risks"
                  >
                    <h3 id="behind-curtain-heading">Behind the curtain</h3>
                    <p>
                      Unresolved risks the creator can use later. They are not
                      reader-facing facts and do not become canon until a later
                      event resolves them.
                    </p>
                    {creatorReceipt.behindCurtainRisks.length > 0 ? (
                      <ul className={styles.behindCurtainList}>
                        {creatorReceipt.behindCurtainRisks.map((risk) => (
                          <li key={risk.riskId}>
                            <span>Latent</span>
                            <strong>{risk.summary}</strong>
                            <small>
                              Potential audience: {risk.potentialHearers
                                .map(({ label }) => label)
                                .join(" · ")}
                            </small>
                            <code>{risk.riskId}</code>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.emptyState}>
                        No unresolved disclosure risk is waiting behind this scene.
                      </p>
                    )}
                  </section>

                  <section aria-labelledby="movement-heading">
                    <h3 id="movement-heading">Visible and hidden movement</h3>
                    {movements.length > 0 ? (
                      <ul className={styles.movementList}>
                        {movements.map(({ event, effect }, index) => {
                          const visible = isCreatorEventVisible(event);
                          return (
                            <li key={`${event.eventId}-${effect.entityId}-${index}`}>
                              <span data-visibility={visible ? "visible" : "hidden"}>
                                {visible ? "Visible movement" : "Hidden movement"}
                              </span>
                              <strong>{humanizeId(effect.entityId)} → {humanizeId(effect.toZoneId)}</strong>
                              <small>{event.summary}</small>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className={styles.emptyState}>No actor movement resolved in this checkpoint.</p>
                    )}
                  </section>

                  <section aria-labelledby="event-audit-heading">
                    <h3 id="event-audit-heading">Event audit</h3>
                    <ol className={styles.eventAudit}>
                      {creatorReceipt.events.map((event) => (
                        <li key={event.eventId}>
                          <span>{isCreatorEventVisible(event) ? "Participant-visible" : "Creator-view only"}</span>
                          <strong>{event.summary}</strong>
                          <code>{event.eventId}</code>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <details className={styles.hashes}>
                    <summary>Proof IDs and hashes</summary>
                    <dl>
                      <div><dt>Checkpoint ID</dt><dd><code>{active.sessionId}</code></dd></div>
                      <div><dt>Parent checkpoint</dt><dd><code>{active.parentCheckpointId ?? "None"}</code></dd></div>
                      <div><dt>Parent sequence</dt><dd>{parentSequence ?? "None"}</dd></div>
                      <div><dt>Branch</dt><dd><code>{active.cursor.branchId}</code></dd></div>
                      <div><dt>Parent branch</dt><dd><code>{active.cursor.parentBranchId ?? "None"}</code></dd></div>
                      <div><dt>State hash</dt><dd title={active.stateHash}><code>{shortHash(active.stateHash)}</code></dd></div>
                      <div><dt>Receipt hash</dt><dd title={creatorReceipt.receiptHash ?? undefined}><code>{shortHash(creatorReceipt.receiptHash)}</code></dd></div>
                      <div><dt>Ledger head</dt><dd title={creatorReceipt.ledgerHeadHash ?? undefined}><code>{shortHash(creatorReceipt.ledgerHeadHash)}</code></dd></div>
                      <div><dt>Fork receipt</dt><dd title={active.cursor.forkedFromReceiptHash ?? undefined}><code>{shortHash(active.cursor.forkedFromReceiptHash)}</code></dd></div>
                    </dl>
                  </details>
                </>
              ) : (
                <div className={styles.inspectorLocked} role="status" data-testid="creator-inspector-locked">
                  <strong>
                    {activeCheckpoint?.creatorStatus === "loading"
                      ? "Loading creator-view world state…"
                      : "Creator inspector locked"}
                  </strong>
                  <p>
                    {activeCheckpoint?.creatorStatus === "loading"
                      ? "The participant scene is ready while the separate capability request is checked."
                      : activeCheckpoint?.creatorError ?? "This checkpoint has no creator capability."}
                  </p>
                  <small>Participant narration and actions remain available.</small>
                </div>
              )}
            </div>
          </details>

          <section className={styles.transportPanel} aria-labelledby="transport-heading">
            <div>
              <p className={styles.eyebrow}>Narration transport</p>
              <h2 id="transport-heading">Restart this bounded world</h2>
              <p>Simulation rules stay deterministic. Only the prose renderer changes.</p>
            </div>
            <div className={styles.transportControls}>
              <fieldset>
                <legend>Choose narration</legend>
                <label>
                  <input
                    type="radio"
                    name="world-transport"
                    value="fixture"
                    checked={transport === "fixture"}
                    onChange={() => setTransport("fixture")}
                    data-testid="world-transport-fixture"
                  />
                  Fixture
                </label>
                <label>
                  <input
                    type="radio"
                    name="world-transport"
                    value="codex_cli"
                    checked={transport === "codex_cli"}
                    onChange={() => setTransport("codex_cli")}
                    data-testid="world-transport-codex-cli"
                  />
                  Local Codex CLI
                </label>
              </fieldset>
              {transport === "codex_cli" ? (
                <label className={styles.tokenField} htmlFor="world-live-token">
                  Local narration token
                  <input
                    id="world-live-token"
                    type="password"
                    value={liveToken}
                    onChange={(event) => setLiveToken(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    data-testid="world-live-token"
                  />
                  <small>Sent only as the <code>{WORLD_LIVE_TOKEN_HEADER}</code> request header to this local server.</small>
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => void restartSession()}
                disabled={loading || busy || (transport === "codex_cli" && liveToken.trim().length === 0)}
                data-testid="world-restart"
              >
                {loading ? "Opening…" : transport === "fixture" ? "Restart fixture" : "Start local Codex narration"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

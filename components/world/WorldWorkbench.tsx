"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/components/world/WorldWorkbench.module.css";
import {
  WORLD_CREATOR_ACCESS_HEADER,
  WORLD_LIVE_TOKEN_HEADER,
  type WorldApiError,
  type WorldCreatorReceipt,
  type WorldEffect,
  type WorldEvent,
  type WorldNarrationDraftDecisionRequest,
  type WorldNarrationDraftDecisionResponse,
  type WorldPendingNarrationDraft,
  type WorldSessionView,
  type WorldTransport,
  type WorldTurnRequest,
} from "@/components/world/api-types";

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

const isPendingNarrationDraft = (
  value: WorldSessionView | WorldPendingNarrationDraft,
): value is WorldPendingNarrationDraft =>
  "kind" in value && value.kind === "creator_review";

const humanizeId = (value: string): string =>
  value
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const shortHash = (value: string | null): string =>
  value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "None";

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

export function WorldWorkbench() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transport, setTransport] = useState<WorldTransport>("fixture");
  const [liveToken, setLiveToken] = useState("");
  const [action, setAction] = useState("");
  const [forkBeforeAction, setForkBeforeAction] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] =
    useState<WorldPendingNarrationDraft | null>(null);
  const [draftParagraphs, setDraftParagraphs] = useState<
    WorldPendingNarrationDraft["narration"]["paragraphs"]
  >([]);
  const autoStarted = useRef(false);
  const creatorCapability = useRef<string | null>(null);
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
    async (nextTransport: WorldTransport, token: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const { data: view, response } = await requestJson<WorldSessionView>(
          "/api/world/session",
          { transport: nextTransport },
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
        setForkBeforeAction(false);
        setTransport(nextTransport);
        await loadCreatorReceipt(view, capability, signal);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "The world session could not be opened.");
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
    void startSession("fixture", "", controller.signal);
    return () => controller.abort();
  }, [startSession]);

  const selectCheckpoint = (sessionId: string) => {
    setSelectedId(sessionId);
    setAction("");
    setForkBeforeAction(false);
    setError(null);
    window.requestAnimationFrame(() => sceneHeadingRef.current?.focus());
  };

  const restartSession = async () => {
    if (transport === "codex_cli" && liveToken.trim().length === 0) {
      setError("Enter the local narration token before starting Codex CLI mode.");
      return;
    }
    await startSession(transport, liveToken.trim());
  };

  const submitTurn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active || active.status === "complete" || action.trim().length === 0) return;

    setBusy(true);
    setError(null);
    const request: WorldTurnRequest = {
      sessionId: active.sessionId,
      expectedStateHash: active.stateHash,
      action: action.trim(),
      forkBeforeAction,
      transport: active.transport,
    };
    try {
      const { data: next } = await requestJson<
        WorldSessionView | WorldPendingNarrationDraft
      >(
        "/api/world/turn",
        request,
        active.transport === "codex_cli" ? liveToken.trim() : "",
        undefined,
        active.transport === "codex_cli" && creatorCapability.current
          ? { [WORLD_CREATOR_ACCESS_HEADER]: creatorCapability.current }
          : {},
      );
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
      setForkBeforeAction(false);
      window.requestAnimationFrame(() => sceneHeadingRef.current?.focus());
      await loadCreatorReceipt(next, creatorCapability.current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The world could not resolve this action.");
    } finally {
      setBusy(false);
    }
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
        <h1>The Night of the Scar</h1>
        <p>Opening the source-grounded Ithacan household and assigning each character only what they know.</p>
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
  const movements = creatorReceipt ? movementEffects(creatorReceipt.events) : [];
  const isCreatorEventVisible = (event: WorldEvent): boolean =>
    event.visibleToEntityIds.includes(active.focalActor.entityId);
  const parentSequence = active.parentCheckpointId
    ? checkpoints.find(({ view }) => view.sessionId === active.parentCheckpointId)?.sequence ?? null
    : null;
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

        <div className={styles.titleGrid}>
          <div>
            <p className={styles.eyebrow}>A bounded Odyssey simulation · Book 19</p>
            <h1>
              The Night
              <span>of the Scar</span>
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

      <div className={styles.workspace}>
        <aside className={styles.timeline} aria-labelledby="checkpoint-heading">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Ephemeral local checkpoints</p>
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
                {active.nextActions.map((candidate, index) => (
                  <button
                    key={candidate.actionId}
                    type="button"
                    onClick={() => setAction(candidate.suggestedInput)}
                    data-testid={`world-candidate-${index + 1}`}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{candidate.label}</strong>
                    <small>{candidate.suggestedInput}</small>
                  </button>
                ))}
              </div>

              <form onSubmit={(event) => void submitTurn(event)}>
                <label htmlFor="world-action">Write an action in your own words</label>
                <textarea
                  id="world-action"
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                  maxLength={800}
                  rows={4}
                  placeholder="Question the testimony, change who is present, wait and observe, or try another grounded action…"
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
                  {busy ? "Resolving player, NPC, and world effects…" : "Commit action to this world line"}
                </button>
              </form>
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

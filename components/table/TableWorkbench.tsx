"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { CreatorDecision } from "@/src/contracts/creator-decision";
import type { CreatorDecisionResult } from "@/src/contracts/creator-decision";
import type { GraphDescriptor } from "@/src/contracts/graph";
import {
  MAX_DISPLAY_DESCRIPTION_LENGTH,
  type ProposalPatch,
} from "@/src/contracts/proposal";
import type { RunRequest, RunResult } from "@/src/contracts/run";
import type {
  SimulationSnapshot,
  SimulationTransitionRecord,
} from "@/src/contracts/simulation";
import { KnowledgeGraph } from "@/components/table/KnowledgeGraph";
import type {
  DecisionApiResult,
  DemoBootstrap,
  DemoReplayResult,
  OverlayReplayApiResult,
  TransitionApiResult,
} from "@/components/table/api-types";

type WorkbenchPhase =
  | "loading"
  | "setup"
  | "running"
  | "proposal"
  | "deciding"
  | "rebased"
  | "transitioning"
  | "step_one"
  | "complete"
  | "rejected"
  | "error";

type TimelineEntry = {
  label: string;
  note: string;
  snapshot: SimulationSnapshot;
};

const phaseLabels: Record<WorkbenchPhase, string> = {
  loading: "Loading fixture",
  setup: "Ready for rehearsal",
  running: "Building candidate",
  proposal: "Creator decision required",
  deciding: "Applying creator decision",
  rebased: "Canon approved · state rebased",
  transitioning: "Validating state transition",
  step_one: "Step 1 applied",
  complete: "Two-step rehearsal complete",
  rejected: "Proposal rejected · state unchanged",
  error: "Request failed",
};

const apiRequest = async <T,>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    signal,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${path} returned a non-JSON response (${response.status}).`);
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? typeof payload.error === "string"
          ? payload.error
          : typeof payload.error === "object" &&
              payload.error !== null &&
              "message" in payload.error &&
              typeof payload.error.message === "string"
            ? payload.error.message
            : `Request failed with status ${response.status}.`
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
};

const snapshotVariable = (snapshot: SimulationSnapshot): string =>
  snapshot.variables.find(({ id }) => id === "harbor_watch")?.value ?? "unknown";

const statusTone = (status: DemoReplayResult["status"]): string => {
  return status === "pass" ? "pass" : "block";
};

const statusCopy = (status: DemoReplayResult["status"]): string =>
  status.replaceAll("_", " ");

const countWords = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/u).length;

export function TableWorkbench() {
  const [phase, setPhase] = useState<WorkbenchPhase>("loading");
  const [bootstrap, setBootstrap] = useState<DemoBootstrap | null>(null);
  const [overlay, setOverlay] = useState<CanonOverlay | null>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [lastRunRequest, setLastRunRequest] = useState<RunRequest | null>(null);
  const [decisionResult, setDecisionResult] = useState<CreatorDecisionResult | null>(null);
  const [lastCreatorDecision, setLastCreatorDecision] = useState<CreatorDecision | null>(null);
  const [decisionGraph, setDecisionGraph] = useState<GraphDescriptor | null>(null);
  const [overlayReplay, setOverlayReplay] = useState<OverlayReplayApiResult | null>(null);
  const [transitions, setTransitions] = useState<SimulationTransitionRecord[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [editingProposal, setEditingProposal] = useState(false);
  const [editedRuleDescription, setEditedRuleDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const loadDemo = useCallback(async (signal?: AbortSignal) => {
    setPhase("loading");
    setApiError(null);
    setFormError(null);
    try {
      const demo = await apiRequest<DemoBootstrap>("/api/demo", undefined, signal);
      if (demo.mode !== "fixture") {
        throw new Error("The public Table requires a fixture-mode demo payload.");
      }
      if (demo.participantSlots.length < 2) {
        throw new Error("The demo must provide two local participant slots.");
      }
      if (
        demo.registeredRehearsal.styleProfileId !== demo.selectedStyleProfileId ||
        !demo.styleProfiles.some(({ id }) => id === demo.registeredRehearsal.styleProfileId)
      ) {
        throw new Error("The selected style profile is not registered by the demo.");
      }

      if (
        !demo.registeredRehearsal.frozen ||
        demo.registeredRehearsal.participantIntents.length !== 2 ||
        demo.registeredRehearsal.participantIntents.some(
          (intent, index) =>
            intent.intentId !== demo.participantSlots[index]?.intentId ||
            intent.participantId !== demo.participantSlots[index]?.participantId ||
            intent.controlledEntityIds.length !== 1 ||
            intent.controlledEntityIds[0] !== demo.participantSlots[index]?.controlledEntityId ||
            intent.intent !== demo.participantSlots[index]?.defaultIntent ||
            !demo.participantSlots[index]?.frozen,
        )
      ) {
        throw new Error("The public rehearsal inputs must match the frozen replay registration.");
      }

      setBootstrap(demo);
      setOverlay(demo.overlay);
      setSnapshot(demo.snapshot);
      setRunResult(null);
      setLastRunRequest(null);
      setDecisionResult(null);
      setLastCreatorDecision(null);
      setDecisionGraph(null);
      setOverlayReplay(null);
      setTransitions([]);
      setTimeline([{ label: "S0", note: "Initial fixture snapshot", snapshot: demo.snapshot }]);
      setEditingProposal(false);
      setEditedRuleDescription("");
      setPhase("setup");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setApiError(error instanceof Error ? error.message : "Unable to load the fixture demo.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadDemo(controller.signal));
    return () => controller.abort();
  }, [loadDemo]);

  useEffect(() => {
    if (!["setup", "loading", "running", "deciding", "transitioning"].includes(phase)) {
      resultHeadingRef.current?.focus();
    }
  }, [phase]);

  const intents = bootstrap?.registeredRehearsal.participantIntents ?? [];
  const selectedStyleId = bootstrap?.registeredRehearsal.styleProfileId ?? "";
  const styleProfile = bootstrap?.styleProfiles.find(({ id }) => id === selectedStyleId);
  const proposal = runResult?.proposals[0] ?? null;
  const completedDraft =
    runResult?.modelOutcome.outcome === "completed" ? runResult.modelOutcome.draft : null;
  const busy = ["loading", "running", "deciding", "transitioning"].includes(phase);
  const visibleReplayResults = overlayReplay?.replayResults ?? bootstrap?.replayResults ?? [];
  const maxWordsConstraint = styleProfile?.constraints.find(
    ({ kind, checkMode, value }) =>
      kind === "max_words" && checkMode === "deterministic" && typeof value === "number",
  );
  const humanStyleConstraints = styleProfile?.constraints.filter(
    ({ checkMode }) => checkMode === "human",
  ) ?? [];
  const narrativeWordCount = completedDraft ? countWords(completedDraft.narrative) : 0;
  const authorizingIntentIds = new Set(
    completedDraft?.utterances.map(({ authorizingIntentId }) => authorizingIntentId) ?? [],
  );
  const contributingIntentIds = new Set(
    completedDraft?.utterances.flatMap(({ contributingIntentIds }) => contributingIntentIds) ?? [],
  );

  const runCandidate = async () => {
    if (!bootstrap || !overlay || !snapshot) return;

    setFormError(null);
    setApiError(null);
    setPhase("running");

    const requestOverlay = phase === "error" ? bootstrap.overlay : overlay;
    const requestSnapshot = phase === "error" ? bootstrap.snapshot : snapshot;
    setOverlay(requestOverlay);
    setSnapshot(requestSnapshot);
    setRunResult(null);
    setLastRunRequest(null);
    setDecisionResult(null);
    setLastCreatorDecision(null);
    setDecisionGraph(null);
    setOverlayReplay(null);
    setTransitions([]);
    setTimeline([
      { label: "S0", note: "Initial fixture snapshot", snapshot: requestSnapshot },
    ]);
    setEditingProposal(false);

    const request: RunRequest = {
      modelMode: "fixture",
      draftFixtureId: bootstrap.registeredRehearsal.draftFixtureId,
      overlay: requestOverlay,
      snapshot: requestSnapshot,
      styleProfileId: selectedStyleId,
      taskType: bootstrap.registeredRehearsal.taskType,
      brief: bootstrap.registeredRehearsal.brief,
      participantIntents: bootstrap.registeredRehearsal.participantIntents,
    };

    try {
      const result = await apiRequest<RunResult>("/api/runs", {
        method: "POST",
        body: JSON.stringify(request),
      });
      setRunResult(result);
      setLastRunRequest(request);
      setSnapshot(result.currentSnapshot);
      setPhase("proposal");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "The fixture run failed.");
      setPhase("error");
    }
  };

  const editableRulePatch = proposal?.patches.find((patch) => patch.op === "add_rule");
  const appliedEditableRule =
    decisionResult?.status === "applied" && editableRulePatch?.op === "add_rule"
      ? decisionResult.overlay.rules.find(({ id }) => id === editableRulePatch.rule.id) ?? null
      : null;

  const beginEdit = () => {
    if (!editableRulePatch || editableRulePatch.op !== "add_rule") return;
    setEditedRuleDescription(
      editableRulePatch.rule.displayDescription ?? editableRulePatch.rule.description,
    );
    setEditingProposal(true);
  };

  const decide = async (action: "accept" | "edit" | "reject") => {
    if (!proposal || !overlay || !snapshot || !lastRunRequest) return;
    if (action === "edit" && editedRuleDescription.trim().length === 0) {
      setFormError("The edited display wording cannot be empty.");
      return;
    }

    let patches: ProposalPatch[] | undefined;
    if (action === "edit") {
      patches = proposal.patches.map((patch) =>
        patch.op === "add_rule" && patch.rule.id === editableRulePatch?.rule.id
          ? {
              ...patch,
              rule: {
                ...patch.rule,
                displayDescription: editedRuleDescription.trim(),
              },
            }
          : patch,
      );
    }

    const decision: CreatorDecision =
      action === "edit"
        ? {
            action,
            proposalId: proposal.id,
            proposalHash: proposal.proposalHash,
            baseOverlayId: proposal.baseOverlayId,
            baseOverlayVersion: proposal.baseOverlayVersion,
            baseOverlayHash: proposal.baseOverlayHash,
            patches: patches ?? proposal.patches,
          }
        : {
            action,
            proposalId: proposal.id,
            proposalHash: proposal.proposalHash,
            baseOverlayId: proposal.baseOverlayId,
            baseOverlayVersion: proposal.baseOverlayVersion,
            baseOverlayHash: proposal.baseOverlayHash,
          };

    setFormError(null);
    setApiError(null);
    setPhase("deciding");
    try {
      const result = await apiRequest<DecisionApiResult>("/api/decisions", {
        method: "POST",
        body: JSON.stringify({ runRequest: lastRunRequest, decision }),
      });
      if (result.decision.status === "applied") {
        if (!result.overlayReplay?.allPassed) {
          throw new Error("The candidate overlay did not pass its fresh safety-control replay.");
        }
      }
      setDecisionResult(result.decision);
      setLastCreatorDecision(decision);
      setDecisionGraph(result.graph);
      setOverlayReplay(result.overlayReplay);
      setOverlay(result.decision.overlay);
      setSnapshot(result.decision.snapshot);
      if (result.decision.status === "applied") {
        setTimeline((current) => [
          current[0],
          {
            label: "S0r",
            note: "Same turn and variables · approved overlay hash",
            snapshot: result.decision.snapshot,
          },
        ]);
        setEditingProposal(false);
        setPhase("rebased");
      } else if (result.decision.status === "rejected") {
        setPhase("rejected");
      } else {
        setApiError(`Creator decision was ${result.decision.status}; canon and state were not advanced.`);
        setPhase("error");
      }
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "The creator decision failed.");
      setPhase("error");
    }
  };

  const advance = async (step: 1 | 2) => {
    if (!snapshot || !lastRunRequest || !lastCreatorDecision) return;
    setApiError(null);
    setPhase("transitioning");
    try {
      const result = await apiRequest<TransitionApiResult>("/api/transitions", {
        method: "POST",
        body: JSON.stringify({
          runRequest: lastRunRequest,
          decision: lastCreatorDecision,
          snapshot,
          step,
        }),
      });
      if (result.status !== "applied") {
        const detail = result.violations.map(({ message }) => message).join(" ");
        setApiError(detail || `Step ${step} was blocked and the state did not change.`);
        setSnapshot(result.snapshot);
        setPhase("error");
        return;
      }

      setSnapshot(result.snapshot);
      setTransitions((current) => [...current, result.transition]);
      setTimeline((current) => [
        ...current,
        {
          label: `S${step}`,
          note: step === 1 ? "Harbor watch organized" : "Red sail observed",
          snapshot: result.snapshot,
        },
      ]);
      setPhase(step === 1 ? "step_one" : "complete");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : `Step ${step} failed.`);
      setPhase("error");
    }
  };

  const transitionChainIsContinuous = useMemo(
    () =>
      transitions.length < 2 ||
      transitions.every(
        (transition, index) =>
          index === 0 || transitions[index - 1]?.toStateHash === transition.fromStateHash,
      ),
    [transitions],
  );

  if (phase === "loading" && !bootstrap) {
    return (
      <main id="main-content" className="workbench loading-screen" aria-busy="true">
        <p className="kicker">FIXTURE MODE · NO LIVE CALL</p>
        <h1>Preparing the Table rehearsal…</h1>
        <p>Loading the synthetic World Pack, overlay, snapshot, and frozen replay.</p>
      </main>
    );
  }

  if (!bootstrap || !overlay || !snapshot) {
    return (
      <main id="main-content" className="workbench loading-screen">
        <p className="kicker">DEMO UNAVAILABLE</p>
        <h1>The fixture could not be loaded.</h1>
        <p role="alert" data-testid="api-error">{apiError ?? "Unknown bootstrap error."}</p>
        <button className="button primary" type="button" onClick={() => void loadDemo()}>
          Retry fixture
        </button>
      </main>
    );
  }

  return (
    <main id="main-content" className="workbench" aria-busy={busy}>
      <header className="workbench-header shell">
        <div className="topline">
          <span>PENELOPE ONTOLOGY</span>
          <span className="mode-badge" data-testid="fixture-mode">FIXTURE MODE · NO LIVE CALL</span>
        </div>
        <div className="title-grid">
          <div>
            <p className="kicker">TABLE REHEARSAL / WORK &amp; PRODUCTIVITY</p>
            <h1>Rehearse the scene.<br /><span>Keep canon inspectable.</span></h1>
          </div>
          <p className="lede">
            Fluent default prose can still flatten a voice or invent connective lore. This harness
            makes creator-owned style constraints explicit, carries them into the structured
            contract, exposes what each character can know, isolates new canon, and advances state
            only after creator approval.
          </p>
        </div>
        <div className="responsibility-contract" data-testid="responsibility-contract">
          <strong>Model proposes · Harness verifies · Creator decides</strong>
          <p>The creator owns the style profile, canon changes, and every final release decision.</p>
        </div>
        <dl className="run-strip">
          <div><dt>World Pack</dt><dd>{bootstrap.worldPack.label}</dd></div>
          <div><dt>Version</dt><dd>{bootstrap.worldPack.version}</dd></div>
          <div><dt>Overlay</dt><dd data-testid="overlay-version">v{overlay.version}</dd></div>
          <div><dt>Canon hash</dt><dd data-testid="canon-hash" title={overlay.hash}>{overlay.hash.slice(0, 12)}…</dd></div>
          <div><dt>Table state</dt><dd data-testid="state-value">{snapshotVariable(snapshot)}</dd></div>
        </dl>
      </header>

      <div className="shell workbench-grid">
        <aside className="stage-rail" aria-label="Rehearsal stages">
          <p className="kicker">VISIBLE CONTROL PATH</p>
          <ol>
            {[
              ["01", "Intent + style"],
              ["02", "Candidate + evidence"],
              ["03", "Creator decision"],
              ["04", "Two state steps"],
              ["05", "Frozen replay"],
            ].map(([number, label]) => (
              <li key={number}><span>{number}</span>{label}</li>
            ))}
          </ol>
          <p className="rail-note">This public rehearsal loads registered synthetic inputs. Arbitrary facilitator-collected intents belong to the gated live-adapter path, not this fixture.</p>
        </aside>

        <div className="workbench-content">
          <section className="setup-panel panel" aria-labelledby="setup-title">
            <div className="panel-heading">
              <div>
                <p className="kicker">01 / REGISTERED REHEARSAL</p>
                <h2 id="setup-title">Frozen inputs make this run auditable.</h2>
              </div>
              <span className="status-chip neutral">2 FROZEN INTENTS</span>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void runCandidate(); }}>
              <fieldset className="participant-fieldset">
                <legend className="sr-only">Frozen registered participant intents</legend>
                <div className="participant-grid">
                  {intents.map((item, index) => {
                    const slot = bootstrap.participantSlots[index];
                    return (
                      <article
                        className="participant-card frozen-intent-card"
                        key={item.intentId}
                        data-testid={`participant-intent-${index}`}
                        data-frozen="true"
                      >
                        <div className="participant-meta">
                          <span>{slot?.participantId ?? item.participantId}</span>
                          <strong>{slot?.characterLabel ?? item.controlledEntityIds[0]}</strong>
                        </div>
                        <p className="frozen-label">REGISTERED · FROZEN · NON-EDITABLE</p>
                        <p className="frozen-intent-copy">{item.intent}</p>
                        <small>{item.intentId} · controls {item.controlledEntityIds[0]}</small>
                      </article>
                    );
                  })}
                </div>
              </fieldset>

              <div className="style-row">
                <div className="frozen-style-profile" data-testid="style-profile" data-frozen="true">
                  <span>Creator style profile · registered</span>
                  <strong>{styleProfile?.label}</strong>
                  <small>{selectedStyleId} · frozen for this rehearsal</small>
                </div>
                <ul className="constraint-list" aria-label="Selected style constraints">
                  {styleProfile?.constraints.map((constraint) => (
                    <li key={constraint.id}>
                      <span>{constraint.kind.replaceAll("_", " ")}</span>
                      <strong>{String(constraint.value)}</strong>
                      <small>{constraint.checkMode}</small>
                    </li>
                  ))}
                </ul>
              </div>

              {formError ? <p className="inline-error" role="alert">{formError}</p> : null}
              <div className="action-row">
                <p>
                  Loaded from <code>{bootstrap.registeredRehearsal.replayCaseId}</code> / <code>{bootstrap.registeredRehearsal.stageId}</code>.
                  The fixture adapter selects the registered draft ID; prompt prose does not branch the output.
                </p>
                <button
                  className="button primary"
                  data-testid="run-candidate"
                  type="submit"
                  disabled={phase !== "setup" && phase !== "error"}
                >
                  Run frozen rehearsal <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          </section>

          <section className="run-status" aria-live="polite" aria-atomic="true">
            <span>RUN STATUS</span>
            <strong data-testid="run-status">{phaseLabels[phase]}</strong>
          </section>

          <section className="proof-panel panel" aria-labelledby="proof-title" data-testid="grounded-proof">
            <div className="panel-heading">
              <div>
                <p className="kicker">FIXTURE PREFLIGHT</p>
                <h2 id="proof-title">A pass needs evidence. A conflict stays visible.</h2>
              </div>
              <span className="status-chip neutral">SERVER EXECUTED</span>
            </div>
            <div className="proof-grid">
              <article className="proof-card grounded">
                <div className="proof-card-heading">
                  <span>GROUNDED SCENE</span>
                  <strong className="status-chip pass">{bootstrap.proofs.grounded.status}</strong>
                </div>
                <blockquote>{bootstrap.proofs.grounded.narrative}</blockquote>
                <p>Used evidence</p>
                <ul className="evidence-tags">
                  {bootstrap.proofs.grounded.usedClaimIds.map((id) => <li key={id}>{id}</li>)}
                </ul>
                <small>
                  {bootstrap.proofs.grounded.characterViews.length} character-scoped views · {bootstrap.proofs.grounded.selectedClaimIds.length} selected claims
                </small>
              </article>
              <article className="proof-card conflict">
                <div className="proof-card-heading">
                  <span>SOURCE CONFLICT</span>
                  <strong className="status-chip decision">needs creator decision</strong>
                </div>
                <p>Helen’s wartime location remains split across two active traditions. The harness exposes the contradiction instead of blending it.</p>
                <ul className="evidence-tags">
                  {bootstrap.proofs.conflict.evidenceIds.map((id) => <li key={id}>{id}</li>)}
                </ul>
                <small>{bootstrap.proofs.conflict.violationCodes.join(" · ")}</small>
              </article>
            </div>
          </section>

          <section className="knowledge-boundary panel" aria-labelledby="knowledge-boundary-title" data-testid="knowledge-boundary">
            <div className="panel-heading">
              <div>
                <p className="kicker">CHARACTER-SCOPED RETRIEVAL</p>
                <h2 id="knowledge-boundary-title">Who can know this?</h2>
              </div>
              <p className="panel-note">Derived from the World Pack and the frozen character view.</p>
            </div>
            <div className="knowledge-boundary-table" role="table" aria-label="Fixture knowledge visibility boundaries">
              <div className="knowledge-boundary-row knowledge-boundary-header" role="row">
                <span role="columnheader">Perspective</span>
                <span role="columnheader">Fact</span>
                <span role="columnheader">Boundary</span>
                <span role="columnheader">Evidence</span>
              </div>
              {bootstrap.knowledgeBoundary.map((boundary) => (
                <div
                  className="knowledge-boundary-row"
                  role="row"
                  key={`${boundary.perspectiveId}-${boundary.factLabel}`}
                  data-testid={`knowledge-${boundary.perspectiveId}-${boundary.status}`}
                >
                  <strong role="cell">{boundary.perspectiveLabel}</strong>
                  <span role="cell">{boundary.factLabel}</span>
                  <span role="cell" className={`boundary-status ${boundary.status}`}>{boundary.status}</span>
                  <span role="cell"><code>{boundary.evidenceId}</code><small>{boundary.basis}</small></span>
                </div>
              ))}
            </div>
          </section>

          {apiError ? (
            <section className="api-error" role="alert" data-testid="api-error">
              <div><span>REQUEST FAILED</span><strong>{apiError}</strong></div>
              <button className="button secondary" type="button" onClick={() => void loadDemo()} data-testid="reset-demo">
                Reset fixture
              </button>
            </section>
          ) : null}

          {runResult ? (
            <>
              <section className="candidate-panel panel" aria-labelledby="candidate-title">
                <div className="panel-heading">
                  <div>
                    <p className="kicker">02 / STRUCTURED CANDIDATE</p>
                    <h2 id="candidate-title" ref={resultHeadingRef} tabIndex={-1}>A scene candidate, not canon.</h2>
                  </div>
                  <span className={`status-chip ${runResult.status === "blocked" ? "block" : "decision"}`}>
                    {runResult.status.replaceAll("_", " ")}
                  </span>
                </div>

                {completedDraft ? (
                  <div className="candidate-grid">
                    <article className="prose-card">
                      <p className="kicker">CANDIDATE PROSE</p>
                      <blockquote>{completedDraft.narrative}</blockquote>
                      <p className="trace-line">fixture · {runResult.modelOutcome.trace.requestedModel} · no response ID</p>
                    </article>
                    <article className="lineage-card">
                      <p className="kicker">INTENT LINEAGE</p>
                      <ul>
                        {completedDraft.utterances.map((utterance, index) => (
                          <li key={`${utterance.speakerId}-${index}`}>
                            <strong>{utterance.speakerId}</strong>
                            <span>authorizing intent · {utterance.authorizingIntentId}</span>
                            <span>
                              contributing intent{utterance.contributingIntentIds.length === 1 ? "" : "s"} · {utterance.contributingIntentIds.length > 0
                                ? utterance.contributingIntentIds.join(" · ")
                                : "none"}
                            </span>
                            <q>{utterance.text}</q>
                          </li>
                        ))}
                      </ul>
                      <div className="intent-coverage" data-testid="intent-coverage">
                        <strong>{authorizingIntentIds.size}/{intents.length} intents authorize a playable line</strong>
                        <span>{contributingIntentIds.size}/{intents.length} intents also appear as contributors</span>
                      </div>
                    </article>
                  </div>
                ) : (
                  <p className="inline-error">Model outcome: {runResult.modelOutcome.outcome}</p>
                )}

                <div className="audit-grid">
                  <article>
                    <h3>Evidence selected</h3>
                    <dl className="evidence-counts">
                      <div><dt>Claims</dt><dd>{runResult.evidence.claimIds.length}</dd></div>
                      <div><dt>Entities</dt><dd>{runResult.evidence.entityIds.length}</dd></div>
                      <div><dt>Character views</dt><dd>{runResult.evidence.characterViews.length}</dd></div>
                    </dl>
                    <ul className="compact-list">
                      {runResult.evidence.characterViews.map((view) => (
                        <li key={view.characterId}>
                          <strong>{view.characterId}</strong>
                          <span>{view.knownClaimIds.length} known · {view.uncertainClaimIds.length} uncertain</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                  <article>
                    <h3>Hard violations</h3>
                    {runResult.hardViolations.length > 0 ? (
                      <ul className="violation-list">
                        {runResult.hardViolations.map((violation, index) => (
                          <li key={`${violation.code}-${index}`}>
                            <span>{violation.code}</span>
                            <p>{violation.message}</p>
                          </li>
                        ))}
                      </ul>
                    ) : <p>No hard violations.</p>}
                  </article>
                </div>

                {completedDraft ? (
                  <section className="style-receipt" aria-labelledby="style-receipt-title" data-testid="style-receipt">
                    <div className="style-receipt-heading">
                      <div>
                        <p className="kicker">STYLE RECEIPT</p>
                        <h3 id="style-receipt-title">Objective checks pass; taste stays human.</h3>
                      </div>
                      <strong className="style-warning">Referenced ≠ verified</strong>
                    </div>
                    <div className="style-receipt-grid">
                      <article>
                        <span>OBJECTIVE · MAX_WORDS</span>
                        <dl>
                          <div><dt>limit</dt><dd>{typeof maxWordsConstraint?.value === "number" ? maxWordsConstraint.value : "—"}</dd></div>
                          <div><dt>actual</dt><dd data-testid="style-word-count">{narrativeWordCount}</dd></div>
                          <div><dt>result</dt><dd className="receipt-pass">{typeof maxWordsConstraint?.value === "number" && narrativeWordCount <= maxWordsConstraint.value ? "PASS" : "FAIL"}</dd></div>
                        </dl>
                      </article>
                      <article>
                        <span>HUMAN-REVIEWED CONSTRAINTS</span>
                        <ul>
                          {humanStyleConstraints.map((constraint) => (
                            <li key={constraint.id}>
                              <strong>{constraint.kind.replaceAll("_", " ")}</strong>
                              <code>{constraint.id}</code>
                              <small>creator review required</small>
                            </li>
                          ))}
                        </ul>
                      </article>
                    </div>
                    <p>
                      The draft references {completedDraft.appliedStyleConstraintIds.length} registered constraints; only deterministic checks are machine-verified. Live AB/BA not measured.
                    </p>
                  </section>
                ) : null}
              </section>

              {proposal ? (
                <section className="decision-panel panel" aria-labelledby="decision-title" data-testid="proposal">
                  <div className="panel-heading">
                    <div>
                      <p className="kicker">03 / CREATOR GATE</p>
                      <h2 id="decision-title">Interesting is not the same as official.</h2>
                    </div>
                    <span className={`status-chip ${decisionResult?.status === "applied" ? "pass" : "decision"}`}>
                      {decisionResult?.status === "applied" ? "OVERLAY APPLIED" : "GHOST PROPOSAL"}
                    </span>
                  </div>
                  <div className="proposal-card">
                    <div>
                      <span>{proposal.id}</span>
                      <h3>{proposal.summary}</h3>
                      {proposal.patches.map((patch) => {
                        if (patch.op === "add_claim") {
                          return <p key={patch.claim.id}>{patch.claim.summary}</p>;
                        }
                        const displayWording =
                          appliedEditableRule?.id === patch.rule.id
                            ? appliedEditableRule.displayDescription
                            : patch.rule.displayDescription;
                        return (
                          <div className="proposal-rule-copy" key={patch.rule.id}>
                            <p data-testid="proposal-semantic-rule">
                              <strong>Locked semantic rule</strong>
                              <span data-testid="proposal-semantic-description">
                                {patch.rule.description}
                              </span>
                            </p>
                            {displayWording ? (
                              <p data-testid="proposal-display-wording">
                                <strong>Display wording · non-authoritative</strong>
                                {displayWording}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <dl>
                      <div><dt>Base overlay</dt><dd>v{proposal.baseOverlayVersion}</dd></div>
                      <div><dt>Proposal hash</dt><dd><code>{proposal.proposalHash}</code></dd></div>
                    </dl>
                  </div>

                  {editingProposal ? (
                    <div className="edit-rule">
                      <label htmlFor="edited-rule">Edit display wording</label>
                      <p className="trace-line">Rule identity, kind, and semantic description remain locked.</p>
                      <textarea
                        id="edited-rule"
                        rows={3}
                        maxLength={MAX_DISPLAY_DESCRIPTION_LENGTH}
                        value={editedRuleDescription}
                        onChange={(event) => setEditedRuleDescription(event.target.value)}
                      />
                      <small>
                        {editedRuleDescription.length}/{MAX_DISPLAY_DESCRIPTION_LENGTH} · display only
                      </small>
                      <div className="button-group">
                        <button className="button secondary" type="button" onClick={() => setEditingProposal(false)}>Cancel</button>
                        <button className="button primary" type="button" onClick={() => void decide("edit")} data-testid="decision-apply-edit">Apply display wording</button>
                      </div>
                    </div>
                  ) : null}

                  {!decisionResult && phase !== "deciding" ? (
                    <div className="decision-actions" aria-label="Creator decision">
                      <button className="button quiet" type="button" onClick={() => void decide("reject")} data-testid="decision-reject">Reject</button>
                      <button className="button secondary" type="button" onClick={beginEdit} disabled={!editableRulePatch} data-testid="decision-edit">Edit wording</button>
                      <button className="button primary" type="button" onClick={() => void decide("accept")} data-testid="decision-accept">Accept into canon</button>
                    </div>
                  ) : null}

                  {phase === "rejected" ? (
                    <div className="unchanged-note">
                      <strong>Rejected safely.</strong>
                      <p>Overlay v{overlay.version}, turn {snapshot.turnIndex}, and state hash remain unchanged.</p>
                      <button className="button secondary" type="button" onClick={() => void loadDemo()} data-testid="reset-demo">Reset and rehearse again</button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <KnowledgeGraph graph={decisionGraph ?? runResult.graph} />
            </>
          ) : null}

          {timeline.length > 0 ? (
            <section className="timeline-panel panel" aria-labelledby="timeline-title">
              <div className="panel-heading">
                <div>
                  <p className="kicker">04 / BOUNDED STATE</p>
                  <h2 id="timeline-title">Two steps. One continuous hash chain.</h2>
                </div>
                <span className="status-chip neutral">MAX STEPS 2</span>
              </div>

              <ol className="timeline" data-testid="state-timeline">
                {timeline.map((entry, index) => (
                  <li key={`${entry.label}-${entry.snapshot.stateHash}`}>
                    <span className="timeline-index">{entry.label}</span>
                    <div>
                      <strong>{snapshotVariable(entry.snapshot)}</strong>
                      <p>{entry.note}</p>
                      <dl>
                        <div><dt>turn</dt><dd>{entry.snapshot.turnIndex}</dd></div>
                        <div><dt>overlay</dt><dd>v{entry.snapshot.overlayVersion}</dd></div>
                      </dl>
                      <code title={entry.snapshot.stateHash}>{entry.snapshot.stateHash}</code>
                    </div>
                    {index < timeline.length - 1 ? <i aria-hidden="true">→</i> : null}
                  </li>
                ))}
              </ol>

              {transitions.length > 0 ? (
                <p className={`chain-proof ${transitionChainIsContinuous ? "pass" : "block"}`}>
                  {transitionChainIsContinuous
                    ? `Hash chain continuous across ${transitions.length} transition${transitions.length > 1 ? "s" : ""}.`
                    : "Hash chain mismatch detected."}
                </p>
              ) : null}

              {phase === "rebased" ? (
                <div className="timeline-action">
                  <p>S0r has the approved overlay but keeps turn 0 and <strong>idle</strong>. Rebase is not a simulation step.</p>
                  <button className="button primary" type="button" onClick={() => void advance(1)} data-testid="advance-step-1">Run step 1 · organize watch</button>
                </div>
              ) : null}
              {phase === "step_one" ? (
                <div className="timeline-action">
                  <p>Step 2 must consume S1 exactly. It cannot skip directly from idle to signal seen.</p>
                  <button className="button primary" type="button" onClick={() => void advance(2)} data-testid="advance-step-2">Run step 2 · observe signal</button>
                </div>
              ) : null}
              {phase === "complete" ? (
                <div className="completion-note" data-testid="completion-summary">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>Scenario limit reached.</strong>
                    <p>The Table stops after two validated steps. No third-step action is available.</p>
                    <dl className="completion-metrics">
                      <div><dt>Mode</dt><dd>fixture only</dd></div>
                      <div><dt>Canon</dt><dd>overlay v{overlay.version}</dd></div>
                      <div><dt>State</dt><dd>idle → watching → signal_seen</dd></div>
                      <div>
                        <dt>Style</dt>
                        <dd>
                          {typeof maxWordsConstraint?.value === "number" && narrativeWordCount <= maxWordsConstraint.value ? 1 : 0} deterministic pass · {humanStyleConstraints.length} creator review
                        </dd>
                      </div>
                      <div><dt>Replay</dt><dd>{visibleReplayResults.filter(({ status }) => status === "pass").length}/{visibleReplayResults.length} controls pass</dd></div>
                    </dl>
                    <details className="review-packet" data-testid="production-review-packet">
                      <summary>Production review packet</summary>
                      <p>This collapsed packet organizes fixture evidence for human handoff; it is not production-readiness evidence.</p>
                      <div className="review-packet-grid">
                        <section>
                          <h3>Intent lineage</h3>
                          <ul>
                            {intents.map((intent) => (
                              <li key={intent.intentId}>
                                <strong>{intent.intentId}</strong>
                                <span>{intent.controlledEntityIds.join(", ")}</span>
                              </li>
                            ))}
                          </ul>
                        </section>
                        <section>
                          <h3>Evidence used</h3>
                          <ul>
                            {runResult?.evidence.claimIds.map((id) => <li key={id}>{id}</li>)}
                          </ul>
                          <small>{runResult?.evidence.characterViews.length ?? 0} character-scoped views</small>
                          <p>
                            Knowledge boundary · {bootstrap.knowledgeBoundary.filter(({ status }) => status === "withheld").length} withheld · {bootstrap.knowledgeBoundary.filter(({ status }) => status === "uncertain").length} uncertain
                          </p>
                          <p>
                            Conflict control · {bootstrap.proofs.conflict.status.replaceAll("_", " ")}
                          </p>
                        </section>
                        <section>
                          <h3>Creator canon delta</h3>
                          <p>{decisionResult?.status ?? "unreviewed"} · overlay v{overlay.version}</p>
                          <ul>
                            {proposal?.patches.map((patch) => (
                              <li key={patch.op === "add_rule" ? patch.rule.id : patch.claim.id}>
                                {patch.op} · {patch.op === "add_rule" ? patch.rule.id : patch.claim.id}
                              </li>
                            ))}
                          </ul>
                        </section>
                        <section>
                          <h3>State + replay</h3>
                          <p>{timeline.map(({ snapshot: item }) => snapshotVariable(item)).join(" → ")}</p>
                          <ul>
                            {visibleReplayResults.map((result) => (
                              <li key={result.id}>{result.id} · {result.status.toUpperCase()}</li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    </details>
                    <button className="button secondary" type="button" onClick={() => void loadDemo()} data-testid="replay-demo">
                      Replay demo
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="replay-panel panel" aria-labelledby="replay-title" data-testid="replay-panel">
            <div className="panel-heading">
              <div>
                <p className="kicker">
                  {overlayReplay ? "05 / APPROVED-OVERLAY REPLAY" : "05 / FROZEN BASELINE"}
                </p>
                <h2 id="replay-title">
                  {overlayReplay
                    ? overlayReplay.allPassed
                      ? "The approved overlay keeps its safety controls intact."
                      : "The approved overlay failed a safety control."
                    : "The baseline controls keep their expected outcomes."}
                </h2>
                <p className="trace-line" data-testid="replay-authority">
                  {overlayReplay
                    ? `fresh server replay · overlay v${overlayReplay.overlayVersion} · ${overlayReplay.overlayHash.slice(0, 12)}…`
                    : "server-executed baseline fixture suite"}
                </p>
              </div>
              <span className={`status-chip ${overlayReplay?.allPassed ? "pass" : "neutral"}`}>
                {overlayReplay ? (overlayReplay.allPassed ? "FRESH PASS" : "REGRESSION") : "SERVER EXECUTED"}
              </span>
            </div>
            <div className="replay-list">
              {visibleReplayResults.map((result, index) => (
                <article key={result.id}>
                  <span className="replay-index">{String(index + 1).padStart(2, "0")}</span>
                  <div><h3>{result.label}</h3><p>{result.detail}</p></div>
                  <span className={`status-chip ${statusTone(result.status)}`}>{statusCopy(result.status)}</span>
                </article>
              ))}
            </div>
          </section>

          <KnowledgeGraph
            graph={bootstrap.proofs.conflict.graph}
            kicker="FROZEN CONFLICT CONTROL"
            title="Two traditions remain two traditions."
            note="Helen comparison · creator decision required"
            testId="conflict-graph"
            accessibleTitle="Helen tradition conflict graph"
          />
        </div>
      </div>

      <footer className="workbench-footer shell">
        <p>Fixture demonstration · deterministic core evidence only</p>
        <p>Live GPT-5.6 runs are a separate controlled path and are not represented here.</p>
      </footer>
    </main>
  );
}

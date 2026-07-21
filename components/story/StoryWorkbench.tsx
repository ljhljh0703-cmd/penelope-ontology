"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { CausalEffect } from "@/src/contracts/campaign";
import styles from "@/components/story/StoryWorkbench.module.css";
import type {
  StoryApiError,
  StoryChangeView,
  StoryChoice,
  StoryModelTrace,
  StorySceneApi,
  StorySceneView,
  StorySession,
  StorySessionApi,
  StoryStyleProfileView,
  StoryTransportSelection,
  StartStorySessionApiRequest,
  StoryTurnApiRequest,
  StoryTurnApiResult,
} from "@/components/story/api-types";
import { STORY_LIVE_TOKEN_HEADER } from "@/components/story/api-types";

const apiRequest = async <T,>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    signal,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });

  let payload: T | StoryApiError;
  try {
    payload = (await response.json()) as T | StoryApiError;
  } catch {
    throw new Error(`${path} returned an unreadable response (${response.status}).`);
  }

  if (!response.ok) {
    const error = (payload as StoryApiError).error;
    const message =
      typeof error === "string"
        ? error
        : error && typeof error.message === "string"
          ? error.message
          : `Story request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
};

const humanizeId = (value: string): string =>
  value
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));

const effectToView = (effect: CausalEffect): StoryChangeView => {
  switch (effect.kind) {
    case "state_transition":
      return {
        id: effect.effectId,
        label: humanizeId(effect.variableId),
        value: `${humanizeId(effect.from)} → ${humanizeId(effect.to)}`,
        tone: "progress",
      };
    case "relation_delta":
      return {
        id: effect.effectId,
        label: humanizeId(effect.axisId),
        value: signed(effect.delta),
        tone: effect.delta > 0 ? "benefit" : "cost",
      };
    case "resource_delta":
      return {
        id: effect.effectId,
        label: humanizeId(effect.resourceId),
        value: signed(effect.delta),
        tone: effect.delta > 0 ? "benefit" : "cost",
      };
    case "knowledge_grant":
      return {
        id: effect.effectId,
        label: humanizeId(effect.claimId),
        value: "Learned",
        tone: "knowledge",
      };
    case "flag_set":
      return {
        id: effect.effectId,
        label: effect.flagId === "red_sail_seen" ? "Red sail sighted" : humanizeId(effect.flagId),
        value: effect.value ? "Recorded" : "Cleared",
        tone: effect.value ? "knowledge" : "progress",
      };
    case "clock_delta":
      return {
        id: effect.effectId,
        label: humanizeId(effect.clockId),
        value: signed(effect.delta),
        tone: effect.delta > 0 ? "cost" : "benefit",
      };
    case "debt_open":
      return {
        id: effect.effectId,
        label: humanizeId(effect.debtKindId),
        value: "Debt opened",
        tone: "debt",
      };
    case "debt_resolve":
      return {
        id: effect.effectId,
        label: "Causal debt",
        value: "Resolved",
        tone: "progress",
      };
  }
};

const isCompletedLiveTrace = (trace: StoryModelTrace | null): boolean => {
  if (
    !trace ||
    trace.mode === "fixture" ||
    !trace.outputSha256 ||
    !trace.requestedModel.startsWith("gpt-5.6") ||
    (trace.actualModel !== null && !trace.actualModel.startsWith("gpt-5.6"))
  ) {
    return false;
  }
  if (trace.mode === "responses_api") {
    return Boolean(trace.responseId && trace.actualModel?.startsWith("gpt-5.6"));
  }
  return Boolean(
    trace.processDiagnostics &&
      trace.processDiagnostics.exitCode === 0 &&
      !trace.processDiagnostics.timedOut,
  );
};

const provenanceCopy = (trace: StoryModelTrace | null): string => {
  if (!isCompletedLiveTrace(trace)) {
    return "Deterministic public-safe fixture. No live model call is implied.";
  }
  if (trace?.mode === "codex_cli") {
    return `Completed Codex CLI trace · requested ${trace.requestedModel}${
      trace.actualModel ? ` · actual ${trace.actualModel}` : " · actual model not independently reported"
    }`;
  }
  return `Completed Responses API trace · ${trace?.actualModel ?? trace?.requestedModel}`;
};

const proseParagraphs = (prose: string): string[] =>
  prose
    .trim()
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

const liveAuthHeaders = (
  transport: StoryTransportSelection,
  token: string,
): HeadersInit =>
  transport === "codex_cli" && token
    ? { [STORY_LIVE_TOKEN_HEADER]: token }
    : {};

const sceneToView = ({
  scene,
  authority,
  whatChanged,
  trace,
  inheritedAction,
  proposalAssessment,
  allowedClaimIds,
  source,
}: {
  scene: StorySceneApi;
  authority: StorySession;
  whatChanged: CausalEffect[];
  trace: StoryModelTrace | null;
  inheritedAction?: string;
  proposalAssessment?: StorySceneView["proposalAssessment"];
  allowedClaimIds?: string[];
  source: "opening" | "turn";
}): StorySceneView => ({
  id: scene.sceneId,
  number: scene.sceneNumber,
  title: scene.title,
  prose: scene.prose,
  focalCharacter: humanizeId(scene.contract.focalCharacterId),
  closingPressure: scene.contract.forwardPressure,
  echoedEffectIds: scene.echoedEffectIds,
  whatChanged: whatChanged.map(effectToView),
  ...(inheritedAction ? { inheritedChoice: inheritedAction } : {}),
  ...(proposalAssessment ? { proposalAssessment } : {}),
  causalSummary: scene.resolution.summary,
  claimRefs: Array.from(
    new Set([
      ...scene.resolution.evidenceClaimIds,
      ...(allowedClaimIds ?? []),
      ...scene.segments.flatMap(({ groundingClaimIds }) => groundingClaimIds),
    ]),
  ),
  effectRefs: Array.from(
    new Set([...scene.echoedEffectIds, ...whatChanged.map(({ effectId }) => effectId)]),
  ),
  openDebtRefs: Array.from(
    new Set([
      ...whatChanged.filter(({ kind }) => kind === "debt_open").map(({ effectId }) => effectId),
      ...authority.spine.mustPayOffObligations
        .filter(({ status }) => status === "open")
        .map(({ obligationId }) => obligationId),
    ]),
  ),
  characterDrives: authority.characterDrives,
  stateHash: authority.storyStateHash,
  trace,
  source,
});

type SceneCardProps = {
  scene: StorySceneView;
  styleProfile?: StoryStyleProfileView;
  isNewest: boolean;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
};

function SceneCard({ scene, styleProfile, isNewest, headingRef }: SceneCardProps) {
  return (
    <article
      className={`${styles.scene} ${isNewest ? styles.sceneNewest : ""}`}
      aria-labelledby={`scene-heading-${scene.number}`}
      data-testid={`story-scene-${scene.number}`}
    >
      <header className={styles.sceneHeader}>
        <div>
          <p className={styles.eyebrow}>
            Scene {scene.number} · {scene.focalCharacter}
          </p>
          <h2 id={`scene-heading-${scene.number}`} ref={headingRef} tabIndex={isNewest ? -1 : undefined}>
            {scene.title}
          </h2>
        </div>
        {scene.echoedEffectIds.length > 0 ? (
          <span className={styles.echoBadge} data-testid={`choice-echo-${scene.number}`}>
            Choice echo
          </span>
        ) : null}
      </header>

      <div className={styles.prose} data-testid={`scene-prose-${scene.number}`}>
        {proseParagraphs(scene.prose).map((paragraph, index) => (
          <p key={`${scene.id}-paragraph-${index}`}>{paragraph}</p>
        ))}
      </div>

      {scene.proposalAssessment ? (
        <aside
          className={styles.penelopeRuling}
          data-decision={scene.proposalAssessment.decision}
          data-testid={`penelope-ruling-${scene.number}`}
        >
          <div>
            <span>Penelope ruling</span>
            <strong>Prepared route recognized</strong>
          </div>
          <p>{scene.proposalAssessment.rationale}</p>
          <small>
            Risk · {humanizeId(scene.proposalAssessment.riskProfile.level)} ·{" "}
            {scene.proposalAssessment.riskProfile.summary}
          </small>
        </aside>
      ) : null}

      <p className={styles.pressure} data-testid={`scene-pressure-${scene.number}`}>
        <span>Forward pressure</span>
        {scene.closingPressure}
      </p>

      <section className={styles.changes} aria-labelledby={`changes-heading-${scene.number}`}>
        <div className={styles.sectionLabelRow}>
          <h3 id={`changes-heading-${scene.number}`}>What changed</h3>
          <span>{scene.whatChanged.length} registered consequences</span>
        </div>
        <ul className={styles.changeList} data-testid={`what-changed-${scene.number}`}>
          {scene.whatChanged.map((change) => (
            <li key={change.id} className={styles[change.tone]}>
              <span>{change.label}</span>
              {change.value ? <strong>{change.value}</strong> : null}
            </li>
          ))}
        </ul>
      </section>

      <details className={styles.why} data-testid={`why-followed-${scene.number}`}>
        <summary>
          <span>Why this followed</span>
          <span className={styles.summaryHint}>Causality, character drives, and provenance</span>
        </summary>
        <div className={styles.whyBody}>
          <div className={styles.causalExplanation}>
            <p className={styles.eyebrow}>Causal path</p>
            <p>{scene.causalSummary}</p>
            {scene.inheritedChoice ? (
              <p className={styles.inheritedChoice}>
                <strong>Inherited choice</strong>
                {scene.inheritedChoice}
              </p>
            ) : null}
          </div>

          <div className={styles.driveGrid}>
            {scene.characterDrives.map((drive) => (
              <div key={drive.characterId} className={styles.driveCard}>
                <strong>{humanizeId(drive.characterId)}</strong>
                <p>{drive.desire}</p>
                <small>{drive.relationshipPressure}</small>
              </div>
            ))}
          </div>

          <section className={styles.styleReceipt} aria-label="Active style receipt">
            <div>
              <p className={styles.eyebrow}>Active style</p>
              <strong>{styleProfile?.label ?? "Style profile unavailable"}</strong>
              <small>{styleProfile?.id ?? "The API did not return a display-safe style receipt."}</small>
            </div>
            {styleProfile ? (
              <ul>
                {styleProfile.constraints.map((constraint) => (
                  <li key={constraint.id}>
                    <span>{constraint.label}</span>
                    <strong>{constraint.value}</strong>
                    <small>{constraint.checkMode === "deterministic" ? "machine check" : "creator review"}</small>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <dl className={styles.receiptGrid}>
            <div>
              <dt>Claims</dt>
              <dd>{scene.claimRefs.length > 0 ? scene.claimRefs.join(" · ") : "Narrator-safe scope"}</dd>
            </div>
            <div>
              <dt>Effects</dt>
              <dd>{scene.effectRefs.length > 0 ? scene.effectRefs.join(" · ") : "None registered"}</dd>
            </div>
            <div>
              <dt>Open debts</dt>
              <dd>{scene.openDebtRefs.length > 0 ? scene.openDebtRefs.join(" · ") : "None"}</dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>{provenanceCopy(scene.trace)}</dd>
            </div>
          </dl>
        </div>
      </details>
    </article>
  );
}

type ChoicePanelProps = {
  sceneNumber: number;
  choices: StoryChoice[];
  selectedChoiceId: string | null;
  busy: boolean;
  onSelectChoice: (choice: StoryChoice) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function ChoicePanel({
  sceneNumber,
  choices,
  selectedChoiceId,
  busy,
  onSelectChoice,
  onSubmit,
}: ChoicePanelProps) {
  const destination = sceneNumber === 1 ? "the consequence" : "the ending";

  return (
    <section className={styles.choicePanel} aria-labelledby="your-move-heading">
      <div className={styles.choiceHeading}>
        <div>
          <p className={styles.eyebrow}>Your move</p>
          <h2 id="your-move-heading">What happens next?</h2>
        </div>
        <p>Your action changes the causal story state. Penelope carries its benefit and cost forward.</p>
      </div>

      <section className={styles.candidateDrawer} data-testid="candidate-choices" aria-labelledby="guided-routes-heading">
        <div className={styles.candidateHeader}>
          <div>
            <p className={styles.eyebrow}>Guided routes</p>
            <h3 id="guided-routes-heading">Choose a prepared direction</h3>
          </div>
          <span>The scenario orders these by recommendation priority.</span>
        </div>
        <div className={styles.choiceGrid}>
          {choices.map((choice, index) => {
            const route = index === 0
              ? { letter: "A", role: "Recommended", action: "Use the recommended route" }
              : { letter: "B", role: "Second route", action: "Use the alternative route" };
            return (
              <button
                key={choice.choiceId}
                type="button"
                className={selectedChoiceId === choice.choiceId ? styles.choiceSelected : styles.choiceCard}
                aria-pressed={selectedChoiceId === choice.choiceId}
                onClick={() => onSelectChoice(choice)}
                disabled={busy}
                data-testid={`candidate-${choice.choiceId}`}
              >
                <span className={styles.choiceRank}>{route.letter} · {route.role}</span>
                <strong>{choice.label}</strong>
                <p>{choice.intent}</p>
                {choice.routeRationale ? (
                  <p className={styles.choiceRationale}>{choice.routeRationale}</p>
                ) : null}
                {choice.riskProfile ? (
                  <div className={styles.choiceRisk} data-risk-level={choice.riskProfile.level}>
                    <span>Risk · {humanizeId(choice.riskProfile.level)}</span>
                    <p>{choice.riskProfile.summary}</p>
                    {choice.riskProfile.possibleCosts.length > 0 ? (
                      <small>Possible cost: {choice.riskProfile.possibleCosts.join(" · ")}</small>
                    ) : null}
                  </div>
                ) : null}
                <small>{route.action} →</small>
              </button>
            );
          })}
        </div>
      </section>

      <aside className={styles.creatorHandoff} aria-labelledby="creator-handoff-heading">
        <p className={styles.eyebrow}>C · Creator direction</p>
        <h3 id="creator-handoff-heading">Develop a new move in the creator interview</h3>
        <p>
          Use the World Workbench when the direction needs intent, motive, or a new world fact.
          It asks before changing the world; this rehearsal only executes prepared routes.
        </p>
        <Link href="/world" className={styles.creatorHandoffLink} data-testid="open-world-creator-interview">
          Open creator interview <span aria-hidden="true">→</span>
        </Link>
      </aside>

      <form onSubmit={onSubmit} className={styles.actionForm}>
        <div className={styles.formFooter}>
          <span>
            {selectedChoiceId
              ? "Prepared route selected"
              : "Select A or B to continue this rehearsal"}
          </span>
          <button type="submit" disabled={busy || !selectedChoiceId} data-testid="continue-story">
            {busy ? "Carrying the consequence…" : `Continue to ${destination}`}
          </button>
        </div>
      </form>
    </section>
  );
}

export function StoryWorkbench() {
  const [bootstrap, setBootstrap] = useState<StorySessionApi | null>(null);
  const [authority, setAuthority] = useState<StorySession | null>(null);
  const [scenes, setScenes] = useState<StorySceneView[]>([]);
  const [trace, setTrace] = useState<StoryModelTrace | null>(null);
  const [choices, setChoices] = useState<StoryChoice[]>([]);
  const [action, setAction] = useState("");
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [residualHook, setResidualHook] = useState<string | null>(null);
  const [transportSelection, setTransportSelection] = useState<StoryTransportSelection>("fixture");
  const [activeTransport, setActiveTransport] = useState<StoryTransportSelection>("fixture");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedTurnRequest, setFailedTurnRequest] = useState<StoryTurnApiRequest | null>(null);
  const [liveLocalAvailable, setLiveLocalAvailable] = useState(false);
  const [liveTokenReady, setLiveTokenReady] = useState(false);
  const liveTokenRef = useRef("");
  const newestHeadingRef = useRef<HTMLHeadingElement>(null);

  const startSession = useCallback(async (transport: StoryTransportSelection, signal?: AbortSignal) => {
    setBusy(true);
    setError(null);
    try {
      const request: StartStorySessionApiRequest = { transport };
      const result = await apiRequest<StorySessionApi>(
        "/api/story/session",
        {
          method: "POST",
          headers: liveAuthHeaders(transport, liveTokenRef.current),
          body: JSON.stringify(request),
        },
        signal,
      );
      if (result.opening.sceneNumber !== 1 || result.session.scenes.length !== 1) {
        throw new Error("The story session did not return its formal opening scene.");
      }
      if (result.transport && result.transport !== transport) {
        throw new Error(`Requested ${transport}, but the server returned ${result.transport}. No fallback was accepted.`);
      }
      if (transport === "codex_cli" && result.transport !== "codex_cli") {
        throw new Error("Live Codex was not explicitly acknowledged. No fixture fallback was accepted.");
      }
      setBootstrap(result);
      setAuthority(result.session);
      setActiveTransport(transport);
      setScenes([
        sceneToView({
          scene: result.opening,
          authority: result.session,
          whatChanged: result.opening.resolution.effects,
          trace: result.openingTrace ?? null,
          source: "opening",
        }),
      ]);
      setTrace(result.openingTrace ?? null);
      setChoices(result.choices);
      setAction("");
      setSelectedChoiceId(null);
      setIsComplete(false);
      setResidualHook(null);
      setFailedTurnRequest(null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const detail = caught instanceof Error ? caught.message : "Unable to open the story.";
      setError(
        transport === "codex_cli"
          ? `Live Codex did not start: ${detail} No fixture fallback was used.`
          : detail,
      );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (scenes.length > 1) newestHeadingRef.current?.focus();
  }, [scenes.length]);

  useEffect(() => {
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    const available = localHosts.has(window.location.hostname);
    void Promise.resolve().then(() => setLiveLocalAvailable(available));
  }, []);

  const completedLive = isCompletedLiveTrace(trace);
  const currentScene = scenes.at(-1) ?? null;
  const sceneProgress = bootstrap
    ? Array.from({ length: bootstrap.scenario.maximumSceneCount }, (_, index) => index + 1)
    : [];

  const pageClaim = completedLive
    ? `Built with Codex. Written live through the gated route · requested ${trace?.requestedModel}; actual model identity unreported. Remembered by Penelope.`
    : activeTransport === "codex_cli"
      ? "Live Codex selected. No completed prose trace yet. No fixture fallback."
      : "Built with Codex. Rehearsed as a public-safe fixture. Remembered by Penelope.";

  const selectChoice = (choice: StoryChoice) => {
    setSelectedChoiceId(choice.choiceId);
    setAction(choice.intent);
  };

  const submitTurn = async (request: StoryTurnApiRequest) => {
    setBusy(true);
    setError(null);

    try {
      const result = await apiRequest<StoryTurnApiResult>("/api/story/turn", {
        method: "POST",
        headers: liveAuthHeaders(request.transport, liveTokenRef.current),
        body: JSON.stringify(request),
      });
      if (result.session.sessionId !== request.authority.sessionId) {
        throw new Error("The returned scene belongs to a different story session.");
      }
      const nextView = sceneToView({
        scene: result.scene,
        authority: result.session,
        whatChanged: result.whatChanged,
        trace: result.trace,
        inheritedAction: request.action,
        proposalAssessment:
          result.session.choiceHistory?.at(-1)?.proposalAssessment,
        allowedClaimIds: result.scopeReceipt.allowedClaimIds,
        source: "turn",
      });
      setScenes((current) => [...current, nextView]);
      setAuthority(result.session);
      setActiveTransport(request.transport);
      setTrace(result.trace);
      setChoices(result.scene.suggestedContinuations);
      setAction("");
      setSelectedChoiceId(null);
      setIsComplete(result.status === "completed");
      setResidualHook(result.scene.residualHook);
      setFailedTurnRequest(null);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "The next scene could not be written.";
      setError(
        request.transport === "codex_cli"
          ? `Live Codex turn failed: ${detail} No fixture fallback was used.`
          : detail,
      );
      setFailedTurnRequest(request);
    } finally {
      setBusy(false);
    }
  };

  const continueStory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authority || isComplete || !selectedChoiceId || action.trim().length < 3) return;

    const request: StoryTurnApiRequest = {
      authority,
      transport: activeTransport,
      action: action.trim(),
      ...(selectedChoiceId ? { choiceId: selectedChoiceId } : {}),
    };
    void submitTurn(request);
  };

  if (!bootstrap || !authority) {
    return (
      <main id="main-content" className={styles.loading} aria-busy={busy}>
        <p className={styles.eyebrow}>Penelope Ontology</p>
        <h1>{busy ? "Setting the red sail against the night…" : "Choose how the story is written."}</h1>
        <p>
          One island, one night, and three scenes. Start with a reliable rehearsal or opt into a
          local Codex generation with no silent fallback.
        </p>
        <fieldset className={styles.transportSelector} disabled={busy}>
          <legend>Story transport</legend>
          <label className={transportSelection === "fixture" ? styles.transportSelected : ""}>
            <input
              type="radio"
              name="story-transport"
              value="fixture"
              checked={transportSelection === "fixture"}
              onChange={() => setTransportSelection("fixture")}
            />
            <span>
              <strong>Rehearsal</strong>
              <small>Deterministic, public-safe, and always available.</small>
            </span>
          </label>
          <label
            className={`${transportSelection === "codex_cli" ? styles.transportSelected : ""} ${
              liveLocalAvailable ? "" : styles.transportUnavailable
            }`}
          >
            <input
              type="radio"
              name="story-transport"
              value="codex_cli"
              checked={transportSelection === "codex_cli"}
              onChange={() => setTransportSelection("codex_cli")}
              data-testid="transport-codex-cli"
              disabled={!liveLocalAvailable}
            />
            <span>
              <strong>Live Codex</strong>
              <small>
                {liveLocalAvailable
                  ? "Requires a local, authenticated Codex CLI. Failed runs never fall back silently."
                  : "Local demo/video only"}
              </small>
            </span>
          </label>
        </fieldset>
        {liveLocalAvailable && transportSelection === "codex_cli" ? (
          <div className={styles.liveToken}>
            <label htmlFor="story-live-token">Local authorization token</label>
            <input
              id="story-live-token"
              data-testid="story-live-token"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={512}
              onChange={(event) => {
                const token = event.currentTarget.value;
                liveTokenRef.current = token;
                setLiveTokenReady(token.length >= 32 && !/\s/u.test(token));
              }}
              aria-describedby="story-live-token-help"
            />
            <small id="story-live-token-help">
              Kept only in this tab memory and sent as a request header. It never enters story JSON or receipts.
            </small>
          </div>
        ) : null}
        {error ? <p className={styles.startError} role="alert" data-testid="start-error">{error}</p> : null}
        <button
          type="button"
          onClick={() => void startSession(transportSelection)}
          disabled={busy || (transportSelection === "codex_cli" && !liveTokenReady)}
          data-testid="start-story"
        >
          {busy
            ? transportSelection === "codex_cli"
              ? "Requesting Live Codex…"
              : "Opening rehearsal…"
            : "Begin the trilogy"}
        </button>
      </main>
    );
  }

  return (
    <main id="main-content" className={styles.page} aria-busy={busy}>
      <header className={styles.hero}>
        <nav className={styles.topbar} aria-label="Story workbench context">
          <Link href="/" className={styles.brand} aria-label="Penelope Ontology home">
            <span>P</span>
            Penelope Ontology
          </Link>
          <div className={styles.modeGroup}>
            <Link href="/table" className={styles.evidenceLink}>
              Harness evidence
            </Link>
            <span className={styles.modeBadge} data-testid="story-mode">
              {completedLive
                ? "LIVE"
                : activeTransport === "codex_cli"
                  ? "CODEX LANE · NO TRACE"
                  : "FIXTURE STORY"}
            </span>
            <span>Scene {Math.min(scenes.length, bootstrap.scenario.maximumSceneCount)} of {bootstrap.scenario.maximumSceneCount}</span>
          </div>
        </nav>

        <div className={styles.heroGrid}>
          <div>
            <p className={styles.eyebrow}>A causal story rehearsal</p>
            <h1>{bootstrap.scenario.title}</h1>
          </div>
          <div className={styles.heroQuestion}>
            <p>{bootstrap.scenario.dramaticQuestion}</p>
            <ol aria-label="Story progress">
              {sceneProgress.map((sceneNumber) => (
                <li
                  key={sceneNumber}
                  className={sceneNumber <= scenes.length ? styles.progressActive : ""}
                  aria-label={`Scene ${sceneNumber}${sceneNumber <= scenes.length ? " reached" : " upcoming"}`}
                >
                  {sceneNumber}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <p className={styles.productClaim} data-testid="story-product-claim">
          {pageClaim}
        </p>
      </header>

      <div className={styles.storyColumn}>
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            styleProfile={bootstrap.styleProfile}
            isNewest={scene.id === currentScene?.id}
            headingRef={scene.id === currentScene?.id ? newestHeadingRef : undefined}
          />
        ))}

        {error ? (
          <div className={styles.error} role="alert" data-testid="story-error">
            <strong>The story did not advance.</strong>
            <p>{error}</p>
            <p>Your action is still here. No scene or consequence was registered, so you can try again.</p>
            {failedTurnRequest?.transport === "codex_cli" ? (
              <div className={styles.recoveryActions}>
                <button
                  type="button"
                  onClick={() => void submitTurn(failedTurnRequest)}
                  disabled={busy}
                  data-testid="retry-live-turn"
                >
                  Retry Live Codex
                </button>
                <button
                  type="button"
                  onClick={() => void submitTurn({ ...failedTurnRequest, transport: "fixture" })}
                  disabled={busy}
                  data-testid="continue-fixture-turn"
                >
                  Continue with verified rehearsal
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isComplete && currentScene ? (
          <ChoicePanel
            key={currentScene.id}
            sceneNumber={currentScene.number}
            choices={choices}
            selectedChoiceId={selectedChoiceId}
            busy={busy}
            onSelectChoice={selectChoice}
            onSubmit={continueStory}
          />
        ) : null}

        {isComplete ? (
          <section className={styles.ending} data-testid="story-ending" aria-labelledby="ending-heading">
            <p className={styles.eyebrow}>Small arc complete</p>
            <h2 id="ending-heading">The signal is answered without becoming proof.</h2>
            <p>{authority.spine.targetEnding}</p>
            {residualHook ? (
              <p className={styles.residualHook}>
                <span>One thread remains</span>
                {residualHook}
              </p>
            ) : null}
            <button type="button" onClick={() => void startSession(activeTransport)} disabled={busy}>
              Rehearse another choice
            </button>
          </section>
        ) : null}
      </div>

      <p className={styles.liveRegion} aria-live="polite" aria-atomic="true">
        {busy
          ? "Penelope is carrying the action into the next scene."
          : isComplete
            ? "The three-scene story arc is complete."
            : `Scene ${scenes.length} is ready.`}
      </p>
    </main>
  );
}

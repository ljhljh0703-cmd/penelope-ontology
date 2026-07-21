"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/components/world/FateFrame.module.css";
import type { WorldSessionView } from "@/components/world/api-types";
import type {
  VisualMomentCandidate,
  VisualMomentDecision,
  VisualMomentTrigger,
} from "@/src/contracts/visual-moment";
import { applyVisualMomentDecision } from "@/src/domain/visual-moment";

const FATE_PALETTE = ["#0b1114", "#34484d", "#b55f3d", "#d8bf8d"] as const;

type FrameState =
  | { status: "generating"; variant: number }
  | { status: "candidate"; variant: number; candidate: VisualMomentCandidate }
  | {
      status: "approved" | "reference_only" | "rejected";
      variant: number;
      candidate: VisualMomentCandidate;
      decision: VisualMomentDecision;
    }
  | { status: "failed"; variant: number; message: string };

const colorRuns = (glyphRow: string, colorRow: string) => {
  const runs: Array<{ colorIndex: number; text: string }> = [];
  for (let index = 0; index < glyphRow.length; index += 1) {
    const colorIndex = Number(colorRow[index]);
    const glyph = glyphRow[index] ?? " ";
    const previous = runs.at(-1);
    if (previous?.colorIndex === colorIndex) previous.text += glyph;
    else runs.push({ colorIndex, text: glyph });
  }
  return runs;
};

const triggerLabel = (trigger: VisualMomentTrigger): string =>
  ({
    irreversible_choice: "Irreversible choice",
    ending_divergence: "Ending divergence",
    secret_reveal: "Secret revealed",
    dramatic_clock_threshold: "Dramatic clock threshold",
    scene_climax: "Scene climax",
  })[trigger];

export function FateFrame({
  view,
  trigger,
}: {
  view: WorldSessionView;
  trigger: VisualMomentTrigger | null;
}) {
  const [frames, setFrames] = useState<Record<string, FrameState>>({});
  const state = frames[view.sessionId] ?? null;

  const visibleEvents = useMemo(
    () =>
      view.visibleEvents.length > 0
        ? view.visibleEvents
        : [
            {
              eventId: `event.visible_ending_${view.sessionId.replace(/-/gu, "")}`,
              source: "world" as const,
              summary:
                view.ending?.summary ??
                "The visible branch reaches a creator-observable turning point.",
            },
          ],
    [view.ending?.summary, view.sessionId, view.visibleEvents],
  );
  const visibleFacts = useMemo(
    () =>
      view.visibleFacts.length > 0
        ? view.visibleFacts
        : [
            {
              id: `fact.visible_scene_${view.sessionId.replace(/-/gu, "")}`,
              summary: view.participantSummary,
            },
          ],
    [view.participantSummary, view.sessionId, view.visibleFacts],
  );

  const generate = useCallback(
    async (variant: number) => {
      if (trigger === null) return;
      const activeTrigger = trigger;
      setFrames((current) => ({
        ...current,
        [view.sessionId]: { status: "generating", variant },
      }));
      try {
        const response = await fetch("/api/world/visual", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            format: "penelope_visual_moment_request",
            schemaVersion: 1,
            momentId: `visual.${view.scenarioId}.${view.sessionId.replace(/-/gu, "")}`,
            checkpointId: view.sessionId,
            scenarioId: view.scenarioId,
            trigger: activeTrigger,
            sceneTitle: view.title,
            visibleFacts,
            visibleEvents,
            palette: FATE_PALETTE,
            variant,
          }),
        });
        const payload = (await response.json()) as
          | VisualMomentCandidate
          | { error?: { message?: string } };
        if (!response.ok || !("candidateId" in payload)) {
          throw new Error(
            "error" in payload
              ? payload.error?.message ?? "This Fate Frame could not be generated."
              : "This Fate Frame could not be generated.",
          );
        }
        setFrames((current) => ({
          ...current,
          [view.sessionId]: { status: "candidate", variant, candidate: payload },
        }));
      } catch (caught) {
        setFrames((current) => ({
          ...current,
          [view.sessionId]: {
            status: "failed",
            variant,
            message:
              caught instanceof Error
                ? caught.message
                : "The story continued without a Fate Frame.",
          },
        }));
      }
    },
    [trigger, view.scenarioId, view.sessionId, view.title, visibleEvents, visibleFacts],
  );

  useEffect(() => {
    if (trigger === null || frames[view.sessionId]) return;
    void generate(0);
  }, [frames, generate, trigger, view.sessionId]);

  const decide = (action: "approve" | "reference_only" | "reject") => {
    if (state?.status !== "candidate") return;
    const decision = applyVisualMomentDecision({ candidate: state.candidate, action });
    setFrames((current) => ({
      ...current,
      [view.sessionId]: {
        status: decision.status,
        variant: state.variant,
        candidate: state.candidate,
        decision,
      },
    }));
  };

  const candidate =
    state && "candidate" in state ? state.candidate : null;

  if (trigger === null) return null;

  return (
    <section className={styles.frame} aria-labelledby={`fate-frame-${view.sessionId}`} data-testid="fate-frame">
      <header>
        <div>
          <p>Fate Frame · {triggerLabel(trigger)}</p>
          <h2 id={`fate-frame-${view.sessionId}`}>The world remembers this turn.</h2>
        </div>
        <span data-status={state?.status ?? "generating"} data-testid="fate-frame-status">
          {state?.status === "approved"
            ? "Approved asset"
            : state?.status === "reference_only"
              ? "Reference only"
              : state?.status === "rejected"
                ? "Rejected"
                : state?.status === "failed"
                  ? "Non-blocking failure"
                  : state?.status === "candidate"
                    ? "Candidate"
                    : "Generating"}
        </span>
      </header>

      {state?.status === "generating" || state === null ? (
        <div className={styles.loading} aria-live="polite">
          <span aria-hidden="true" />
          <p>Building a limited-color frame from participant-visible facts only.</p>
        </div>
      ) : null}

      {candidate ? (
        <div
          className={styles.ascii}
          role="img"
          aria-label={candidate.frame.altText}
          data-testid="fate-frame-ascii"
        >
          <div aria-hidden="true">
            {candidate.frame.glyphRows.map((glyphRow, rowIndex) => (
              <div key={`${candidate.candidateId}-${rowIndex}`}>
                {colorRuns(glyphRow, candidate.frame.colorRows[rowIndex]!).map(
                  (run, runIndex) => (
                    <span
                      key={`${rowIndex}-${runIndex}`}
                      style={{ color: candidate.frame.palette[run.colorIndex] }}
                    >
                      {run.text}
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {state?.status === "candidate" ? (
        <div className={styles.review}>
          <p>
            Candidate only. It cannot change canon or bind to this checkpoint until you approve it.
          </p>
          <div>
            <button type="button" onClick={() => decide("approve")} data-testid="fate-frame-approve">
              Approve asset
            </button>
            <button type="button" onClick={() => void generate(state.variant + 1)} data-testid="fate-frame-regenerate">
              Regenerate
            </button>
            <button type="button" onClick={() => decide("reference_only")}>
              Keep as reference
            </button>
            <button type="button" onClick={() => decide("reject")}>
              Reject
            </button>
          </div>
        </div>
      ) : null}

      {state?.status === "approved" ? (
        <p className={styles.decision} data-testid="fate-frame-bound">
          Bound to checkpoint {view.turn}. The approved render hash will be eligible for Phase C export.
        </p>
      ) : null}
      {state?.status === "reference_only" ? (
        <div className={styles.decision}>
          <p>Kept beside the work, but not bound to canon or the checkpoint.</p>
          <button type="button" onClick={() => void generate(state.variant + 1)}>Generate another</button>
        </div>
      ) : null}
      {state?.status === "rejected" ? (
        <div className={styles.decision}>
          <p>No visual asset was bound. The resolved story remains unchanged.</p>
          <button type="button" onClick={() => void generate(state.variant + 1)}>Try a new candidate</button>
        </div>
      ) : null}
      {state?.status === "failed" ? (
        <div className={styles.decision} role="status">
          <p>{state.message} The story and checkpoint remain available.</p>
          <button type="button" onClick={() => void generate(state.variant + 1)}>Try again</button>
        </div>
      ) : null}

      <footer>
        <span>Fixture provider · Bayer 4×4 · {FATE_PALETTE.length} colors</span>
        <span>No hidden creator state sent</span>
      </footer>
    </section>
  );
}

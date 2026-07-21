"use client";

import styles from "@/components/world/CausalTransition.module.css";

export type CausalTransitionState = Readonly<{
  phase: "resolving" | "receipt" | "review" | "resolved" | "failed";
  choice: string;
  consequences: ReadonlyArray<string>;
}>;

const phaseCopy: Record<CausalTransitionState["phase"], string> = {
  resolving: "Tracing the choice through declared rules…",
  receipt: "The world has answered. Verifying what actually changed…",
  review: "Creator review is required before this world line can advance.",
  resolved: "The next checkpoint now inherits these consequences.",
  failed: "The choice did not enter the world. The previous checkpoint is intact.",
};

const phaseTitle: Record<CausalTransitionState["phase"], string> = {
  resolving: "Your choice is being tested against the world.",
  receipt: "The world has answered.",
  review: "A possible world line awaits your approval.",
  resolved: "Your choice has entered the world.",
  failed: "The world refused this choice.",
};

export function CausalTransition({
  state,
  onDismiss,
}: {
  state: CausalTransitionState | null;
  onDismiss: () => void;
}) {
  if (!state) return null;
  const dismissible = ["review", "resolved", "failed"].includes(state.phase);

  return (
    <aside
      className={styles.loom}
      data-phase={state.phase}
      data-testid="world-loom"
      aria-labelledby="world-loom-title"
    >
      <div className={styles.heading}>
        <div>
          <p>The Loom</p>
          <span>{state.phase === "resolved" ? "Receipt sealed" : "World in motion"}</span>
        </div>
        {dismissible ? (
          <button type="button" onClick={onDismiss} aria-label="Dismiss The Loom">
            Close
          </button>
        ) : null}
      </div>
      <h2 id="world-loom-title">{phaseTitle[state.phase]}</h2>
      <blockquote>“{state.choice}”</blockquote>
      <div className={styles.thread} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className={styles.status} aria-live="polite" aria-atomic="true">
        {phaseCopy[state.phase]}
      </p>
      {state.consequences.length > 0 ? (
        <ul>
          {state.consequences.map((consequence) => (
            <li key={consequence}>{consequence}</li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}

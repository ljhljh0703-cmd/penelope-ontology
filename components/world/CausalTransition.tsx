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

export function CausalTransition({ state }: { state: CausalTransitionState | null }) {
  if (!state) return null;

  return (
    <aside
      className={styles.loom}
      data-phase={state.phase}
      data-testid="world-loom"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={styles.heading}>
        <p>The Loom</p>
        <span>{state.phase === "resolved" ? "Receipt sealed" : "World in motion"}</span>
      </div>
      <h2>Your choice has entered the world.</h2>
      <blockquote>“{state.choice}”</blockquote>
      <div className={styles.thread} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className={styles.status}>{phaseCopy[state.phase]}</p>
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

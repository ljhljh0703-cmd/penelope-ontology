"use client";

import { useMemo, useState } from "react";
import styles from "@/components/world/WorldCodex.module.css";
import {
  buildWorldCodexProjection,
  type WorldCodexCheckpoint,
} from "@/components/world/world-codex";

type CodexTab = "overview" | "cast" | "relations" | "plot" | "branches";

const tabs: ReadonlyArray<{ id: CodexTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "cast", label: "Cast" },
  { id: "relations", label: "Relations" },
  { id: "plot", label: "Plot" },
  { id: "branches", label: "Branches" },
];

const readableId = (value: string): string =>
  value
    .replace(/^(entity|zone|branch|ending|clock)\./u, "")
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

export function WorldCodex({
  active,
  parent,
  checkpoints,
  onSelectCheckpoint,
}: {
  active: WorldCodexCheckpoint | null;
  parent: WorldCodexCheckpoint | null;
  checkpoints: ReadonlyArray<WorldCodexCheckpoint>;
  onSelectCheckpoint: (checkpointId: string) => void;
}) {
  const [tab, setTab] = useState<CodexTab>("overview");
  const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const projection = useMemo(
    () =>
      active
        ? buildWorldCodexProjection({ active, parent, checkpoints })
        : null,
    [active, checkpoints, parent],
  );

  if (!active || !projection) {
    return (
      <section className={styles.locked} data-testid="world-codex-locked">
        <p>Creator projection</p>
        <h2>World Codex is waiting for creator access.</h2>
        <span>
          The participant scene remains available. Private motives, relationships,
          and branch receipts appear here only after the separate creator projection loads.
        </span>
      </section>
    );
  }

  const selectedActor =
    projection.cast.find(({ entityId }) => entityId === selectedActorId) ??
    projection.cast[0] ??
    null;
  const selectedRelationship =
    projection.relationships.find(({ id }) => id === selectedRelationshipId) ??
    projection.relationships[0] ??
    null;

  return (
    <section className={styles.codex} data-testid="world-codex">
      <header className={styles.header}>
        <div>
          <p>Creator observatory · receipt-derived</p>
          <h2>World Codex</h2>
        </div>
        <span>{projection.overview.checkpointLabel}</span>
      </header>

      <nav className={styles.tabs} aria-label="World Codex sections">
        {tabs.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-current={tab === candidate.id ? "page" : undefined}
            onClick={() => setTab(candidate.id)}
            data-testid={`world-codex-tab-${candidate.id}`}
          >
            {candidate.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className={styles.overview} data-testid="world-codex-overview">
          <article className={styles.questionCard}>
            <p>Dramatic question</p>
            <h3>
              {projection.overview.dramaticQuestion ??
                "This pack has not declared a dramatic question yet."}
            </h3>
            <span>{projection.overview.scenarioSummary}</span>
          </article>
          <div className={styles.metricGrid}>
            <article>
              <strong>{active.view.turn}</strong>
              <span>Turns resolved</span>
            </article>
            <article>
              <strong>{projection.overview.activeClockCount}</strong>
              <span>Active pressures</span>
            </article>
            <article>
              <strong>{projection.overview.latentRiskCount}</strong>
              <span>Latent risks</span>
            </article>
            <article>
              <strong>{projection.branches.length}</strong>
              <span>Recorded world lines</span>
            </article>
          </div>
          <section className={styles.changeLedger}>
            <div>
              <p>Since the parent checkpoint</p>
              <h3>What the world remembers</h3>
            </div>
            <ul>
              {projection.cast.flatMap((actor) =>
                actor.changes.map((change) => (
                  <li key={`${actor.entityId}-${change}`}>
                    <strong>{actor.name}</strong>
                    <span>{change}</span>
                  </li>
                )),
              )}
              {projection.cast.every(({ changes }) => changes.length === 0) ? (
                <li>
                  <strong>Opening state</strong>
                  <span>No receipt-backed character change exists yet.</span>
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "cast" ? (
        <div className={styles.cast} data-testid="world-codex-cast">
          <div className={styles.castRail} aria-label="Characters">
            {projection.cast.map((actor) => (
              <button
                key={actor.entityId}
                type="button"
                aria-pressed={selectedActor?.entityId === actor.entityId}
                onClick={() => setSelectedActorId(actor.entityId)}
              >
                <span>{actor.role === "participant" ? "Focal" : "NPC"}</span>
                <strong>{actor.name}</strong>
                <small>{readableId(actor.location)}</small>
              </button>
            ))}
          </div>
          {selectedActor ? (
            <article className={styles.castDetail}>
              <header>
                <div>
                  <p>{selectedActor.role}</p>
                  <h3>{selectedActor.name}</h3>
                </div>
                <span data-state={selectedActor.agendaState}>
                  {selectedActor.agendaState}
                </span>
              </header>
              <dl>
                <div>
                  <dt>Wants</dt>
                  <dd>{selectedActor.desire}</dd>
                </div>
                <div>
                  <dt>Avoids</dt>
                  <dd>{selectedActor.avoids}</dd>
                </div>
                <div>
                  <dt>Current position</dt>
                  <dd>{readableId(selectedActor.location)}</dd>
                </div>
                <div>
                  <dt>Private premises held</dt>
                  <dd>{selectedActor.knownPremiseCount}</dd>
                </div>
              </dl>
              <section>
                <p>Change since parent</p>
                {selectedActor.changes.length > 0 ? (
                  <ul>
                    {selectedActor.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                ) : (
                  <span>No receipt-backed change at this checkpoint.</span>
                )}
              </section>
            </article>
          ) : null}
        </div>
      ) : null}

      {tab === "relations" ? (
        <div className={styles.relations} data-testid="world-codex-relations">
          {projection.relationships.length > 0 ? (
            <>
              <div className={styles.relationMap} aria-label="Declared relationship map">
                {projection.relationships.map((relationship) => (
                  <button
                    key={relationship.id}
                    type="button"
                    aria-pressed={selectedRelationship?.id === relationship.id}
                    onClick={() => setSelectedRelationshipId(relationship.id)}
                  >
                    <strong>{relationship.subjectName}</strong>
                    <span>
                      <i aria-hidden="true" />
                      <em>{relationship.label}</em>
                      <b aria-hidden="true">
                        {relationship.direction === "mutual" ? "↔" : "→"}
                      </b>
                    </span>
                    <strong>{relationship.objectName}</strong>
                  </button>
                ))}
              </div>
              {selectedRelationship ? (
                <article className={styles.relationDetail}>
                  <p>Declared authority</p>
                  <h3>
                    {selectedRelationship.subjectName} {selectedRelationship.label}{" "}
                    {selectedRelationship.objectName}
                  </h3>
                  <span>{selectedRelationship.summary}</span>
                  <dl>
                    <div>
                      <dt>Direction</dt>
                      <dd>{selectedRelationship.direction}</dd>
                    </div>
                    <div>
                      <dt>Provenance</dt>
                      <dd>{readableId(selectedRelationship.provenance)}</dd>
                    </div>
                    <div>
                      <dt>Axis</dt>
                      <dd>{readableId(selectedRelationship.axisId)}</dd>
                    </div>
                  </dl>
                  <small>
                    This edge comes from the sealed World Pack. Penelope does not infer it from prose.
                  </small>
                </article>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>
              <h3>No relationship edges were declared.</h3>
              <p>
                The cast and causal state still work. Add explicit relationships to the
                World Pack before this map makes a claim.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {tab === "plot" ? (
        <div className={styles.plot} data-testid="world-codex-plot">
          <section>
            <p>Current causal beat</p>
            <h3>Events recorded at this checkpoint</h3>
            <ol>
              {projection.plot.currentEvents.map((event, index) => (
                <li key={`${index}-${event}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{event}</strong>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <p>Pressure</p>
            <h3>Clocks the next scene inherits</h3>
            <ul className={styles.pressureList}>
              {projection.plot.clocks.map((clock) => (
                <li key={clock.id}>
                  <div>
                    <strong>{clock.label}</strong>
                    <span>{clock.value}/{clock.maxValue}</span>
                  </div>
                  <meter min={0} max={clock.maxValue} value={clock.value} />
                </li>
              ))}
            </ul>
          </section>
          <section className={styles.endings}>
            <p>Declared horizon</p>
            <h3>Possible endings</h3>
            <ul>
              {projection.plot.possibleEndings.map((ending) => (
                <li key={ending.id}>
                  <span>{readableId(ending.provenance)}</span>
                  <strong>{readableId(ending.kind)}</strong>
                  <p>{ending.summary}</p>
                </li>
              ))}
            </ul>
          </section>
          {projection.plot.latentRisks.length > 0 ? (
            <section className={styles.curtain}>
              <p>Behind the curtain · creator only</p>
              <h3>Unresolved risks</h3>
              <ul>
                {projection.plot.latentRisks.map((risk) => (
                  <li key={risk.riskId}>{risk.summary}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "branches" ? (
        <div className={styles.branches} data-testid="world-codex-branches">
          <header>
            <p>Checkpoint lineage</p>
            <h3>Every accepted choice leaves a world line.</h3>
            <span>
              Select a checkpoint to inspect it. Parent links and endings come from receipts, not story wording.
            </span>
          </header>
          <ol>
            {projection.branches.map((branch) => (
              <li key={branch.checkpointId} data-active={branch.active}>
                <button
                  type="button"
                  onClick={() => onSelectCheckpoint(branch.checkpointId)}
                  aria-current={branch.active ? "step" : undefined}
                >
                  <span>{String(branch.sequence).padStart(2, "0")}</span>
                  <div>
                    <strong>{readableId(branch.branchId)}</strong>
                    <small>
                      Turn {branch.turn} · {branch.endingKind ? readableId(branch.endingKind) : "Open"}
                    </small>
                  </div>
                  <i>{branch.status}</i>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

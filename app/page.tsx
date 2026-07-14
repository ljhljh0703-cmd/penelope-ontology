const stages = [
  ["01", "Retrieve", "Select only claims from the active canon profile."],
  ["02", "Draft", "Ask GPT-5.6 for prose plus machine-checkable assertions."],
  ["03", "Validate", "Fail closed on timeline, entity, knowledge, and source violations."],
  ["04", "Decide", "Keep new lore outside canon until the creator accepts or edits it."],
  ["05", "Replay", "Rerun frozen cases after every accepted canon change."],
] as const;

const demoCases = [
  { label: "Grounded scene", state: "EXPECTED PASS", tone: "pass" },
  { label: "Living Hector in Ithaca", state: "EXPECTED BLOCK", tone: "block" },
  { label: "Penelope knows Ogygia", state: "EXPECTED BLOCK", tone: "block" },
  { label: "New red-sail rule", state: "CREATOR DECISION", tone: "decision" },
] as const;

export default function Home() {
  return (
    <main>
      <section className="hero shell">
        <div className="eyebrow-row">
          <span className="eyebrow">OPENAI BUILD WEEK · WORK &amp; PRODUCTIVITY</span>
          <span className="phase">DAY 0 SCAFFOLD</span>
        </div>
        <p className="working-title">Narrative Ontology Harness · working title</p>
        <h1>
          Keep the story inventive.
          <span>Keep the world accountable.</span>
        </h1>
        <p className="lede">
          A creative engine that writes inside a creator&apos;s world, names the canon it used,
          and asks before making new lore official.
        </p>
        <div className="hero-grid">
          <article className="world-card">
            <div className="card-topline">
              <span>WORLD PACK</span>
              <span>trojan-returns-demo@0.1.0</span>
            </div>
            <div className="world-map" aria-label="Two fixed demo states">
              <div>
                <small>STATE A</small>
                <strong>Troy</strong>
                <span>Hector&apos;s funeral complete</span>
              </div>
              <i aria-hidden="true">→</i>
              <div>
                <small>STATE B</small>
                <strong>Ithaca</strong>
                <span>Odyssey, Book 1</span>
              </div>
            </div>
            <p className="card-note">
              Two fixed moments. No attempt to model all of Greek mythology.
            </p>
          </article>
          <aside className="contract-card">
            <p className="mini-label">CORE CONTRACT</p>
            <ul>
              <li><span>World mode</span><strong>CLOSED</strong></li>
              <li><span>Unknown fact</span><strong>BLOCK / PROPOSE</strong></li>
              <li><span>Canon change</span><strong>CREATOR ONLY</strong></li>
              <li><span>Target live model</span><strong>GPT-5.6</strong></li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="pipeline-section">
        <div className="shell">
          <div className="section-heading">
            <p className="mini-label">THE HARNESS, NOT A MEMORY CLAIM</p>
            <h2>One visible chain of evidence</h2>
          </div>
          <div className="pipeline">
            {stages.map(([number, title, description]) => (
              <article key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="shell proof-section">
        <div className="section-heading compact">
          <p className="mini-label">FROZEN DEMO CASES</p>
          <h2>Natural prose is not proof.</h2>
          <p>Every result must survive deterministic checks before it reaches canon.</p>
        </div>
        <div className="case-list">
          {demoCases.map((item, index) => (
            <div className="case-row" key={item.label}>
              <span className="case-index">0{index + 1}</span>
              <strong>{item.label}</strong>
              <span className={`status ${item.tone}`}>{item.state}</span>
            </div>
          ))}
        </div>
        <div className="truth-banner">
          <span>CURRENT TRUTH</span>
          <p>
            Contracts and fixture data exist. Retrieval, GPT-5.6 live generation, hard
            validators, creator gate, and replay execution are intentionally still pending.
          </p>
        </div>
      </section>
    </main>
  );
}

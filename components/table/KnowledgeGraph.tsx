import type { GraphDescriptor, GraphVisualState } from "@/src/contracts/graph";

const stateLabels: Record<GraphVisualState, string> = {
  active_evidence: "active evidence",
  missing_character_knowledge: "missing from character knowledge",
  blocked_assertion: "blocked assertion",
  ghost_proposal: "unapproved proposal",
  approved_overlay: "approved creator canon",
  current_scenario_value: "current scenario value",
};

type PositionedNode = GraphDescriptor["nodes"][number] & {
  x: number;
  y: number;
};

const positionNodes = (graph: GraphDescriptor): PositionedNode[] => {
  const columns = Math.min(4, Math.max(1, graph.nodes.length));
  return graph.nodes.map((node, index) => ({
    ...node,
    x: 110 + (index % columns) * 180,
    y: 74 + Math.floor(index / columns) * 132,
  }));
};

export function KnowledgeGraph({
  graph,
  proposalApplied,
}: {
  graph: GraphDescriptor;
  proposalApplied: boolean;
}) {
  const nodes = positionNodes(graph);
  const nodeIndex = new Map(nodes.map((node) => [node.id, node]));
  const rows = Math.max(1, Math.ceil(nodes.length / 4));
  const height = 148 + (rows - 1) * 132;

  const presentationState = (state: GraphVisualState): GraphVisualState =>
    proposalApplied && state === "ghost_proposal" ? "approved_overlay" : state;

  return (
    <section className="graph-panel panel" aria-labelledby="graph-title" data-testid="graph">
      <div className="panel-heading">
        <div>
          <p className="kicker">CANON / KNOWLEDGE GRAPH</p>
          <h2 id="graph-title">What the harness can prove</h2>
        </div>
        <p className="panel-note">Derived view · not a graph database</p>
      </div>

      <div className="graph-frame">
        <svg
          className="knowledge-graph"
          viewBox={`0 0 760 ${height}`}
          role="img"
          aria-labelledby="graph-svg-title graph-svg-description"
        >
          <title id="graph-svg-title">Narrative evidence and proposal graph</title>
          <desc id="graph-svg-description">
            A deterministic visual projection of evidence, character knowledge, blocked assertions,
            proposals, and current state. A complete text version follows the graphic.
          </desc>

          {graph.edges.map((edge) => {
            const from = nodeIndex.get(edge.fromNodeId);
            const to = nodeIndex.get(edge.toNodeId);
            if (!from || !to) return null;
            const visualState = presentationState(edge.visualState);
            return (
              <g key={edge.id} className={`graph-edge graph-state-${visualState}`}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                <title>{`${from.label} — ${edge.predicate ?? edge.kind} → ${to.label}`}</title>
              </g>
            );
          })}

          {nodes.map((node) => {
            const visualState = presentationState(node.visualState);
            return (
              <g
                key={node.id}
                className={`graph-node graph-state-${visualState}`}
                transform={`translate(${node.x} ${node.y})`}
              >
                <circle r="41" />
                <text className="graph-node-kind" textAnchor="middle" y="-7">
                  {node.kind.replaceAll("_", " ")}
                </text>
                <text className="graph-node-label" textAnchor="middle" y="12">
                  {node.label.length > 18 ? `${node.label.slice(0, 16)}…` : node.label}
                </text>
                <title>{`${node.label}: ${stateLabels[visualState]}`}</title>
              </g>
            );
          })}
        </svg>
      </div>

      <details className="graph-fallback" open>
        <summary>Graph as text</summary>
        <div className="graph-text-grid">
          <div>
            <h3>Nodes</h3>
            <ul>
              {graph.nodes.map((node) => {
                const state = presentationState(node.visualState);
                return (
                  <li key={node.id}>
                    <strong>{node.label}</strong>
                    <span>{stateLabels[state]}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h3>Relations</h3>
            <ul>
              {graph.edges.map((edge) => {
                const from = nodeIndex.get(edge.fromNodeId)?.label ?? edge.fromNodeId;
                const to = nodeIndex.get(edge.toNodeId)?.label ?? edge.toNodeId;
                const state = presentationState(edge.visualState);
                return (
                  <li key={edge.id}>
                    <strong>{from}</strong> {edge.predicate ?? edge.kind} <strong>{to}</strong>
                    <span>{stateLabels[state]}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}

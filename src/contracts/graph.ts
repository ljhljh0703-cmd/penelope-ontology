import { z } from "zod";
import { IdentifierSchema, addDuplicateIssues } from "@/src/contracts/common";

export const GraphVisualStateSchema = z.enum([
  "active_evidence",
  "missing_character_knowledge",
  "blocked_assertion",
  "ghost_proposal",
  "approved_overlay",
  "current_scenario_value",
]);

export const GraphNodeSchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum([
      "entity",
      "literal",
      "rule",
      "proposal",
      "snapshot",
      "state_variable",
      "state_value",
    ]),
    label: z.string().min(1),
    nonAuthoritativeDisplayLabel: z.string().min(1).nullable(),
    visualState: GraphVisualStateSchema,
    evidenceIds: z.array(IdentifierSchema),
  })
  .strict();

export const GraphEdgeSchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum(["claim", "conflict", "proposal", "applied", "current_value"]),
    fromNodeId: IdentifierSchema,
    toNodeId: IdentifierSchema,
    predicate: IdentifierSchema.nullable(),
    visualState: GraphVisualStateSchema,
    evidenceIds: z.array(IdentifierSchema),
    visibleToIds: z.array(IdentifierSchema),
    status: z.enum(["active", "missing", "blocked", "proposed", "approved", "current"]),
  })
  .strict();

export const GraphDescriptorSchema = z
  .object({
    id: IdentifierSchema,
    nodes: z.array(GraphNodeSchema),
    edges: z.array(GraphEdgeSchema),
  })
  .strict()
  .superRefine((graph, context) => {
    const nodeIds = graph.nodes.map(({ id }) => id);
    const edgeIds = graph.edges.map(({ id }) => id);
    addDuplicateIssues(nodeIds, "graph node id", context);
    addDuplicateIssues(edgeIds, "graph edge id", context);

    if (nodeIds.join("\n") !== [...nodeIds].sort().join("\n")) {
      context.addIssue({ code: "custom", path: ["nodes"], message: "Graph nodes must be sorted by id." });
    }
    if (edgeIds.join("\n") !== [...edgeIds].sort().join("\n")) {
      context.addIssue({ code: "custom", path: ["edges"], message: "Graph edges must be sorted by id." });
    }

    const knownNodeIds = new Set(nodeIds);
    for (const edge of graph.edges) {
      if (!knownNodeIds.has(edge.fromNodeId)) {
        context.addIssue({
          code: "custom",
          path: ["edges"],
          message: `Graph edge ${edge.id} has unknown source node ${edge.fromNodeId}.`,
        });
      }
      if (!knownNodeIds.has(edge.toNodeId)) {
        context.addIssue({
          code: "custom",
          path: ["edges"],
          message: `Graph edge ${edge.id} has unknown target node ${edge.toNodeId}.`,
        });
      }
    }
  });

export type GraphVisualState = z.infer<typeof GraphVisualStateSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphDescriptor = z.infer<typeof GraphDescriptorSchema>;

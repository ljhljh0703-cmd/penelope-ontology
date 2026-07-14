import { z } from "zod";
import {
  HashSchema,
  IdentifierSchema,
  VersionSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";

export const CandidateActionSchema = z
  .object({
    actorEntityId: IdentifierSchema,
    authorizingIntentId: IdentifierSchema,
    contributingIntentIds: z.array(IdentifierSchema),
    op: z.literal("set_variable"),
    variableId: IdentifierSchema,
    from: IdentifierSchema,
    to: IdentifierSchema,
    evidenceClaimIds: z.array(IdentifierSchema),
    evidenceRuleIds: z.array(IdentifierSchema),
  })
  .strict()
  .superRefine((action, context) => {
    addDuplicateIssues(action.contributingIntentIds, "contributing intent id", context);
    if (action.contributingIntentIds.includes(action.authorizingIntentId)) {
      context.addIssue({
        code: "custom",
        path: ["contributingIntentIds"],
        message: "The authorizing intent cannot also be a contributing intent.",
      });
    }
  });

export const SimulationTransitionDefinitionSchema = z
  .object({
    from: IdentifierSchema,
    to: IdentifierSchema,
    requiredRuleIds: z.array(IdentifierSchema),
  })
  .strict();

export const SimulationVariableDefinitionSchema = z
  .object({
    id: IdentifierSchema,
    initialValue: IdentifierSchema,
    values: z.array(IdentifierSchema).min(2),
    transitions: z.array(SimulationTransitionDefinitionSchema).min(1),
  })
  .strict()
  .superRefine((variable, context) => {
    addDuplicateIssues(variable.values, "simulation variable value", context);
    if (!variable.values.includes(variable.initialValue)) {
      context.addIssue({
        code: "custom",
        path: ["initialValue"],
        message: `Unknown initial value: ${variable.initialValue}`,
      });
    }
    for (const transition of variable.transitions) {
      if (!variable.values.includes(transition.from)) {
        context.addIssue({
          code: "custom",
          path: ["transitions"],
          message: `Transition starts from unknown value: ${transition.from}`,
        });
      }
      if (!variable.values.includes(transition.to)) {
        context.addIssue({
          code: "custom",
          path: ["transitions"],
          message: `Transition ends at unknown value: ${transition.to}`,
        });
      }
    }
    addDuplicateIssues(
      variable.transitions.map(({ from, to }) => `${from}->${to}`),
      "simulation transition",
      context,
    );
  });

export const SimulationScenarioSchema = z
  .object({
    id: IdentifierSchema,
    worldPackId: IdentifierSchema,
    worldPackVersion: z.string().min(1),
    baseStateId: IdentifierSchema,
    maxSteps: z.number().int().min(0).max(2),
    variables: z.array(SimulationVariableDefinitionSchema),
  })
  .strict()
  .superRefine((scenario, context) => {
    addDuplicateIssues(
      scenario.variables.map(({ id }) => id),
      "simulation variable id",
      context,
    );
  });

export const SimulationVariableValueSchema = z
  .object({
    id: IdentifierSchema,
    value: IdentifierSchema,
  })
  .strict();

const SimulationSnapshotFields = {
  scenarioId: IdentifierSchema,
  turnIndex: z.number().int().min(0).max(2),
  canonProfileId: IdentifierSchema,
  styleProfileId: IdentifierSchema,
  baseStateId: IdentifierSchema,
  worldPackVersion: z.string().min(1),
  overlayId: z.literal("creator_canon"),
  overlayVersion: VersionSchema,
  canonHash: HashSchema,
  presentEntityIds: z.array(IdentifierSchema),
  deceasedEntityIds: z.array(IdentifierSchema),
  variables: z.array(SimulationVariableValueSchema),
} as const;

const addSnapshotIssues = (
  snapshot: {
    presentEntityIds: string[];
    deceasedEntityIds: string[];
    variables: Array<{ id: string }>;
  },
  context: z.RefinementCtx,
): void => {
  addDuplicateIssues(snapshot.presentEntityIds, "present entity id", context);
  addDuplicateIssues(snapshot.deceasedEntityIds, "deceased entity id", context);
  addDuplicateIssues(
    snapshot.variables.map(({ id }) => id),
    "simulation variable id",
    context,
  );
};

export const SimulationSnapshotPayloadSchema = z
  .object(SimulationSnapshotFields)
  .strict()
  .superRefine(addSnapshotIssues);

export const SimulationSnapshotSchema = z
  .object({
    ...SimulationSnapshotFields,
    stateHash: HashSchema,
  })
  .strict()
  .superRefine(addSnapshotIssues);

export const SimulationTransitionRecordSchema = z
  .object({
    status: z.enum(["applied", "blocked"]),
    action: CandidateActionSchema,
    fromStateHash: HashSchema,
    toStateHash: HashSchema,
    toSnapshot: SimulationSnapshotSchema,
  })
  .strict();

export type CandidateAction = z.infer<typeof CandidateActionSchema>;
export type SimulationScenario = z.infer<typeof SimulationScenarioSchema>;
export type SimulationSnapshotPayload = z.infer<typeof SimulationSnapshotPayloadSchema>;
export type SimulationSnapshot = z.infer<typeof SimulationSnapshotSchema>;
export type SimulationTransitionRecord = z.infer<typeof SimulationTransitionRecordSchema>;

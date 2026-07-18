import { z } from "zod";
import {
  HashSchema,
  IdentifierSchema,
  addDuplicateIssues,
} from "@/src/contracts/common";

export const MAX_WORLD_SIMULATION_TURNS = 6;
export const MAX_REACTIONS_PER_TURN = 2;

const SummarySchema = z.string().trim().min(12).max(600);

export const SourceLocatorSchema = z
  .object({
    id: IdentifierSchema,
    work: z.literal("Homer, Odyssey"),
    book: z.enum(["19", "23"]),
    passage: z.string().trim().min(3).max(120),
    url: z.string().url(),
    sourceStatus: z.literal("primary_source_checked"),
    checkedAt: z.iso.date(),
    evidenceSummary: SummarySchema,
    usage: z.literal("original_summary_only"),
  })
  .strict();

const PremiseOriginSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("source"),
      sourceLocatorIds: z.array(IdentifierSchema).min(1).max(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal("creator"),
      creatorDecisionId: IdentifierSchema,
    })
    .strict(),
]);

export const CanonicalPremiseSchema = z
  .object({
    id: IdentifierSchema,
    summary: SummarySchema,
    textForm: z.literal("original_summary"),
    origin: PremiseOriginSchema,
    meaning: SummarySchema,
    recognizerEntityIds: z.array(IdentifierSchema).min(1).max(4),
    stakes: z
      .array(
        z
          .object({
            id: IdentifierSchema,
            summary: SummarySchema,
            affectedEntityIds: z.array(IdentifierSchema).min(1).max(4),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    approvalState: z.enum(["source_verified", "creator_approved"]),
  })
  .strict()
  .superRefine((premise, context) => {
    addDuplicateIssues(premise.recognizerEntityIds, "premise recognizer entity id", context);
    addDuplicateIssues(
      premise.stakes.map(({ id }) => id),
      "premise stake id",
      context,
    );
    if (premise.origin.kind === "source" && premise.approvalState !== "source_verified") {
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "A source-origin premise must be source_verified.",
      });
    }
    if (premise.origin.kind === "creator" && premise.approvalState !== "creator_approved") {
      context.addIssue({
        code: "custom",
        path: ["approvalState"],
        message: "A creator-origin premise must be creator_approved.",
      });
    }
  });

export const WorldZoneSchema = z
  .object({
    id: IdentifierSchema,
    name: z.string().trim().min(1).max(80),
    summary: SummarySchema,
    connectedZoneIds: z.array(IdentifierSchema).min(1).max(2),
  })
  .strict()
  .superRefine((zone, context) => {
    addDuplicateIssues(zone.connectedZoneIds, "connected zone id", context);
    if (zone.connectedZoneIds.includes(zone.id)) {
      context.addIssue({
        code: "custom",
        path: ["connectedZoneIds"],
        message: "A zone cannot connect to itself.",
      });
    }
  });

export const ActorAgendaSchema = z
  .object({
    desire: SummarySchema,
    avoids: SummarySchema,
    priority: z.number().int().min(1).max(100),
    state: z.enum(["active", "blocked", "satisfied"]),
    defaultActionId: IdentifierSchema,
  })
  .strict();

export const WorldActorSchema = z
  .object({
    id: IdentifierSchema,
    name: z.string().trim().min(1).max(80),
    participantLabel: z.string().trim().min(1).max(80),
    simulationRole: z.enum(["focal_participant", "npc"]),
    publicDescription: SummarySchema,
    currentZoneId: IdentifierSchema,
    agenda: ActorAgendaSchema,
  })
  .strict();

export const ActionDefinitionSchema = z
  .object({
    id: IdentifierSchema,
    label: z.string().trim().min(1).max(80),
    summary: SummarySchema,
    verbAliases: z
      .array(
        z
          .string()
          .min(1)
          .max(40)
          .regex(/^[a-z]+(?: [a-z]+){0,3}$/, "Use lowercase English action aliases."),
      )
      .min(1)
      .max(8),
    actorMode: z.enum(["participant", "npc"]),
    allowedActorEntityIds: z.array(IdentifierSchema).min(1).max(4),
    targetMode: z.enum(["self", "entity", "zone", "none"]),
    allowedTargetEntityIds: z.array(IdentifierSchema).max(4),
    allowedZoneIds: z.array(IdentifierSchema).max(3),
    cost: z.object({ turns: z.literal(1) }).strict(),
    worldMeaning: SummarySchema,
  })
  .strict()
  .superRefine((action, context) => {
    addDuplicateIssues(action.verbAliases, "action verb alias", context);
    addDuplicateIssues(action.allowedActorEntityIds, "allowed actor entity id", context);
    addDuplicateIssues(action.allowedTargetEntityIds, "allowed target entity id", context);
    addDuplicateIssues(action.allowedZoneIds, "allowed zone id", context);
    if (action.targetMode === "entity" && action.allowedTargetEntityIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["allowedTargetEntityIds"],
        message: "An entity-targeted action needs at least one allowed target.",
      });
    }
    if (action.targetMode === "zone" && action.allowedZoneIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["allowedZoneIds"],
        message: "A zone-targeted action needs at least one allowed zone.",
      });
    }
    if (
      action.targetMode !== "entity" &&
      action.allowedTargetEntityIds.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowedTargetEntityIds"],
        message: "Only entity-targeted actions may declare entity targets.",
      });
    }
    if (action.targetMode !== "zone" && action.allowedZoneIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["allowedZoneIds"],
        message: "Only zone-targeted actions may declare zone targets.",
      });
    }
  });

export const ReactionConditionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("action_observed"),
      actionId: IdentifierSchema,
      actorEntityId: IdentifierSchema.nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("premise_known"),
      entityId: IdentifierSchema,
      premiseId: IdentifierSchema,
      expected: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("flag_equals"),
      flagId: IdentifierSchema,
      value: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("clock_at_least"),
      clockId: IdentifierSchema,
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("actor_in_zone"),
      entityId: IdentifierSchema,
      zoneId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("turn_at_least"),
      turn: z.number().int().min(1).max(MAX_WORLD_SIMULATION_TURNS),
    })
    .strict(),
]);

export const ReactionEffectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("grant_knowledge"),
      entityId: IdentifierSchema,
      premiseId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_flag"),
      flagId: IdentifierSchema,
      value: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("advance_clock"),
      clockId: IdentifierSchema,
      delta: z.number().int().min(1).max(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal("move_actor"),
      entityId: IdentifierSchema,
      toZoneId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_agenda_state"),
      entityId: IdentifierSchema,
      state: z.enum(["active", "blocked", "satisfied"]),
    })
    .strict(),
]);

export const SimulationRuleProvenanceSchema = z
  .object({
    basis: z.enum(["source_derived", "creator_authored", "agent_proposed"]),
    premiseIds: z.array(IdentifierSchema).max(6),
    reviewState: z.enum([
      "source_grounded",
      "creator_approved",
      "creator_review_required",
    ]),
    canonStatus: z.enum(["source_canon", "not_source_canon"]),
    creatorApprovalReceiptId: IdentifierSchema.nullable(),
    creatorDecisionId: IdentifierSchema.nullable(),
  })
  .strict()
  .superRefine((provenance, context) => {
    if (
      provenance.basis === "source_derived" &&
      (provenance.reviewState !== "source_grounded" ||
        provenance.premiseIds.length === 0 ||
        provenance.canonStatus !== "source_canon" ||
        provenance.creatorApprovalReceiptId !== null ||
        provenance.creatorDecisionId !== null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A source-derived rule requires source-grounded source canon, at least one premise, and no creator approval reference.",
      });
    }
    if (
      provenance.basis === "agent_proposed" &&
      provenance.canonStatus !== "not_source_canon"
    ) {
      context.addIssue({
        code: "custom",
        message: "An agent-proposed rule must remain explicitly outside source canon.",
      });
    }
    if (
      provenance.basis === "agent_proposed" &&
      provenance.reviewState === "creator_review_required" &&
      (provenance.creatorApprovalReceiptId !== null ||
        provenance.creatorDecisionId !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "A pending agent proposal cannot cite a creator approval receipt.",
      });
    }
    if (
      provenance.basis === "agent_proposed" &&
      provenance.reviewState === "creator_approved" &&
      (provenance.creatorApprovalReceiptId === null ||
        provenance.creatorDecisionId === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "An approved agent proposal requires both creator approval receipt and decision references.",
      });
    }
    if (
      provenance.basis === "creator_authored" &&
      (provenance.reviewState !== "creator_approved" ||
        provenance.canonStatus !== "not_source_canon" ||
        provenance.creatorApprovalReceiptId === null ||
        provenance.creatorDecisionId === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A creator-authored rule requires creator-approved non-source-canon state and receipt references.",
      });
    }
  });

export const CreatorRuleApprovalDecisionSchema = z
  .object({
    decisionId: IdentifierSchema,
    action: z.enum(["approve", "approve_as_creator_authored_if"]),
    ruleIds: z.array(IdentifierSchema).min(1).max(8),
  })
  .strict()
  .superRefine((decision, context) => {
    addDuplicateIssues(decision.ruleIds, "creator-approved rule id", context);
  });

export const CreatorRuleApprovalReceiptSchema = z
  .object({
    binding: z
      .object({
        receiptId: IdentifierSchema,
        subjectFingerprint: HashSchema,
        issuer: z.literal("creator"),
        issuerAuthorityId: IdentifierSchema,
      })
      .strict(),
    scenarioId: IdentifierSchema,
    approvedOn: z.iso.date(),
    decisions: z.array(CreatorRuleApprovalDecisionSchema).min(1).max(12),
  })
  .strict()
  .superRefine((receipt, context) => {
    addDuplicateIssues(
      receipt.decisions.map(({ decisionId }) => decisionId),
      "creator approval decision id",
      context,
    );
    addDuplicateIssues(
      receipt.decisions.flatMap(({ ruleIds }) => ruleIds),
      "creator approval mapped rule id",
      context,
    );
  });

export const CreatorRuleApprovalAuthorityRegistrySchema = z
  .object({
    creatorAuthorityIds: z.array(IdentifierSchema).min(1).max(8),
    trustedReceipts: z
      .array(
        z
          .object({
            receiptId: IdentifierSchema,
            subjectFingerprint: HashSchema,
            issuer: z.literal("creator"),
            issuerAuthorityId: IdentifierSchema,
            payloadFingerprint: HashSchema,
          })
          .strict(),
      )
      .max(8),
  })
  .strict()
  .superRefine((registry, context) => {
    addDuplicateIssues(
      registry.creatorAuthorityIds,
      "creator approval authority id",
      context,
    );
    addDuplicateIssues(
      registry.trustedReceipts.map(({ receiptId }) => receiptId),
      "trusted creator approval receipt id",
      context,
    );
  });

export const ReactionRuleSchema = z
  .object({
    id: IdentifierSchema,
    actorEntityId: IdentifierSchema,
    actionId: IdentifierSchema,
    priority: z.number().int().min(1).max(100),
    summary: SummarySchema,
    observableSummary: SummarySchema.nullable(),
    provenance: SimulationRuleProvenanceSchema,
    conditions: z.array(ReactionConditionSchema).min(1).max(4),
    effects: z.array(ReactionEffectSchema).min(1).max(4),
    once: z.boolean(),
  })
  .strict();

export const PressureClockSchema = z
  .object({
    id: IdentifierSchema,
    label: z.string().trim().min(1).max(80),
    initialValue: z.number().int().nonnegative(),
    maxValue: z.number().int().min(1).max(12),
  })
  .strict()
  .refine((clock) => clock.initialValue < clock.maxValue, {
    message: "A pressure clock must start below its maximum.",
    path: ["initialValue"],
  });

export const EndingRuleSchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum([
      "canon_contained",
      "controlled_discovery",
      "plan_compromised",
      "timeout",
    ]),
    priority: z.number().int().min(1).max(100),
    summary: SummarySchema,
    provenance: SimulationRuleProvenanceSchema,
    conditions: z.array(ReactionConditionSchema).min(1).max(4),
    terminal: z.literal(true),
  })
  .strict();

export const PrivateKnowledgeStateSchema = z
  .object({
    entityId: IdentifierSchema,
    premiseIds: z.array(IdentifierSchema).max(12),
  })
  .strict()
  .superRefine((state, context) => {
    addDuplicateIssues(state.premiseIds, "private knowledge premise id", context);
  });

export const InitialFlagSchema = z
  .object({
    id: IdentifierSchema,
    value: z.boolean(),
  })
  .strict();

const addUnknownReferenceIssue = (
  known: ReadonlySet<string>,
  value: string,
  path: Array<string | number>,
  label: string,
  context: z.RefinementCtx,
): void => {
  if (!known.has(value)) {
    context.addIssue({
      code: "custom",
      path,
      message: `Unknown ${label}: ${value}`,
    });
  }
};

export const WorldSimulationScenarioSchema = z
  .object({
    id: IdentifierSchema,
    title: z.string().trim().min(1).max(120),
    summary: SummarySchema,
    focalParticipantEntityId: IdentifierSchema,
    maxTurns: z.number().int().min(1).max(MAX_WORLD_SIMULATION_TURNS),
    maxReactionsPerTurn: z
      .number()
      .int()
      .min(1)
      .max(MAX_REACTIONS_PER_TURN),
    sourceLocators: z.array(SourceLocatorSchema).min(2).max(6),
    premises: z.array(CanonicalPremiseSchema).min(1).max(24),
    zones: z.array(WorldZoneSchema).length(3),
    actors: z.array(WorldActorSchema).min(2).max(6),
    actions: z.array(ActionDefinitionSchema).min(2).max(18),
    initialPrivateKnowledge: z.array(PrivateKnowledgeStateSchema).min(2).max(6),
    initialFlags: z.array(InitialFlagSchema).max(16),
    clocks: z.array(PressureClockSchema).min(1).max(3),
    creatorRuleApprovalReceipts: z
      .array(CreatorRuleApprovalReceiptSchema)
      .max(8),
    creatorRuleApprovalAuthorityRegistry:
      CreatorRuleApprovalAuthorityRegistrySchema,
    reactionRules: z.array(ReactionRuleSchema).min(1).max(16),
    endingRules: z.array(EndingRuleSchema).length(4),
  })
  .strict()
  .superRefine((scenario, context) => {
    addDuplicateIssues(scenario.sourceLocators.map(({ id }) => id), "source locator id", context);
    addDuplicateIssues(scenario.premises.map(({ id }) => id), "canonical premise id", context);
    addDuplicateIssues(scenario.zones.map(({ id }) => id), "world zone id", context);
    addDuplicateIssues(scenario.actors.map(({ id }) => id), "world actor id", context);
    addDuplicateIssues(scenario.actions.map(({ id }) => id), "action definition id", context);
    addDuplicateIssues(
      scenario.actions.flatMap(({ verbAliases }) => verbAliases),
      "action verb alias",
      context,
    );
    addDuplicateIssues(
      scenario.initialPrivateKnowledge.map(({ entityId }) => entityId),
      "private knowledge entity id",
      context,
    );
    addDuplicateIssues(scenario.initialFlags.map(({ id }) => id), "initial flag id", context);
    addDuplicateIssues(scenario.clocks.map(({ id }) => id), "pressure clock id", context);
    addDuplicateIssues(
      scenario.creatorRuleApprovalReceipts.map(
        ({ binding }) => binding.receiptId,
      ),
      "creator rule approval receipt id",
      context,
    );
    addDuplicateIssues(scenario.reactionRules.map(({ id }) => id), "reaction rule id", context);
    addDuplicateIssues(scenario.endingRules.map(({ id }) => id), "ending rule id", context);

    const sourceIds = new Set(scenario.sourceLocators.map(({ id }) => id));
    const premiseIds = new Set(scenario.premises.map(({ id }) => id));
    const zoneIds = new Set(scenario.zones.map(({ id }) => id));
    const actorIds = new Set(scenario.actors.map(({ id }) => id));
    const actionIds = new Set(scenario.actions.map(({ id }) => id));
    const flagIds = new Set(scenario.initialFlags.map(({ id }) => id));
    const clockById = new Map(scenario.clocks.map((clock) => [clock.id, clock]));
    const clockIds = new Set(clockById.keys());
    const simulationRules = [
      ...scenario.reactionRules,
      ...scenario.endingRules,
    ];
    const simulationRuleIds = new Set(simulationRules.map(({ id }) => id));

    for (const [receiptIndex, receipt] of
      scenario.creatorRuleApprovalReceipts.entries()) {
      if (receipt.scenarioId !== scenario.id) {
        context.addIssue({
          code: "custom",
          path: ["creatorRuleApprovalReceipts", receiptIndex, "scenarioId"],
          message: "A creator approval receipt must target this scenario.",
        });
      }
      for (const [decisionIndex, decision] of receipt.decisions.entries()) {
        for (const [ruleIndex, ruleId] of decision.ruleIds.entries()) {
          addUnknownReferenceIssue(
            simulationRuleIds,
            ruleId,
            [
              "creatorRuleApprovalReceipts",
              receiptIndex,
              "decisions",
              decisionIndex,
              "ruleIds",
              ruleIndex,
            ],
            "creator-approved simulation rule",
            context,
          );
        }
      }
    }

    for (const [ruleIndex, rule] of simulationRules.entries()) {
      const provenance = rule.provenance;
      if (provenance.reviewState !== "creator_approved") continue;
      const receipt = scenario.creatorRuleApprovalReceipts.find(
        ({ binding }) =>
          binding.receiptId === provenance.creatorApprovalReceiptId,
      );
      const decision = receipt?.decisions.find(
        ({ decisionId }) => decisionId === provenance.creatorDecisionId,
      );
      if (!decision?.ruleIds.includes(rule.id)) {
        context.addIssue({
          code: "custom",
          path: ["simulationRules", ruleIndex, "provenance"],
          message:
            "A creator-approved rule must be mapped by its referenced receipt decision.",
        });
      }
    }

    const focalActors = scenario.actors.filter(
      ({ simulationRole }) => simulationRole === "focal_participant",
    );
    if (
      focalActors.length !== 1 ||
      focalActors[0]?.id !== scenario.focalParticipantEntityId
    ) {
      context.addIssue({
        code: "custom",
        path: ["focalParticipantEntityId"],
        message: "A scenario must identify its one focal participant actor.",
      });
    }
    for (const actor of scenario.actors) {
      if (
        !scenario.initialPrivateKnowledge.some(
          ({ entityId }) => entityId === actor.id,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["initialPrivateKnowledge"],
          message: `Missing private knowledge state for actor: ${actor.id}`,
        });
      }
    }

    for (const [premiseIndex, premise] of scenario.premises.entries()) {
      if (premise.origin.kind === "source") {
        for (const locatorId of premise.origin.sourceLocatorIds) {
          addUnknownReferenceIssue(
            sourceIds,
            locatorId,
            ["premises", premiseIndex, "origin", "sourceLocatorIds"],
            "source locator",
            context,
          );
        }
      }
      for (const entityId of premise.recognizerEntityIds) {
        addUnknownReferenceIssue(
          actorIds,
          entityId,
          ["premises", premiseIndex, "recognizerEntityIds"],
          "premise recognizer",
          context,
        );
      }
      for (const [stakeIndex, stake] of premise.stakes.entries()) {
        for (const entityId of stake.affectedEntityIds) {
          addUnknownReferenceIssue(
            actorIds,
            entityId,
            ["premises", premiseIndex, "stakes", stakeIndex, "affectedEntityIds"],
            "stake entity",
            context,
          );
        }
      }
    }

    for (const [zoneIndex, zone] of scenario.zones.entries()) {
      for (const connectedZoneId of zone.connectedZoneIds) {
        addUnknownReferenceIssue(
          zoneIds,
          connectedZoneId,
          ["zones", zoneIndex, "connectedZoneIds"],
          "connected zone",
          context,
        );
        const peer = scenario.zones.find(({ id }) => id === connectedZoneId);
        if (peer && !peer.connectedZoneIds.includes(zone.id)) {
          context.addIssue({
            code: "custom",
            path: ["zones", zoneIndex, "connectedZoneIds"],
            message: `Zone connection must be reciprocal: ${zone.id} -> ${connectedZoneId}`,
          });
        }
      }
    }

    for (const [actorIndex, actor] of scenario.actors.entries()) {
      addUnknownReferenceIssue(
        zoneIds,
        actor.currentZoneId,
        ["actors", actorIndex, "currentZoneId"],
        "actor zone",
        context,
      );
      addUnknownReferenceIssue(
        actionIds,
        actor.agenda.defaultActionId,
        ["actors", actorIndex, "agenda", "defaultActionId"],
        "default action",
        context,
      );
      const defaultAction = scenario.actions.find(
        ({ id }) => id === actor.agenda.defaultActionId,
      );
      if (defaultAction && !defaultAction.allowedActorEntityIds.includes(actor.id)) {
        context.addIssue({
          code: "custom",
          path: ["actors", actorIndex, "agenda", "defaultActionId"],
          message: `Default action does not authorize actor: ${actor.id}`,
        });
      }
    }

    for (const [actionIndex, action] of scenario.actions.entries()) {
      for (const actorId of action.allowedActorEntityIds) {
        addUnknownReferenceIssue(
          actorIds,
          actorId,
          ["actions", actionIndex, "allowedActorEntityIds"],
          "allowed actor",
          context,
        );
        const actor = scenario.actors.find(({ id }) => id === actorId);
        if (
          actor &&
          ((action.actorMode === "participant" && actor.simulationRole !== "focal_participant") ||
            (action.actorMode === "npc" && actor.simulationRole !== "npc"))
        ) {
          context.addIssue({
            code: "custom",
            path: ["actions", actionIndex, "allowedActorEntityIds"],
            message: `Action actorMode conflicts with actor role: ${actorId}`,
          });
        }
      }
      for (const targetId of action.allowedTargetEntityIds) {
        addUnknownReferenceIssue(
          actorIds,
          targetId,
          ["actions", actionIndex, "allowedTargetEntityIds"],
          "allowed target",
          context,
        );
      }
      for (const zoneId of action.allowedZoneIds) {
        addUnknownReferenceIssue(
          zoneIds,
          zoneId,
          ["actions", actionIndex, "allowedZoneIds"],
          "allowed action zone",
          context,
        );
      }
    }

    for (const [knowledgeIndex, knowledge] of scenario.initialPrivateKnowledge.entries()) {
      addUnknownReferenceIssue(
        actorIds,
        knowledge.entityId,
        ["initialPrivateKnowledge", knowledgeIndex, "entityId"],
        "private knowledge entity",
        context,
      );
      for (const premiseId of knowledge.premiseIds) {
        addUnknownReferenceIssue(
          premiseIds,
          premiseId,
          ["initialPrivateKnowledge", knowledgeIndex, "premiseIds"],
          "private knowledge premise",
          context,
        );
      }
    }

    const validateCondition = (
      condition: z.infer<typeof ReactionConditionSchema>,
      path: Array<string | number>,
    ): void => {
      switch (condition.kind) {
        case "action_observed":
          addUnknownReferenceIssue(actionIds, condition.actionId, path, "observed action", context);
          if (condition.actorEntityId !== null) {
            addUnknownReferenceIssue(actorIds, condition.actorEntityId, path, "observed actor", context);
          }
          break;
        case "premise_known":
          addUnknownReferenceIssue(actorIds, condition.entityId, path, "knowledge entity", context);
          addUnknownReferenceIssue(premiseIds, condition.premiseId, path, "known premise", context);
          break;
        case "flag_equals":
          addUnknownReferenceIssue(flagIds, condition.flagId, path, "condition flag", context);
          break;
        case "clock_at_least": {
          addUnknownReferenceIssue(clockIds, condition.clockId, path, "condition clock", context);
          const clock = clockById.get(condition.clockId);
          if (clock && condition.value > clock.maxValue) {
            context.addIssue({
              code: "custom",
              path,
              message: `Clock threshold exceeds maximum: ${condition.clockId}`,
            });
          }
          break;
        }
        case "actor_in_zone":
          addUnknownReferenceIssue(actorIds, condition.entityId, path, "located actor", context);
          addUnknownReferenceIssue(zoneIds, condition.zoneId, path, "condition zone", context);
          break;
        case "turn_at_least":
          if (condition.turn > scenario.maxTurns) {
            context.addIssue({
              code: "custom",
              path,
              message: "Turn condition exceeds the scenario turn limit.",
            });
          }
          break;
      }
    };

    for (const [ruleIndex, rule] of scenario.reactionRules.entries()) {
      for (const premiseId of rule.provenance.premiseIds) {
        addUnknownReferenceIssue(
          premiseIds,
          premiseId,
          ["reactionRules", ruleIndex, "provenance", "premiseIds"],
          "reaction provenance premise",
          context,
        );
      }
      addUnknownReferenceIssue(
        actorIds,
        rule.actorEntityId,
        ["reactionRules", ruleIndex, "actorEntityId"],
        "reaction actor",
        context,
      );
      const actor = scenario.actors.find(({ id }) => id === rule.actorEntityId);
      if (actor && actor.simulationRole !== "npc") {
        context.addIssue({
          code: "custom",
          path: ["reactionRules", ruleIndex, "actorEntityId"],
          message: "Only NPCs may own reaction rules.",
        });
      }
      addUnknownReferenceIssue(
        actionIds,
        rule.actionId,
        ["reactionRules", ruleIndex, "actionId"],
        "reaction action",
        context,
      );
      const reactionAction = scenario.actions.find(({ id }) => id === rule.actionId);
      if (
        reactionAction &&
        (reactionAction.actorMode !== "npc" ||
          !reactionAction.allowedActorEntityIds.includes(rule.actorEntityId))
      ) {
        context.addIssue({
          code: "custom",
          path: ["reactionRules", ruleIndex, "actionId"],
          message: "A reaction action must authorize its NPC owner.",
        });
      }
      for (const [conditionIndex, condition] of rule.conditions.entries()) {
        validateCondition(condition, ["reactionRules", ruleIndex, "conditions", conditionIndex]);
      }
      for (const [effectIndex, effect] of rule.effects.entries()) {
        const path = ["reactionRules", ruleIndex, "effects", effectIndex] as Array<
          string | number
        >;
        switch (effect.kind) {
          case "grant_knowledge":
            addUnknownReferenceIssue(actorIds, effect.entityId, path, "knowledge recipient", context);
            addUnknownReferenceIssue(premiseIds, effect.premiseId, path, "granted premise", context);
            break;
          case "set_flag":
            addUnknownReferenceIssue(flagIds, effect.flagId, path, "effect flag", context);
            break;
          case "advance_clock":
            addUnknownReferenceIssue(clockIds, effect.clockId, path, "effect clock", context);
            break;
          case "move_actor":
            addUnknownReferenceIssue(actorIds, effect.entityId, path, "moved actor", context);
            addUnknownReferenceIssue(zoneIds, effect.toZoneId, path, "destination zone", context);
            break;
          case "set_agenda_state":
            addUnknownReferenceIssue(actorIds, effect.entityId, path, "agenda actor", context);
            break;
        }
      }
    }

    const expectedEndingKinds = [
      "canon_contained",
      "controlled_discovery",
      "plan_compromised",
      "timeout",
    ];
    addDuplicateIssues(
      scenario.endingRules.map(({ kind }) => kind),
      "ending rule kind",
      context,
    );
    for (const kind of expectedEndingKinds) {
      if (!scenario.endingRules.some((ending) => ending.kind === kind)) {
        context.addIssue({
          code: "custom",
          path: ["endingRules"],
          message: `Missing required ending kind: ${kind}`,
        });
      }
    }
    for (const [endingIndex, ending] of scenario.endingRules.entries()) {
      for (const premiseId of ending.provenance.premiseIds) {
        addUnknownReferenceIssue(
          premiseIds,
          premiseId,
          ["endingRules", endingIndex, "provenance", "premiseIds"],
          "ending provenance premise",
          context,
        );
      }
      for (const [conditionIndex, condition] of ending.conditions.entries()) {
        validateCondition(condition, ["endingRules", endingIndex, "conditions", conditionIndex]);
      }
      if (
        ending.kind === "timeout" &&
        !ending.conditions.some(
          (condition) =>
            condition.kind === "turn_at_least" && condition.turn === scenario.maxTurns,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["endingRules", endingIndex, "conditions"],
          message: "The timeout ending must trigger at the scenario turn limit.",
        });
      }
    }
  });

export type SourceLocator = z.infer<typeof SourceLocatorSchema>;
export type CanonicalPremise = z.infer<typeof CanonicalPremiseSchema>;
export type WorldZone = z.infer<typeof WorldZoneSchema>;
export type ActorAgenda = z.infer<typeof ActorAgendaSchema>;
export type WorldActor = z.infer<typeof WorldActorSchema>;
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;
export type ReactionCondition = z.infer<typeof ReactionConditionSchema>;
export type ReactionEffect = z.infer<typeof ReactionEffectSchema>;
export type SimulationRuleProvenance = z.infer<
  typeof SimulationRuleProvenanceSchema
>;
export type CreatorRuleApprovalDecision = z.infer<
  typeof CreatorRuleApprovalDecisionSchema
>;
export type CreatorRuleApprovalReceipt = z.infer<
  typeof CreatorRuleApprovalReceiptSchema
>;
export type CreatorRuleApprovalAuthorityRegistry = z.infer<
  typeof CreatorRuleApprovalAuthorityRegistrySchema
>;
export type ReactionRule = z.infer<typeof ReactionRuleSchema>;
export type PressureClock = z.infer<typeof PressureClockSchema>;
export type EndingRule = z.infer<typeof EndingRuleSchema>;
export type WorldSimulationScenario = z.infer<typeof WorldSimulationScenarioSchema>;

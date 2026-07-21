import type {
  CampaignEventInput,
  CampaignLedger,
  CausalEffect,
} from "@/src/contracts/campaign";
import type {
  ActionDefinition,
  CreatorRuleApprovalReceipt,
  EndingRule,
  ReactionCondition,
  ReactionEffect,
  ReactionRule,
  WorldSimulationScenario,
} from "@/src/contracts/world-simulation";
import {
  ResolvedWorldActionSchema,
  WorldSimulationSessionSchema,
  WorldSimulationStatePayloadSchema,
  WorldSimulationStateSchema,
  WorldTurnReceiptPayloadSchema,
  WorldTurnReceiptSchema,
  CreatorWorldDirectionReceiptSchema,
  type CreatorWorldDirectionReceipt,
  type ResolvedWorldAction,
  type WorldActionCandidate,
  type WorldSimulationEvent,
  type WorldSimulationSession,
  type WorldSimulationState,
  type WorldSimulationStatePayload,
  type WorldTurnReceipt,
} from "@/src/contracts/world-runtime";
import {
  appendCampaignEvent,
  buildCampaignEventAuthorityHash,
  createCampaignLedger,
  forkCampaignLedger,
  hasValidCampaignLedger,
} from "@/src/domain/campaign";
import { sha256Canonical, sortedUniqueIds } from "@/src/domain/canonical-json";

const WORLD_RUNTIME_VERSION = "1.0.0";

const compareIds = (left: string, right: string): number => left.localeCompare(right);

type SimulationRuleEntry =
  | { kind: "reaction"; rule: ReactionRule }
  | { kind: "ending"; rule: EndingRule };

const simulationRuleEntries = (
  scenario: Pick<WorldSimulationScenario, "reactionRules" | "endingRules">,
): SimulationRuleEntry[] => [
  ...scenario.reactionRules.map((rule) => ({ kind: "reaction" as const, rule })),
  ...scenario.endingRules.map((rule) => ({ kind: "ending" as const, rule })),
];

export const buildCreatorRuleApprovalSubjectFingerprint = ({
  scenario,
  receiptId,
}: {
  scenario: Pick<
    WorldSimulationScenario,
    | "id"
    | "reactionRules"
    | "narrationSpeechDirectives"
    | "endingRules"
  >;
  receiptId: string;
}): string =>
  sha256Canonical({
    schemaVersion: "penelope.creator-rule-approval-subject.v2",
    scenarioId: scenario.id,
    rules: simulationRuleEntries(scenario)
      .filter(
        ({ rule }) =>
          rule.provenance.creatorApprovalReceiptId === receiptId,
      )
      .map(({ kind, rule }) => ({ kind, rule }))
      .sort((left, right) => compareIds(left.rule.id, right.rule.id)),
    narrationSpeechDirectives: scenario.narrationSpeechDirectives
      .filter(
        ({ creatorApprovalReceiptId }) =>
          creatorApprovalReceiptId === receiptId,
      )
      .sort((left, right) => compareIds(left.id, right.id)),
  });

export const fingerprintCreatorRuleApprovalReceiptPayload = (
  receipt: CreatorRuleApprovalReceipt,
): string => {
  const { binding, ...payload } = receipt;
  void binding;
  return sha256Canonical({
    schemaVersion: "penelope.creator-rule-approval-receipt-payload.v1",
    payload,
  });
};

const trustedCreatorRuleIdsForReceipt = ({
  scenario,
  receiptId,
}: {
  scenario: WorldSimulationScenario;
  receiptId: string;
}): ReadonlySet<string> => {
  const receipts = scenario.creatorRuleApprovalReceipts.filter(
    ({ binding }) => binding.receiptId === receiptId,
  );
  const trustedReceipts =
    scenario.creatorRuleApprovalAuthorityRegistry.trustedReceipts.filter(
      (receipt) => receipt.receiptId === receiptId,
    );
  if (receipts.length !== 1 || trustedReceipts.length !== 1) return new Set();
  const receipt = receipts[0]!;
  const trusted = trustedReceipts[0]!;
  const { binding } = receipt;
  const authorityIds =
    scenario.creatorRuleApprovalAuthorityRegistry.creatorAuthorityIds;
  if (
    new Set(authorityIds).size !== authorityIds.length ||
    binding.issuer !== "creator" ||
    !authorityIds.includes(binding.issuerAuthorityId) ||
    trusted.issuer !== binding.issuer ||
    trusted.issuerAuthorityId !== binding.issuerAuthorityId ||
    trusted.subjectFingerprint !== binding.subjectFingerprint ||
    trusted.subjectFingerprint !==
      buildCreatorRuleApprovalSubjectFingerprint({ scenario, receiptId }) ||
    trusted.payloadFingerprint !==
      fingerprintCreatorRuleApprovalReceiptPayload(receipt) ||
    receipt.scenarioId !== scenario.id
  ) {
    return new Set();
  }

  const mappedRuleIds = receipt.decisions.flatMap(({ ruleIds }) => ruleIds);
  if (
    new Set(mappedRuleIds).size !== mappedRuleIds.length ||
    new Set(receipt.decisions.map(({ decisionId }) => decisionId)).size !==
      receipt.decisions.length
  ) {
    return new Set();
  }
  const mappedRuleIdSet = new Set(mappedRuleIds);
  const approvedRules = simulationRuleEntries(scenario)
    .map(({ rule }) => rule)
    .filter(
      ({ provenance }) =>
        provenance.creatorApprovalReceiptId === receiptId,
    );
  if (
    approvedRules.length !== mappedRuleIdSet.size ||
    approvedRules.some(
      (rule) =>
        !mappedRuleIdSet.has(rule.id) ||
        rule.provenance.basis === "source_derived" ||
        rule.provenance.reviewState !== "creator_approved" ||
        rule.provenance.canonStatus !== "not_source_canon" ||
        !receipt.decisions.some(
          ({ decisionId, ruleIds }) =>
            decisionId === rule.provenance.creatorDecisionId &&
            ruleIds.includes(rule.id),
        ),
    )
  ) {
    return new Set();
  }
  return mappedRuleIdSet;
};

export const activeWorldSimulationRuleIds = (
  scenario: WorldSimulationScenario,
): ReadonlySet<string> => {
  const activeRuleIds = new Set<string>();
  const receiptTrust = new Map<string, ReadonlySet<string>>();
  for (const { rule } of simulationRuleEntries(scenario)) {
    if (
      rule.provenance.basis === "source_derived" &&
      rule.provenance.reviewState === "source_grounded" &&
      rule.provenance.canonStatus === "source_canon"
    ) {
      activeRuleIds.add(rule.id);
      continue;
    }
    const receiptId = rule.provenance.creatorApprovalReceiptId;
    if (
      rule.provenance.reviewState !== "creator_approved" ||
      rule.provenance.canonStatus !== "not_source_canon" ||
      receiptId === null
    ) {
      continue;
    }
    const trustedRuleIds =
      receiptTrust.get(receiptId) ??
      trustedCreatorRuleIdsForReceipt({ scenario, receiptId });
    receiptTrust.set(receiptId, trustedRuleIds);
    if (trustedRuleIds.has(rule.id)) activeRuleIds.add(rule.id);
  }
  return activeRuleIds;
};

const normalizeText = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9._ -]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const intentTokens = (value: string): string[] =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/gu, "'")
    .replace(
      /\b(?:don't|doesn't|didn't|won't|wouldn't|shouldn't|can't|cannot|isn't|aren't)\b/gu,
      " not ",
    )
    .replace(/[,:;.?!]+/gu, " | ")
    .replace(/[^a-z0-9|]+/gu, " ")
    .trim()
    .split(/\s+/gu)
    .filter(Boolean);

const NEGATION_TOKENS = new Set([
  "not",
  "never",
  "no",
  "without",
  "refuse",
  "refuses",
  "refused",
  "refusing",
  "decline",
  "declines",
  "declined",
  "declining",
]);

const phraseStarts = (tokens: string[], phrase: string[]): number[] => {
  if (phrase.length === 0 || phrase.length > tokens.length) return [];
  const starts: number[] = [];
  for (let index = 0; index <= tokens.length - phrase.length; index += 1) {
    if (phrase.every((token, offset) => tokens[index + offset] === token)) {
      starts.push(index);
    }
  }
  return starts;
};

const isNegatedMatch = (tokens: string[], start: number): boolean => {
  const clauseStart = tokens.lastIndexOf("|", start - 1) + 1;
  return tokens
    .slice(Math.max(clauseStart, start - 4), start)
    .some((token) => NEGATION_TOKENS.has(token));
};

const normalizeStatePayload = (
  input: WorldSimulationStatePayload,
): WorldSimulationStatePayload => {
  const parsed = WorldSimulationStatePayloadSchema.parse(input);
  return {
    ...parsed,
    actors: [...parsed.actors].sort(({ entityId: left }, { entityId: right }) =>
      compareIds(left, right),
    ),
    knowledge: [...parsed.knowledge]
      .map((entry) => ({ ...entry, premiseIds: sortedUniqueIds(entry.premiseIds) }))
      .sort(({ entityId: left }, { entityId: right }) => compareIds(left, right)),
    flags: [...parsed.flags].sort(({ id: left }, { id: right }) => compareIds(left, right)),
    clocks: [...parsed.clocks].sort(({ id: left }, { id: right }) => compareIds(left, right)),
    ...(parsed.relationships
      ? {
          relationships: [...parsed.relationships].sort(
            ({ relationshipId: left }, { relationshipId: right }) =>
              compareIds(left, right),
          ),
        }
      : {}),
    firedReactionRuleIds: sortedUniqueIds(parsed.firedReactionRuleIds),
  };
};

const statePayload = (state: WorldSimulationState): WorldSimulationStatePayload => {
  const { stateHash, ...payload } = WorldSimulationStateSchema.parse(state);
  void stateHash;
  return payload;
};

export const buildWorldSimulationState = (
  input: WorldSimulationStatePayload,
): WorldSimulationState => {
  const payload = normalizeStatePayload(input);
  return WorldSimulationStateSchema.parse({
    ...payload,
    stateHash: sha256Canonical(payload),
  });
};

export const hasValidWorldSimulationState = (state: WorldSimulationState): boolean => {
  const parsed = WorldSimulationStateSchema.safeParse(state);
  return (
    parsed.success &&
    sha256Canonical(normalizeStatePayload(statePayload(parsed.data))) === parsed.data.stateHash
  );
};

const initialState = (scenario: WorldSimulationScenario): WorldSimulationState =>
  buildWorldSimulationState({
    scenarioId: scenario.id,
    turn: 0,
    worldTick: 0,
    actors: scenario.actors.map((actor) => ({
      entityId: actor.id,
      zoneId: actor.currentZoneId,
      agendaState: actor.agenda.state,
    })),
    knowledge: scenario.initialPrivateKnowledge.map((entry) => ({
      entityId: entry.entityId,
      premiseIds: entry.premiseIds,
    })),
    flags: scenario.initialFlags,
    clocks: scenario.clocks.map(({ id, initialValue }) => ({ id, value: initialValue })),
    ...(scenario.relationships
      ? {
          relationships: scenario.relationships.map(({ id, initialLevel }) => ({
            relationshipId: id,
            level: initialLevel,
          })),
        }
      : {}),
    ...(scenario.episodeBlueprint
      ? {
          episode: {
            sceneId: scenario.episodeBlueprint.scenes[0]!.id,
            sceneIndex: 0,
          },
        }
      : {}),
    firedReactionRuleIds: [],
    status: "active",
    endingId: null,
  });

export const createWorldSimulationSession = ({
  scenario,
  branchId = "branch.canon",
  campaignId = `campaign.${scenario.id}`,
}: {
  scenario: WorldSimulationScenario;
  branchId?: string;
  campaignId?: string;
}): WorldSimulationSession => {
  const state = initialState(scenario);
  const ledger = createCampaignLedger({
    campaignId,
    branchId,
    parentBranchId: null,
    forkedFromEntryHash: null,
    worldPackId: scenario.id,
    worldPackVersion: WORLD_RUNTIME_VERSION,
    baseCanonHash: sha256Canonical(scenario.premises),
    baseStateHash: state.stateHash,
  });
  return WorldSimulationSessionSchema.parse({
    scenarioId: scenario.id,
    cursor: {
      branchId,
      parentBranchId: null,
      forkedFromReceiptHash: null,
    },
    state,
    turns: [],
    ledger,
  });
};

const receiptPayload = (receipt: WorldTurnReceipt) => {
  const { receiptHash, ...payload } = receipt;
  void receiptHash;
  return WorldTurnReceiptPayloadSchema.parse(payload);
};

export const hasValidWorldSimulationSession = (
  session: WorldSimulationSession,
  scenario: WorldSimulationScenario,
  diagnostics?: string[],
): boolean => {
  const fail = (code: string): false => {
    diagnostics?.push(code);
    return false;
  };
  const parsed = WorldSimulationSessionSchema.safeParse(session);
  const initial = initialState(scenario);
  const activeRuleIds = activeWorldSimulationRuleIds(scenario);
  if (
    !parsed.success ||
    !hasValidWorldSimulationState(parsed.data.state) ||
    !hasValidCampaignLedger(parsed.data.ledger) ||
    parsed.data.scenarioId !== scenario.id ||
    parsed.data.scenarioId !== parsed.data.state.scenarioId ||
    parsed.data.state.turn !== parsed.data.turns.length ||
    parsed.data.ledger.cursor.branchId !== parsed.data.cursor.branchId ||
    parsed.data.ledger.cursor.parentBranchId !== parsed.data.cursor.parentBranchId ||
    (parsed.data.ledger.cursor.campaignId !== `campaign.${scenario.id}` &&
      !parsed.data.ledger.cursor.campaignId.startsWith(
        `campaign.${scenario.id}.`,
      )) ||
    parsed.data.ledger.cursor.worldPackId !== scenario.id ||
    parsed.data.ledger.cursor.worldPackVersion !== WORLD_RUNTIME_VERSION ||
    parsed.data.ledger.cursor.baseCanonHash !== sha256Canonical(scenario.premises) ||
    parsed.data.ledger.cursor.baseStateHash !== initial.stateHash
  ) {
    return fail("authority_header_invalid");
  }

  const childBranch = parsed.data.cursor.parentBranchId !== null;
  const forkEntry = parsed.data.ledger.cursor.forkedFromEntryHash
    ? parsed.data.ledger.entries.find(
        ({ entryHash }) =>
          entryHash === parsed.data.ledger.cursor.forkedFromEntryHash,
      ) ?? null
    : null;
  const expectedForkReceiptHash = forkEntry
    ? parsed.data.turns.find(({ turn }) => turn === forkEntry.worldTick)
        ?.receiptHash ?? null
    : null;
  if (
    (!childBranch &&
      (parsed.data.cursor.forkedFromReceiptHash !== null ||
        parsed.data.ledger.cursor.forkedFromEntryHash !== null)) ||
    (childBranch &&
      parsed.data.cursor.forkedFromReceiptHash !== expectedForkReceiptHash)
  ) {
    return fail("fork_authority_invalid");
  }

  let replayState = initial;
  let ledgerIndex = 0;
  let previousLedgerEntryHash: string | null = null;
  const forkTurn = forkEntry?.worldTick ?? 0;
  for (const [receiptIndex, receipt] of parsed.data.turns.entries()) {
    if (
      receipt.turn !== receiptIndex + 1 ||
      receipt.turnId !== `turn.${receipt.turn}` ||
      receipt.beforeStateHash !== replayState.stateHash ||
      (!childBranch && receipt.branchId !== parsed.data.cursor.branchId) ||
      (childBranch &&
        receipt.turn > forkTurn &&
        receipt.branchId !== parsed.data.cursor.branchId) ||
      sha256Canonical(receiptPayload(receipt)) !== receipt.receiptHash
    ) {
      return fail(`receipt_${receipt.turn}_invalid`);
    }

    const turnPriorState = replayState;
    let playerEntryHash: string | null = null;
    let precedingReactionEntryHash: string | null = null;
    for (const [eventIndex, event] of receipt.events.entries()) {
      if (
        event.source.kind !== "participant" &&
        !activeRuleIds.has(event.source.reactionRuleId)
      ) {
        return fail(`receipt_${receipt.turn}_inactive_rule`);
      }
      const entry = parsed.data.ledger.entries[ledgerIndex];
      if (!entry) return fail(`ledger_entry_${ledgerIndex}_missing`);
      const expectedSource =
        event.source.kind === "participant"
          ? {
              kind: "player" as const,
              actorEntityId: event.source.actorEntityId,
              authorizingIntentId: `intent.${event.eventId}`,
            }
          : event.source.kind === "npc"
            ? {
                kind: "npc" as const,
                actorEntityId: event.source.actorEntityId,
                triggerId: `trigger.${event.eventId}`,
              }
            : {
                kind: "world" as const,
                triggerId: `trigger.${event.eventId}`,
              };
      const expectedTargets =
        event.source.kind === "participant"
          ? receipt.action.targetEntityId
            ? [receipt.action.targetEntityId]
            : []
          : sortedUniqueIds(
              event.effects.flatMap((effect) => {
                switch (effect.kind) {
                  case "grant_knowledge":
                  case "move_actor":
                  case "set_agenda_state":
                    return [effect.entityId];
                  case "set_flag":
                  case "advance_clock":
                    return [];
                  case "adjust_relationship": {
                    const relationship = scenario.relationships?.find(
                      ({ id }) => id === effect.relationshipId,
                    );
                    return relationship
                      ? [relationship.subjectEntityId, relationship.objectEntityId]
                      : [];
                  }
                }
              }),
            );
      const expectedCauses = sortedUniqueIds(
        eventIndex === 0
          ? previousLedgerEntryHash
            ? [previousLedgerEntryHash]
            : []
          : [
              ...(playerEntryHash ? [playerEntryHash] : []),
              ...(precedingReactionEntryHash
                ? [precedingReactionEntryHash]
                : []),
            ],
      );
      const expectedEffects = causalEffects({
        scenario,
        event,
        turn: receipt.turn,
        priorState: turnPriorState,
        focalEntityId: scenario.focalParticipantEntityId,
      });
      const entryChecks: Array<[string, boolean]> = [
        ["id", entry.id === `campaign.${event.eventId}`],
        ["tick", entry.worldTick === receipt.turn],
        ["action", entry.actionTypeId === event.actionId],
        [
          "source",
          sha256Canonical(entry.source) === sha256Canonical(expectedSource),
        ],
        [
          "targets",
          sha256Canonical(entry.targetEntityIds) ===
            sha256Canonical(expectedTargets),
        ],
        [
          "causes",
          sha256Canonical(entry.causeEntryHashes) ===
            sha256Canonical(expectedCauses),
        ],
        [
          "effects",
          sha256Canonical(entry.effects) === sha256Canonical(expectedEffects),
        ],
      ];
      const failedEntryCheck = entryChecks.find(([, valid]) => !valid);
      if (failedEntryCheck) {
        return fail(
          `ledger_entry_${ledgerIndex}_${failedEntryCheck[0]}_mismatch`,
        );
      }
      if (eventIndex === 0) playerEntryHash = entry.entryHash;
      else precedingReactionEntryHash = entry.entryHash;
      previousLedgerEntryHash = entry.entryHash;
      ledgerIndex += 1;
      replayState = applyReactionEffects({
        scenario,
        state: replayState,
        effects: event.effects,
      });
    }

    replayState = buildWorldSimulationState({
      ...statePayload(replayState),
      turn: receipt.turn,
      worldTick: turnPriorState.worldTick + 1,
      firedReactionRuleIds: sortedUniqueIds([
        ...replayState.firedReactionRuleIds,
        ...receipt.firedReactionRuleIds.filter(
          (ruleId) =>
            activeRuleIds.has(ruleId) &&
            scenario.reactionRules.find(({ id }) => id === ruleId)?.once ===
            true,
        ),
      ]),
    });
    const replayEpisode = advanceEpisodeState({
      scenario,
      state: replayState,
      accepted: receipt.action.status === "accepted",
    });
    replayState = replayEpisode.state;
    if (
      sha256Canonical(receipt.sceneTransition ?? null) !==
      sha256Canonical(replayEpisode.transition)
    ) {
      return fail(`receipt_${receipt.turn}_scene_transition_mismatch`);
    }
    const expectedEnding = pickEnding({
      scenario,
      state: replayState,
      action: receipt.action,
      turn: receipt.turn,
    });
    if (receipt.endingId !== (expectedEnding?.id ?? null)) {
      return fail(`receipt_${receipt.turn}_ending_mismatch`);
    }
    if (expectedEnding) {
      replayState = buildWorldSimulationState({
        ...statePayload(replayState),
        status: "complete",
        endingId: expectedEnding.id,
      });
    }
    if (receipt.afterStateHash !== replayState.stateHash) {
      return fail(`receipt_${receipt.turn}_state_mismatch`);
    }
  }
  const valid =
    ledgerIndex === parsed.data.ledger.entries.length &&
    replayState.stateHash === parsed.data.state.stateHash;
  return valid ? true : fail("session_tail_mismatch");
};

export const forkWorldSimulationSession = ({
  scenario,
  session,
  childBranchId,
  existingBranchIds,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  childBranchId: string;
  existingBranchIds: ReadonlySet<string>;
}): WorldSimulationSession => {
  if (!hasValidWorldSimulationSession(session, scenario)) {
    throw new Error("Cannot fork an invalid world simulation session.");
  }
  const ledger = forkCampaignLedger({
    ledger: session.ledger,
    childBranchId,
    existingBranchIds,
  });
  return WorldSimulationSessionSchema.parse({
    ...session,
    cursor: {
      branchId: childBranchId,
      parentBranchId: session.cursor.branchId,
      forkedFromReceiptHash: session.turns.at(-1)?.receiptHash ?? null,
    },
    ledger,
  });
};

const actorAliases = (scenario: WorldSimulationScenario, entityId: string): string[] => {
  const actor = scenario.actors.find(({ id }) => id === entityId);
  return actor
    ? sortedUniqueIds([
        normalizeText(actor.name),
        normalizeText(actor.id),
        normalizeText(actor.id.split(".").at(-1) ?? actor.id),
      ])
    : [];
};

const actionAliasMatches = (input: string, action: ActionDefinition): string[] => {
  const tokens = intentTokens(input);
  return action.verbAliases.filter((alias) => {
    const phrase = intentTokens(alias);
    return phraseStarts(tokens, phrase).some(
      (start) => !isNegatedMatch(tokens, start),
    );
  });
};

export const resolveWorldAction = ({
  scenario,
  input,
}: {
  scenario: WorldSimulationScenario;
  input: string;
}): ResolvedWorldAction => {
  const rawInput = input.trim();
  const normalizedInput = normalizeText(rawInput);
  const actorEntityId = scenario.focalParticipantEntityId;
  const unsupported = (reason: string): ResolvedWorldAction =>
    ResolvedWorldActionSchema.parse({
      status: "unsupported",
      rawInput,
      normalizedInput,
      actionId: null,
      actorEntityId,
      targetEntityId: null,
      targetZoneId: null,
      reason,
    });

  if (!normalizedInput) return unsupported("The action contains no resolvable words.");

  const candidates = scenario.actions
    .filter(
      (action) =>
        action.actorMode === "participant" &&
        action.allowedActorEntityIds.includes(actorEntityId),
    )
    .map((action) => {
      const aliases = actionAliasMatches(rawInput, action);
      return {
        action,
        score: Math.max(0, ...aliases.map((alias) => alias.length)),
      };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || compareIds(left.action.id, right.action.id),
    );

  const best = candidates[0];
  if (!best) return unsupported("No registered world action matches this intent.");
  if (candidates.length > 1) {
    return unsupported("The input names more than one world action; resolve one action per turn.");
  }

  const action = best.action;
  let targetEntityId: string | null = null;
  let targetZoneId: string | null = null;
  if (action.targetMode === "self") {
    targetEntityId = actorEntityId;
  } else if (action.targetMode === "entity") {
    const explicitTargets = action.allowedTargetEntityIds.filter((entityId) =>
      actorAliases(scenario, entityId).some((alias) => normalizedInput.includes(alias)),
    );
    if (explicitTargets.length > 1) {
      return unsupported("The action addresses more than one possible target.");
    }
    targetEntityId =
      explicitTargets[0] ??
      (action.allowedTargetEntityIds.length === 1
        ? action.allowedTargetEntityIds[0] ?? null
        : null);
    if (!targetEntityId) return unsupported("The action requires a named target.");
  } else if (action.targetMode === "zone") {
    const explicitZones = action.allowedZoneIds.filter((zoneId) => {
      const zone = scenario.zones.find(({ id }) => id === zoneId);
      const aliases = [zoneId, zone?.name ?? "", zoneId.split(".").at(-1) ?? ""]
        .map(normalizeText)
        .filter(Boolean);
      return aliases.some((alias) => normalizedInput.includes(alias));
    });
    targetZoneId =
      explicitZones[0] ??
      (action.allowedZoneIds.length === 1 ? action.allowedZoneIds[0] ?? null : null);
    if (!targetZoneId || explicitZones.length > 1) {
      return unsupported("The action requires one reachable named zone.");
    }
  }

  return ResolvedWorldActionSchema.parse({
    status: "accepted",
    rawInput,
    normalizedInput,
    actionId: action.id,
    actorEntityId,
    targetEntityId,
    targetZoneId,
    reason: action.worldMeaning,
  });
};

const hasKnowledge = (
  state: WorldSimulationState,
  entityId: string,
  premiseId: string,
): boolean =>
  state.knowledge
    .find((entry) => entry.entityId === entityId)
    ?.premiseIds.includes(premiseId) ?? false;

const conditionMatches = ({
  condition,
  state,
  action,
  turn,
}: {
  condition: ReactionCondition;
  state: WorldSimulationState;
  action: ResolvedWorldAction;
  turn: number;
}): boolean => {
  switch (condition.kind) {
    case "action_observed":
      return (
        action.status === "accepted" &&
        action.actionId === condition.actionId &&
        (condition.actorEntityId === null || condition.actorEntityId === action.actorEntityId)
      );
    case "premise_known":
      return hasKnowledge(state, condition.entityId, condition.premiseId) === condition.expected;
    case "flag_equals":
      return state.flags.find(({ id }) => id === condition.flagId)?.value === condition.value;
    case "clock_at_least":
      return (state.clocks.find(({ id }) => id === condition.clockId)?.value ?? -1) >= condition.value;
    case "actor_in_zone":
      return state.actors.find(({ entityId }) => entityId === condition.entityId)?.zoneId === condition.zoneId;
    case "turn_at_least":
      return turn >= condition.turn;
    case "scene_is":
      return state.episode?.sceneId === condition.sceneId;
  }
};

const allConditionsMatch = ({
  conditions,
  state,
  action,
  turn,
}: {
  conditions: ReactionCondition[];
  state: WorldSimulationState;
  action: ResolvedWorldAction;
  turn: number;
}): boolean => conditions.every((condition) => conditionMatches({ condition, state, action, turn }));

const applyReactionEffects = ({
  scenario,
  state,
  effects,
}: {
  scenario: WorldSimulationScenario;
  state: WorldSimulationState;
  effects: ReactionEffect[];
}): WorldSimulationState => {
  const payload = structuredClone(statePayload(state));
  for (const effect of effects) {
    switch (effect.kind) {
      case "grant_knowledge": {
        let entry = payload.knowledge.find(({ entityId }) => entityId === effect.entityId);
        if (!entry) {
          entry = { entityId: effect.entityId, premiseIds: [] };
          payload.knowledge.push(entry);
        }
        entry.premiseIds = sortedUniqueIds([...entry.premiseIds, effect.premiseId]);
        break;
      }
      case "set_flag": {
        const flag = payload.flags.find(({ id }) => id === effect.flagId);
        if (flag) flag.value = effect.value;
        else payload.flags.push({ id: effect.flagId, value: effect.value });
        break;
      }
      case "advance_clock": {
        const clock = payload.clocks.find(({ id }) => id === effect.clockId);
        const definition = scenario.clocks.find(({ id }) => id === effect.clockId);
        if (!clock || !definition) throw new Error(`Unknown world clock ${effect.clockId}.`);
        clock.value = Math.min(definition.maxValue, clock.value + effect.delta);
        break;
      }
      case "move_actor": {
        const actor = payload.actors.find(({ entityId }) => entityId === effect.entityId);
        if (!actor) throw new Error(`Unknown runtime actor ${effect.entityId}.`);
        actor.zoneId = effect.toZoneId;
        break;
      }
      case "set_agenda_state": {
        const actor = payload.actors.find(({ entityId }) => entityId === effect.entityId);
        if (!actor) throw new Error(`Unknown runtime actor ${effect.entityId}.`);
        actor.agendaState = effect.state;
        break;
      }
      case "adjust_relationship": {
        const relationship = payload.relationships?.find(
          ({ relationshipId }) => relationshipId === effect.relationshipId,
        );
        const definition = scenario.relationships?.find(
          ({ id }) => id === effect.relationshipId,
        );
        if (!relationship || !definition) {
          throw new Error(`Unknown runtime relationship ${effect.relationshipId}.`);
        }
        relationship.level = Math.max(
          definition.minLevel,
          Math.min(definition.maxLevel, relationship.level + effect.delta),
        );
        break;
      }
    }
  }
  return buildWorldSimulationState(payload);
};

const advanceEpisodeState = ({
  scenario,
  state,
  accepted,
}: {
  scenario: WorldSimulationScenario;
  state: WorldSimulationState;
  accepted: boolean;
}): {
  state: WorldSimulationState;
  transition: NonNullable<WorldTurnReceipt["sceneTransition"]> | null;
} => {
  const blueprint = scenario.episodeBlueprint;
  const episode = state.episode;
  if (!accepted || !blueprint || !episode) return { state, transition: null };
  const nextIndex = Math.min(episode.sceneIndex + 1, blueprint.scenes.length - 1);
  if (nextIndex === episode.sceneIndex) return { state, transition: null };
  const nextScene = blueprint.scenes[nextIndex]!;
  return {
    state: buildWorldSimulationState({
      ...statePayload(state),
      episode: { sceneId: nextScene.id, sceneIndex: nextIndex },
    }),
    transition: {
      fromSceneId: episode.sceneId,
      toSceneId: nextScene.id,
      fromSceneIndex: episode.sceneIndex,
      toSceneIndex: nextIndex,
    },
  };
};

const pickEnding = ({
  scenario,
  state,
  action,
  turn,
}: {
  scenario: WorldSimulationScenario;
  state: WorldSimulationState;
  action: ResolvedWorldAction;
  turn: number;
}): EndingRule | null => {
  const activeRuleIds = activeWorldSimulationRuleIds(scenario);
  const matches = scenario.endingRules
    .filter(
      (ending) =>
        activeRuleIds.has(ending.id) &&
        allConditionsMatch({
          conditions: ending.conditions,
          state,
          action,
          turn,
        }),
    )
    .sort((left, right) => right.priority - left.priority || compareIds(left.id, right.id));
  if (matches[0]) return matches[0];
  if (turn >= scenario.maxTurns) {
    return (
      scenario.endingRules.find(
        ({ id, kind }) => kind === "timeout" && activeRuleIds.has(id),
      ) ?? null
    );
  }
  return null;
};

const reactionPremiseIds = (rule: ReactionRule): string[] =>
  sortedUniqueIds([
    ...rule.conditions.flatMap((condition) =>
      condition.kind === "premise_known" ? [condition.premiseId] : [],
    ),
    ...rule.effects.flatMap((effect) =>
      effect.kind === "grant_knowledge" ? [effect.premiseId] : [],
    ),
  ]);

const causalEffects = ({
  scenario,
  event,
  turn,
  priorState,
  focalEntityId,
}: {
  scenario: WorldSimulationScenario;
  event: WorldSimulationEvent;
  turn: number;
  priorState: WorldSimulationState;
  focalEntityId: string;
}): CausalEffect[] => {
  if (event.effects.length === 0) {
    return [
      {
        effectId: `effect.turn_${turn}.${event.actionId}.observed`,
        kind: "flag_set",
        entityId:
          event.source.kind === "world"
            ? focalEntityId
            : event.source.actorEntityId,
        flagId: `action_observed.turn_${turn}.${event.actionId}`,
        value: true,
      },
    ];
  }
  return event.effects.flatMap((effect, index): CausalEffect[] => {
    const effectId = `effect.turn_${turn}.${event.eventId}.${index}`;
    switch (effect.kind) {
      case "grant_knowledge":
        return [{ effectId, kind: "knowledge_grant", entityId: effect.entityId, claimId: effect.premiseId }];
      case "set_flag":
        return [{
          effectId,
          kind: "flag_set",
          entityId:
            event.source.kind === "npc"
              ? event.source.actorEntityId
              : focalEntityId,
          flagId: effect.flagId,
          value: effect.value,
        }];
      case "advance_clock":
        return [{ effectId, kind: "clock_delta", clockId: effect.clockId, delta: effect.delta }];
      case "move_actor": {
        const from = priorState.actors.find(({ entityId }) => entityId === effect.entityId)?.zoneId;
        return [
          ...(from
            ? [{ effectId: `${effectId}.from`, kind: "flag_set" as const, entityId: effect.entityId, flagId: `actor_at.${effect.entityId}.${from}`, value: false }]
            : []),
          { effectId: `${effectId}.to`, kind: "flag_set", entityId: effect.entityId, flagId: `actor_at.${effect.entityId}.${effect.toZoneId}`, value: true },
        ];
      }
      case "set_agenda_state":
        return [{ effectId, kind: "flag_set", entityId: effect.entityId, flagId: `agenda.${effect.entityId}.${effect.state}`, value: true }];
      case "adjust_relationship": {
        const relationship = scenario.relationships?.find(
          ({ id }) => id === effect.relationshipId,
        );
        if (!relationship) return [];
        return [{
          effectId,
          kind: "relation_delta",
          subjectEntityId: relationship.subjectEntityId,
          objectEntityId: relationship.objectEntityId,
          axisId: relationship.axisId,
          delta: effect.delta,
        }];
      }
    }
  });
};

const appendWorldEvent = ({
  scenario,
  ledger,
  event,
  turn,
  causeEntryHashes,
  priorState,
  targetEntityIds,
}: {
  scenario: WorldSimulationScenario;
  ledger: CampaignLedger;
  event: WorldSimulationEvent;
  turn: number;
  causeEntryHashes: string[];
  priorState: WorldSimulationState;
  targetEntityIds: string[];
}): { ledger: CampaignLedger; entryHash: string } => {
  const effects = causalEffects({
    scenario,
    event,
    turn,
    priorState,
    focalEntityId: scenario.focalParticipantEntityId,
  });
  const reactionRuleId =
    event.source.kind === "participant" ? null : event.source.reactionRuleId;
  const activeRuleIds = activeWorldSimulationRuleIds(scenario);
  const reactionRule = reactionRuleId
    ? scenario.reactionRules.find(
        ({ id }) => id === reactionRuleId && activeRuleIds.has(id),
      ) ?? null
    : null;
  const sourceReceiptId =
    event.source.kind === "participant"
      ? `intent.${event.eventId}`
      : `trigger.${event.eventId}`;
  const input: CampaignEventInput = {
    id: `campaign.${event.eventId}`,
    baseCursorHash: ledger.cursor.cursorHash,
    worldTick: turn,
    source:
      event.source.kind === "participant"
        ? {
            kind: "player",
            actorEntityId: event.source.actorEntityId,
            authorizingIntentId: sourceReceiptId,
          }
        : event.source.kind === "npc"
          ? {
              kind: "npc",
              actorEntityId: event.source.actorEntityId,
              triggerId: sourceReceiptId,
            }
          : { kind: "world", triggerId: sourceReceiptId },
    actionTypeId: event.actionId,
    targetEntityIds,
    scope: "scene",
    visibility:
      event.visibleToEntityIds.length > 0
        ? { scope: "entities", entityIds: event.visibleToEntityIds }
        : { scope: "facilitator", entityIds: [] },
    causeEntryHashes,
    evidenceClaimIds: reactionRule ? reactionPremiseIds(reactionRule) : [],
    evidenceRuleIds: reactionRule ? [reactionRule.id] : [],
    traceIds: [`trace.turn_${turn}`],
    reversibility: "reversible",
    irreversibleRuling: null,
    effects,
    beforeStateHash: ledger.cursor.currentStateHash,
    afterStateHash: ledger.cursor.currentStateHash,
    transitionReceiptHash: null,
  };
  const authorityHash = buildCampaignEventAuthorityHash(input);
  const flagIds = effects.flatMap((effect) => (effect.kind === "flag_set" ? [effect.flagId] : []));
  const result = appendCampaignEvent({
    ledger,
    event: input,
    knownEntityIds: new Set(scenario.actors.map(({ id }) => id)),
    activeClaimIds: new Set(scenario.premises.map(({ id }) => id)),
    activeRuleIds: new Set(
      scenario.reactionRules
        .filter(({ id }) => activeRuleIds.has(id))
        .map(({ id }) => id),
    ),
    activeActionTypeIds: new Set([
      ...scenario.actions.map(({ id }) => id),
      "action.unsupported",
      event.actionId,
    ]),
    activeRelationAxisIds: new Set(
      scenario.relationships?.map(({ axisId }) => axisId) ?? [],
    ),
    activeResourceIds: new Set(),
    activeFlagIds: new Set([...scenario.initialFlags.map(({ id }) => id), ...flagIds]),
    activeClockIds: new Set(scenario.clocks.map(({ id }) => id)),
    activeDebtKindIds: new Set(),
    authorizedIntentReceipts:
      event.source.kind === "participant"
        ? new Map([[sourceReceiptId, authorityHash]])
        : new Map(),
    activeTriggerReceipts:
      event.source.kind === "participant"
        ? new Map()
        : new Map([[sourceReceiptId, authorityHash]]),
    approvedRulingReceipts: new Map(),
  });
  if (result.status !== "applied" || !result.entry) {
    throw new Error(
      `World event ${event.eventId} failed causal append: ${result.violations
        .map(({ code }) => code)
        .join(", ")}`,
    );
  }
  return { ledger: result.ledger, entryHash: result.entry.entryHash };
};

export const runWorldSimulationTurn = ({
  scenario,
  session,
  input,
  creatorDirection: creatorDirectionInput = null,
}: {
  scenario: WorldSimulationScenario;
  session: WorldSimulationSession;
  input: string;
  creatorDirection?: CreatorWorldDirectionReceipt | null;
}): { session: WorldSimulationSession; receipt: WorldTurnReceipt } => {
  if (!hasValidWorldSimulationSession(session, scenario)) {
    throw new Error("World simulation authority is invalid or targets another scenario.");
  }
  if (session.state.status === "complete" || session.state.turn >= scenario.maxTurns) {
    throw new Error("The bounded world simulation session is already complete.");
  }

  const turn = session.state.turn + 1;
  const activeRuleIds = activeWorldSimulationRuleIds(scenario);
  const action = resolveWorldAction({ scenario, input });
  const creatorDirection = creatorDirectionInput
    ? CreatorWorldDirectionReceiptSchema.parse(creatorDirectionInput)
    : null;
  if (
    creatorDirection &&
    (action.status !== "accepted" ||
      creatorDirection.registeredActionId !== action.actionId)
  ) {
    throw new Error(
      "The creator direction receipt does not match the registered world action.",
    );
  }
  const actionDefinition =
    action.status === "accepted"
      ? scenario.actions.find(({ id }) => id === action.actionId)
      : null;
  const playerEvent: WorldSimulationEvent = {
    eventId: `event.turn_${turn}.participant`,
    source: { kind: "participant", actorEntityId: scenario.focalParticipantEntityId },
    actionId: action.actionId ?? "action.unsupported",
    summary:
      action.status === "accepted"
        ? actionDefinition?.summary ?? action.reason
        : "The attempted intervention finds no answer in the scene; no one carries it out, and the moment passes without advantage.",
    effects: [],
    visibleToEntityIds: [scenario.focalParticipantEntityId],
  };

  let workingState = session.state;
  const events: WorldSimulationEvent[] = [playerEvent];
  const selectedRuleIds = new Set<string>();
  while (selectedRuleIds.size < scenario.maxReactionsPerTurn) {
    const next = scenario.reactionRules
      .filter(
        (rule) =>
          activeRuleIds.has(rule.id) &&
          !selectedRuleIds.has(rule.id) &&
          workingState.actors.find(({ entityId }) => entityId === rule.actorEntityId)
            ?.agendaState === "active" &&
          (!rule.once || !workingState.firedReactionRuleIds.includes(rule.id)) &&
          allConditionsMatch({ conditions: rule.conditions, state: workingState, action, turn }),
      )
      .sort((left, right) => {
        const rulePriority = right.priority - left.priority;
        if (rulePriority !== 0) return rulePriority;
        const leftAgendaPriority =
          scenario.actors.find(({ id }) => id === left.actorEntityId)?.agenda
            .priority ?? 0;
        const rightAgendaPriority =
          scenario.actors.find(({ id }) => id === right.actorEntityId)?.agenda
            .priority ?? 0;
        return (
          rightAgendaPriority - leftAgendaPriority ||
          compareIds(left.id, right.id)
        );
      })[0];
    if (!next) break;
    workingState = applyReactionEffects({
      scenario,
      state: workingState,
      effects: next.effects,
    });
    selectedRuleIds.add(next.id);
    if (next.once) {
      workingState = buildWorldSimulationState({
        ...statePayload(workingState),
        firedReactionRuleIds: [
          ...workingState.firedReactionRuleIds,
          next.id,
        ],
      });
    }
    events.push({
      eventId: `event.turn_${turn}.reaction.${next.id}`,
      source: {
        kind: "npc",
        actorEntityId: next.actorEntityId,
        reactionRuleId: next.id,
      },
      actionId: next.actionId,
      summary: next.observableSummary ?? next.summary,
      effects: next.effects,
      visibleToEntityIds:
        next.observableSummary === null
          ? []
          : [scenario.focalParticipantEntityId],
    });
  }

  workingState = buildWorldSimulationState({
    ...statePayload(workingState),
    turn,
    worldTick: session.state.worldTick + 1,
  });
  const episodeAdvance = advanceEpisodeState({
    scenario,
    state: workingState,
    accepted: action.status === "accepted",
  });
  workingState = episodeAdvance.state;
  const ending = pickEnding({ scenario, state: workingState, action, turn });
  if (ending) {
    workingState = buildWorldSimulationState({
      ...statePayload(workingState),
      status: "complete",
      endingId: ending.id,
    });
  }

  let ledger = session.ledger;
  const playerAppend = appendWorldEvent({
    scenario,
    ledger,
    event: playerEvent,
    turn,
    causeEntryHashes: ledger.cursor.headEntryHash ? [ledger.cursor.headEntryHash] : [],
    priorState: session.state,
    targetEntityIds: action.targetEntityId ? [action.targetEntityId] : [],
  });
  ledger = playerAppend.ledger;
  let precedingReactionEntryHash: string | null = null;
  for (const event of events.slice(1)) {
    const appended = appendWorldEvent({
      scenario,
      ledger,
      event,
      turn,
      causeEntryHashes: [
        playerAppend.entryHash,
        ...(precedingReactionEntryHash ? [precedingReactionEntryHash] : []),
      ],
      priorState: session.state,
      targetEntityIds: sortedUniqueIds(
        event.effects.flatMap((effect) => {
          switch (effect.kind) {
            case "grant_knowledge":
            case "move_actor":
            case "set_agenda_state":
              return [effect.entityId];
            case "set_flag":
            case "advance_clock":
              return [];
            case "adjust_relationship": {
              const relationship = scenario.relationships?.find(
                ({ id }) => id === effect.relationshipId,
              );
              return relationship
                ? [relationship.subjectEntityId, relationship.objectEntityId]
                : [];
            }
          }
        }),
      ),
    });
    ledger = appended.ledger;
    precedingReactionEntryHash = appended.entryHash;
  }

  const receiptPayloadValue = WorldTurnReceiptPayloadSchema.parse({
    turnId: `turn.${turn}`,
    branchId: session.cursor.branchId,
    turn,
    beforeStateHash: session.state.stateHash,
    afterStateHash: workingState.stateHash,
    action,
    creatorDirection,
    events,
    firedReactionRuleIds: [...selectedRuleIds].sort(compareIds),
    endingId: ending?.id ?? null,
    ...(scenario.episodeBlueprint
      ? { sceneTransition: episodeAdvance.transition }
      : {}),
  });
  const receipt = WorldTurnReceiptSchema.parse({
    ...receiptPayloadValue,
    receiptHash: sha256Canonical(receiptPayloadValue),
  });
  const nextSession = WorldSimulationSessionSchema.parse({
    ...session,
    state: workingState,
    turns: [...session.turns, receipt],
    ledger,
  });
  const diagnostics: string[] = [];
  if (!hasValidWorldSimulationSession(nextSession, scenario, diagnostics)) {
    throw new Error(
      `The world simulation produced an invalid session receipt chain: ${diagnostics[0] ?? "unknown"}.`,
    );
  }
  return { session: nextSession, receipt };
};

export const worldActionCandidates = ({
  scenario,
}: {
  scenario: WorldSimulationScenario;
}): WorldActionCandidate[] => {
  const actorId = scenario.focalParticipantEntityId;
  return scenario.actions
    .filter(
      (action) =>
        action.actorMode === "participant" && action.allowedActorEntityIds.includes(actorId),
    )
    .map((action) => {
      const verb = action.verbAliases[0] ?? action.label;
      const targetEntityId = action.allowedTargetEntityIds[0] ?? null;
      const targetZoneId = action.allowedZoneIds[0] ?? null;
      const targetName = targetEntityId
        ? scenario.actors.find(({ id }) => id === targetEntityId)?.participantLabel ?? targetEntityId
        : targetZoneId
          ? scenario.zones.find(({ id }) => id === targetZoneId)?.name ?? targetZoneId
          : null;
      return {
        actionId: action.id,
        label: action.label,
        suggestedInput:
          targetName && !normalizeText(verb).includes(normalizeText(targetName))
            ? `${verb} ${targetName}`
            : verb,
        targetEntityId,
        targetZoneId,
      };
    });
};

export const focalPremiseIds = (
  session: WorldSimulationSession,
  focalEntityId: string,
): string[] =>
  session.state.knowledge.find(({ entityId }) => entityId === focalEntityId)?.premiseIds ?? [];

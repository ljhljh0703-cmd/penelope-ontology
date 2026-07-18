import {
  CampaignCursorPayloadSchema,
  CampaignCursorSchema,
  CampaignEventInputSchema,
  CampaignLedgerSchema,
  CausalLedgerEntrySchema,
  MAX_CAMPAIGN_LEDGER_ENTRIES,
  type CampaignCursor,
  type CampaignCursorPayload,
  type CampaignEventInput,
  type CampaignLedger,
  type CampaignLedgerViolation,
  type CausalEffect,
  type CausalLedgerEntry,
} from "@/src/contracts/campaign";
import type {
  CandidateAction,
  SimulationScenario,
  SimulationSnapshot,
} from "@/src/contracts/simulation";
import { sha256Canonical, sortedUniqueIds } from "@/src/domain/canonical-json";
import { applySimulationAction } from "@/src/domain/simulation";

const compareIds = (left: string, right: string): number => left.localeCompare(right);

const normalizeEffect = (effect: CausalEffect): CausalEffect => ({ ...effect });

const normalizeEventInput = (input: CampaignEventInput): CampaignEventInput => {
  const parsed = CampaignEventInputSchema.parse(input);
  return CampaignEventInputSchema.parse({
    ...parsed,
    targetEntityIds: sortedUniqueIds(parsed.targetEntityIds),
    visibility:
      parsed.visibility.scope === "entities"
        ? { ...parsed.visibility, entityIds: sortedUniqueIds(parsed.visibility.entityIds) }
        : parsed.visibility,
    causeEntryHashes: sortedUniqueIds(parsed.causeEntryHashes),
    evidenceClaimIds: sortedUniqueIds(parsed.evidenceClaimIds),
    evidenceRuleIds: sortedUniqueIds(parsed.evidenceRuleIds),
    traceIds: sortedUniqueIds(parsed.traceIds),
    effects: parsed.effects
      .map(normalizeEffect)
      .sort(({ effectId: left }, { effectId: right }) => compareIds(left, right)),
  });
};

/** Exact, branch-head-bound identity used by one-shot intent/trigger/ruling receipts. */
export const buildCampaignEventAuthorityHash = (input: CampaignEventInput): string =>
  sha256Canonical(normalizeEventInput(input));

const cursorPayload = (cursor: CampaignCursor): CampaignCursorPayload => ({
  campaignId: cursor.campaignId,
  branchId: cursor.branchId,
  parentBranchId: cursor.parentBranchId,
  forkedFromEntryHash: cursor.forkedFromEntryHash,
  worldPackId: cursor.worldPackId,
  worldPackVersion: cursor.worldPackVersion,
  baseCanonHash: cursor.baseCanonHash,
  baseStateHash: cursor.baseStateHash,
  currentStateHash: cursor.currentStateHash,
  headEntryHash: cursor.headEntryHash,
  entryCount: cursor.entryCount,
});

export const buildCampaignCursor = (input: CampaignCursorPayload): CampaignCursor => {
  const payload = CampaignCursorPayloadSchema.parse(input);
  return CampaignCursorSchema.parse({
    ...payload,
    cursorHash: sha256Canonical(payload),
  });
};

export type CreateCampaignLedgerInput = Omit<
  CampaignCursorPayload,
  "currentStateHash" | "headEntryHash" | "entryCount"
>;

export const createCampaignLedger = (input: CreateCampaignLedgerInput): CampaignLedger => {
  const cursor = buildCampaignCursor({
    ...input,
    currentStateHash: input.baseStateHash,
    headEntryHash: null,
    entryCount: 0,
  });
  return CampaignLedgerSchema.parse({ cursor, entries: [] });
};

const entryPayload = (entry: CausalLedgerEntry) => {
  const { entryHash, ...payload } = entry;
  void entryHash;
  return payload;
};

const buildLedgerEntry = ({
  input,
  sequence,
  previousEntryHash,
}: {
  input: CampaignEventInput;
  sequence: number;
  previousEntryHash: string | null;
}): CausalLedgerEntry => {
  const normalized = normalizeEventInput(input);
  const payload = {
    ...normalized,
    sequence,
    previousEntryHash,
  };
  return CausalLedgerEntrySchema.parse({
    ...payload,
    entryHash: sha256Canonical(payload),
  });
};

const rebuildCursorAfterEntry = (
  previous: CampaignCursor,
  entry: CausalLedgerEntry,
): CampaignCursor =>
  buildCampaignCursor({
    ...cursorPayload(previous),
    currentStateHash: entry.afterStateHash,
    headEntryHash: entry.entryHash,
    entryCount: previous.entryCount + 1,
  });

export type ForkCampaignLedgerInput = {
  ledger: CampaignLedger;
  childBranchId: string;
  existingBranchIds: ReadonlySet<string>;
};

/**
 * Forks the current branch head without mutating the parent ledger.
 *
 * Inherited entries retain their exact hashes and receipt-bound payloads. The
 * parent head hash marks the immutable inherited prefix; only events appended
 * after the fork bind to the child cursor.
 */
export const forkCampaignLedger = ({
  ledger,
  childBranchId,
  existingBranchIds,
}: ForkCampaignLedgerInput): CampaignLedger => {
  const parsed = CampaignLedgerSchema.safeParse(ledger);
  if (!parsed.success || !verifyParsedCampaignLedgerIntegrity(parsed.data)) {
    throw new Error("Cannot fork an invalid campaign ledger.");
  }

  const parent = parsed.data;
  if (childBranchId === parent.cursor.branchId) {
    throw new Error("A child campaign branch must have a new branch identifier.");
  }
  if (existingBranchIds.has(childBranchId)) {
    throw new Error(`Campaign branch ${childBranchId} already exists.`);
  }

  const childCursor = buildCampaignCursor({
    campaignId: parent.cursor.campaignId,
    branchId: childBranchId,
    parentBranchId: parent.cursor.branchId,
    forkedFromEntryHash: parent.cursor.headEntryHash,
    worldPackId: parent.cursor.worldPackId,
    worldPackVersion: parent.cursor.worldPackVersion,
    baseCanonHash: parent.cursor.baseCanonHash,
    baseStateHash: parent.cursor.baseStateHash,
    currentStateHash: parent.cursor.currentStateHash,
    headEntryHash: parent.cursor.headEntryHash,
    entryCount: parent.cursor.entryCount,
  });

  return CampaignLedgerSchema.parse({ cursor: childCursor, entries: parent.entries });
};

/** Fast integrity check for an object already parsed by CampaignLedgerSchema. */
export const verifyParsedCampaignLedgerIntegrity = (ledger: CampaignLedger): boolean => {
  try {
    if (
      ledger.cursor.parentBranchId === ledger.cursor.branchId ||
      (ledger.cursor.parentBranchId === null && ledger.cursor.forkedFromEntryHash !== null)
    ) {
      return false;
    }
    const inheritedHeadIndex =
      ledger.cursor.forkedFromEntryHash === null
        ? -1
        : ledger.entries.findIndex(
            ({ entryHash }) => entryHash === ledger.cursor.forkedFromEntryHash,
          );
    if (ledger.cursor.forkedFromEntryHash !== null && inheritedHeadIndex < 0) {
      return false;
    }
    const inheritedEntryCount = inheritedHeadIndex + 1;
    if (
      ledger.entries.length > MAX_CAMPAIGN_LEDGER_ENTRIES ||
      ledger.cursor.entryCount !== ledger.entries.length ||
      ledger.cursor.headEntryHash !== (ledger.entries.at(-1)?.entryHash ?? null)
    ) {
      return false;
    }

    let cursor = buildCampaignCursor({
      campaignId: ledger.cursor.campaignId,
      branchId: ledger.cursor.branchId,
      parentBranchId: ledger.cursor.parentBranchId,
      forkedFromEntryHash: ledger.cursor.forkedFromEntryHash,
      worldPackId: ledger.cursor.worldPackId,
      worldPackVersion: ledger.cursor.worldPackVersion,
      baseCanonHash: ledger.cursor.baseCanonHash,
      baseStateHash: ledger.cursor.baseStateHash,
      currentStateHash: ledger.cursor.baseStateHash,
      headEntryHash: null,
      entryCount: 0,
    });

    const knownEntryIds = new Set<string>();
    const knownEntryHashes = new Set<string>();
    const knownEffectIds = new Set<string>();
    const openDebtIds = new Set<string>();
    const knownVariableValues = new Map<string, string>();
    const consumedSourceReceiptIds = new Set<string>();
    const consumedRulingReceiptIds = new Set<string>();
    let previousWorldTick = -1;
    for (const [index, entry] of ledger.entries.entries()) {
      const inheritedFromParent = index < inheritedEntryCount;
      const stateTransitions = entry.effects.filter(
        (effect): effect is Extract<CausalEffect, { kind: "state_transition" }> =>
          effect.kind === "state_transition",
      );
      const localEffectIds = new Set(entry.effects.map(({ effectId }) => effectId));
      const duplicateEffect =
        localEffectIds.size !== entry.effects.length ||
        entry.effects.some(({ effectId }) => knownEffectIds.has(effectId));
      const invalidDebtResolution = entry.effects.some(
        (effect) => effect.kind === "debt_resolve" && !openDebtIds.has(effect.debtEffectId),
      );
      const sourceReceiptId =
        entry.source.kind === "player"
          ? entry.source.authorizingIntentId
          : entry.source.triggerId;
      const rulingReceiptId =
        entry.irreversibleRuling?.kind === "rule"
          ? entry.irreversibleRuling.receiptId
          : entry.irreversibleRuling?.kind === "gm_approval"
            ? entry.irreversibleRuling.approvalId
            : null;
      if (
        knownEntryIds.has(entry.id) ||
        entry.sequence !== index ||
        entry.worldTick < previousWorldTick ||
        entry.previousEntryHash !== cursor.headEntryHash ||
        (!inheritedFromParent && entry.baseCursorHash !== cursor.cursorHash) ||
        entry.beforeStateHash !== cursor.currentStateHash ||
        entry.causeEntryHashes.some((hash) => !knownEntryHashes.has(hash)) ||
        duplicateEffect ||
        consumedSourceReceiptIds.has(sourceReceiptId) ||
        (rulingReceiptId !== null && consumedRulingReceiptIds.has(rulingReceiptId)) ||
        invalidDebtResolution ||
        stateTransitions.length > 1 ||
        stateTransitions.some(({ from, to }) => from === to) ||
        stateTransitions.some(
          ({ variableId, from }) =>
            knownVariableValues.has(variableId) && knownVariableValues.get(variableId) !== from,
        ) ||
        (stateTransitions.length === 0 && entry.transitionReceiptHash !== null) ||
        (stateTransitions.length === 1 && entry.transitionReceiptHash === null) ||
        (entry.reversibility === "reversible" && entry.irreversibleRuling !== null) ||
        (entry.reversibility === "irreversible" && entry.irreversibleRuling === null) ||
        (stateTransitions.length === 0 && entry.beforeStateHash !== entry.afterStateHash) ||
        (stateTransitions.length === 1 && entry.beforeStateHash === entry.afterStateHash) ||
        sha256Canonical(entryPayload(entry)) !== entry.entryHash
      ) {
        return false;
      }
      knownEntryIds.add(entry.id);
      knownEntryHashes.add(entry.entryHash);
      consumedSourceReceiptIds.add(sourceReceiptId);
      if (rulingReceiptId !== null) consumedRulingReceiptIds.add(rulingReceiptId);
      for (const effect of entry.effects) {
        knownEffectIds.add(effect.effectId);
        if (effect.kind === "state_transition") {
          knownVariableValues.set(effect.variableId, effect.to);
        }
        if (effect.kind === "debt_open") openDebtIds.add(effect.effectId);
        if (effect.kind === "debt_resolve") openDebtIds.delete(effect.debtEffectId);
      }
      previousWorldTick = entry.worldTick;
      cursor = rebuildCursorAfterEntry(cursor, entry);
    }

    return cursor.cursorHash === ledger.cursor.cursorHash;
  } catch {
    return false;
  }
};

export const hasValidCampaignLedger = (input: CampaignLedger): boolean => {
  const parsed = CampaignLedgerSchema.safeParse(input);
  return parsed.success && verifyParsedCampaignLedgerIntegrity(parsed.data);
};

const violation = (
  code: CampaignLedgerViolation["code"],
  message: string,
  evidenceIds: string[],
): CampaignLedgerViolation => ({ code, message, evidenceIds });

const effectEntityIds = (effect: CausalEffect): string[] => {
  switch (effect.kind) {
    case "relation_delta":
      return [effect.subjectEntityId, effect.objectEntityId];
    case "resource_delta":
    case "knowledge_grant":
    case "flag_set":
      return [effect.entityId];
    case "debt_open":
      return [effect.debtorEntityId, effect.creditorEntityId];
    case "state_transition":
    case "clock_delta":
    case "debt_resolve":
      return [];
  }
};

const sourceActorId = (input: CampaignEventInput): string | null =>
  input.source.kind === "world" ? null : input.source.actorEntityId;

const openDebtEffectIds = (ledger: CampaignLedger): Set<string> => {
  const open = new Set<string>();
  for (const entry of ledger.entries) {
    for (const effect of entry.effects) {
      if (effect.kind === "debt_open") open.add(effect.effectId);
      if (effect.kind === "debt_resolve") open.delete(effect.debtEffectId);
    }
  }
  return open;
};

export type AppendCampaignEventResult = {
  status: "applied" | "blocked";
  ledger: CampaignLedger;
  entry: CausalLedgerEntry | null;
  violations: CampaignLedgerViolation[];
};

export type CampaignTransitionAuthority = {
  scenario: SimulationScenario;
  snapshot: SimulationSnapshot;
  action: CandidateAction;
};

export type CampaignOntologyAuthority = {
  activeActionTypeIds: ReadonlySet<string>;
  activeRelationAxisIds: ReadonlySet<string>;
  activeResourceIds: ReadonlySet<string>;
  activeFlagIds: ReadonlySet<string>;
  activeClockIds: ReadonlySet<string>;
  activeDebtKindIds: ReadonlySet<string>;
};

export type AppendCampaignEventInput = CampaignOntologyAuthority & {
  ledger: CampaignLedger;
  event: CampaignEventInput;
  knownEntityIds: ReadonlySet<string>;
  activeClaimIds: ReadonlySet<string>;
  activeRuleIds: ReadonlySet<string>;
  authorizedIntentReceipts: ReadonlyMap<string, string>;
  activeTriggerReceipts: ReadonlyMap<string, string>;
  approvedRulingReceipts: ReadonlyMap<string, string>;
  transitionAuthority?: CampaignTransitionAuthority | null;
};

export const appendCampaignEvent = ({
  ledger,
  event: eventInput,
  knownEntityIds,
  activeClaimIds,
  activeRuleIds,
  activeActionTypeIds,
  activeRelationAxisIds,
  activeResourceIds,
  activeFlagIds,
  activeClockIds,
  activeDebtKindIds,
  authorizedIntentReceipts,
  activeTriggerReceipts,
  approvedRulingReceipts,
  transitionAuthority = null,
}: AppendCampaignEventInput): AppendCampaignEventResult => {
  const event = normalizeEventInput(eventInput);
  const eventAuthorityHash = buildCampaignEventAuthorityHash(event);
  const violations: CampaignLedgerViolation[] = [];

  if (!verifyParsedCampaignLedgerIntegrity(ledger)) {
    violations.push(
      violation("ledger_hash_invalid", "The campaign ledger hash chain is invalid.", [
        ledger.cursor.cursorHash,
      ]),
    );
  }
  if (event.baseCursorHash !== ledger.cursor.cursorHash) {
    violations.push(
      violation("stale_cursor", "The event targets a stale campaign cursor.", [
        event.baseCursorHash,
        ledger.cursor.cursorHash,
      ]),
    );
  }
  if (event.beforeStateHash !== ledger.cursor.currentStateHash) {
    violations.push(
      violation("state_hash_mismatch", "The event does not start from the branch state.", [
        event.beforeStateHash,
        ledger.cursor.currentStateHash,
      ]),
    );
  }
  if (ledger.entries.length >= MAX_CAMPAIGN_LEDGER_ENTRIES) {
    violations.push(
      violation("entry_limit_exceeded", "The in-memory campaign ledger reached its bound.", [
        ledger.cursor.branchId,
      ]),
    );
  }
  if (ledger.entries.some(({ id }) => id === event.id)) {
    violations.push(
      violation("event_duplicate", `Campaign event ${event.id} already exists.`, [event.id]),
    );
  }

  const priorEffectIds = new Set(
    ledger.entries.flatMap((entry) => entry.effects.map(({ effectId }) => effectId)),
  );
  const duplicateEffectIds = event.effects
    .map(({ effectId }) => effectId)
    .filter((effectId) => priorEffectIds.has(effectId));
  if (duplicateEffectIds.length > 0) {
    violations.push(
      violation(
        "effect_duplicate",
        "Causal effect identifiers cannot be reused within a campaign branch.",
        duplicateEffectIds,
      ),
    );
  }

  const previousWorldTick = ledger.entries.at(-1)?.worldTick;
  if (previousWorldTick !== undefined && event.worldTick < previousWorldTick) {
    violations.push(
      violation(
        "world_tick_regression",
        "Campaign world time cannot move backward within a branch.",
        [event.id],
      ),
    );
  }

  const consumedSourceReceiptIds = new Set(
    ledger.entries.map((entry) =>
      entry.source.kind === "player"
        ? entry.source.authorizingIntentId
        : entry.source.triggerId,
    ),
  );
  if (event.source.kind === "player") {
    const receiptId = event.source.authorizingIntentId;
    if (
      authorizedIntentReceipts.get(receiptId) !== eventAuthorityHash ||
      consumedSourceReceiptIds.has(receiptId)
    ) {
      violations.push(
        violation(
          "source_authority_invalid",
          "The player event requires an exact, unused intent resolution receipt.",
          [receiptId],
        ),
      );
    }
  } else {
    const receiptId = event.source.triggerId;
    if (
      activeTriggerReceipts.get(receiptId) !== eventAuthorityHash ||
      consumedSourceReceiptIds.has(receiptId)
    ) {
      violations.push(
        violation(
          "source_authority_invalid",
          "The NPC or world event requires an exact, unused trigger receipt.",
          [receiptId],
        ),
      );
    }
  }

  if (event.reversibility === "reversible" && event.irreversibleRuling !== null) {
    violations.push(
      violation(
        "ruling_invalid",
        "A reversible event cannot carry an irreversible ruling.",
        [event.id],
      ),
    );
  }
  if (event.reversibility === "irreversible") {
    const ruling = event.irreversibleRuling;
    const receiptId =
      ruling?.kind === "rule"
        ? ruling.receiptId
        : ruling?.kind === "gm_approval"
          ? ruling.approvalId
          : null;
    const consumedRulingReceiptIds = new Set(
      ledger.entries.flatMap((entry) => {
        const prior = entry.irreversibleRuling;
        if (prior?.kind === "rule") return [prior.receiptId];
        if (prior?.kind === "gm_approval") return [prior.approvalId];
        return [];
      }),
    );
    const exactUnusedReceipt =
      receiptId !== null &&
      approvedRulingReceipts.get(receiptId) === eventAuthorityHash &&
      !consumedRulingReceiptIds.has(receiptId);
    const validRuleRuling =
      ruling?.kind === "rule" &&
      activeRuleIds.has(ruling.ruleId) &&
      event.evidenceRuleIds.includes(ruling.ruleId) &&
      exactUnusedReceipt;
    const validGmRuling =
      ruling?.kind === "gm_approval" && exactUnusedReceipt;
    if (!validRuleRuling && !validGmRuling) {
      violations.push(
        violation(
          "ruling_invalid",
          "An irreversible event requires an exact, unused rule or GM ruling receipt.",
          ruling?.kind === "rule"
            ? [ruling.ruleId, ruling.receiptId]
            : ruling?.kind === "gm_approval"
              ? [ruling.approvalId]
              : [event.id],
        ),
      );
    }
  }

  const knownEntryHashes = new Set(ledger.entries.map(({ entryHash }) => entryHash));
  const unknownCauses = event.causeEntryHashes.filter((hash) => !knownEntryHashes.has(hash));
  if (unknownCauses.length > 0) {
    violations.push(
      violation("cause_unknown", "The event cites causes outside this campaign branch.", unknownCauses),
    );
  }

  const referencedEntityIds = sortedUniqueIds([
    ...(sourceActorId(event) ? [sourceActorId(event)!] : []),
    ...event.targetEntityIds,
    ...(event.visibility.scope === "entities" ? event.visibility.entityIds : []),
    ...event.effects.flatMap(effectEntityIds),
  ]);
  const unknownEntities = referencedEntityIds.filter((id) => !knownEntityIds.has(id));
  if (unknownEntities.length > 0) {
    violations.push(
      violation("entity_unknown", "The event references entities outside the World Pack.", unknownEntities),
    );
  }

  const inactiveEvidence = [
    ...event.evidenceClaimIds.filter((id) => !activeClaimIds.has(id)),
    ...event.evidenceRuleIds.filter((id) => !activeRuleIds.has(id)),
    ...event.effects
      .filter((effect): effect is Extract<CausalEffect, { kind: "knowledge_grant" }> =>
        effect.kind === "knowledge_grant",
      )
      .map(({ claimId }) => claimId)
      .filter((id) => !activeClaimIds.has(id)),
  ];
  if (inactiveEvidence.length > 0) {
    violations.push(
      violation(
        "evidence_inactive",
        "The event depends on inactive or unknown claims and rules.",
        sortedUniqueIds(inactiveEvidence),
      ),
    );
  }

  const inactiveOntologyIds = [
    ...(activeActionTypeIds.has(event.actionTypeId) ? [] : [event.actionTypeId]),
    ...event.effects.flatMap((effect) => {
      switch (effect.kind) {
        case "relation_delta":
          return activeRelationAxisIds.has(effect.axisId) ? [] : [effect.axisId];
        case "resource_delta":
          return activeResourceIds.has(effect.resourceId) ? [] : [effect.resourceId];
        case "flag_set":
          return activeFlagIds.has(effect.flagId) ? [] : [effect.flagId];
        case "clock_delta":
          return activeClockIds.has(effect.clockId) ? [] : [effect.clockId];
        case "debt_open":
          return activeDebtKindIds.has(effect.debtKindId) ? [] : [effect.debtKindId];
        case "state_transition":
        case "knowledge_grant":
        case "debt_resolve":
          return [];
      }
    }),
  ];
  if (inactiveOntologyIds.length > 0) {
    violations.push(
      violation(
        "ontology_inactive",
        "The event uses action or effect dimensions outside the active campaign ontology.",
        sortedUniqueIds(inactiveOntologyIds),
      ),
    );
  }

  const openDebts = openDebtEffectIds(ledger);
  const unknownDebts = event.effects
    .filter((effect): effect is Extract<CausalEffect, { kind: "debt_resolve" }> =>
      effect.kind === "debt_resolve",
    )
    .map(({ debtEffectId }) => debtEffectId)
    .filter((id) => !openDebts.has(id));
  if (unknownDebts.length > 0) {
    violations.push(
      violation("debt_unknown", "The event resolves a debt that is not open.", unknownDebts),
    );
  }

  const stateTransitions = event.effects.filter(
    (effect): effect is Extract<CausalEffect, { kind: "state_transition" }> =>
      effect.kind === "state_transition",
  );
  if (stateTransitions.some(({ from, to }) => from === to)) {
    violations.push(
      violation(
        "state_transition_invalid",
        "A registered state transition must change its finite-state value.",
        stateTransitions.map(({ effectId }) => effectId),
      ),
    );
  }
  if (stateTransitions.length === 0) {
    if (event.transitionReceiptHash !== null || transitionAuthority !== null) {
      violations.push(
        violation(
          "transition_receipt_invalid",
          "A non-state event cannot carry a simulation transition receipt.",
          [event.id],
        ),
      );
    }
  } else if (stateTransitions.length === 1) {
    const effect = stateTransitions[0];
    let receiptMatches = false;
    if (
      event.source.kind === "player" &&
      event.transitionReceiptHash !== null &&
      transitionAuthority !== null
    ) {
      try {
        const resolution = applySimulationAction({
          ...transitionAuthority,
          activeRuleIds,
        });
        const action = transitionAuthority.action;
        receiptMatches =
          transitionAuthority.scenario.worldPackId === ledger.cursor.worldPackId &&
          transitionAuthority.scenario.worldPackVersion === ledger.cursor.worldPackVersion &&
          transitionAuthority.snapshot.worldPackVersion === ledger.cursor.worldPackVersion &&
          resolution.status === "applied" &&
          resolution.transition.status === "applied" &&
          sha256Canonical(resolution.transition) === event.transitionReceiptHash &&
          resolution.transition.fromStateHash === event.beforeStateHash &&
          resolution.transition.toStateHash === event.afterStateHash &&
          transitionAuthority.snapshot.stateHash === event.beforeStateHash &&
          action.actorEntityId === event.source.actorEntityId &&
          action.authorizingIntentId === event.source.authorizingIntentId &&
          action.variableId === effect.variableId &&
          action.from === effect.from &&
          action.to === effect.to &&
          action.evidenceClaimIds.every((id) => event.evidenceClaimIds.includes(id)) &&
          action.evidenceRuleIds.every((id) => event.evidenceRuleIds.includes(id));
      } catch {
        receiptMatches = false;
      }
    }
    if (!receiptMatches) {
      violations.push(
        violation(
          "transition_receipt_invalid",
          "A state transition must match one applied registered simulation receipt.",
          [effect.effectId],
        ),
      );
    }
  }
  if (
    stateTransitions.length > 1 ||
    (stateTransitions.length === 0 && event.beforeStateHash !== event.afterStateHash) ||
    (stateTransitions.length === 1 && event.beforeStateHash === event.afterStateHash)
  ) {
    violations.push(
      violation(
        "state_hash_mismatch",
        "State hashes must change exactly when one registered state transition is recorded.",
        [event.beforeStateHash, event.afterStateHash],
      ),
    );
  }

  if (violations.length > 0) {
    return { status: "blocked", ledger, entry: null, violations };
  }

  const entry = buildLedgerEntry({
    input: event,
    sequence: ledger.cursor.entryCount,
    previousEntryHash: ledger.cursor.headEntryHash,
  });
  const next = CampaignLedgerSchema.parse({
    entries: [...ledger.entries, entry],
    cursor: rebuildCursorAfterEntry(ledger.cursor, entry),
  });

  return { status: "applied", ledger: next, entry, violations: [] };
};

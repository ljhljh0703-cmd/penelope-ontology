import type {
  CampaignEventVisibilitySchema,
  CampaignLedger,
  CausalEffect,
  CausalLedgerEntry,
} from "@/src/contracts/campaign";
import {
  CausalProjectionSchema,
  CausalWorkingSetSchema,
  type CausalEventRef,
  type CausalProjection,
  type CausalProjectionPayload,
  type CausalWorkingSet,
  type CausalWorkingSetPayload,
} from "@/src/contracts/causal-context";
import { canonicalJson, sha256Canonical, sortedUniqueIds } from "@/src/domain/canonical-json";
import { verifyParsedCampaignLedgerIntegrity } from "@/src/domain/campaign";

type CampaignEventVisibility = typeof CampaignEventVisibilitySchema._output;

export type CausalWorkingSetBudget = Partial<{
  maxEvents: number;
  causeDepth: number;
  maxEventEffects: number;
  maxVariables: number;
  maxRelations: number;
  maxResources: number;
  maxKnowledge: number;
  maxFlags: number;
  maxClocks: number;
  maxOpenDebts: number;
}>;

const DEFAULT_BUDGET: Required<CausalWorkingSetBudget> = {
  maxEvents: 6,
  causeDepth: 2,
  maxEventEffects: 24,
  maxVariables: 16,
  maxRelations: 24,
  maxResources: 12,
  maxKnowledge: 24,
  maxFlags: 16,
  maxClocks: 8,
  maxOpenDebts: 12,
};

const MAX_BUDGET: Required<CausalWorkingSetBudget> = {
  maxEvents: 8,
  causeDepth: 2,
  maxEventEffects: 32,
  maxVariables: 24,
  maxRelations: 32,
  maxResources: 24,
  maxKnowledge: 32,
  maxFlags: 24,
  maxClocks: 12,
  maxOpenDebts: 16,
};

export const MAX_COMPACT_CAUSAL_CONTEXT_BYTES = 16_384;

const compareIds = (left: string, right: string): number => left.localeCompare(right);

const relationKey = (subject: string, object: string, axis: string): string =>
  `${subject}\u0000${object}\u0000${axis}`;
const entityValueKey = (entity: string, value: string): string => `${entity}\u0000${value}`;

const assertValidLedger = (ledger: CampaignLedger): void => {
  if (!verifyParsedCampaignLedgerIntegrity(ledger)) {
    throw new Error("Cannot derive causal context from an invalid campaign ledger.");
  }
};

const projectionPayload = (projection: CausalProjection): CausalProjectionPayload => {
  const { projectionHash, ...payload } = projection;
  void projectionHash;
  return payload;
};

const materializeProjectionFromEntries = (
  ledger: CampaignLedger,
  entries: CausalLedgerEntry[],
): CausalProjection => {
  const variables = new Map<
    string,
    CausalProjectionPayload["variables"][number]
  >();
  const relations = new Map<
    string,
    CausalProjectionPayload["relations"][number]
  >();
  const resources = new Map<
    string,
    CausalProjectionPayload["resources"][number]
  >();
  const knowledge = new Map<
    string,
    CausalProjectionPayload["knowledge"][number]
  >();
  const flags = new Map<string, CausalProjectionPayload["flags"][number]>();
  const clocks = new Map<string, CausalProjectionPayload["clocks"][number]>();
  const openDebts = new Map<
    string,
    CausalProjectionPayload["openDebts"][number]
  >();

  for (const entry of entries) {
    for (const effect of entry.effects) {
      switch (effect.kind) {
        case "state_transition":
          variables.set(effect.variableId, {
            variableId: effect.variableId,
            value: effect.to,
            lastEntryHash: entry.entryHash,
          });
          break;
        case "relation_delta": {
          const key = relationKey(
            effect.subjectEntityId,
            effect.objectEntityId,
            effect.axisId,
          );
          relations.set(key, {
            subjectEntityId: effect.subjectEntityId,
            objectEntityId: effect.objectEntityId,
            axisId: effect.axisId,
            value: (relations.get(key)?.value ?? 0) + effect.delta,
            lastEntryHash: entry.entryHash,
          });
          break;
        }
        case "resource_delta": {
          const key = entityValueKey(effect.entityId, effect.resourceId);
          resources.set(key, {
            entityId: effect.entityId,
            resourceId: effect.resourceId,
            value: (resources.get(key)?.value ?? 0) + effect.delta,
            lastEntryHash: entry.entryHash,
          });
          break;
        }
        case "knowledge_grant": {
          const key = entityValueKey(effect.entityId, effect.claimId);
          if (!knowledge.has(key)) {
            knowledge.set(key, {
              entityId: effect.entityId,
              claimId: effect.claimId,
              learnedByEntryHash: entry.entryHash,
            });
          }
          break;
        }
        case "flag_set": {
          const key = entityValueKey(effect.entityId, effect.flagId);
          flags.set(key, {
            entityId: effect.entityId,
            flagId: effect.flagId,
            value: effect.value,
            lastEntryHash: entry.entryHash,
          });
          break;
        }
        case "clock_delta":
          clocks.set(effect.clockId, {
            clockId: effect.clockId,
            value: (clocks.get(effect.clockId)?.value ?? 0) + effect.delta,
            lastEntryHash: entry.entryHash,
          });
          break;
        case "debt_open":
          openDebts.set(effect.effectId, {
            debtEffectId: effect.effectId,
            debtorEntityId: effect.debtorEntityId,
            creditorEntityId: effect.creditorEntityId,
            debtKindId: effect.debtKindId,
            weight: effect.weight,
            openedByEntryHash: entry.entryHash,
          });
          break;
        case "debt_resolve":
          openDebts.delete(effect.debtEffectId);
          break;
      }
    }
  }

  const payload: CausalProjectionPayload = {
    branchId: ledger.cursor.branchId,
    cursorHash: ledger.cursor.cursorHash,
    currentStateHash: ledger.cursor.currentStateHash,
    throughEntryCount: ledger.cursor.entryCount,
    variables: [...variables.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([, value]) => value),
    relations: [...relations.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([, value]) => value),
    resources: [...resources.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([, value]) => value),
    knowledge: [...knowledge.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([, value]) => value),
    flags: [...flags.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([, value]) => value),
    clocks: [...clocks.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([, value]) => value),
    openDebts: [...openDebts.entries()]
      .sort(([left], [right]) => compareIds(left, right))
      .map(([, value]) => value),
  };

  return CausalProjectionSchema.parse({
    ...payload,
    projectionHash: sha256Canonical(payload),
  });
};

export const materializeCausalProjection = (ledger: CampaignLedger): CausalProjection => {
  assertValidLedger(ledger);
  return materializeProjectionFromEntries(ledger, ledger.entries);
};

const normalizeBudget = (
  input: CausalWorkingSetBudget | undefined,
): Required<CausalWorkingSetBudget> => {
  const budget = { ...DEFAULT_BUDGET, ...input };
  for (const [name, value] of Object.entries(budget)) {
    const maximum = MAX_BUDGET[name as keyof typeof MAX_BUDGET];
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
      throw new RangeError(
        `Causal working-set budget ${name} must be an integer from 0 through ${maximum}.`,
      );
    }
  }
  return budget;
};

const actorEntityId = (entry: CausalLedgerEntry): string | null =>
  entry.source.kind === "world" ? null : entry.source.actorEntityId;

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

const isVisible = (
  visibility: CampaignEventVisibility,
  audience: CausalWorkingSet["audience"],
  viewerEntityIds: ReadonlySet<string>,
): boolean => {
  if (audience === "facilitator") return true;
  if (visibility.scope === "public") return true;
  if (visibility.scope === "facilitator") return false;
  return visibility.entityIds.some((entityId) => viewerEntityIds.has(entityId));
};

const touchesFocus = (entry: CausalLedgerEntry, focalEntityIds: ReadonlySet<string>): boolean => {
  const actor = actorEntityId(entry);
  return [
    ...(actor ? [actor] : []),
    ...entry.targetEntityIds,
    ...entry.effects.flatMap(effectEntityIds),
  ].some((entityId) => focalEntityIds.has(entityId));
};

const takeBounded = <T>(values: T[], maximum: number): { values: T[]; truncated: boolean } => ({
  values: values.slice(0, maximum),
  truncated: values.length > maximum,
});

const workingSetPayload = (workingSet: CausalWorkingSet): CausalWorkingSetPayload => {
  const { workingSetHash, ...payload } = workingSet;
  void workingSetHash;
  return payload;
};

export const buildCausalWorkingSet = ({
  ledger,
  focalEntityIds: focalEntityInput,
  viewerEntityIds: viewerEntityInput,
  audience,
  budget: budgetInput,
  pinnedEntryHashes = [],
}: {
  ledger: CampaignLedger;
  focalEntityIds: string[];
  viewerEntityIds: string[];
  audience: CausalWorkingSet["audience"];
  budget?: CausalWorkingSetBudget;
  pinnedEntryHashes?: string[];
}): CausalWorkingSet => {
  assertValidLedger(ledger);
  const focalEntityIds = sortedUniqueIds(focalEntityInput);
  if (focalEntityIds.length === 0) {
    throw new Error("A causal working set requires at least one focal entity.");
  }
  const focus = new Set(focalEntityIds);
  const viewerEntityIds = sortedUniqueIds(viewerEntityInput);
  if (audience === "characters" && viewerEntityIds.length === 0) {
    throw new Error("A character-scoped causal working set requires an authorized viewer.");
  }
  const viewers = new Set(viewerEntityIds);
  const budget = normalizeBudget(budgetInput);
  const entryByHash = new Map(ledger.entries.map((entry) => [entry.entryHash, entry]));
  const visibleEntries = ledger.entries.filter((entry) =>
    isVisible(entry.visibility, audience, viewers),
  );
  const projection = materializeProjectionFromEntries(ledger, visibleEntries);
  const visibleEntryHashes = new Set(visibleEntries.map(({ entryHash }) => entryHash));
  const directEntries = visibleEntries.filter((entry) => touchesFocus(entry, focus));
  const unknownPinnedHashes = pinnedEntryHashes.filter((hash) => !entryByHash.has(hash));
  if (unknownPinnedHashes.length > 0) {
    throw new Error("A pinned causal event does not belong to this campaign branch.");
  }
  const pinnedEntries = sortedUniqueIds(pinnedEntryHashes)
    .map((hash) => entryByHash.get(hash))
    .filter(
      (entry): entry is CausalLedgerEntry =>
        entry !== undefined && visibleEntryHashes.has(entry.entryHash),
    );
  const pinnedEffectCount = pinnedEntries.reduce(
    (total, entry) => total + entry.effects.length,
    0,
  );
  if (
    pinnedEntries.length > MAX_BUDGET.maxEvents ||
    pinnedEffectCount > MAX_BUDGET.maxEventEffects
  ) {
    throw new RangeError("Pinned causal events exceed the hard working-set budget.");
  }
  const eventCapacity = Math.max(budget.maxEvents, pinnedEntries.length);
  const eventEffectCapacity = Math.max(budget.maxEventEffects, pinnedEffectCount);
  const candidateHashes = new Set<string>();

  const collectVisibleCauses = (entry: CausalLedgerEntry, depth: number): void => {
    if (depth >= budget.causeDepth) return;
    for (const causeHash of entry.causeEntryHashes) {
      if (!visibleEntryHashes.has(causeHash)) continue;
      candidateHashes.add(causeHash);
      const cause = entryByHash.get(causeHash);
      if (cause) collectVisibleCauses(cause, depth + 1);
    }
  };

  const seedEntries = [...pinnedEntries, ...directEntries]
    .filter(
      (entry, index, entries) =>
        entries.findIndex(({ entryHash }) => entryHash === entry.entryHash) === index,
    )
    .sort((left, right) => right.sequence - left.sequence);
  for (const entry of seedEntries) {
    candidateHashes.add(entry.entryHash);
    collectVisibleCauses(entry, 0);
  }

  const pinnedEntryHashesSet = new Set(pinnedEntries.map(({ entryHash }) => entryHash));
  const selectedHashes = new Set<string>(pinnedEntryHashesSet);
  for (const entry of seedEntries) {
    if (!selectedHashes.has(entry.entryHash) && selectedHashes.size >= eventCapacity) break;
    selectedHashes.add(entry.entryHash);
    const queue = entry.causeEntryHashes.map((hash) => ({ hash, depth: 1 }));
    while (queue.length > 0 && selectedHashes.size < eventCapacity) {
      const next = queue.shift();
      if (!next || next.depth > budget.causeDepth || !visibleEntryHashes.has(next.hash)) {
        continue;
      }
      selectedHashes.add(next.hash);
      const cause = entryByHash.get(next.hash);
      if (cause) {
        queue.push(
          ...cause.causeEntryHashes.map((hash) => ({ hash, depth: next.depth + 1 })),
        );
      }
    }
  }

  const selectedEntries = ledger.entries.filter(({ entryHash }) => selectedHashes.has(entryHash));
  const eventIdByHash = new Map(selectedEntries.map(({ entryHash, id }) => [entryHash, id]));
  let remainingEventEffects = eventEffectCapacity;
  let eventEffectsTruncated = false;
  const selectedEffectsByHash = new Map<string, CausalEffect[]>();
  const effectAllocationOrder = [
    ...selectedEntries.filter(({ entryHash }) => pinnedEntryHashesSet.has(entryHash)),
    ...selectedEntries
      .filter(({ entryHash }) => !pinnedEntryHashesSet.has(entryHash))
      .reverse(),
  ];
  for (const entry of effectAllocationOrder) {
    const effects = entry.effects.slice(0, remainingEventEffects);
    selectedEffectsByHash.set(entry.entryHash, effects);
    remainingEventEffects -= effects.length;
    if (effects.length < entry.effects.length) eventEffectsTruncated = true;
  }
  const events: CausalEventRef[] = selectedEntries.map((entry) => ({
    id: entry.id,
    entryHash: entry.entryHash,
    sequence: entry.sequence,
    worldTick: entry.worldTick,
    sourceKind: entry.source.kind,
    actorEntityId: actorEntityId(entry),
    actionTypeId: entry.actionTypeId,
    targetEntityIds: entry.targetEntityIds,
    causeEventIds: entry.causeEntryHashes
      .map((hash) => eventIdByHash.get(hash))
      .filter((id): id is string => id !== undefined)
      .sort(compareIds),
    evidenceClaimIds: entry.evidenceClaimIds,
    evidenceRuleIds: entry.evidenceRuleIds,
    traceIds: entry.traceIds,
    effectKinds: [...new Set(entry.effects.map(({ kind }) => kind))].sort(compareIds),
    effects: selectedEffectsByHash.get(entry.entryHash) ?? [],
    reversibility: entry.reversibility,
  }));

  const entryVisibleByHash = (hash: string): boolean => {
    const entry = entryByHash.get(hash);
    return entry ? isVisible(entry.visibility, audience, viewers) : false;
  };
  const relationCandidates = projection.relations.filter(
    (state) =>
      (focus.has(state.subjectEntityId) || focus.has(state.objectEntityId)) &&
      entryVisibleByHash(state.lastEntryHash),
  );
  const resourceCandidates = projection.resources.filter(
    (state) => focus.has(state.entityId) && entryVisibleByHash(state.lastEntryHash),
  );
  const knowledgeCandidates = projection.knowledge.filter(
    (state) => focus.has(state.entityId) && entryVisibleByHash(state.learnedByEntryHash),
  );
  const flagCandidates = projection.flags.filter(
    (state) => focus.has(state.entityId) && entryVisibleByHash(state.lastEntryHash),
  );
  const clockCandidates = projection.clocks.filter((state) =>
    entryVisibleByHash(state.lastEntryHash),
  );
  const debtCandidates = projection.openDebts.filter(
    (state) =>
      (focus.has(state.debtorEntityId) || focus.has(state.creditorEntityId)) &&
      entryVisibleByHash(state.openedByEntryHash),
  );

  const variableCandidates = projection.variables.filter((state) =>
    entryVisibleByHash(state.lastEntryHash),
  );
  const variables = takeBounded(variableCandidates, budget.maxVariables);
  const relations = takeBounded(relationCandidates, budget.maxRelations);
  const resources = takeBounded(resourceCandidates, budget.maxResources);
  const knowledge = takeBounded(knowledgeCandidates, budget.maxKnowledge);
  const flags = takeBounded(flagCandidates, budget.maxFlags);
  const clocks = takeBounded(clockCandidates, budget.maxClocks);
  const openDebts = takeBounded(debtCandidates, budget.maxOpenDebts);
  const payload: CausalWorkingSetPayload = {
    branchId: ledger.cursor.branchId,
    cursorHash: ledger.cursor.cursorHash,
    currentStateHash: ledger.cursor.currentStateHash,
    projectionHash: projection.projectionHash,
    focalEntityIds,
    viewerEntityIds,
    audience,
    events,
    variables: variables.values,
    relations: relations.values,
    resources: resources.values,
    knowledge: knowledge.values,
    flags: flags.values,
    clocks: clocks.values,
    openDebts: openDebts.values,
    truncated:
      selectedHashes.size < candidateHashes.size ||
      eventEffectsTruncated ||
      variables.truncated ||
      relations.truncated ||
      resources.truncated ||
      knowledge.truncated ||
      flags.truncated ||
      clocks.truncated ||
      openDebts.truncated,
  };

  return CausalWorkingSetSchema.parse({
    ...payload,
    workingSetHash: sha256Canonical(payload),
  });
};

const compactEffect = (effect: CausalEffect): Array<string | number | boolean> => {
  switch (effect.kind) {
    case "state_transition":
      return ["s", effect.effectId, effect.variableId, effect.from, effect.to];
    case "relation_delta":
      return [
        "r",
        effect.effectId,
        effect.subjectEntityId,
        effect.objectEntityId,
        effect.axisId,
        effect.delta,
      ];
    case "resource_delta":
      return ["q", effect.effectId, effect.entityId, effect.resourceId, effect.delta];
    case "knowledge_grant":
      return ["k", effect.effectId, effect.entityId, effect.claimId];
    case "flag_set":
      return ["g", effect.effectId, effect.entityId, effect.flagId, effect.value];
    case "clock_delta":
      return ["c", effect.effectId, effect.clockId, effect.delta];
    case "debt_open":
      return [
        "do",
        effect.effectId,
        effect.debtorEntityId,
        effect.creditorEntityId,
        effect.debtKindId,
        effect.weight,
      ];
    case "debt_resolve":
      return ["dr", effect.effectId, effect.debtEffectId];
  }
};

export const serializeCompactCausalContext = (workingSet: CausalWorkingSet): string => {
  const parsed = CausalWorkingSetSchema.parse(workingSet);
  const serialized = canonicalJson({
    v: 1,
    b: parsed.branchId,
    f: parsed.focalEntityIds,
    p: parsed.viewerEntityIds,
    a: parsed.audience === "facilitator" ? "gm" : "pc",
    e: parsed.events.map((event) => [
      event.id,
      event.worldTick,
      event.sourceKind,
      event.actorEntityId,
      event.actionTypeId,
      event.targetEntityIds,
      event.causeEventIds,
      event.evidenceClaimIds,
      event.evidenceRuleIds,
      event.traceIds,
      event.effectKinds,
      event.effects.map(compactEffect),
      event.reversibility,
    ]),
    u: parsed.variables.map((state) => [state.variableId, state.value]),
    r: parsed.relations.map((state) => [
      state.subjectEntityId,
      state.objectEntityId,
      state.axisId,
      state.value,
    ]),
    q: parsed.resources.map((state) => [state.entityId, state.resourceId, state.value]),
    k: parsed.knowledge.map((state) => [state.entityId, state.claimId]),
    g: parsed.flags.map((state) => [state.entityId, state.flagId, state.value]),
    c: parsed.clocks.map((state) => [state.clockId, state.value]),
    d: parsed.openDebts.map((state) => [
      state.debtEffectId,
      state.debtorEntityId,
      state.creditorEntityId,
      state.debtKindId,
      state.weight,
    ]),
    t: parsed.truncated,
  });
  if (new TextEncoder().encode(serialized).byteLength > MAX_COMPACT_CAUSAL_CONTEXT_BYTES) {
    throw new RangeError("The compact causal context exceeds its hard byte budget.");
  }
  return serialized;
};

export type CausalPromptPrefixIdentity = {
  worldPackId: string;
  worldPackVersion: string;
  approvedOverlayHash: string;
  styleProfileId: string;
  responseSchemaVersion: string;
};

export const buildCausalPromptCacheKey = (identity: CausalPromptPrefixIdentity): string =>
  `penelope:${sha256Canonical({
    worldPackId: identity.worldPackId,
    worldPackVersion: identity.worldPackVersion,
    approvedOverlayHash: identity.approvedOverlayHash,
    styleProfileId: identity.styleProfileId,
    responseSchemaVersion: identity.responseSchemaVersion,
  })}`;

export const verifyCausalProjectionHash = (projection: CausalProjection): boolean =>
  sha256Canonical(projectionPayload(projection)) === projection.projectionHash;

export const verifyCausalWorkingSetHash = (workingSet: CausalWorkingSet): boolean =>
  sha256Canonical(workingSetPayload(workingSet)) === workingSet.workingSetHash;

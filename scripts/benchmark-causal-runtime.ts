import { execFileSync } from "node:child_process";
import { cpus, platform, arch } from "node:os";
import { performance } from "node:perf_hooks";
import { prepareCampaignTurn } from "@/src/application/campaign-turn";
import {
  CampaignLedgerSchema,
  CausalLedgerEntrySchema,
  type CampaignLedger,
} from "@/src/contracts/campaign";
import { buildCausalWorkingSet, serializeCompactCausalContext } from "@/src/domain/causal-context";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  buildCampaignCursor,
  buildCampaignEventAuthorityHash,
  createCampaignLedger,
} from "@/src/domain/campaign";

const EVENT_COUNT = Number.parseInt(process.argv[2] ?? "10000", 10);
const SAMPLE_COUNT = Number.parseInt(process.argv[3] ?? "20", 10);
const ENTITY_COUNT = 500;
if (!Number.isInteger(EVENT_COUNT) || EVENT_COUNT < 1 || EVENT_COUNT > 10_000) {
  throw new RangeError("Pass an event count from 1 through 10000.");
}
if (!Number.isInteger(SAMPLE_COUNT) || SAMPLE_COUNT < 1 || SAMPLE_COUNT > 100) {
  throw new RangeError("Pass a sample count from 1 through 100.");
}

const baseHash = "a".repeat(64);
const stateHash = "b".repeat(64);
const initial = createCampaignLedger({
  campaignId: "campaign.benchmark",
  branchId: "branch.main",
  parentBranchId: null,
  forkedFromEntryHash: null,
  worldPackId: "pack.benchmark",
  worldPackVersion: "1.0.0",
  baseCanonHash: baseHash,
  baseStateHash: stateHash,
});

const entries: CampaignLedger["entries"] = [];
let cursor = initial.cursor;
for (let index = 0; index < EVENT_COUNT; index += 1) {
  const actorEntityId = `entity.${index % ENTITY_COUNT}`;
  const payload = {
    id: `event.${index}`,
    baseCursorHash: cursor.cursorHash,
    worldTick: index,
    source: {
      kind: "player" as const,
      actorEntityId,
      authorizingIntentId: `intent.${index}`,
    },
    actionTypeId: "action.advance",
    targetEntityIds: [actorEntityId],
    scope: "scene" as const,
    visibility: { scope: "public" as const, entityIds: [] as [] },
    causeEntryHashes: cursor.headEntryHash ? [cursor.headEntryHash] : [],
    evidenceClaimIds: [],
    evidenceRuleIds: [],
    traceIds: [],
    reversibility: "reversible" as const,
    irreversibleRuling: null,
    effects: [
      {
        effectId: `effect.${index}`,
        kind: "resource_delta" as const,
        entityId: actorEntityId,
        resourceId: `resource.${index % 40}`,
        delta: 1,
      },
    ],
    beforeStateHash: stateHash,
    afterStateHash: stateHash,
    transitionReceiptHash: null,
    sequence: index,
    previousEntryHash: cursor.headEntryHash,
  };
  const entry = CausalLedgerEntrySchema.parse({
    ...payload,
    entryHash: sha256Canonical(payload),
  });
  entries.push(entry);
  cursor = buildCampaignCursor({
    campaignId: cursor.campaignId,
    branchId: cursor.branchId,
    parentBranchId: cursor.parentBranchId,
    forkedFromEntryHash: cursor.forkedFromEntryHash,
    worldPackId: cursor.worldPackId,
    worldPackVersion: cursor.worldPackVersion,
    baseCanonHash: cursor.baseCanonHash,
    baseStateHash: cursor.baseStateHash,
    currentStateHash: stateHash,
    headEntryHash: entry.entryHash,
    entryCount: index + 1,
  });
}

const ledger = CampaignLedgerSchema.parse({ cursor, entries });
const focalEntityId = "entity.0";
const build = () => {
  const workingSet = buildCausalWorkingSet({
    ledger,
    focalEntityIds: [focalEntityId],
    viewerEntityIds: [focalEntityId],
    audience: "characters",
  });
  return { workingSet, compactContext: serializeCompactCausalContext(workingSet) };
};

build();
build();
const durationsMs: number[] = [];
let { workingSet, compactContext } = build();
for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
  const startedAt = performance.now();
  ({ workingSet, compactContext } = build());
  durationsMs.push(performance.now() - startedAt);
}
const sortedDurations = [...durationsMs].sort((left, right) => left - right);
const percentile = (fraction: number): number =>
  sortedDurations[Math.min(sortedDurations.length - 1, Math.ceil(fraction * sortedDurations.length) - 1)]!;

const lastEntry = entries.at(-1)!;
const prefixEntries = entries.slice(0, -1);
const prefixCursor = buildCampaignCursor({
  campaignId: cursor.campaignId,
  branchId: cursor.branchId,
  parentBranchId: cursor.parentBranchId,
  forkedFromEntryHash: cursor.forkedFromEntryHash,
  worldPackId: cursor.worldPackId,
  worldPackVersion: cursor.worldPackVersion,
  baseCanonHash: cursor.baseCanonHash,
  baseStateHash: cursor.baseStateHash,
  currentStateHash: stateHash,
  headEntryHash: prefixEntries.at(-1)?.entryHash ?? null,
  entryCount: prefixEntries.length,
});
if (prefixCursor.cursorHash !== lastEntry.baseCursorHash) {
  throw new Error("The benchmark prefix does not match the final event authority.");
}
const prefixLedger = CampaignLedgerSchema.parse({ cursor: prefixCursor, entries: prefixEntries });
const {
  sequence: lastSequence,
  previousEntryHash: lastPreviousEntryHash,
  entryHash: lastEntryHash,
  ...lastEvent
} = lastEntry;
void lastSequence;
void lastPreviousEntryHash;
void lastEntryHash;
const finalSource = lastEvent.source;
if (finalSource.kind !== "player") {
  throw new Error("The benchmark final event must be player-authored.");
}
const finalActorEntityId = finalSource.actorEntityId;
const finalIntentId = finalSource.authorizingIntentId;
const finalAuthorityHash = buildCampaignEventAuthorityHash(lastEvent);
const finalResourceIds = new Set(
  lastEvent.effects.flatMap((effect) =>
    effect.kind === "resource_delta" ? [effect.resourceId] : [],
  ),
);
const knownEntityIds = new Set(
  Array.from({ length: ENTITY_COUNT }, (_, index) => `entity.${index}`),
);
const prepareTurn = () => {
  const result = prepareCampaignTurn({
    ledger: prefixLedger,
    event: lastEvent,
    knownEntityIds,
    activeClaimIds: new Set(),
    activeRuleIds: new Set(),
    activeActionTypeIds: new Set([lastEvent.actionTypeId]),
    activeRelationAxisIds: new Set(),
    activeResourceIds: finalResourceIds,
    activeFlagIds: new Set(),
    activeClockIds: new Set(),
    activeDebtKindIds: new Set(),
    authorizedIntentReceipts: new Map([[finalIntentId, finalAuthorityHash]]),
    activeTriggerReceipts: new Map(),
    approvedRulingReceipts: new Map(),
    focalEntityIds: [finalActorEntityId],
    viewer: { kind: "participant", participantId: "participant.benchmark" },
    verifiedParticipantControl: new Map([
      ["participant.benchmark", new Set([finalActorEntityId])],
    ]),
  });
  if (result.status !== "applied") {
    throw new Error(`Benchmark turn was blocked: ${result.violations[0]?.code ?? "unknown"}`);
  }
  return result;
};
prepareTurn();
prepareTurn();
const turnDurationsMs: number[] = [];
for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
  const startedAt = performance.now();
  prepareTurn();
  turnDurationsMs.push(performance.now() - startedAt);
}
const sortedTurnDurations = [...turnDurationsMs].sort((left, right) => left - right);
const turnPercentile = (fraction: number): number =>
  sortedTurnDurations[
    Math.min(
      sortedTurnDurations.length - 1,
      Math.ceil(fraction * sortedTurnDurations.length) - 1,
    )
  ]!;
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const worktreeDirty =
  execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;

process.stdout.write(
  `${JSON.stringify({
    eventCount: EVENT_COUNT,
    entityCount: ENTITY_COUNT,
    sampleCount: SAMPLE_COUNT,
    warmupCount: 2,
    runtime: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
    },
    git: { head: gitHead, worktreeDirty },
    selectedEvents: workingSet.events.length,
    selectedResources: workingSet.resources.length,
    compactContextBytes: Buffer.byteLength(compactContext),
    contextDurationMs: {
      p50: Number(percentile(0.5).toFixed(3)),
      p95: Number(percentile(0.95).toFixed(3)),
      max: Number(sortedDurations.at(-1)!.toFixed(3)),
    },
    fullTurnDurationMs: {
      p50: Number(turnPercentile(0.5).toFixed(3)),
      p95: Number(turnPercentile(0.95).toFixed(3)),
      max: Number(sortedTurnDurations.at(-1)!.toFixed(3)),
    },
    truncated: workingSet.truncated,
  })}\n`,
);

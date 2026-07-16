import type {
  CampaignEventInput,
  CampaignLedger,
  CampaignLedgerViolation,
  CausalLedgerEntry,
} from "@/src/contracts/campaign";
import type { CausalWorkingSet } from "@/src/contracts/causal-context";
import {
  buildCausalWorkingSet,
  serializeCompactCausalContext,
  type CausalWorkingSetBudget,
} from "@/src/domain/causal-context";
import { appendCampaignEvent } from "@/src/domain/campaign";
import type {
  CampaignOntologyAuthority,
  CampaignTransitionAuthority,
} from "@/src/domain/campaign";

export type CampaignViewerPrincipal =
  | { kind: "facilitator" }
  | { kind: "participant"; participantId: string };

type PrepareCampaignTurnInput = CampaignOntologyAuthority & {
  ledger: CampaignLedger;
  event: CampaignEventInput;
  knownEntityIds: ReadonlySet<string>;
  activeClaimIds: ReadonlySet<string>;
  activeRuleIds: ReadonlySet<string>;
  authorizedIntentReceipts: ReadonlyMap<string, string>;
  activeTriggerReceipts: ReadonlyMap<string, string>;
  approvedRulingReceipts: ReadonlyMap<string, string>;
  transitionAuthority?: CampaignTransitionAuthority | null;
  focalEntityIds: string[];
  viewer: CampaignViewerPrincipal;
  verifiedParticipantControl: ReadonlyMap<string, ReadonlySet<string>>;
  budget?: CausalWorkingSetBudget;
};

export type PreparedCampaignTurn =
  | {
      status: "applied";
      ledger: CampaignLedger;
      entry: CausalLedgerEntry;
      violations: [];
      workingSet: CausalWorkingSet;
      nextNarrativeContext: string;
    }
  | {
      status: "blocked";
      ledger: CampaignLedger;
      entry: null;
      violations: CampaignLedgerViolation[];
      workingSet: null;
      nextNarrativeContext: null;
    };

/**
 * Applies one already-resolved branch event, then prepares the only dynamic
 * causal suffix the next narrative call needs. It never writes root canon and
 * never calls a model to summarize the ledger.
 */
export const prepareCampaignTurn = (input: PrepareCampaignTurnInput): PreparedCampaignTurn => {
  const eventId =
    typeof (input.event as { id?: unknown }).id === "string"
      ? input.event.id
      : "event.invalid";
  const viewerEntityIds =
    input.viewer.kind === "facilitator"
      ? []
      : [...(input.verifiedParticipantControl.get(input.viewer.participantId) ?? [])];
  const invalidViewer =
    (input.viewer.kind === "participant" && viewerEntityIds.length === 0) ||
    viewerEntityIds.some((entityId) => !input.knownEntityIds.has(entityId)) ||
    input.focalEntityIds.length === 0 ||
    input.focalEntityIds.some((entityId) => !input.knownEntityIds.has(entityId));
  if (invalidViewer) {
    return {
      status: "blocked",
      ledger: input.ledger,
      entry: null,
      violations: [
        {
          code: "viewer_authority_invalid",
          message: "The narrative viewer or focal entity is not authorized by campaign control.",
          evidenceIds:
            input.viewer.kind === "participant"
              ? [input.viewer.participantId]
              : input.focalEntityIds,
        },
      ],
      workingSet: null,
      nextNarrativeContext: null,
    };
  }

  let appended: ReturnType<typeof appendCampaignEvent>;
  try {
    appended = appendCampaignEvent({
      ledger: input.ledger,
      event: input.event,
      knownEntityIds: input.knownEntityIds,
      activeClaimIds: input.activeClaimIds,
      activeRuleIds: input.activeRuleIds,
      activeActionTypeIds: input.activeActionTypeIds,
      activeRelationAxisIds: input.activeRelationAxisIds,
      activeResourceIds: input.activeResourceIds,
      activeFlagIds: input.activeFlagIds,
      activeClockIds: input.activeClockIds,
      activeDebtKindIds: input.activeDebtKindIds,
      authorizedIntentReceipts: input.authorizedIntentReceipts,
      activeTriggerReceipts: input.activeTriggerReceipts,
      approvedRulingReceipts: input.approvedRulingReceipts,
      transitionAuthority: input.transitionAuthority,
    });
  } catch {
    return {
      status: "blocked",
      ledger: input.ledger,
      entry: null,
      violations: [
        {
          code: "event_input_invalid",
          message: "The campaign event failed strict input validation.",
          evidenceIds: [eventId],
        },
      ],
      workingSet: null,
      nextNarrativeContext: null,
    };
  }
  if (appended.status === "blocked" || !appended.entry) {
    return {
      status: "blocked",
      ledger: appended.ledger,
      entry: null,
      violations: appended.violations,
      workingSet: null,
      nextNarrativeContext: null,
    };
  }

  let workingSet: CausalWorkingSet;
  let nextNarrativeContext: string;
  try {
    workingSet = buildCausalWorkingSet({
      ledger: appended.ledger,
      focalEntityIds: input.focalEntityIds,
      viewerEntityIds,
      audience: input.viewer.kind === "facilitator" ? "facilitator" : "characters",
      budget: input.budget,
      pinnedEntryHashes: [appended.entry.entryHash],
    });
    nextNarrativeContext = serializeCompactCausalContext(workingSet);
  } catch {
    return {
      status: "blocked",
      ledger: input.ledger,
      entry: null,
      violations: [
        {
          code: "context_budget_exceeded",
          message: "The bounded causal context could not be prepared safely.",
          evidenceIds: [eventId],
        },
      ],
      workingSet: null,
      nextNarrativeContext: null,
    };
  }
  return {
    status: "applied",
    ledger: appended.ledger,
    entry: appended.entry,
    violations: [],
    workingSet,
    nextNarrativeContext,
  };
};

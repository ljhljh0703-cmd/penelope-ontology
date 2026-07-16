import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { ProposalPatch } from "@/src/contracts/proposal";
import { RunResultSchema, type RunResult } from "@/src/contracts/run";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import {
  hasValidOverlayHash,
  hasValidProposalHash,
} from "@/src/domain/canon-overlay";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { hasValidSnapshotHash } from "@/src/domain/simulation";

const EXPECTED_RULE_DESCRIPTION =
  "In this creator canon, Ithacans treat a returning ship's red sail as a signal to begin the royal harbor watch.";

export const LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID = "live-gpt56-primary";
export const LIVE_RED_SAIL_RETRY_ATTEMPT_ID = "live-gpt56-retry-1";
export const LIVE_RED_SAIL_REQUEST_SHA256 =
  "b341c779b81a03bda66a5d3c6c18146df7bb92750e49d594a161fac7e07fc1c7";
export const LIVE_RED_SAIL_WORLD_PACK_SHA256 =
  "22a97e0d2328dcf7b8a8a99605c7e72dd1d74455f99bf9e3ca8c0fcf30af94eb";

/**
 * Public-domain, synthetic preregistration for the single paid live-evidence call.
 *
 * Wording may vary, but model output cannot choose a different canon mutation.
 * The current creator overlay, initial snapshot, style profile, participant
 * authorities, and semantic proposal are fixed before dispatch.
 */
export const LIVE_RED_SAIL_SCENARIO_CONTRACT = {
  id: "live.trojan_returns.red_sail_proposal.v1",
  worldPack: {
    id: "trojan-returns-demo",
    version: "0.2.0",
  },
  sourceFixtures: {
    overlayId: "overlay.v0",
    snapshotId: "snapshot.s0",
  },
  authority: {
    overlayId: "creator_canon",
    overlayVersion: 0,
    overlayHash: "15fe0c8edf47d0a78322b08d33a598036b7498b7a2fb6ee2f90c64da01327806",
    scenarioId: "scenario.harbor_watch",
    baseStateId: "state.ithaca.odyssey_book_1",
    snapshotTurnIndex: 0,
    snapshotStateHash: "ffc558f0c9bd9139cd18c7408cb393b405d75698cc412d35cf345b1c5094f50e",
    styleProfileId: "style.table_ready_mythic",
  },
  request: {
    outputLocale: "en" as const,
    taskType: "expand" as const,
    brief:
      "Write a brief, playable scene in present-tense limited third person. Penelope refuses to treat a returning ship's red sail as proof of anyone's return; Telemachus proposes only a cautious harbor watch. Keep the custom outside canon and return exactly one proposal with id proposal.red_sail_signal containing exactly one add_rule patch: id rule.creator.red_sail_signal, kind expansion, description exactly: In this creator canon, Ithacans treat a returning ship's red sail as a signal to begin the royal harbor watch. Return no actions and no other proposal.",
    participantIntents: [
      {
        intentId: "intent.penelope",
        participantId: "participant.one",
        controlledEntityIds: ["penelope"],
        intent: "Keep the household from confusing a signal with certainty.",
      },
      {
        intentId: "intent.telemachus",
        participantId: "participant.two",
        controlledEntityIds: ["telemachus"],
        intent: "Propose a red-sail harbor signal and organize a cautious watch.",
      },
    ],
  },
  expected: {
    status: "needs_creator_decision" as const,
    modelOutcome: "completed" as const,
    allowedHardViolationCode: "unapproved_expansion" as const,
    proposalId: "proposal.red_sail_signal",
    patch: {
      op: "add_rule" as const,
      rule: {
        id: "rule.creator.red_sail_signal",
        kind: "expansion" as const,
        description: EXPECTED_RULE_DESCRIPTION,
      },
    },
    actions: [] as const,
  },
} as const;

type LiveScenarioAuthorityInput = {
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  styleProfileId: string;
};

export const hasLiveRedSailScenarioAuthority = ({
  overlay,
  snapshot,
  styleProfileId,
}: LiveScenarioAuthorityInput): boolean => {
  const { authority, worldPack } = LIVE_RED_SAIL_SCENARIO_CONTRACT;
  return (
    hasValidOverlayHash(overlay) &&
    hasValidSnapshotHash(snapshot) &&
    overlay.id === authority.overlayId &&
    overlay.version === authority.overlayVersion &&
    overlay.hash === authority.overlayHash &&
    overlay.worldPackId === worldPack.id &&
    overlay.worldPackVersion === worldPack.version &&
    snapshot.scenarioId === authority.scenarioId &&
    snapshot.baseStateId === authority.baseStateId &&
    snapshot.turnIndex === authority.snapshotTurnIndex &&
    snapshot.stateHash === authority.snapshotStateHash &&
    snapshot.worldPackVersion === worldPack.version &&
    snapshot.overlayId === authority.overlayId &&
    snapshot.overlayVersion === authority.overlayVersion &&
    snapshot.canonHash === authority.overlayHash &&
    snapshot.styleProfileId === authority.styleProfileId &&
    styleProfileId === authority.styleProfileId
  );
};

export const assertLiveRedSailScenarioAuthority = (
  input: LiveScenarioAuthorityInput,
): void => {
  if (!hasLiveRedSailScenarioAuthority(input)) {
    throw new Error(
      `Live scenario authority does not match ${LIVE_RED_SAIL_SCENARIO_CONTRACT.id}.`,
    );
  }
};

export type LiveRedSailRunIssue =
  | "result_schema_invalid"
  | "result_status_mismatch"
  | "model_trace_mismatch"
  | "registered_output_script_mismatch"
  | "participant_lineage_mismatch"
  | "style_binding_mismatch"
  | "action_expectation_mismatch"
  | "hard_violation_mismatch"
  | "proposal_count_mismatch"
  | "proposal_authority_mismatch"
  | "proposal_hash_invalid"
  | "proposal_semantic_patch_mismatch"
  | "snapshot_authority_mismatch"
  | "snapshot_mutated";

export type LiveRedSailRunVerdict = {
  ok: boolean;
  issues: LiveRedSailRunIssue[];
};

const hasExpectedSemanticPatch = (
  patches: ReadonlyArray<ProposalPatch>,
): boolean => {
  const expected = LIVE_RED_SAIL_SCENARIO_CONTRACT.expected.patch;
  if (patches.length !== 1) return false;
  const patch = patches[0];
  return (
    patch?.op === expected.op &&
    patch.rule.id === expected.rule.id &&
    patch.rule.kind === expected.rule.kind &&
    patch.rule.description === expected.rule.description
  );
};

const hasExpectedLineage = (result: RunResult): boolean => {
  if (result.modelOutcome.outcome !== "completed") return false;
  const { draft } = result.modelOutcome;
  const expected = [
    ["penelope", "intent.penelope"],
    ["telemachus", "intent.telemachus"],
  ] as const;
  const mentioned = new Set(draft.mentionedEntityIds);
  return expected.every(
    ([speakerId, authorizingIntentId]) =>
      mentioned.has(speakerId) &&
      draft.utterances.some(
        (utterance) =>
          utterance.speakerId === speakerId &&
          utterance.authorizingIntentId === authorizingIntentId,
      ),
  );
};

const UNICODE_LETTER = /\p{Letter}/u;
const LATIN_SCRIPT = /\p{Script=Latin}/u;

const generatedHumanReadableText = (result: RunResult): string[] => {
  if (result.modelOutcome.outcome !== "completed") return [];
  const { draft } = result.modelOutcome;
  return [
    draft.narrative,
    ...draft.utterances.map(({ text }) => text),
    ...draft.assertedClaims.flatMap((claim) => [
      claim.summary,
      ...(claim.object.kind === "literal" ? [claim.object.value] : []),
    ]),
    ...draft.unknowns,
    ...draft.proposals.flatMap((proposal) => [
      proposal.summary,
      ...proposal.patches.flatMap((patch) =>
        patch.op === "add_claim"
          ? [
              patch.claim.summary,
              ...(patch.claim.object.kind === "literal"
                ? [patch.claim.object.value]
                : []),
            ]
          : [
              patch.rule.description,
              ...(patch.rule.displayDescription === null
                ? []
                : [patch.rule.displayDescription]),
            ],
      ),
    ]),
  ];
};

/**
 * Narrow preregistration check for the English demo call.
 *
 * Every Unicode letter in generated prose must belong to the Latin script;
 * punctuation, digits, and emoji are allowed. This is deliberately not
 * described as language detection: Latin-script text can still be non-English
 * and requires creator review.
 */
export const passesRegisteredEnglishScriptCheck = (result: RunResult): boolean =>
  generatedHumanReadableText(result).every(
    (text) =>
      [...text].every(
        (character) =>
          !UNICODE_LETTER.test(character) || LATIN_SCRIPT.test(character),
      ),
  );

/**
 * Evaluates the raw, private RunResult before it may be sanitized as successful
 * live evidence. Human prose is deliberately not compared; all state-changing
 * semantic authority is.
 */
export const evaluateLiveRedSailRunResult = (
  input: unknown,
): LiveRedSailRunVerdict => {
  const parsed = RunResultSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: ["result_schema_invalid"] };
  }

  const result = parsed.data;
  const { authority, expected } = LIVE_RED_SAIL_SCENARIO_CONTRACT;
  const issues: LiveRedSailRunIssue[] = [];
  const draft =
    result.modelOutcome.outcome === "completed"
      ? result.modelOutcome.draft
      : null;
  const completed = draft !== null;

  if (result.status !== expected.status) issues.push("result_status_mismatch");
  if (
    !completed ||
    result.modelOutcome.trace.mode !== "live" ||
    result.modelOutcome.trace.outcome !== expected.modelOutcome ||
    result.modelOutcome.trace.requestedModel !== "gpt-5.6" ||
    !/^gpt-5\.6(?:$|-)/u.test(result.modelOutcome.trace.actualModel ?? "") ||
    (result.modelOutcome.trace.inputTokens ?? 0) <= 0 ||
    (result.modelOutcome.trace.outputTokens ?? 0) <= 0
  ) {
    issues.push("model_trace_mismatch");
  }

  if (!passesRegisteredEnglishScriptCheck(result)) {
    issues.push("registered_output_script_mismatch");
  }

  if (!hasExpectedLineage(result)) issues.push("participant_lineage_mismatch");
  if (
    !draft ||
    draft.styleProfileId !== authority.styleProfileId
  ) {
    issues.push("style_binding_mismatch");
  }
  if (
    !draft ||
    draft.actions.length !== expected.actions.length ||
    result.transitionCandidate !== null
  ) {
    issues.push("action_expectation_mismatch");
  }

  if (
    result.hardViolations.length !== 1 ||
    result.hardViolations[0]?.code !== expected.allowedHardViolationCode ||
    result.hardViolations[0]?.evidenceIds.length !== 1 ||
    result.hardViolations[0]?.evidenceIds[0] !== expected.proposalId
  ) {
    issues.push("hard_violation_mismatch");
  }

  const draftProposals = draft?.proposals ?? [];
  if (result.proposals.length !== 1 || draftProposals.length !== 1) {
    issues.push("proposal_count_mismatch");
  }
  const proposal = result.proposals[0];
  const draftProposal = draftProposals[0];
  if (
    proposal?.id !== expected.proposalId ||
    draftProposal?.id !== expected.proposalId ||
    proposal?.baseOverlayId !== authority.overlayId ||
    proposal?.baseOverlayVersion !== authority.overlayVersion ||
    proposal?.baseOverlayHash !== authority.overlayHash
  ) {
    issues.push("proposal_authority_mismatch");
  }
  if (!proposal || !hasValidProposalHash(proposal)) {
    issues.push("proposal_hash_invalid");
  }
  if (
    !proposal ||
    !draftProposal ||
    !hasExpectedSemanticPatch(proposal.patches) ||
    !hasExpectedSemanticPatch(draftProposal.patches)
  ) {
    issues.push("proposal_semantic_patch_mismatch");
  }

  if (
    result.currentSnapshot.stateHash !== authority.snapshotStateHash ||
    result.currentSnapshot.styleProfileId !== authority.styleProfileId ||
    result.currentSnapshot.overlayId !== authority.overlayId ||
    result.currentSnapshot.overlayVersion !== authority.overlayVersion ||
    result.currentSnapshot.canonHash !== authority.overlayHash ||
    !hasValidSnapshotHash(result.currentSnapshot)
  ) {
    issues.push("snapshot_authority_mismatch");
  }
  if (
    sha256Canonical(result.proposedNextSnapshot) !==
    sha256Canonical(result.currentSnapshot)
  ) {
    issues.push("snapshot_mutated");
  }

  return { ok: issues.length === 0, issues };
};

export const isLiveRedSailRunResultAccepted = (input: unknown): boolean =>
  evaluateLiveRedSailRunResult(input).ok;

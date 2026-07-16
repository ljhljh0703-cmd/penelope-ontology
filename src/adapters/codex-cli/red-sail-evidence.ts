import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CODEX_CLI_REQUESTED_MODEL,
  CodexCliNarrativeOutcomeSchema,
  CodexCliUsageSchema,
  type CodexCliNarrativeOutcome,
} from "@/src/adapters/codex-cli/contracts";
import { ModelDraftSchema, type ModelDraft } from "@/src/contracts/model-draft";
import type { RunRequest } from "@/src/contracts/run";
import type { StyleProfile } from "@/src/contracts/style-profile";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
} from "@/src/evidence/live-scenario-contract";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const UNICODE_LETTER = /\p{Letter}/u;
const LATIN_SCRIPT = /\p{Script=Latin}/u;

export const CodexCliRedSailIssueSchema = z.enum([
  "request_hash_mismatch",
  "draft_schema_invalid",
  "registered_output_script_mismatch",
  "participant_lineage_mismatch",
  "style_binding_mismatch",
  "style_receipt_mismatch",
  "action_expectation_mismatch",
  "asserted_claim_expectation_mismatch",
  "proposal_count_mismatch",
  "proposal_semantic_patch_mismatch",
]);

export type CodexCliRedSailIssue = z.infer<
  typeof CodexCliRedSailIssueSchema
>;

export type CodexCliRedSailVerdict = {
  ok: boolean;
  issues: CodexCliRedSailIssue[];
};

const humanReadableText = (draft: ModelDraft): string[] => [
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

export const passesCodexCliRegisteredEnglishScriptCheck = (
  draft: ModelDraft,
): boolean =>
  humanReadableText(draft).every((text) =>
    [...text].every(
      (character) =>
        !UNICODE_LETTER.test(character) || LATIN_SCRIPT.test(character),
    ),
  );

const hasExpectedLineage = (draft: ModelDraft): boolean => {
  const expected = [
    ["penelope", "intent.penelope"],
    ["telemachus", "intent.telemachus"],
  ] as const;
  const mentioned = new Set(draft.mentionedEntityIds);
  const registeredIntentIds = new Set<string>(
    LIVE_RED_SAIL_SCENARIO_CONTRACT.request.participantIntents.map(
      ({ intentId }) => intentId,
    ),
  );
  return (
    draft.utterances.every(
      ({ authorizingIntentId, contributingIntentIds }) =>
        registeredIntentIds.has(authorizingIntentId) &&
        contributingIntentIds.every((id) => registeredIntentIds.has(id)),
    ) &&
    expected.every(
      ([speakerId, authorizingIntentId]) =>
        mentioned.has(speakerId) &&
        draft.utterances.some(
          (utterance) =>
            utterance.speakerId === speakerId &&
            utterance.authorizingIntentId === authorizingIntentId,
        ),
    )
  );
};

const hasExpectedPatch = (draft: ModelDraft): boolean => {
  const expected = LIVE_RED_SAIL_SCENARIO_CONTRACT.expected;
  const proposal = draft.proposals[0];
  const patch = proposal?.patches[0];
  return (
    proposal?.id === expected.proposalId &&
    proposal.patches.length === 1 &&
    patch?.op === "add_rule" &&
    patch.rule.id === expected.patch.rule.id &&
    patch.rule.kind === expected.patch.rule.kind &&
    patch.rule.description === expected.patch.rule.description
  );
};

export const evaluateCodexCliRedSailDraft = ({
  request,
  draft: input,
  styleProfile,
}: {
  request: LiveRunRequest;
  draft: unknown;
  styleProfile: StyleProfile;
}): CodexCliRedSailVerdict => {
  const issues: CodexCliRedSailIssue[] = [];
  if (sha256Canonical(request) !== LIVE_RED_SAIL_REQUEST_SHA256) {
    issues.push("request_hash_mismatch");
  }
  const parsed = ModelDraftSchema.safeParse(input);
  if (!parsed.success) {
    issues.push("draft_schema_invalid");
    return { ok: false, issues };
  }
  const draft = parsed.data;
  if (!passesCodexCliRegisteredEnglishScriptCheck(draft)) {
    issues.push("registered_output_script_mismatch");
  }
  if (!hasExpectedLineage(draft)) {
    issues.push("participant_lineage_mismatch");
  }
  if (
    draft.styleProfileId !==
      LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.styleProfileId ||
    styleProfile.id !== LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.styleProfileId
  ) {
    issues.push("style_binding_mismatch");
  }
  const registeredStyleIds = new Set(
    styleProfile.constraints.map(({ id }) => id),
  );
  if (
    draft.appliedStyleConstraintIds.length === 0 ||
    draft.appliedStyleConstraintIds.some((id) => !registeredStyleIds.has(id))
  ) {
    issues.push("style_receipt_mismatch");
  }
  if (draft.actions.length !== 0) {
    issues.push("action_expectation_mismatch");
  }
  if (draft.assertedClaims.length !== 0) {
    issues.push("asserted_claim_expectation_mismatch");
  }
  if (draft.proposals.length !== 1) {
    issues.push("proposal_count_mismatch");
  }
  if (!hasExpectedPatch(draft)) {
    issues.push("proposal_semantic_patch_mismatch");
  }
  return { ok: issues.length === 0, issues };
};

export const CodexCliSanitizedEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("codex_cli_sanitized"),
    scenarioContractId: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.id),
    capturedAt: z.iso.datetime(),
    transport: z.literal("codex_cli"),
    authority: z
      .object({
        requestSha256: z.literal(LIVE_RED_SAIL_REQUEST_SHA256),
        worldPackId: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.id),
        worldPackVersion: z.literal(
          LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.version,
        ),
        worldPackSha256: HashSchema,
        styleProfileId: z.literal(
          LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.styleProfileId,
        ),
        overlayHash: z.literal(
          LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.overlayHash,
        ),
        stateHash: z.literal(
          LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.snapshotStateHash,
        ),
      })
      .strict(),
    requestedModel: z.literal(CODEX_CLI_REQUESTED_MODEL),
    actualModel: z.null(),
    responseId: z.null(),
    cliVersion: z.string().min(1),
    usage: CodexCliUsageSchema,
    threadIdSha256: HashSchema,
    modelInputSha256: HashSchema,
    promptSha256: HashSchema,
    outputSchemaSha256: HashSchema,
    executionContractSha256: HashSchema,
    approvalAuthoritySha256: HashSchema,
    jsonlSha256: HashSchema,
    finalMessageSha256: HashSchema,
    draftSha256: HashSchema,
    scenarioVerdict: z.literal("passed"),
    rawJsonlPublic: z.literal(false),
    rawFinalMessagePublic: z.literal(false),
    actualModelObserved: z.literal(false),
    responseIdObserved: z.literal(false),
  })
  .strict();

export type CodexCliSanitizedEvidence = z.infer<
  typeof CodexCliSanitizedEvidenceSchema
>;

export const buildCodexCliSanitizedEvidence = ({
  capturedAt,
  request,
  worldPackSha256,
  styleProfile,
  outcome: input,
}: {
  capturedAt: string;
  request: LiveRunRequest;
  worldPackSha256: string;
  styleProfile: StyleProfile;
  outcome: CodexCliNarrativeOutcome;
}): CodexCliSanitizedEvidence => {
  const outcome = CodexCliNarrativeOutcomeSchema.parse(input);
  if (outcome.outcome !== "completed") {
    throw new Error("Only a completed Codex CLI outcome can be sanitized.");
  }
  const verdict = evaluateCodexCliRedSailDraft({
    request,
    draft: outcome.draft,
    styleProfile,
  });
  if (!verdict.ok) {
    throw new Error(
      `Codex CLI red-sail evidence failed: ${verdict.issues.join(",")}`,
    );
  }
  if (
    outcome.trace.requestSha256 !== LIVE_RED_SAIL_REQUEST_SHA256 ||
    outcome.trace.worldPackSha256 !== worldPackSha256
  ) {
    throw new Error(
      "Codex CLI trace is not bound to the registered request and world pack.",
    );
  }
  return CodexCliSanitizedEvidenceSchema.parse({
    schemaVersion: 1,
    evidenceType: "codex_cli_sanitized",
    scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
    capturedAt,
    transport: "codex_cli",
    authority: {
      requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
      worldPackId: LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.id,
      worldPackVersion: LIVE_RED_SAIL_SCENARIO_CONTRACT.worldPack.version,
      worldPackSha256,
      styleProfileId: LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.styleProfileId,
      overlayHash: LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.overlayHash,
      stateHash: LIVE_RED_SAIL_SCENARIO_CONTRACT.authority.snapshotStateHash,
    },
    requestedModel: outcome.trace.requestedModel,
    actualModel: null,
    responseId: null,
    cliVersion: outcome.trace.cliVersion,
    usage: outcome.trace.usage,
    threadIdSha256: createHash("sha256")
      .update(outcome.trace.threadId)
      .digest("hex"),
    modelInputSha256: outcome.trace.modelInputSha256,
    promptSha256: outcome.trace.promptSha256,
    outputSchemaSha256: outcome.trace.outputSchemaSha256,
    executionContractSha256: outcome.trace.executionContractSha256,
    approvalAuthoritySha256: outcome.trace.approvalAuthoritySha256,
    jsonlSha256: outcome.trace.jsonlSha256,
    finalMessageSha256: outcome.trace.finalMessageSha256,
    draftSha256: sha256Canonical(outcome.draft),
    scenarioVerdict: "passed",
    rawJsonlPublic: false,
    rawFinalMessagePublic: false,
    actualModelObserved: false,
    responseIdObserved: false,
  });
};

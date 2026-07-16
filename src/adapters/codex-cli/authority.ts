import {
  getCodexCliCaptureAttempt,
  type CodexCliCaptureMode,
} from "@/src/adapters/codex-cli/attempt";
import {
  CODEX_CLI_REQUESTED_MODEL,
  CodexCliApprovalAuthoritySchema,
  CodexCliReviewPacketSchema,
  type CodexCliApprovalAuthority,
  type CodexCliReviewPacket,
} from "@/src/adapters/codex-cli/contracts";
import {
  buildCodexCliExecutionContract,
} from "@/src/adapters/codex-cli/execution-contract";
import {
  buildCodexCliModelInput,
  buildCodexCliPrompt,
  type CodexCliNarrativeModelInput,
} from "@/src/adapters/codex-cli/narrative-model";
import {
  type CodexCliOutputSchema,
} from "@/src/adapters/codex-cli/output-schema";
import { getCodexCliOutputSchema } from "@/src/adapters/codex-cli/schema-policy";
import { CODEX_CLI_FAILURE_DIAGNOSTIC_POLICY } from "@/src/adapters/codex-cli/process-diagnostics";
import {
  LiveRunRequestSchema,
  type EvidenceBundle,
  type RunRequest,
} from "@/src/contracts/run";
import type { StyleProfile } from "@/src/contracts/style-profile";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { normalizeParticipantIntents } from "@/src/domain/participants";
import { retrieveEvidence } from "@/src/domain/retrieval";
import { WorldPackSchema, type WorldPack } from "@/src/domain/schemas";
import {
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
  LIVE_RED_SAIL_WORLD_PACK_SHA256,
} from "@/src/evidence/live-scenario-contract";

type LiveRunRequest = Extract<RunRequest, { modelMode: "live" }>;

export type CodexCliAuthorityBundle = {
  worldPack: WorldPack;
  request: LiveRunRequest;
  evidence: EvidenceBundle;
  styleProfile: StyleProfile;
  modelInput: CodexCliNarrativeModelInput;
  prompt: string;
  outputSchema: CodexCliOutputSchema;
  executionContract: ReturnType<typeof buildCodexCliExecutionContract>;
  diagnosticPolicy?: typeof CODEX_CLI_FAILURE_DIAGNOSTIC_POLICY;
  authority: CodexCliApprovalAuthority;
  approvalAuthoritySha256: string;
};

const assertRegisteredHash = (actual: string, expected: string): void => {
  if (actual !== expected) {
    throw new Error("codex_cli_registered_hash_mismatch");
  }
};

export const buildCodexCliAuthorityBundle = ({
  worldPack: worldPackInput,
  request: requestInput,
  command = "codex",
  mode = "primary",
  previousAttemptReceiptSha256,
}: {
  worldPack: unknown;
  request: unknown;
  command?: string;
  mode?: CodexCliCaptureMode;
  previousAttemptReceiptSha256?: string;
}): CodexCliAuthorityBundle => {
  const attempt = getCodexCliCaptureAttempt(mode);
  if (
    (mode === "primary" && previousAttemptReceiptSha256 !== undefined) ||
    (mode === "retry" && previousAttemptReceiptSha256 === undefined)
  ) {
    throw new Error("codex_cli_previous_receipt_binding_invalid");
  }
  const worldPack = WorldPackSchema.parse(worldPackInput);
  const request = LiveRunRequestSchema.parse(requestInput);
  assertRegisteredHash(
    sha256Canonical(worldPack),
    LIVE_RED_SAIL_WORLD_PACK_SHA256,
  );
  assertRegisteredHash(
    sha256Canonical(request),
    LIVE_RED_SAIL_REQUEST_SHA256,
  );

  const participants = normalizeParticipantIntents(
    request.participantIntents,
    worldPack,
  );
  const evidence = retrieveEvidence({
    pack: worldPack,
    overlay: request.overlay,
    snapshot: request.snapshot,
    participantIntents: participants.intents,
    brief: request.brief,
  });
  const styleProfile = worldPack.styleProfiles.find(
    ({ id }) => id === request.styleProfileId,
  );
  if (!styleProfile) {
    throw new Error("codex_cli_registered_style_profile_missing");
  }

  const modelInput = buildCodexCliModelInput({
    request,
    evidence,
    styleProfile,
  });
  const prompt = buildCodexCliPrompt(modelInput);
  const outputSchema = getCodexCliOutputSchema(attempt.attemptId);
  const diagnosticPolicy = mode === "retry"
    ? CODEX_CLI_FAILURE_DIAGNOSTIC_POLICY
    : undefined;
  const executionContract = buildCodexCliExecutionContract({ command });
  const authority = CodexCliApprovalAuthoritySchema.parse({
    schemaVersion: 1,
    scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
    attemptId: attempt.attemptId,
    transport: "codex_cli",
    requestedModel: CODEX_CLI_REQUESTED_MODEL,
    requestSha256: sha256Canonical(request),
    worldPackSha256: sha256Canonical(worldPack),
    modelInputSha256: sha256Canonical(modelInput),
    promptSha256: sha256Canonical(prompt),
    outputSchemaSha256: sha256Canonical(outputSchema),
    executionContractSha256: sha256Canonical(executionContract),
    ...(previousAttemptReceiptSha256
      ? { previousAttemptReceiptSha256 }
      : {}),
    ...(diagnosticPolicy
      ? { diagnosticPolicySha256: sha256Canonical(diagnosticPolicy) }
      : {}),
  });
  return {
    worldPack,
    request,
    evidence,
    styleProfile,
    modelInput,
    prompt,
    outputSchema,
    executionContract,
    ...(diagnosticPolicy ? { diagnosticPolicy } : {}),
    authority,
    approvalAuthoritySha256: sha256Canonical(authority),
  };
};

export const buildCodexCliReviewPacket = (
  bundle: CodexCliAuthorityBundle,
): CodexCliReviewPacket =>
  CodexCliReviewPacketSchema.parse({
    schemaVersion: 1,
    evidenceType: "codex_cli_capture_review",
    authority: bundle.authority,
    approvalAuthoritySha256: bundle.approvalAuthoritySha256,
    modelInput: bundle.modelInput,
    prompt: bundle.prompt,
    outputSchema: bundle.outputSchema,
    executionContract: bundle.executionContract,
    ...(bundle.diagnosticPolicy
      ? { diagnosticPolicy: bundle.diagnosticPolicy }
      : {}),
  });

export const isCodexCliReviewPacketBound = ({
  packet,
  bundle,
}: {
  packet: CodexCliReviewPacket;
  bundle: CodexCliAuthorityBundle;
}): boolean =>
  sha256Canonical(packet.authority) === packet.approvalAuthoritySha256 &&
  packet.approvalAuthoritySha256 === bundle.approvalAuthoritySha256 &&
  sha256Canonical(packet.modelInput) === bundle.authority.modelInputSha256 &&
  sha256Canonical(packet.prompt) === bundle.authority.promptSha256 &&
  sha256Canonical(packet.outputSchema) ===
    bundle.authority.outputSchemaSha256 &&
  sha256Canonical(packet.executionContract) ===
    bundle.authority.executionContractSha256 &&
  (bundle.diagnosticPolicy
    ? sha256Canonical(packet.diagnosticPolicy) ===
        bundle.authority.diagnosticPolicySha256
    : packet.diagnosticPolicy === undefined &&
      bundle.authority.diagnosticPolicySha256 === undefined) &&
  sha256Canonical(packet) === sha256Canonical(buildCodexCliReviewPacket(bundle));

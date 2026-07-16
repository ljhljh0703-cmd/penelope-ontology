import { z } from "zod";
import {
  CodexCliApprovalAuthoritySchema,
  CodexCliHashSchema,
  type CodexCliApprovalAuthority,
} from "@/src/adapters/codex-cli/contracts";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { LIVE_RED_SAIL_SCENARIO_CONTRACT } from "@/src/evidence/live-scenario-contract";
import {
  CODEX_CLI_CAPTURE_ATTEMPTS,
  CODEX_CLI_PRIMARY_ATTEMPT_ID,
  CODEX_CLI_RETRY_ATTEMPT_ID,
  CodexCliCaptureAttemptIdSchema,
} from "@/src/adapters/codex-cli/attempt";

export const CODEX_CLI_CAPTURE_ATTEMPT_ID =
  CODEX_CLI_PRIMARY_ATTEMPT_ID;
export const CODEX_CLI_CAPTURE_RETRY_ATTEMPT_ID =
  CODEX_CLI_RETRY_ATTEMPT_ID;
export const CODEX_CLI_CAPTURE_APPROVAL_LOCATOR =
  CODEX_CLI_CAPTURE_ATTEMPTS.primary.approvalLocator;
export const CODEX_CLI_CAPTURE_REVIEW_LOCATOR =
  CODEX_CLI_CAPTURE_ATTEMPTS.primary.reviewLocator;

export const CodexCliCaptureApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("codex_cli_capture_approval"),
    authority: CodexCliApprovalAuthoritySchema.extend({
      scenarioContractId: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.id),
      attemptId: CodexCliCaptureAttemptIdSchema,
    }),
    approvalAuthoritySha256: CodexCliHashSchema,
    approved: z.literal(true),
  })
  .strict();

export type CodexCliCaptureApproval = z.infer<
  typeof CodexCliCaptureApprovalSchema
>;

export const buildCodexCliCaptureApproval = ({
  authority: authorityInput,
  approvalAuthoritySha256,
}: {
  authority: CodexCliApprovalAuthority;
  approvalAuthoritySha256: string;
}): CodexCliCaptureApproval => {
  const authority = CodexCliApprovalAuthoritySchema.parse(authorityInput);
  if (sha256Canonical(authority) !== approvalAuthoritySha256) {
    throw new Error("codex_cli_approval_authority_hash_mismatch");
  }
  return CodexCliCaptureApprovalSchema.parse({
    schemaVersion: 1,
    evidenceType: "codex_cli_capture_approval",
    authority,
    approvalAuthoritySha256,
    approved: true,
  });
};

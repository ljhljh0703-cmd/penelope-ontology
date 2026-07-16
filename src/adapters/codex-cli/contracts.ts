import { z } from "zod";
import { ModelDraftSchema } from "@/src/contracts/model-draft";
import { CodexCliCaptureAttemptIdSchema } from "@/src/adapters/codex-cli/attempt";

export const CODEX_CLI_REQUESTED_MODEL = "gpt-5.6-sol" as const;

export const CodexCliHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const TokenCountSchema = z.number().int().nonnegative();

export const CodexCliApprovalAuthoritySchema = z
  .object({
    schemaVersion: z.literal(1),
    scenarioContractId: z.string().min(1),
    attemptId: CodexCliCaptureAttemptIdSchema,
    transport: z.literal("codex_cli"),
    requestedModel: z.literal(CODEX_CLI_REQUESTED_MODEL),
    requestSha256: CodexCliHashSchema,
    worldPackSha256: CodexCliHashSchema,
    modelInputSha256: CodexCliHashSchema,
    promptSha256: CodexCliHashSchema,
    outputSchemaSha256: CodexCliHashSchema,
    executionContractSha256: CodexCliHashSchema,
    previousAttemptReceiptSha256: CodexCliHashSchema.optional(),
    diagnosticPolicySha256: CodexCliHashSchema.optional(),
  })
  .strict();

export const CodexCliReviewPacketSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("codex_cli_capture_review"),
    authority: CodexCliApprovalAuthoritySchema,
    approvalAuthoritySha256: CodexCliHashSchema,
    modelInput: z.unknown(),
    prompt: z.string().min(1),
    outputSchema: z.unknown(),
    executionContract: z.unknown(),
    diagnosticPolicy: z.unknown().optional(),
  })
  .strict();

export const CodexCliUsageSchema = z
  .object({
    inputTokens: TokenCountSchema,
    cachedInputTokens: TokenCountSchema,
    outputTokens: TokenCountSchema,
    reasoningOutputTokens: TokenCountSchema,
  })
  .strict();

export const CodexCliTraceSchema = z
  .object({
    schemaVersion: z.literal(1),
    transport: z.literal("codex_cli"),
    requestedModel: z.literal(CODEX_CLI_REQUESTED_MODEL),
    actualModel: z.null(),
    responseId: z.null(),
    threadId: z.uuid(),
    cliVersion: z.string().regex(/^codex-cli \d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u),
    usage: CodexCliUsageSchema,
    requestSha256: CodexCliHashSchema,
    worldPackSha256: CodexCliHashSchema,
    modelInputSha256: CodexCliHashSchema,
    promptSha256: CodexCliHashSchema,
    outputSchemaSha256: CodexCliHashSchema,
    executionContractSha256: CodexCliHashSchema,
    approvalAuthoritySha256: CodexCliHashSchema,
    jsonlSha256: CodexCliHashSchema,
    finalMessageSha256: CodexCliHashSchema,
    isolation: z
      .object({
        ephemeral: z.literal(true),
        ignoredUserConfig: z.literal(true),
        ignoredRules: z.literal(true),
        skippedGitRepoCheck: z.literal(true),
        sandbox: z.literal("read-only"),
        emptyWorkingDirectory: z.literal(true),
        stdinPrompt: z.literal(true),
        structuredOutput: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const CodexCliFailureKindSchema = z.enum([
  "configuration_error",
  "input_schema_error",
  "timeout",
  "process_error",
  "event_stream_error",
  "prohibited_activity",
  "output_schema_error",
  "provenance_error",
]);

const CodexCliFailureSchema = z
  .object({
    outcome: z.literal("failed"),
    failure: z
      .object({
        kind: CodexCliFailureKindSchema,
        code: z.string().regex(/^[a-z0-9_]{1,80}$/u),
        retryable: z.boolean(),
      })
      .strict(),
    transport: z.literal("codex_cli"),
    requestedModel: z.literal(CODEX_CLI_REQUESTED_MODEL),
  })
  .strict();

const CodexCliCompletedSchema = z
  .object({
    outcome: z.literal("completed"),
    draft: ModelDraftSchema,
    trace: CodexCliTraceSchema,
  })
  .strict();

export const CodexCliNarrativeOutcomeSchema = z.discriminatedUnion("outcome", [
  CodexCliCompletedSchema,
  CodexCliFailureSchema,
]);

export type CodexCliUsage = z.infer<typeof CodexCliUsageSchema>;
export type CodexCliApprovalAuthority = z.infer<
  typeof CodexCliApprovalAuthoritySchema
>;
export type CodexCliReviewPacket = z.infer<
  typeof CodexCliReviewPacketSchema
>;
export type CodexCliTrace = z.infer<typeof CodexCliTraceSchema>;
export type CodexCliNarrativeOutcome = z.infer<
  typeof CodexCliNarrativeOutcomeSchema
>;

export const CODEX_CLI_ISOLATION = {
  ephemeral: true,
  ignoredUserConfig: true,
  ignoredRules: true,
  skippedGitRepoCheck: true,
  sandbox: "read-only",
  emptyWorkingDirectory: true,
  stdinPrompt: true,
  structuredOutput: true,
} as const;

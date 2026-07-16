import { z } from "zod";
import {
  CODEX_CLI_REQUESTED_MODEL,
  CodexCliNarrativeOutcomeSchema,
  CodexCliUsageSchema,
} from "@/src/adapters/codex-cli/contracts";
import { CodexCliProcessDiagnosticsSchema } from "@/src/adapters/codex-cli/process-diagnostics";
import {
  CODEX_CLI_PRIMARY_ATTEMPT_ID,
  CODEX_CLI_RETRY_ATTEMPT_ID,
} from "@/src/adapters/codex-cli/attempt";
import { LiveRunRequestSchema } from "@/src/contracts/run";
import {
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
} from "@/src/evidence/live-scenario-contract";

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const CodexCliRawCaptureSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("codex_cli_raw_capture"),
    scenarioContractId: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.id),
    capturedAt: z.iso.datetime(),
    transport: z.literal("codex_cli"),
    request: LiveRunRequestSchema,
    outcome: CodexCliNarrativeOutcomeSchema,
    privateCapture: z
      .object({
        jsonl: z.string().min(1),
        finalMessage: z.string().min(1),
        stderr: z.string(),
      })
      .strict(),
  })
  .strict();

const CodexCliCaptureReceiptShape = {
  schemaVersion: z.literal(1),
    evidenceType: z.literal("codex_cli_capture_attempt"),
    scenarioContractId: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.id),
    transport: z.literal("codex_cli"),
    requestSha256: z.literal(LIVE_RED_SAIL_REQUEST_SHA256),
    worldPackSha256: HashSchema,
    modelInputSha256: HashSchema,
    promptSha256: HashSchema,
    outputSchemaSha256: HashSchema,
    executionContractSha256: HashSchema,
    approvalAuthoritySha256: HashSchema,
    requestedModel: z.literal(CODEX_CLI_REQUESTED_MODEL),
    actualModel: z.null(),
    responseId: z.null(),
    actualModelObserved: z.literal(false),
    responseIdObserved: z.literal(false),
    cliVersion: z.string().min(1),
    dispatchedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    outcome: z.enum(["persisted", "typed_failure", "persistence_failure"]),
    failureCode: z.string().regex(/^[a-z0-9_]{1,80}$/u).nullable(),
    retryable: z.boolean().nullable(),
    usage: CodexCliUsageSchema.nullable(),
    threadIdSha256: HashSchema.nullable(),
    jsonlSha256: HashSchema.nullable(),
    finalMessageSha256: HashSchema.nullable(),
    sanitizedEvidenceSha256: HashSchema.nullable(),
    rawPersisted: z.boolean(),
  publicPersisted: z.boolean(),
} as const;

export const CodexCliCaptureReceiptSchema = z.discriminatedUnion("attemptId", [
  z
    .object({
      ...CodexCliCaptureReceiptShape,
      attemptId: z.literal(CODEX_CLI_PRIMARY_ATTEMPT_ID),
      processDiagnostics: CodexCliProcessDiagnosticsSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...CodexCliCaptureReceiptShape,
      attemptId: z.literal(CODEX_CLI_RETRY_ATTEMPT_ID),
      processDiagnostics: CodexCliProcessDiagnosticsSchema.nullable(),
    })
    .strict(),
]);

export const CodexCliDispatchReservationSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("codex_cli_dispatch_reservation"),
    attemptId: z.enum([
      CODEX_CLI_PRIMARY_ATTEMPT_ID,
      CODEX_CLI_RETRY_ATTEMPT_ID,
    ]),
    scenarioContractId: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.id),
    transport: z.literal("codex_cli"),
    requestSha256: z.literal(LIVE_RED_SAIL_REQUEST_SHA256),
    worldPackSha256: HashSchema,
    modelInputSha256: HashSchema,
    promptSha256: HashSchema,
    outputSchemaSha256: HashSchema,
    executionContractSha256: HashSchema,
    approvalAuthoritySha256: HashSchema,
    requestedModel: z.literal(CODEX_CLI_REQUESTED_MODEL),
    reservedAt: z.iso.datetime(),
  })
  .strict();

export type CodexCliCaptureReceipt = z.infer<
  typeof CodexCliCaptureReceiptSchema
>;
export type CodexCliRawCapture = z.infer<typeof CodexCliRawCaptureSchema>;

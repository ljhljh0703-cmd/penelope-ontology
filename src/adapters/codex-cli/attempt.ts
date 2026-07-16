import { z } from "zod";

export const CODEX_CLI_PRIMARY_ATTEMPT_ID =
  "codex-cli-gpt56-sol-primary" as const;
export const CODEX_CLI_RETRY_ATTEMPT_ID =
  "codex-cli-gpt56-sol-retry-1" as const;

export const CodexCliCaptureAttemptIdSchema = z.enum([
  CODEX_CLI_PRIMARY_ATTEMPT_ID,
  CODEX_CLI_RETRY_ATTEMPT_ID,
]);

export type CodexCliCaptureAttemptId = z.infer<
  typeof CodexCliCaptureAttemptIdSchema
>;
export type CodexCliCaptureMode = "primary" | "retry";

type CodexCliCaptureAttemptConfig = {
  mode: CodexCliCaptureMode;
  attemptId: CodexCliCaptureAttemptId;
  outputSchemaPolicy: "legacy_draft_07" | "openai_sdk_normalized";
  approvalLocator: string;
  reviewLocator: string;
  rawLocator: string;
  publicLocator: string;
  lockLocator: string;
  reservationLocator: string;
  receiptLocator: string;
  previousReceiptLocator: string | null;
};

export const CODEX_CLI_CAPTURE_ATTEMPTS = {
  primary: {
    mode: "primary",
    attemptId: CODEX_CLI_PRIMARY_ATTEMPT_ID,
    outputSchemaPolicy: "legacy_draft_07",
    approvalLocator: "artifacts/live/codex-cli/capture-approval.json",
    reviewLocator: "artifacts/live/codex-cli/review-packet.json",
    rawLocator: "artifacts/live/codex-cli/red-sail-capture.json",
    publicLocator: "artifacts/evidence/codex-cli-sanitized.json",
    lockLocator: "artifacts/live/codex-cli/capture.lock.json",
    reservationLocator: "artifacts/live/codex-cli/dispatch.pending.json",
    receiptLocator: "artifacts/live/codex-cli/capture-receipt.json",
    previousReceiptLocator: null,
  },
  retry: {
    mode: "retry",
    attemptId: CODEX_CLI_RETRY_ATTEMPT_ID,
    outputSchemaPolicy: "openai_sdk_normalized",
    approvalLocator: "artifacts/live/codex-cli/retry-1-capture-approval.json",
    reviewLocator: "artifacts/live/codex-cli/retry-1-review-packet.json",
    rawLocator: "artifacts/live/codex-cli/red-sail-capture.json",
    publicLocator: "artifacts/evidence/codex-cli-sanitized.json",
    lockLocator: "artifacts/live/codex-cli/capture.lock.json",
    reservationLocator: "artifacts/live/codex-cli/retry-1-dispatch.pending.json",
    receiptLocator: "artifacts/live/codex-cli/retry-1-capture-receipt.json",
    previousReceiptLocator: "artifacts/live/codex-cli/capture-receipt.json",
  },
} as const satisfies Record<CodexCliCaptureMode, CodexCliCaptureAttemptConfig>;

export const getCodexCliCaptureAttempt = (
  mode: CodexCliCaptureMode = "primary",
): CodexCliCaptureAttemptConfig => CODEX_CLI_CAPTURE_ATTEMPTS[mode];

export const parseCodexCliCaptureModeArgs = (
  args: readonly string[],
): CodexCliCaptureMode => {
  if (args.length === 0) return "primary";
  if (args.length === 1 && args[0] === "--retry") return "retry";
  throw new Error("arguments_invalid");
};

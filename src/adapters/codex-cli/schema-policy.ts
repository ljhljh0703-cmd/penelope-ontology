import {
  CODEX_CLI_PRIMARY_ATTEMPT_ID,
  CODEX_CLI_RETRY_ATTEMPT_ID,
  type CodexCliCaptureAttemptId,
} from "@/src/adapters/codex-cli/attempt";
import {
  CODEX_CLI_MODEL_DRAFT_OUTPUT_SCHEMA,
  type CodexCliOutputSchema,
} from "@/src/adapters/codex-cli/output-schema";
import { MODEL_DRAFT_JSON_SCHEMA } from "@/src/contracts/model-draft";

export const getCodexCliOutputSchema = (
  attemptId: CodexCliCaptureAttemptId,
): CodexCliOutputSchema => {
  if (attemptId === CODEX_CLI_PRIMARY_ATTEMPT_ID) {
    return MODEL_DRAFT_JSON_SCHEMA;
  }
  if (attemptId === CODEX_CLI_RETRY_ATTEMPT_ID) {
    return CODEX_CLI_MODEL_DRAFT_OUTPUT_SCHEMA;
  }
  return attemptId satisfies never;
};

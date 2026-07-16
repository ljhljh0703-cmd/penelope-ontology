import {
  CODEX_CLI_ISOLATION,
  CODEX_CLI_REQUESTED_MODEL,
} from "@/src/adapters/codex-cli/contracts";
import {
  DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES,
  DEFAULT_CODEX_CLI_TIMEOUT_MS,
} from "@/src/adapters/codex-cli/process-runner";
import { sha256Canonical } from "@/src/domain/canonical-json";

export const CODEX_CLI_SCHEMA_PATH_PLACEHOLDER = "<output-schema-path>";
export const CODEX_CLI_OUTPUT_PATH_PLACEHOLDER = "<last-message-path>";

export const CODEX_CLI_SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "CODEX_HOME",
  "NODE_ENV",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const;

export const buildCodexCliArgs = ({
  schemaPath,
  outputPath,
}: {
  schemaPath: string;
  outputPath: string;
}): string[] => [
  "exec",
  "--ephemeral",
  "--ignore-user-config",
  "--ignore-rules",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--model",
  CODEX_CLI_REQUESTED_MODEL,
  "--output-schema",
  schemaPath,
  "--output-last-message",
  outputPath,
  "--json",
  "--color",
  "never",
  "-",
];

export const buildCodexCliEnvironment = (
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv =>
  Object.fromEntries(
    CODEX_CLI_SAFE_ENV_KEYS.flatMap((key) =>
      source[key] === undefined ? [] : [[key, source[key]]],
    ),
  ) as NodeJS.ProcessEnv;

export const buildCodexCliExecutionContract = ({
  command = "codex",
  timeoutMs = DEFAULT_CODEX_CLI_TIMEOUT_MS,
  outputLimitBytes = DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES,
}: {
  command?: string;
  timeoutMs?: number;
  outputLimitBytes?: number;
} = {}) => ({
  schemaVersion: 1 as const,
  transport: "codex_cli" as const,
  command,
  argsTemplate: buildCodexCliArgs({
    schemaPath: CODEX_CLI_SCHEMA_PATH_PLACEHOLDER,
    outputPath: CODEX_CLI_OUTPUT_PATH_PLACEHOLDER,
  }),
  timeoutMs,
  outputLimitBytes,
  promptViaStdin: true as const,
  safeEnvironmentKeys: [...CODEX_CLI_SAFE_ENV_KEYS],
  isolation: CODEX_CLI_ISOLATION,
});

export const codexCliExecutionContractSha256 = (input?: {
  command?: string;
  timeoutMs?: number;
  outputLimitBytes?: number;
}): string => sha256Canonical(buildCodexCliExecutionContract(input));

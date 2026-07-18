import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { resolveCodexCliCommand } from "@/src/adapters/codex-cli/command";
import { buildCodexCliEnvironment } from "@/src/adapters/codex-cli/execution-contract";
import {
  DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES,
  DEFAULT_CODEX_CLI_TIMEOUT_MS,
  CodexCliProcessRunnerError,
  runCodexCliProcess,
  type CodexCliProcessInvocation,
  type CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";
import {
  WorldNarrationRequestSchema,
  WorldNarrationSchema,
  WorldNarratorOutcomeSchema,
  validateWorldNarration,
  type WorldNarrationRequest,
  type WorldNarratorOutcome,
} from "@/src/contracts/world-narrator";
import { canonicalJson } from "@/src/domain/canonical-json";
import type { WorldNarrator } from "@/src/ports/world-narrator";

export const CODEX_CLI_WORLD_NARRATOR_REQUESTED_MODEL =
  "gpt-5.6-sol" as const;
export const CODEX_CLI_WORLD_NARRATOR_ADAPTER_ID =
  "world_narrator_codex_cli_v1" as const;

export const CODEX_CLI_WORLD_NARRATOR_OUTPUT_SCHEMA = z.toJSONSchema(
  WorldNarrationSchema,
  {
    target: "draft-07",
    reused: "inline",
  },
);

export type CodexCliWorldNarratorCommandResolver = (
  env: NodeJS.ProcessEnv,
) => Promise<string>;

export type CodexCliWorldNarratorOptions = {
  env?: NodeJS.ProcessEnv;
  commandResolver?: CodexCliWorldNarratorCommandResolver;
  processRunner?: CodexCliProcessRunner;
  timeoutMs?: number;
  outputLimitBytes?: number;
  tempRoot?: string;
};

const MODEL_INSTRUCTIONS = [
  "You are the world narrator for Penelope Ontology.",
  "Return only the structured world narration required by the supplied JSON schema.",
  "Write the prose in English using 120 through 180 words.",
  "Narrate only the observable facts, focal knowledge, previous visible scene summary, and already-resolved events in WORLD_NARRATION_REQUEST_JSON.",
  "Do not invent or mutate world state, canon, effects, knowledge, identities, motives, branch data, event results, or future actions.",
  "Render every supplied resolved event and ground it with its exact eventId; cite only supplied factIds and eventIds.",
  "Use the supplied style constraints only to shape expression, never to change facts or resolved events; preserve each ownership label exactly.",
  "Keep the focal viewpoint inside what focalEntityId can perceive or already knows.",
  "Copy nextActionCandidates exactly and in order into nextActions; do not complete, combine, reassign, or rewrite them.",
  "The prose field must exactly concatenate the ordered segment text fields with two newline characters.",
  "Stop before the next user decision.",
  "Do not run commands, inspect files, call tools, use MCP, or browse the web. The complete safe request is below.",
].join(" ");

export const buildCodexCliWorldNarratorPrompt = (
  request: WorldNarrationRequest,
): string => {
  const safeRequest = WorldNarrationRequestSchema.parse(request);
  return `${MODEL_INSTRUCTIONS}\n\nWORLD_NARRATION_REQUEST_JSON:\n${canonicalJson(safeRequest)}\n`;
};

export const buildCodexCliWorldNarratorArgs = ({
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
  CODEX_CLI_WORLD_NARRATOR_REQUESTED_MODEL,
  "--output-schema",
  schemaPath,
  "--output-last-message",
  outputPath,
  "--color",
  "never",
  "-",
];

const trace = () => ({
  provenance: "model" as const,
  adapterId: CODEX_CLI_WORLD_NARRATOR_ADAPTER_ID,
});

const rejected = (code: string, message: string): WorldNarratorOutcome =>
  WorldNarratorOutcomeSchema.parse({
    outcome: "rejected",
    error: { code, message },
    trace: trace(),
  });

const positiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

const executeInTemporaryWorkspace = async ({
  request,
  root,
  command,
  env,
  runner,
  timeoutMs,
  outputLimitBytes,
}: {
  request: WorldNarrationRequest;
  root: string;
  command: string;
  env: NodeJS.ProcessEnv;
  runner: CodexCliProcessRunner;
  timeoutMs: number;
  outputLimitBytes: number;
}): Promise<WorldNarratorOutcome> => {
  const workspace = path.join(root, "workspace");
  const ioDirectory = path.join(root, "io");
  await Promise.all([mkdir(workspace), mkdir(ioDirectory)]);

  const schemaPath = path.join(ioDirectory, "world-narration.schema.json");
  const outputPath = path.join(ioDirectory, "last-message.json");
  await writeFile(
    schemaPath,
    `${canonicalJson(CODEX_CLI_WORLD_NARRATOR_OUTPUT_SCHEMA)}\n`,
    { encoding: "utf8", flag: "wx" },
  );

  const invocation: CodexCliProcessInvocation = {
    command,
    args: buildCodexCliWorldNarratorArgs({ schemaPath, outputPath }),
    cwd: workspace,
    stdin: buildCodexCliWorldNarratorPrompt(request),
    env: buildCodexCliEnvironment(env),
    timeoutMs,
    outputLimitBytes,
  };

  let result;
  try {
    result = await runner(invocation);
  } catch (error) {
    const suffix = error instanceof CodexCliProcessRunnerError
      ? error.code
      : "spawn_failed";
    return rejected(
      `world_narrator_codex_cli_${suffix}`,
      "The Codex CLI process could not be completed.",
    );
  }

  if (result.timedOut) {
    return rejected(
      "world_narrator_codex_cli_timeout",
      "The Codex CLI world narration timed out.",
    );
  }
  if (result.exitCode !== 0 || result.signal !== null) {
    return rejected(
      "world_narrator_codex_cli_process_failed",
      "The Codex CLI process exited without a usable world narration.",
    );
  }

  let finalMessage: string;
  try {
    const outputStat = await lstat(outputPath);
    if (
      !outputStat.isFile() ||
      outputStat.isSymbolicLink() ||
      outputStat.size === 0 ||
      outputStat.size > outputLimitBytes
    ) {
      throw new Error("invalid output file");
    }
    finalMessage = await readFile(outputPath, "utf8");
  } catch {
    return rejected(
      "world_narrator_codex_cli_output_missing",
      "The Codex CLI did not produce a readable structured world narration.",
    );
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(finalMessage.trim()) as unknown;
  } catch {
    return rejected(
      "world_narrator_codex_cli_output_json_invalid",
      "The Codex CLI world narration was not valid structured JSON.",
    );
  }

  const validation = validateWorldNarration({
    request,
    narration: parsedOutput,
  });
  if (!validation.ok) {
    return rejected(
      `world_narrator_codex_cli_${validation.code}`,
      validation.message,
    );
  }

  return WorldNarratorOutcomeSchema.parse({
    outcome: "completed",
    narration: validation.narration,
    trace: trace(),
  });
};

export const createCodexCliWorldNarrator = (
  options: CodexCliWorldNarratorOptions = {},
): WorldNarrator => ({
  async narrate(requestInput) {
    const request = WorldNarrationRequestSchema.safeParse(requestInput);
    if (!request.success) {
      return rejected(
        "world_narrator_codex_cli_request_invalid",
        request.error.issues[0]?.message ??
          "The world narration request is invalid.",
      );
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_CLI_TIMEOUT_MS;
    const outputLimitBytes =
      options.outputLimitBytes ?? DEFAULT_CODEX_CLI_OUTPUT_LIMIT_BYTES;
    if (!positiveInteger(timeoutMs) || !positiveInteger(outputLimitBytes)) {
      return rejected(
        "world_narrator_codex_cli_configuration_invalid",
        "The Codex CLI world narrator transport configuration is invalid.",
      );
    }

    const sourceEnv = options.env ?? process.env;
    let command: string;
    try {
      command = await (options.commandResolver ?? resolveCodexCliCommand)(
        sourceEnv,
      );
    } catch {
      return rejected(
        "world_narrator_codex_cli_command_unavailable",
        "A usable ChatGPT-authenticated Codex CLI was not found.",
      );
    }

    let root: string;
    try {
      root = await mkdtemp(
        path.join(
          options.tempRoot ?? tmpdir(),
          "penelope-world-narrator-codex-",
        ),
      );
    } catch {
      return rejected(
        "world_narrator_codex_cli_temp_unavailable",
        "The isolated Codex CLI workspace could not be created.",
      );
    }

    let outcome: WorldNarratorOutcome;
    try {
      outcome = await executeInTemporaryWorkspace({
        request: request.data,
        root,
        command,
        env: sourceEnv,
        runner: options.processRunner ?? runCodexCliProcess,
        timeoutMs,
        outputLimitBytes,
      });
    } catch {
      outcome = rejected(
        "world_narrator_codex_cli_io_failed",
        "The isolated Codex CLI workspace failed safely.",
      );
    }

    try {
      await rm(root, { recursive: true, force: true });
    } catch {
      return rejected(
        "world_narrator_codex_cli_cleanup_failed",
        "The isolated Codex CLI workspace could not be cleaned.",
      );
    }
    return outcome;
  },
});

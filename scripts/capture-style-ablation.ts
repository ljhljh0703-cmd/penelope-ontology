import { access, open, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI, { APIConnectionTimeoutError } from "openai";
import { ZodError } from "zod";
import { sha256Canonical } from "@/src/domain/canonical-json";
import {
  StyleAblationCaptureSchema,
  StyleAblationNarrativeSchema,
  StyleAblationPlanSchema,
  type StyleAblationCapture,
  type StyleAblationCaptureCall,
  type StyleAblationPlan,
} from "@/src/evaluation/style-ablation-contracts";
import {
  buildStyleAblationBlindPacket,
  buildStyleAblationCaptureReceipt,
} from "@/src/evaluation/style-ablation-evaluator";
import {
  buildStyleAblationSchedule,
  type StyleAblationScheduledCall,
} from "@/src/evaluation/style-ablation-input";

export const STYLE_ABLATION_TIMEOUT_MS = 90_000;
export const STYLE_ABLATION_MAX_RETRIES = 0;

export type StyleAblationEnvironment = {
  [key: string]: string | undefined;
  ENABLE_OPENAI_LIVE?: string;
  OPENAI_API_KEY?: string;
};

type OpenAIClientLike = Pick<OpenAI, "responses">;

export class StyleAblationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StyleAblationConfigurationError";
  }
}

export const assertStyleAblationCapturePathsAvailable = async ({
  rawCapturePath,
  publicReportPath,
  publicReceiptPath,
}: {
  rawCapturePath: string;
  publicReportPath: string;
  publicReceiptPath: string;
}): Promise<void> => {
  for (const [label, filePath] of [
    ["raw capture", rawCapturePath],
    ["final public report", publicReportPath],
    ["public capture receipt", publicReceiptPath],
  ] as const) {
    try {
      await access(filePath);
      throw new StyleAblationConfigurationError(
        `Refusing duplicate style-ablation calls because the ${label} already exists.`,
      );
    } catch (error) {
      if (error instanceof StyleAblationConfigurationError) throw error;
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }
};

export const loadStyleAblationLiveConfig = (env: StyleAblationEnvironment) => {
  if (env.ENABLE_OPENAI_LIVE !== "true") {
    throw new StyleAblationConfigurationError(
      "Style ablation capture requires ENABLE_OPENAI_LIVE=true.",
    );
  }
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new StyleAblationConfigurationError(
      "Style ablation capture requires a non-empty OpenAI API key.",
    );
  }
  return {
    apiKey,
    timeoutMs: STYLE_ABLATION_TIMEOUT_MS,
    maxRetries: STYLE_ABLATION_MAX_RETRIES,
  } as const;
};

const responseContainsRefusal = (response: {
  output: ReadonlyArray<{
    type: string;
    content?: ReadonlyArray<{ type: string }>;
  }>;
}): boolean =>
  response.output.some(
    (item) =>
      item.type === "message" &&
      item.content?.some((content) => content.type === "refusal"),
  );

const callBase = (scheduled: StyleAblationScheduledCall) => ({
  callId: scheduled.callId,
  pairId: scheduled.pairId,
  ordinal: scheduled.ordinal,
  condition: scheduled.condition,
  blindSampleId: scheduled.blindSampleId,
  commonRequestSha256: scheduled.commonRequestSha256,
  fullRequestSha256: scheduled.fullRequestSha256,
  outputSchemaSha256: scheduled.outputSchemaSha256,
});

const failedCall = ({
  scheduled,
  outcome,
  errorCode,
  response,
}: {
  scheduled: StyleAblationScheduledCall;
  outcome: "refused" | "timeout" | "api_error" | "schema_error";
  errorCode: string;
  response?: {
    id: string;
    model: string;
    usage?: { input_tokens: number; output_tokens: number } | null;
  };
}): StyleAblationCaptureCall => ({
  ...callBase(scheduled),
  outcome,
  actualModel: response?.model ?? null,
  responseId: response?.id ?? null,
  inputTokens: response?.usage?.input_tokens ?? null,
  outputTokens: response?.usage?.output_tokens ?? null,
  errorCode,
});

export const captureStyleAblation = async ({
  plan: planInput,
  env,
  client,
  capturedAt,
}: {
  plan: StyleAblationPlan | unknown;
  env: StyleAblationEnvironment;
  client?: OpenAIClientLike;
  capturedAt: string;
}): Promise<StyleAblationCapture> => {
  const plan = StyleAblationPlanSchema.parse(planInput);
  const config = loadStyleAblationLiveConfig(env);
  const openai =
    client ??
    new OpenAI({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries,
    });
  const schedule = buildStyleAblationSchedule(plan);
  const calls: StyleAblationCaptureCall[] = [];

  for (const scheduled of schedule) {
    try {
      const response = await openai.responses.parse(
        scheduled.requestBody,
        {
          timeout: config.timeoutMs,
          maxRetries: config.maxRetries,
        },
      );

      if (responseContainsRefusal(response)) {
        calls.push(
          failedCall({
            scheduled,
            outcome: "refused",
            errorCode: "model_refused",
            response,
          }),
        );
        continue;
      }
      if (response.error || response.status === "failed") {
        calls.push(
          failedCall({
            scheduled,
            outcome: "api_error",
            errorCode: "openai_response_failed",
            response,
          }),
        );
        continue;
      }
      if (response.status !== "completed") {
        calls.push(
          failedCall({
            scheduled,
            outcome: "schema_error",
            errorCode: "model_response_incomplete",
            response,
          }),
        );
        continue;
      }

      const parsed = StyleAblationNarrativeSchema.safeParse(response.output_parsed);
      if (!parsed.success || !response.usage) {
        calls.push(
          failedCall({
            scheduled,
            outcome: "schema_error",
            errorCode: "model_output_schema_invalid",
            response,
          }),
        );
        continue;
      }

      calls.push({
        ...callBase(scheduled),
        outcome: "completed",
        actualModel: response.model,
        responseId: response.id,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        narrative: parsed.data.narrative,
      });
    } catch (error) {
      calls.push(
        failedCall({
          scheduled,
          outcome:
            error instanceof APIConnectionTimeoutError
              ? "timeout"
              : error instanceof ZodError || error instanceof SyntaxError
                ? "schema_error"
                : "api_error",
          errorCode:
            error instanceof APIConnectionTimeoutError
              ? "openai_timeout"
              : error instanceof ZodError || error instanceof SyntaxError
                ? "model_output_parse_failed"
                : "openai_api_error",
        }),
      );
    }
  }

  return StyleAblationCaptureSchema.parse({
    schemaVersion: 1,
    evaluationId: plan.evaluationId,
    planSha256: sha256Canonical(plan),
    capturedAt,
    requestedModel: plan.targetModel,
    reasoningEffort: plan.reasoningEffort,
    maxOutputTokens: plan.maxOutputTokens,
    expectedCallCount: 4,
    noAutomaticRetries: true,
    commonRequestSha256: schedule[0].commonRequestSha256,
    outputSchemaSha256: schedule[0].outputSchemaSha256,
    calls,
  });
};

const pretty = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const main = async (): Promise<void> => {
  const root = process.cwd();
  const planPath = path.join(root, "data", "evals", "style-ablation-plan.json");
  const rawDirectory = path.join(root, "artifacts", "live", "style-ablation");
  const rawCapturePath = path.join(rawDirectory, "raw-capture.json");
  const blindPacketPath = path.join(rawDirectory, "blind-packet.json");
  const publicDirectory = path.join(root, "artifacts", "evidence");
  const publicReportPath = path.join(publicDirectory, "style-ablation.json");
  const publicReceiptPath = path.join(
    publicDirectory,
    "style-ablation-capture-receipt.json",
  );
  const plan = StyleAblationPlanSchema.parse(
    JSON.parse(await readFile(planPath, "utf8")) as unknown,
  );

  loadStyleAblationLiveConfig(process.env);
  await mkdir(rawDirectory, { recursive: true });
  await mkdir(publicDirectory, { recursive: true });
  await assertStyleAblationCapturePathsAvailable({
    rawCapturePath,
    publicReportPath,
    publicReceiptPath,
  });
  const rawHandle = await open(rawCapturePath, "wx");
  const receiptHandle = await open(publicReceiptPath, "wx").catch(async (error) => {
    await rawHandle.close();
    throw error;
  });
  let capture: StyleAblationCapture;
  try {
    capture = await captureStyleAblation({
      plan,
      env: process.env,
      capturedAt: new Date().toISOString(),
    });
    await rawHandle.writeFile(pretty(capture), "utf8");
    await receiptHandle.writeFile(
      pretty(buildStyleAblationCaptureReceipt(plan, capture)),
      "utf8",
    );
  } finally {
    await rawHandle.close();
    await receiptHandle.close();
  }

  if (capture.calls.some(({ outcome }) => outcome !== "completed")) {
    throw new Error(
      "One or more preregistered calls failed. Raw capture retained; do not replace calls under this evaluation ID.",
    );
  }

  const blindPacket = buildStyleAblationBlindPacket(plan, capture);
  await writeFile(blindPacketPath, pretty(blindPacket), {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    "STYLE_ABLATION_CAPTURED calls=4 retries=0 raw=artifacts/live/style-ablation/raw-capture.json receipt=artifacts/evidence/style-ablation-capture-receipt.json blind=artifacts/live/style-ablation/blind-packet.json\n",
  );
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown style ablation failure.";
    process.stderr.write(`STYLE_ABLATION_CAPTURE_FAILED ${message}\n`);
    process.exitCode = 1;
  });
}

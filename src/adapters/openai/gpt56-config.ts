export const DEFAULT_GPT56_MODEL = "gpt-5.6";
export const DEFAULT_REASONING_EFFORT = "medium";

export type Gpt56Config = {
  apiKey: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
};

export class ModelConfigurationError extends Error {
  readonly code = "model_configuration_error";
}

export type Environment = Readonly<Record<string, string | undefined>>;

export const loadGpt56Config = (env: Environment = process.env): Gpt56Config => {
  if (env.ENABLE_OPENAI_LIVE?.trim().toLowerCase() !== "true") {
    throw new ModelConfigurationError(
      "ENABLE_OPENAI_LIVE=true is required before live model calls are allowed.",
    );
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ModelConfigurationError("OPENAI_API_KEY is required for live mode.");
  }

  const reasoningEffort = env.OPENAI_REASONING_EFFORT ?? DEFAULT_REASONING_EFFORT;
  if (!(["low", "medium", "high"] as const).includes(reasoningEffort as "low" | "medium" | "high")) {
    throw new ModelConfigurationError(`Unsupported reasoning effort: ${reasoningEffort}`);
  }

  return {
    apiKey,
    model: env.OPENAI_MODEL?.trim() || DEFAULT_GPT56_MODEL,
    reasoningEffort: reasoningEffort as Gpt56Config["reasoningEffort"],
  };
};

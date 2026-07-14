import { describe, expect, it } from "vitest";
import {
  DEFAULT_GPT56_MODEL,
  ModelConfigurationError,
  loadGpt56Config,
} from "@/src/adapters/openai/gpt56-config";

describe("GPT-5.6 configuration", () => {
  it("fails with a typed error when the explicit live flag is missing", () => {
    expect(() => loadGpt56Config({})).toThrow(ModelConfigurationError);
    expect(() => loadGpt56Config({ OPENAI_API_KEY: "test-key" })).toThrow(
      "ENABLE_OPENAI_LIVE=true",
    );
  });

  it("fails with a typed error when the live key is missing", () => {
    expect(() => loadGpt56Config({ ENABLE_OPENAI_LIVE: "true" })).toThrow(
      ModelConfigurationError,
    );
  });

  it("uses the GPT-5.6 alias and medium effort as deliberate defaults", () => {
    expect(
      loadGpt56Config({ ENABLE_OPENAI_LIVE: "true", OPENAI_API_KEY: "test-key" }),
    ).toEqual({
      apiKey: "test-key",
      model: DEFAULT_GPT56_MODEL,
      reasoningEffort: "medium",
    });
  });

  it("rejects model overrides outside the GPT-5.6 family", () => {
    expect(() =>
      loadGpt56Config({
        ENABLE_OPENAI_LIVE: "true",
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-4.1",
      }),
    ).toThrow("requires the GPT-5.6 model family");
    expect(
      loadGpt56Config({
        ENABLE_OPENAI_LIVE: "true",
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-5.6-sol",
      }).model,
    ).toBe("gpt-5.6-sol");
  });
});

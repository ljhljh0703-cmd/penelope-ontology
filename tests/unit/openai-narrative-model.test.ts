import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  createOpenAiNarrativeModel,
  DEFAULT_OPENAI_TIMEOUT_MS,
} from "@/src/adapters/openai/narrative-model";
import { ModelDraftSchema } from "@/src/contracts/model-draft";
import {
  EvidenceBundleSchema,
  RunRequestSchema,
} from "@/src/contracts/run";
import { StyleProfileSetSchema } from "@/src/contracts/style-profile";

const readJson = (path: string) =>
  JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;

const world = readJson("data/world-packs/trojan-returns/world.json") as {
  styleProfiles: unknown;
};
const styleProfiles = StyleProfileSetSchema.parse(world.styleProfiles);
const draft = ModelDraftSchema.parse(
  readJson("data/world-packs/trojan-returns/drafts/grounded-penelope.json"),
);

const request = RunRequestSchema.parse({
  modelMode: "live",
  overlay: readJson("data/world-packs/trojan-returns/overlays/overlay.v0.json"),
  snapshot: readJson("data/world-packs/trojan-returns/snapshots/s0.json"),
  styleProfileId: "style.table_ready_mythic",
  taskType: "scene",
  brief: "Compose one bounded table-ready exchange.",
  participantIntents: [
    {
      intentId: "intent.penelope",
      participantId: "participant.two",
      controlledEntityIds: ["penelope"],
      intent: "Keep hope distinct from knowledge.",
    },
    {
      intentId: "intent.eurycleia",
      participantId: "participant.one",
      controlledEntityIds: ["eurycleia"],
      intent: "Prepare the household without declaring a return.",
    },
  ],
});

const evidence = EvidenceBundleSchema.parse({
  entityIds: ["eurycleia", "penelope"],
  claimIds: ["claim.odyssey.penelope_uncertain_fate"],
  eventIds: ["event.odyssey_opening"],
  ruleIds: ["rule.character_knowledge", "rule.closed_world"],
  characterViews: [
    {
      characterId: "penelope",
      entityIds: ["penelope", "odysseus"],
      knownClaimIds: [],
      uncertainClaimIds: ["claim.odyssey.penelope_uncertain_fate"],
      eventIds: ["event.odyssey_opening"],
      ruleIds: ["rule.closed_world", "rule.character_knowledge"],
      context: "Penelope knows only that Odysseus' fate remains uncertain.",
    },
    {
      characterId: "eurycleia",
      entityIds: ["eurycleia", "odysseus"],
      knownClaimIds: [],
      uncertainClaimIds: ["claim.odyssey.penelope_uncertain_fate"],
      eventIds: ["event.odyssey_opening"],
      ruleIds: ["rule.closed_world", "rule.character_knowledge"],
      context: "Eurycleia shares the household's uncertainty.",
    },
  ],
  context: "Only character-visible evidence for the selected fixed state.",
});

const liveEnv = {
  ENABLE_OPENAI_LIVE: "true",
  OPENAI_API_KEY: "test-key",
} as const;

const asClient = (parse: ReturnType<typeof vi.fn>) =>
  ({ responses: { parse } }) as unknown as Pick<OpenAI, "responses">;

const response = (overrides: Record<string, unknown> = {}) => ({
  id: "resp_test",
  model: "gpt-5.6-sol",
  status: "completed",
  error: null,
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: "{}", parsed: draft }],
    },
  ],
  output_parsed: draft,
  usage: { input_tokens: 120, output_tokens: 80 },
  ...overrides,
});

const makeModel = (parse: ReturnType<typeof vi.fn>, env = liveEnv) =>
  createOpenAiNarrativeModel({
    client: asClient(parse),
    env,
    styleProfiles,
  });

describe("OpenAI narrative model adapter", () => {
  it("fails closed before a model call unless both the live flag and key exist", async () => {
    const parse = vi.fn();
    const flagMissing = createOpenAiNarrativeModel({
      client: asClient(parse),
      env: { OPENAI_API_KEY: "test-key" },
      styleProfiles,
    });
    const keyMissing = createOpenAiNarrativeModel({
      client: asClient(parse),
      env: { ENABLE_OPENAI_LIVE: "true" },
      styleProfiles,
    });

    expect((await flagMissing.generate(request, evidence)).outcome).toBe(
      "configuration_error",
    );
    expect((await keyMissing.generate(request, evidence)).outcome).toBe(
      "configuration_error",
    );
    expect(parse).not.toHaveBeenCalled();
  });

  it("uses Responses parse with a strict Zod format and only bounded model input", async () => {
    const parse = vi.fn().mockResolvedValue(response());
    const result = await makeModel(parse).generate(request, evidence);

    expect(result).toMatchObject({
      outcome: "completed",
      trace: {
        mode: "live",
        requestedModel: "gpt-5.6",
        actualModel: "gpt-5.6-sol",
        responseId: "resp_test",
        inputTokens: 120,
        outputTokens: 80,
      },
    });
    expect(parse).toHaveBeenCalledTimes(1);

    const [body, requestOptions] = parse.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(body).toMatchObject({
      model: "gpt-5.6",
      reasoning: { effort: "medium" },
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "narrative_model_draft",
          strict: true,
        },
      },
    });
    expect(requestOptions).toEqual({ timeout: DEFAULT_OPENAI_TIMEOUT_MS });

    const modelInput = JSON.parse(body.input as string) as Record<string, unknown>;
    expect(Object.keys(modelInput).sort()).toEqual([
      "brief",
      "evidence",
      "participantIntents",
      "styleProfile",
    ]);
    expect(Object.keys(modelInput.evidence as Record<string, unknown>).sort()).toEqual([
      "characterViews",
      "context",
    ]);
    expect(
      (modelInput.participantIntents as Array<{ intentId: string }>).map(
        ({ intentId }) => intentId,
      ),
    ).toEqual(["intent.eurycleia", "intent.penelope"]);
    expect(
      ((modelInput.styleProfile as { constraints: Array<{ id: string }> }).constraints).map(
        ({ id }) => id,
      ),
    ).toEqual(
      [...styleProfiles[0].constraints].map(({ id }) => id).sort(),
    );

    const serializedInput = body.input as string;
    expect(serializedInput).not.toContain("overlay");
    expect(serializedInput).not.toContain("canonHash");
    expect(serializedInput).not.toContain(request.overlay.hash);
    expect(serializedInput).not.toContain("worldPackVersion");
  });

  it("maps a refusal without returning the refusal prose", async () => {
    const privateDetail = "private refusal detail";
    const parse = vi.fn().mockResolvedValue(
      response({
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: privateDetail }],
          },
        ],
        output_parsed: null,
      }),
    );

    const result = await makeModel(parse).generate(request, evidence);
    expect(result).toMatchObject({
      outcome: "refused",
      error: { code: "model_refused", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain(privateDetail);
  });

  it("maps SDK timeouts without returning the thrown message", async () => {
    const privateDetail = "private timeout detail";
    const parse = vi
      .fn()
      .mockRejectedValue(new APIConnectionTimeoutError({ message: privateDetail }));

    const result = await makeModel(parse).generate(request, evidence);
    expect(result).toMatchObject({
      outcome: "timeout",
      error: { code: "openai_timeout", retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain(privateDetail);
  });

  it("maps retryable API failures without returning upstream details", async () => {
    const privateDetail = "private upstream detail";
    const parse = vi.fn().mockRejectedValue(
      new APIError(500, { message: privateDetail }, privateDetail, new Headers()),
    );

    const result = await makeModel(parse).generate(request, evidence);
    expect(result).toMatchObject({
      outcome: "api_error",
      error: { code: "openai_api_error", retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain(privateDetail);
  });

  it("maps a missing parsed draft to schema_error instead of refusal", async () => {
    const parse = vi.fn().mockResolvedValue(
      response({
        output: [],
        output_parsed: null,
      }),
    );

    const result = await makeModel(parse).generate(request, evidence);
    expect(result).toMatchObject({
      outcome: "schema_error",
      error: { code: "model_output_schema_invalid", retryable: false },
    });
  });
});

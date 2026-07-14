import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import {
  STYLE_ABLATION_MAX_RETRIES,
  STYLE_ABLATION_TIMEOUT_MS,
  assertStyleAblationCapturePathsAvailable,
  captureStyleAblation,
} from "@/scripts/capture-style-ablation";
import { writeStyleAblationPublicReportOnce } from "@/scripts/finalize-style-ablation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { StyleAblationPlanSchema } from "@/src/evaluation/style-ablation-contracts";
import { buildStyleAblationSchedule } from "@/src/evaluation/style-ablation-input";

const plan = StyleAblationPlanSchema.parse(
  JSON.parse(
    readFileSync(resolve("data/evals/style-ablation-plan.json"), "utf8"),
  ) as unknown,
);

const liveEnv = {
  ENABLE_OPENAI_LIVE: "true",
  OPENAI_API_KEY: "test-key",
} as const;

const response = (index: number) => ({
  id: `resp_test_${index}`,
  model: "gpt-5.6-sol",
  status: "completed",
  error: null,
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: "{}", parsed: { narrative: `Scene ${index}.` } }],
    },
  ],
  output_parsed: { narrative: `Scene ${index}.` },
  usage: { input_tokens: 100 + index, output_tokens: 20 + index },
});

const asClient = (parse: ReturnType<typeof vi.fn>) =>
  ({ responses: { parse } }) as unknown as Pick<OpenAI, "responses">;

describe("style ablation live capture", () => {
  it("performs four calls with a shared strict schema and retry disabled", async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce(response(1))
      .mockResolvedValueOnce(response(2))
      .mockResolvedValueOnce(response(3))
      .mockResolvedValueOnce(response(4));

    const capture = await captureStyleAblation({
      plan,
      env: liveEnv,
      client: asClient(parse),
      capturedAt: "2026-07-15T00:00:00.000Z",
    });

    expect(parse).toHaveBeenCalledTimes(4);
    expect(capture.calls.every(({ outcome }) => outcome === "completed")).toBe(true);
    expect(capture.noAutomaticRetries).toBe(true);
    expect(capture.planSha256).toBe(sha256Canonical(plan));
    expect(STYLE_ABLATION_TIMEOUT_MS).toBe(90_000);
    const schedule = buildStyleAblationSchedule(plan);
    for (const [[body, options], scheduled] of (
      parse.mock.calls as Array<
      [Record<string, unknown>, Record<string, unknown>]
      >
    ).map((call, index) => [call, schedule[index]] as const)) {
      expect(body).toMatchObject({
        model: "gpt-5.6",
        reasoning: { effort: "medium" },
        max_output_tokens: 4096,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "style_ablation_narrative",
            strict: true,
          },
        },
      });
      expect(options).toEqual({
        timeout: STYLE_ABLATION_TIMEOUT_MS,
        maxRetries: STYLE_ABLATION_MAX_RETRIES,
      });
      expect(sha256Canonical(body)).toBe(scheduled.fullRequestSha256);
      expect(
        sha256Canonical((body as { text: { format: unknown } }).text.format),
      ).toBe(scheduled.outputSchemaSha256);
    }

    const inputs = parse.mock.calls.map(([body]) =>
      JSON.parse((body as { input: string }).input) as Record<string, unknown>,
    );
    expect(inputs.map(({ creatorStyleBundle }) => creatorStyleBundle === null)).toEqual([
      true,
      false,
      false,
      true,
    ]);
    const withoutStyleBundle = (input: Record<string, unknown>) => {
      const commonInput = { ...input };
      delete commonInput.creatorStyleBundle;
      return commonInput;
    };
    expect(inputs.map(withoutStyleBundle)).toEqual(
      [inputs[0], inputs[0], inputs[0], inputs[0]].map(withoutStyleBundle),
    );
  });

  it("records a failed slot without retrying or replacing it", async () => {
    const parse = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream detail must not escape"))
      .mockResolvedValueOnce(response(2))
      .mockResolvedValueOnce(response(3))
      .mockResolvedValueOnce(response(4));

    const capture = await captureStyleAblation({
      plan,
      env: liveEnv,
      client: asClient(parse),
      capturedAt: "2026-07-15T00:00:00.000Z",
    });

    expect(parse).toHaveBeenCalledTimes(4);
    expect(capture.calls.map(({ outcome }) => outcome)).toEqual([
      "api_error",
      "completed",
      "completed",
      "completed",
    ]);
    expect(JSON.stringify(capture)).not.toContain("upstream detail");
  });

  it("fails closed before any call when the API key is missing", async () => {
    const parse = vi.fn();
    await expect(
      captureStyleAblation({
        plan,
        env: { ENABLE_OPENAI_LIVE: "true" },
        client: asClient(parse),
        capturedAt: "2026-07-15T00:00:00.000Z",
      }),
    ).rejects.toThrow("non-empty OpenAI API key");
    expect(parse).not.toHaveBeenCalled();
  });

  it("refuses to overwrite a finalized public report for the evaluation ID", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "style-ablation-finalize-"));
    const reportPath = resolve(directory, "style-ablation.json");
    try {
      await writeStyleAblationPublicReportOnce(reportPath, { status: "objective_only" });
      await expect(
        writeStyleAblationPublicReportOnce(reportPath, { status: "supported_on_probe" }),
      ).rejects.toMatchObject({ code: "EEXIST" });
      expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual({
        status: "objective_only",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails closed before calls when any durable capture artifact already exists", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "style-ablation-preflight-"));
    const paths = {
      rawCapturePath: resolve(directory, "raw-capture.json"),
      publicReportPath: resolve(directory, "style-ablation.json"),
      publicReceiptPath: resolve(directory, "style-ablation-capture-receipt.json"),
    };
    try {
      for (const filePath of Object.values(paths)) {
        await writeFile(filePath, "reserved", "utf8");
        await expect(assertStyleAblationCapturePathsAvailable(paths)).rejects.toThrow(
          "Refusing duplicate style-ablation calls",
        );
        await rm(filePath);
      }
      await expect(assertStyleAblationCapturePathsAvailable(paths)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

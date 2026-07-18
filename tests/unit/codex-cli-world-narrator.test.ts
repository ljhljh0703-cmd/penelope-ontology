import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import penelopeEnglishStyleProfile from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { CHATGPT_BUNDLED_CODEX_COMMAND } from "@/src/adapters/codex-cli/command";
import type {
  CodexCliProcessInvocation,
  CodexCliProcessRunner,
} from "@/src/adapters/codex-cli/process-runner";
import {
  CODEX_CLI_NARRATION_RENDERER_ADAPTER_ID,
  CODEX_CLI_NARRATION_RENDERER_REQUESTED_MODEL,
  buildCodexCliNarrationCriticPrompt,
  buildCodexCliNarrationRendererArgs,
  buildCodexCliNarrationRendererPrompt,
  createCodexCliNarrationRenderer,
} from "@/src/adapters/codex-cli/world-narrator";
import {
  ModelNarrationOutputSchema,
  NarrationCriticRequestSchema,
  NarrationRendererRequestSchema,
  PenelopeEnglishStyleProfileSchema,
  PenelopeNarrationPreflightReceiptSchema,
  PenelopeScenePlanSchema,
  type ModelNarrationOutput,
  type NarrationRendererRequest,
} from "@/src/contracts/world-narrator";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

const makeTemporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(
    path.join(tmpdir(), "penelope-narration-renderer-test-"),
  );
  temporaryRoots.push(root);
  return root;
};

const argumentPath = (
  invocation: CodexCliProcessInvocation,
  flag: "--output-schema" | "--output-last-message",
): string => {
  const index = invocation.args.indexOf(flag);
  const value = invocation.args[index + 1];
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
};

const rendererRequest: NarrationRendererRequest =
  NarrationRendererRequestSchema.parse({
    modelFacingRequest: {
      sceneMode: "setup",
      languageProfileId: "en-penelope-v1",
      referenceReceiptId: "creator-craft-reference-2026-07-17-01",
      focalActorId: "entity.a",
      presentActors: [
        {
          entityId: "entity.a",
          renderDescriptor: "A woman stands beside the hearth.",
          sourceFactIds: ["fact.a"],
        },
      ],
      visibleFacts: [{ factId: "fact.a", renderText: "A lamp burns." }],
      resolvedEvents: [],
      authorizedActionEventIds: [],
      authorizedReactionEventIds: [],
      authorizedChangeEventIds: [],
      authorizedAnchors: [],
      licensedRenderingDetails: [],
      styleStateId: "en-penelope-state-baseline",
      reservedActionIds: ["action.wait"],
    },
    scenePlan: PenelopeScenePlanSchema.parse({
      scenePlanId: "scene.setup",
      sceneMode: "setup",
      sentencePlans: [
        {
          sentencePlanId: "sp.orientation",
          role: "orientation",
          actorId: "entity.a",
          speakerId: null,
          sourceFactIds: ["fact.a"],
          sourceEventIds: [],
          speechEventIds: [],
          licensedRenderingDetailIds: [],
          plainFunction: "Place the focal actor beside the registered lamp.",
          plainFunctionSourceAuthorityIds: ["fact.a"],
          plainIntent: null,
          plainIntentSourceAuthorityIds: [],
          changesState: false,
        },
        {
          sentencePlanId: "sp.stop",
          role: "in_world_stop",
          actorId: "entity.a",
          speakerId: null,
          sourceFactIds: ["fact.a"],
          sourceEventIds: [],
          speechEventIds: [],
          licensedRenderingDetailIds: [],
          plainFunction: "Stop on the focal actor waiting by the door.",
          plainFunctionSourceAuthorityIds: ["fact.a"],
          plainIntent: null,
          plainIntentSourceAuthorityIds: [],
          changesState: false,
        },
      ],
    }),
    preflightReceipt: PenelopeNarrationPreflightReceiptSchema.parse({
      preflightId: "preflight.setup",
      sceneMode: "setup",
      sceneAuthority: {
        factIds: ["fact.a"],
        eventIds: [],
        actorEntityIds: ["entity.a"],
        licensedRenderingDetailIds: [],
        licensedRenderingDetails: [],
      },
      referenceReceipt: {
        status: "available",
        referenceId: "creator-craft-reference-2026-07-17-01",
        transferableTechniqueIds: ["TT-01"],
        sceneApplicability: [
          {
            techniqueId: "TT-01",
            plainReason: "Use the resolved physical situation as the scene beat.",
          },
        ],
        forbiddenImitation: true,
        excludedGimmicks: ["FC-04"],
      },
      plainDramaticPlan: {
        focalActorId: "entity.a",
        actionSourceEventIds: [],
        reactionSourceEventIds: [],
        changeSourceEventIds: [],
      },
      dialogueAuthority: {
        mode: "none",
        speakerId: null,
        speechAct: null,
        speechEventIds: [],
        speechActLicenseIds: [],
        authorizedContentIds: [],
        plainIntent: null,
        plainIntentSourceAuthorityIds: [],
      },
      creatorReviewRequired: true,
    }),
    styleProfile: PenelopeEnglishStyleProfileSchema.parse(
      penelopeEnglishStyleProfile,
    ),
  });

const rendererModelOutput: ModelNarrationOutput =
  ModelNarrationOutputSchema.parse({
    planReceipt: [
      {
        sentencePlanId: "sp.orientation",
        role: "orientation",
        sourceFactIds: ["fact.a"],
        sourceEventIds: [],
        speechEventIds: [],
        licensedRenderingDetailIds: [],
      },
      {
        sentencePlanId: "sp.stop",
        role: "in_world_stop",
        sourceFactIds: ["fact.a"],
        sourceEventIds: [],
        speechEventIds: [],
        licensedRenderingDetailIds: [],
      },
    ],
    readerProse: {
      format: "english_prose_paragraphs",
      paragraphs: [
        {
          paragraphId: "paragraph.one",
          sentencePlanIds: ["sp.orientation"],
          text: "A lamp burns beside the hearth.",
        },
        {
          paragraphId: "paragraph.two",
          sentencePlanIds: ["sp.stop"],
          text: "The woman waits by the door.",
        },
      ],
    },
  });

describe("Codex CLI narration renderer", () => {
  it("serializes three bounded layers and requests ModelNarrationOutput only", async () => {
    const tempRoot = await makeTemporaryRoot();
    const runner = vi.fn<CodexCliProcessRunner>(async (invocation) => {
      expect(invocation.args).toEqual(
        buildCodexCliNarrationRendererArgs({
          schemaPath: argumentPath(invocation, "--output-schema"),
          outputPath: argumentPath(invocation, "--output-last-message"),
        }),
      );
      expect(invocation.args).toContain(
        CODEX_CLI_NARRATION_RENDERER_REQUESTED_MODEL,
      );
      const prompt = invocation.stdin;
      const layer1 = prompt.indexOf("=== LAYER 1 : INVARIANT AUTHORITY ===");
      const layer2 = prompt.indexOf("=== LAYER 2 : RESOLVED SCENE AND PLAN ===");
      const layer3 = prompt.indexOf("=== LAYER 3 : RENDERING STYLE AND OUTPUT ===");
      expect(layer1).toBeGreaterThanOrEqual(0);
      expect(layer2).toBeGreaterThan(layer1);
      expect(layer3).toBeGreaterThan(layer2);
      expect(prompt).not.toContain("120 through 180");
      expect(prompt).not.toContain("privateValidation");
      expect(prompt).not.toContain("renderAudit");
      expect(prompt).not.toContain("evidenceAuthorityRegistry");
      expect(prompt).not.toContain('"reservedActionIds"');
      expect(prompt).toContain('"reservedParticipantActionsExist":true');
      expect(prompt).toContain('"sceneMode":"setup"');
      expect(prompt).toContain('"effectiveLeverValues"');
      expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
      expect(invocation.env.CODEX_API_KEY).toBeUndefined();
      expect(await readdir(invocation.cwd)).toEqual([]);

      const schema = JSON.parse(
        await readFile(argumentPath(invocation, "--output-schema"), "utf8"),
      ) as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
        "planReceipt",
        "readerProse",
      ]);
      expect(JSON.stringify(schema)).not.toContain("renderAudit");
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        JSON.stringify(rendererModelOutput),
        "utf8",
      );
      return {
        exitCode: 0,
        signal: null,
        stdout: "untrusted progress text",
        stderr: "",
        timedOut: false,
      };
    });

    const outcome = await createCodexCliNarrationRenderer({
      env: {
        NODE_ENV: "test",
        HOME: "/tmp/penelope-test-home",
        CODEX_HOME: "/tmp/penelope-test-codex-home",
        PATH: "/bin",
        OPENAI_API_KEY: "placeholder",
        CODEX_API_KEY: "test-key",
      },
      commandResolver: async () => CHATGPT_BUNDLED_CODEX_COMMAND,
      processRunner: runner,
      tempRoot,
    }).render(rendererRequest);

    expect(runner).toHaveBeenCalledOnce();
    expect(outcome).toEqual({
      outcome: "completed",
      modelOutput: rendererModelOutput,
      trace: {
        provenance: "model",
        adapterId: CODEX_CLI_NARRATION_RENDERER_ADAPTER_ID,
      },
    });
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("runs one warning-only critic call with the same authority layers", async () => {
    const tempRoot = await makeTemporaryRoot();
    const criticRequest = NarrationCriticRequestSchema.parse({
      rendererRequest,
      priorOutput: rendererModelOutput,
      warningRuleIds: ["FC-04"],
    });
    const runner = vi.fn<CodexCliProcessRunner>(async (invocation) => {
      expect(invocation.stdin).toBe(
        buildCodexCliNarrationCriticPrompt(criticRequest),
      );
      expect(invocation.stdin).toContain("=== WARNING-ONLY REVISION ===");
      expect(invocation.stdin).toContain('["FC-04"]');
      expect(invocation.stdin).not.toContain("renderAudit");
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        JSON.stringify(rendererModelOutput),
        "utf8",
      );
      return {
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
      };
    });

    const outcome = await createCodexCliNarrationRenderer({
      commandResolver: async () => "codex",
      processRunner: runner,
      tempRoot,
    }).revise(criticRequest);

    expect(runner).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({
      outcome: "completed",
      trace: { adapterId: CODEX_CLI_NARRATION_RENDERER_ADAPTER_ID },
    });
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("rejects extra output authority and invalid input before execution", async () => {
    const tempRoot = await makeTemporaryRoot();
    const runner = vi.fn<CodexCliProcessRunner>(async (invocation) => {
      await writeFile(
        argumentPath(invocation, "--output-last-message"),
        JSON.stringify({
          ...rendererModelOutput,
          renderAudit: { hardPass: true },
        }),
        "utf8",
      );
      return {
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        timedOut: false,
      };
    });
    const adapter = createCodexCliNarrationRenderer({
      commandResolver: async () => "codex",
      processRunner: runner,
      tempRoot,
    });

    expect(await adapter.render(rendererRequest)).toMatchObject({
      outcome: "rejected",
      error: { code: "narration_renderer_codex_cli_output_invalid" },
    });
    expect(runner).toHaveBeenCalledOnce();

    const invalid = {
      ...rendererRequest,
      privateValidation: { forbiddenKnowledgeIds: ["private.fact"] },
    };
    expect(() =>
      buildCodexCliNarrationRendererPrompt(
        invalid as NarrationRendererRequest,
      ),
    ).toThrow();
    expect(await adapter.render(invalid as NarrationRendererRequest)).toMatchObject({
      outcome: "rejected",
      error: { code: "narration_renderer_codex_cli_request_invalid" },
    });
    expect(runner).toHaveBeenCalledOnce();
    expect(await readdir(tempRoot)).toEqual([]);
  });
});

import {
  ModelNarrationOutputSchema,
  NarrationCriticRequestSchema,
  NarrationRendererRequestSchema,
  type ModelNarrationOutput,
  type NarrationRendererRequest,
  type PenelopeSentencePlan,
} from "@/src/contracts/world-narrator";
import type {
  NarrationCritic,
  NarrationRenderer,
} from "@/src/ports/world-narrator";

const FIXTURE_RENDERER_ADAPTER_ID = "world_narration_renderer_fixture_v2";
const FIXTURE_CRITIC_ADAPTER_ID = "world_narration_critic_fixture_v1";

type FixtureRenderResult =
  | { ok: true; modelOutput: ModelNarrationOutput }
  | { ok: false; code: string; message: string };

const planReceiptFor = (plan: PenelopeSentencePlan) => ({
  sentencePlanId: plan.sentencePlanId,
  role: plan.role,
  sourceFactIds: [...plan.sourceFactIds],
  sourceEventIds: [...plan.sourceEventIds],
  speechEventIds: [...plan.speechEventIds],
  licensedRenderingDetailIds: [...plan.licensedRenderingDetailIds],
});

const preparedSourceText = (
  request: NarrationRendererRequest,
): Map<string, string> => {
  const sources = new Map<string, string>();
  const register = (sourceId: string, text: string): void => {
    if (!sources.has(sourceId)) sources.set(sourceId, text.trim());
  };

  for (const fact of request.modelFacingRequest.visibleFacts) {
    register(fact.factId, fact.renderText);
  }
  for (const actor of request.modelFacingRequest.presentActors) {
    for (const factId of actor.sourceFactIds) {
      register(factId, actor.renderDescriptor);
    }
  }
  for (const anchor of request.modelFacingRequest.authorizedAnchors) {
    for (const factId of anchor.sourceFactIds) {
      register(factId, anchor.renderDescriptor);
    }
  }
  for (const event of request.modelFacingRequest.resolvedEvents) {
    register(event.eventId, event.observableText);
  }
  for (const detail of request.modelFacingRequest.licensedRenderingDetails) {
    register(detail.licenseId, detail.contentBoundary);
  }

  return sources;
};

const authorizedSourceIds = (
  request: NarrationRendererRequest,
): Set<string> =>
  new Set([
    ...request.preflightReceipt.sceneAuthority.factIds,
    ...request.preflightReceipt.sceneAuthority.eventIds,
    ...request.preflightReceipt.sceneAuthority.licensedRenderingDetailIds,
    ...request.preflightReceipt.dialogueAuthority.speechEventIds,
    ...request.preflightReceipt.dialogueAuthority.speechActLicenseIds,
  ]);

const renderPreparedFixture = (
  request: NarrationRendererRequest,
): FixtureRenderResult => {
  const sourceText = preparedSourceText(request);
  const authorized = authorizedSourceIds(request);
  const plans = request.scenePlan.sentencePlans;
  const renderedPlans: Array<{ plan: PenelopeSentencePlan; text: string }> = [];

  for (const plan of plans) {
    const sourceIds = [
      ...plan.sourceFactIds,
      ...plan.sourceEventIds,
      ...plan.speechEventIds,
      ...plan.licensedRenderingDetailIds,
    ];
    const unauthorizedSourceId = sourceIds.find(
      (sourceId) => !authorized.has(sourceId),
    );
    if (unauthorizedSourceId !== undefined) {
      return {
        ok: false,
        code: "fixture_renderer_source_unauthorized",
        message: `Sentence plan ${plan.sentencePlanId} cites an unauthorized source.`,
      };
    }

    const missingSourceId = sourceIds.find(
      (sourceId) => !sourceText.has(sourceId),
    );
    if (missingSourceId !== undefined) {
      return {
        ok: false,
        code: "fixture_renderer_prose_unavailable",
        message: `Sentence plan ${plan.sentencePlanId} has no prepared prose for an authorized source.`,
      };
    }

    const text = [...new Set(sourceIds)]
      .map((sourceId) => sourceText.get(sourceId)!)
      .join(" ");
    renderedPlans.push({ plan, text });
  }

  const maximumParagraphs = 8;
  const chunkSize = Math.ceil(renderedPlans.length / maximumParagraphs);
  const paragraphs = [];
  for (let index = 0; index < renderedPlans.length; index += chunkSize) {
    const chunk = renderedPlans.slice(index, index + chunkSize);
    paragraphs.push({
      paragraphId: `fixture.paragraph.${paragraphs.length + 1}`,
      sentencePlanIds: chunk.map(({ plan }) => plan.sentencePlanId),
      text: chunk.map(({ text }) => text).join(" "),
    });
  }

  const output = ModelNarrationOutputSchema.safeParse({
    planReceipt: plans.map(planReceiptFor),
    readerProse: {
      format: "english_prose_paragraphs",
      paragraphs,
    },
  });
  if (!output.success) {
    return {
      ok: false,
      code: "fixture_renderer_output_invalid",
      message:
        output.error.issues[0]?.message ??
        "The prepared fixture output is invalid.",
    };
  }

  return { ok: true, modelOutput: output.data };
};

const sameAuthoritySet = (
  request: NarrationRendererRequest,
  output: ModelNarrationOutput,
): boolean =>
  JSON.stringify(output.planReceipt) ===
  JSON.stringify(request.scenePlan.sentencePlans.map(planReceiptFor));

export const fixtureNarrationRenderer: NarrationRenderer = {
  async render(requestInput) {
    const request = NarrationRendererRequestSchema.safeParse(requestInput);
    if (!request.success) {
      return {
        outcome: "rejected",
        error: {
          code: "fixture_renderer_request_invalid",
          message:
            request.error.issues[0]?.message ??
            "The fixture renderer request is invalid.",
        },
        trace: {
          provenance: "fixture",
          adapterId: FIXTURE_RENDERER_ADAPTER_ID,
        },
      };
    }

    const rendered = renderPreparedFixture(request.data);
    if (!rendered.ok) {
      return {
        outcome: "rejected",
        error: { code: rendered.code, message: rendered.message },
        trace: {
          provenance: "fixture",
          adapterId: FIXTURE_RENDERER_ADAPTER_ID,
        },
      };
    }

    return {
      outcome: "completed",
      modelOutput: rendered.modelOutput,
      trace: {
        provenance: "fixture",
        adapterId: FIXTURE_RENDERER_ADAPTER_ID,
      },
    };
  },
};

export const fixtureNarrationCritic: NarrationCritic = {
  async revise(requestInput) {
    const request = NarrationCriticRequestSchema.safeParse(requestInput);
    if (!request.success) {
      return {
        outcome: "rejected",
        error: {
          code: "fixture_critic_request_invalid",
          message:
            request.error.issues[0]?.message ??
            "The fixture critic request is invalid.",
        },
        trace: {
          provenance: "fixture",
          adapterId: FIXTURE_CRITIC_ADAPTER_ID,
        },
      };
    }
    if (!sameAuthoritySet(request.data.rendererRequest, request.data.priorOutput)) {
      return {
        outcome: "rejected",
        error: {
          code: "fixture_critic_authority_changed",
          message: "The critic cannot revise output outside the original scene authority.",
        },
        trace: {
          provenance: "fixture",
          adapterId: FIXTURE_CRITIC_ADAPTER_ID,
        },
      };
    }

    const rendered = renderPreparedFixture(request.data.rendererRequest);
    if (!rendered.ok) {
      return {
        outcome: "rejected",
        error: { code: rendered.code, message: rendered.message },
        trace: {
          provenance: "fixture",
          adapterId: FIXTURE_CRITIC_ADAPTER_ID,
        },
      };
    }

    return {
      outcome: "completed",
      modelOutput: rendered.modelOutput,
      trace: {
        provenance: "fixture",
        adapterId: FIXTURE_CRITIC_ADAPTER_ID,
      },
    };
  },
};

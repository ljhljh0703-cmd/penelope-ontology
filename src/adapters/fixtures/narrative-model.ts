import { loadDraftFixture } from "@/src/adapters/filesystem/demo-data";
import type { ModelDraft } from "@/src/contracts/model-draft";
import type { NarrativeModel } from "@/src/ports/narrative-model";

type DraftLoader = (id: string) => Promise<ModelDraft>;

export const createFixtureNarrativeModel = (
  loadDraft: DraftLoader = loadDraftFixture,
): NarrativeModel => ({
  async generate(request) {
    if (request.modelMode !== "fixture") {
      return {
        outcome: "configuration_error",
        error: {
          code: "fixture_mode_required",
          message: "The fixture adapter only accepts fixture-mode requests.",
          retryable: false,
        },
        trace: {
          mode: "fixture",
          outcome: "configuration_error",
          requestedModel: "fixture-v1",
          actualModel: null,
          responseId: null,
          inputTokens: null,
          outputTokens: null,
        },
      };
    }

    try {
      const draft = await loadDraft(request.draftFixtureId);
      return {
        outcome: "completed",
        draft,
        trace: {
          mode: "fixture",
          outcome: "completed",
          requestedModel: "fixture-v1",
          actualModel: null,
          responseId: null,
          inputTokens: null,
          outputTokens: null,
        },
      };
    } catch {
      return {
        outcome: "schema_error",
        error: {
          code: "fixture_unavailable",
          message: "The requested structured fixture is unavailable or invalid.",
          retryable: false,
        },
        trace: {
          mode: "fixture",
          outcome: "schema_error",
          requestedModel: "fixture-v1",
          actualModel: null,
          responseId: null,
          inputTokens: null,
          outputTokens: null,
        },
      };
    }
  },
});

export const fixtureNarrativeModel = createFixtureNarrativeModel();

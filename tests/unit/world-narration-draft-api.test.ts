import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createCodexCliNarrationRenderer = vi.hoisted(() => vi.fn());
const checkpointFailure = vi.hoisted(() => ({ nextApprovedSave: false }));

vi.mock("@/src/adapters/codex-cli/world-narrator", () => ({
  createCodexCliNarrationRenderer,
}));

vi.mock(
  "@/src/application/world-session-store",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/src/application/world-session-store")
      >();
    return {
      ...actual,
      saveWorldSessionCheckpoint: (
        input: Parameters<typeof actual.saveWorldSessionCheckpoint>[0],
      ) => {
        if (
          checkpointFailure.nextApprovedSave &&
          input.narrationDecisionReceipt
        ) {
          checkpointFailure.nextApprovedSave = false;
          throw new Error("Injected approved checkpoint save failure.");
        }
        return actual.saveWorldSessionCheckpoint(input);
      },
    };
  },
);

import { POST as decideWorldNarration } from "@/app/api/world/narration-draft/route";
import { POST as inspectWorld } from "@/app/api/world/creator/route";
import { POST as startWorld } from "@/app/api/world/session/route";
import { POST as turnWorld } from "@/app/api/world/turn/route";
import { fixtureNarrationRenderer } from "@/src/adapters/fixtures/world-narrator";
import {
  STORY_CODEX_CLI_ENABLED_ENV,
  STORY_CODEX_CLI_TOKEN_ENV,
  STORY_LIVE_TOKEN_HEADER,
} from "@/src/application/story-live-gate";
import {
  loadWorldSessionCheckpoint,
  resetWorldSessionStoreForTests,
} from "@/src/application/world-session-store";
import {
  WORLD_CREATOR_ACCESS_TOKEN_HEADER,
  WorldCreatorReceiptSchema,
  WorldNarrationDraftDecisionApiResponseSchema,
  WorldNarrationDraftViewSchema,
  WorldParticipantSessionViewSchema,
  type WorldNarrationDraftView,
} from "@/src/contracts/world-api";
import type {
  NarrationCritic,
  NarrationRenderer,
} from "@/src/ports/world-narrator";

const LIVE_TOKEN = "world-draft-route-token-".padEnd(64, "9");

const request = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

type RendererMode = "creator_review" | "hard_fail";

const modelAdapter = (mode: RendererMode): NarrationRenderer & NarrationCritic => {
  const render: NarrationRenderer["render"] = async (input) => {
    const fixture = await fixtureNarrationRenderer.render(input);
    if (fixture.outcome !== "completed") return fixture;
    const paragraphs = fixture.modelOutput.readerProse.paragraphs.map(
      (paragraph) => ({
        ...paragraph,
        text:
          mode === "hard_fail"
            ? "The stranger is Odysseus."
            : `${paragraph.text.replace(/[.!?]+$/u, "")}!`,
      }),
    );
    return {
      outcome: "completed",
      modelOutput: {
        ...fixture.modelOutput,
        readerProse: { ...fixture.modelOutput.readerProse, paragraphs },
      },
      trace: {
        provenance: "model",
        adapterId: "test.world_narration_codex_cli",
      },
    };
  };
  return {
    render,
    async revise(input) {
      return render(input.rendererRequest);
    },
  };
};

const openCodexWorld = async () => {
  const response = await startWorld(
    request(
      "/api/world/session",
      { transport: "codex_cli" },
      { [STORY_LIVE_TOKEN_HEADER]: LIVE_TOKEN },
    ),
  );
  return {
    response,
    view: WorldParticipantSessionViewSchema.parse(await response.json()),
    creatorAccessToken:
      response.headers.get(WORLD_CREATOR_ACCESS_TOKEN_HEADER) ?? "",
  };
};

const createPendingDraft = async (): Promise<{
  opening: Awaited<ReturnType<typeof openCodexWorld>>["view"];
  creatorAccessToken: string;
  response: Response;
  draft: WorldNarrationDraftView;
}> => {
  const { view: opening, creatorAccessToken } = await openCodexWorld();
  const response = await turnWorld(
    request(
      "/api/world/turn",
      {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "Please bring the basin for Eurycleia.",
        preparedActionId: "action.penelope.order_washing",
        forkBeforeAction: false,
        transport: "codex_cli",
      },
      {
        [STORY_LIVE_TOKEN_HEADER]: LIVE_TOKEN,
        [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: creatorAccessToken,
      },
    ),
  );
  return {
    opening,
    creatorAccessToken,
    response,
    draft: WorldNarrationDraftViewSchema.parse(await response.json()),
  };
};

const decide = async ({
  draft,
  creatorAccessToken,
  decision,
}: {
  draft: WorldNarrationDraftView;
  creatorAccessToken: string;
  decision:
    | { action: "approve" }
    | { action: "reject" }
    | {
        action: "edit";
        paragraphs: Array<{ paragraphId: string; text: string }>;
      };
}) =>
  decideWorldNarration(
    request(
      "/api/world/narration-draft",
      { authority: draft.authority, decision },
      { [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: creatorAccessToken },
    ),
  );

describe("world narration creator-review API", () => {
  beforeEach(() => {
    resetWorldSessionStoreForTests();
    vi.stubEnv(STORY_CODEX_CLI_ENABLED_ENV, "1");
    vi.stubEnv(STORY_CODEX_CLI_TOKEN_ENV, LIVE_TOKEN);
    createCodexCliNarrationRenderer.mockReturnValue(
      modelAdapter("creator_review"),
    );
  });

  afterEach(() => {
    checkpointFailure.nextApprovedSave = false;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("keeps a hard-passing free-prose turn pending without creating a checkpoint", async () => {
    const { opening, response, draft } = await createPendingDraft();

    expect(response.status).toBe(202);
    expect(draft.kind).toBe("creator_review");
    expect(draft.authority.baseCheckpointId).toBe(opening.sessionId);
    expect(draft.authority.baseStateHash).toBe(opening.stateHash);
    expect(draft.authority.creatorReviewRuleIds.length).toBeGreaterThan(0);
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.stateHash).toBe(
      opening.stateHash,
    );
    expect(loadWorldSessionCheckpoint(draft.authority.draftId)).toBeNull();
    expect(JSON.stringify(draft)).not.toMatch(
      /"candidateSession"|"candidateReceipt"|"artifacts":|"planReceipt"|"sentencePlanIds"/u,
    );
  });

  it("commits exactly one checkpoint after exact creator approval", async () => {
    const { opening, creatorAccessToken, draft } = await createPendingDraft();
    const response = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "approve" },
    });
    const approved = WorldNarrationDraftDecisionApiResponseSchema.parse(
      await response.json(),
    );

    expect(response.status).toBe(200);
    expect(approved.status).toBe("approved");
    if (approved.status !== "approved") throw new Error("Expected approval.");
    expect(approved.session.parentCheckpointId).toBe(opening.sessionId);
    expect(approved.session.turn).toBe(1);
    const stored = loadWorldSessionCheckpoint(approved.session.sessionId);
    expect(stored?.narrationDecisionReceipt).toMatchObject({
      decision: "approve",
      draftId: draft.authority.draftId,
      draftHash: draft.authority.draftHash,
      originalCreatorReviewRuleIds: draft.authority.creatorReviewRuleIds,
      satisfiedCreatorReviewRuleIds: draft.authority.creatorReviewRuleIds,
      approvedModelOutputHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      receiptHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.stateHash).toBe(
      opening.stateHash,
    );
    expect(JSON.stringify(approved.session)).not.toMatch(
      /decisionReceipt|narrationDecisionProof|satisfiedCreatorReviewRuleIds|draftHash/u,
    );

    const creatorResponse = await inspectWorld(
      request(
        "/api/world/creator",
        {
          sessionId: approved.session.sessionId,
          expectedStateHash: approved.session.stateHash,
        },
        { [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: creatorAccessToken },
      ),
    );
    const creatorReceipt = WorldCreatorReceiptSchema.parse(
      await creatorResponse.json(),
    );
    expect(creatorResponse.status).toBe(200);
    expect(creatorReceipt.narrationDecisionProof).toMatchObject({
      decision: "approve",
      draftId: draft.authority.draftId,
      draftHash: draft.authority.draftHash,
      originalCreatorReviewRuleIds: draft.authority.creatorReviewRuleIds,
      satisfiedCreatorReviewRuleIds: draft.authority.creatorReviewRuleIds,
    });
    expect(JSON.stringify(creatorReceipt.narrationDecisionProof)).not.toContain(
      approved.session.narration.prose,
    );

    const replay = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "approve" },
    });
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: { code: "draft_consumed" },
    });
  });

  it("accepts a paragraph-only edit and preserves the immutable paragraph bindings", async () => {
    const { creatorAccessToken, draft } = await createPendingDraft();
    const paragraphs = draft.narration.paragraphs.map((paragraph, index) => ({
      paragraphId: paragraph.paragraphId,
      text: index === 0 ? paragraph.text.replace(/!$/u, ".") : paragraph.text,
    }));
    const response = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "edit", paragraphs },
    });
    const approved = WorldNarrationDraftDecisionApiResponseSchema.parse(
      await response.json(),
    );

    expect(response.status).toBe(200);
    expect(approved.status).toBe("approved");
    if (approved.status !== "approved") throw new Error("Expected edited approval.");
    expect(approved.session.narration.paragraphs.map(({ paragraphId }) => paragraphId)).toEqual(
      paragraphs.map(({ paragraphId }) => paragraphId),
    );
    expect(approved.session.narration.paragraphs[0]?.text).toBe(
      paragraphs[0]?.text,
    );
  });

  it("releases validation reservations so a failed edit can be corrected", async () => {
    const { opening, creatorAccessToken, draft } = await createPendingDraft();
    const unsafeParagraphs = draft.narration.paragraphs.map((paragraph) => ({
      paragraphId: paragraph.paragraphId,
      text: "The stranger is Odysseus.",
    }));
    const denied = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "edit", paragraphs: unsafeParagraphs },
    });

    expect(denied.status).toBe(422);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "validation_failed" },
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.stateHash).toBe(
      opening.stateHash,
    );

    const corrected = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "approve" },
    });
    expect(corrected.status).toBe(200);
  });

  it("rejects an oversized edit before reservation and leaves the draft retryable", async () => {
    const { creatorAccessToken, draft } = await createPendingDraft();
    const oversized = Array.from({ length: 6 }, (_, index) => ({
      paragraphId: `fixture.oversized.${index + 1}`,
      text: "x".repeat(2_400),
    }));
    const denied = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "edit", paragraphs: oversized },
    });

    expect(denied.status).toBe(400);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "world_narration_decision_invalid" },
    });
    const corrected = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "approve" },
    });
    expect(corrected.status).toBe(200);
  });

  it("does not consume a draft when the approved checkpoint save fails", async () => {
    const { opening, creatorAccessToken, draft } = await createPendingDraft();
    checkpointFailure.nextApprovedSave = true;
    const failed = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "approve" },
    });

    expect(failed.status).toBe(500);
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.stateHash).toBe(
      opening.stateHash,
    );
    const retried = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "approve" },
    });
    expect(retried.status).toBe(200);
  });

  it("rejects without changing the base checkpoint", async () => {
    const { opening, creatorAccessToken, draft } = await createPendingDraft();
    const before = loadWorldSessionCheckpoint(opening.sessionId);
    const response = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "reject" },
    });
    const rejected = WorldNarrationDraftDecisionApiResponseSchema.parse(
      await response.json(),
    );

    expect(response.status).toBe(200);
    expect(rejected).toMatchObject({
      status: "rejected",
      baseCheckpointId: opening.sessionId,
      baseStateHash: opening.stateHash,
      stateChanged: false,
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)).toEqual(before);
  });

  it("rejects tampered authority without consuming the valid decision", async () => {
    const { creatorAccessToken, draft } = await createPendingDraft();
    const tampered = structuredClone(draft);
    tampered.authority.draftHash = "a".repeat(64);
    const denied = await decide({
      draft: tampered,
      creatorAccessToken,
      decision: { action: "approve" },
    });
    expect(denied.status).toBe(409);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "authority_mismatch" },
    });

    const valid = await decide({
      draft,
      creatorAccessToken,
      decision: { action: "approve" },
    });
    expect(valid.status).toBe(200);
  });

  it("rejects a live turn before rendering when creator capability is missing", async () => {
    const { view: opening } = await openCodexWorld();
    const response = await turnWorld(
      request(
        "/api/world/turn",
        {
          sessionId: opening.sessionId,
          expectedStateHash: opening.stateHash,
          action: "Please bring the basin for Eurycleia.",
          preparedActionId: "action.penelope.order_washing",
          forkBeforeAction: false,
          transport: "codex_cli",
        },
        { [STORY_LIVE_TOKEN_HEADER]: LIVE_TOKEN },
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "world_creator_access_denied" },
    });
    expect(createCodexCliNarrationRenderer).not.toHaveBeenCalled();
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.stateHash).toBe(
      opening.stateHash,
    );
  });

  it("blocks a second turn while the base checkpoint has a pending draft", async () => {
    const { opening, creatorAccessToken } = await createPendingDraft();
    const callsAfterDraft = createCodexCliNarrationRenderer.mock.calls.length;
    const response = await turnWorld(
      request(
        "/api/world/turn",
        {
          sessionId: opening.sessionId,
          expectedStateHash: opening.stateHash,
          action: "Observe without intervening.",
          preparedActionId: "action.penelope.observe",
          forkBeforeAction: true,
          transport: "codex_cli",
        },
        {
          [STORY_LIVE_TOKEN_HEADER]: LIVE_TOKEN,
          [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: creatorAccessToken,
        },
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "world_session_creator_review_pending" },
    });
    expect(createCodexCliNarrationRenderer).toHaveBeenCalledTimes(
      callsAfterDraft,
    );
  });

  it("rejects narration transport switches in both directions before adapter creation", async () => {
    const codexOpening = await openCodexWorld();
    expect(codexOpening.view.transport).toBe("codex_cli");
    expect(codexOpening.view.narratorTrace.provenance).toBe("fixture");
    const codexToFixture = await turnWorld(
      request("/api/world/turn", {
        sessionId: codexOpening.view.sessionId,
        expectedStateHash: codexOpening.view.stateHash,
        action: "Please bring the basin for Eurycleia.",
        preparedActionId: "action.penelope.order_washing",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    expect(codexToFixture.status).toBe(409);
    await expect(codexToFixture.json()).resolves.toMatchObject({
      error: { code: "world_session_transport_mismatch" },
    });

    resetWorldSessionStoreForTests();
    const fixtureResponse = await startWorld(
      request("/api/world/session", { transport: "fixture" }),
    );
    const fixtureOpening = WorldParticipantSessionViewSchema.parse(
      await fixtureResponse.json(),
    );
    const fixtureCreatorAccess =
      fixtureResponse.headers.get(WORLD_CREATOR_ACCESS_TOKEN_HEADER) ?? "";
    const fixtureToCodex = await turnWorld(
      request(
        "/api/world/turn",
        {
          sessionId: fixtureOpening.sessionId,
          expectedStateHash: fixtureOpening.stateHash,
          action: "Please bring the basin for Eurycleia.",
          preparedActionId: "action.penelope.order_washing",
          forkBeforeAction: false,
          transport: "codex_cli",
        },
        {
          [STORY_LIVE_TOKEN_HEADER]: LIVE_TOKEN,
          [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: fixtureCreatorAccess,
        },
      ),
    );
    expect(fixtureToCodex.status).toBe(409);
    await expect(fixtureToCodex.json()).resolves.toMatchObject({
      error: { code: "world_session_transport_mismatch" },
    });
    expect(createCodexCliNarrationRenderer).not.toHaveBeenCalled();
  });

  it("keeps hard-failing prose outside the pending-draft lane", async () => {
    createCodexCliNarrationRenderer.mockReturnValue(modelAdapter("hard_fail"));
    const { view: opening, creatorAccessToken } = await openCodexWorld();
    const response = await turnWorld(
      request(
        "/api/world/turn",
        {
          sessionId: opening.sessionId,
          expectedStateHash: opening.stateHash,
          action: "Please bring the basin for Eurycleia.",
          preparedActionId: "action.penelope.order_washing",
          forkBeforeAction: false,
          transport: "codex_cli",
        },
        {
          [STORY_LIVE_TOKEN_HEADER]: LIVE_TOKEN,
          [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: creatorAccessToken,
        },
      ),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "world_narration_hard_fail" },
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.stateHash).toBe(
      opening.stateHash,
    );
  });
});

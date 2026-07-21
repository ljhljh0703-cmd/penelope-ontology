import { beforeEach, describe, expect, it } from "vitest";
import { POST as startWorld } from "@/app/api/world/session/route";
import { POST as turnWorld } from "@/app/api/world/turn/route";
import { POST as inspectWorld } from "@/app/api/world/creator/route";
import {
  loadWorldSessionCheckpoint,
  resetWorldSessionStoreForTests,
} from "@/src/application/world-session-store";
import {
  WORLD_CREATOR_ACCESS_TOKEN_HEADER,
  WorldCreatorReceiptSchema,
  WorldParticipantSessionViewSchema,
} from "@/src/contracts/world-api";
import {
  CreatorCDialogueResponseSchema,
  type CreatorTacitKnowledgeAnswer,
} from "@/src/contracts/creator-c-dialogue";

const request = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const startFixture = async () => {
  const response = await startWorld(
    request("/api/world/session", { transport: "fixture" }),
  );
  return {
    response,
    view: WorldParticipantSessionViewSchema.parse(await response.json()),
    creatorAccessToken:
      response.headers.get(WORLD_CREATOR_ACCESS_TOKEN_HEADER) ?? "",
  };
};

const creatorAnswers: CreatorTacitKnowledgeAnswer[] = [
  {
    questionId: "desired_outcome",
    answer: "Keep the interview private while Penelope tests the stranger.",
  },
  {
    questionId: "character_motive",
    answer: "Penelope suspects the household is listening and needs room to judge safely.",
  },
  {
    questionId: "accepted_cost",
    answer: "Melantho may feel excluded and become more suspicious.",
  },
];

describe("world-first Odyssey API", () => {
  beforeEach(() => resetWorldSessionStoreForTests());

  it("opens a participant-safe source-grounded session", async () => {
    const { response, view, creatorAccessToken } = await startFixture();

    expect(response.status).toBe(200);
    expect(view.turn).toBe(0);
    expect(view.cursor.branchId).toMatch(/^branch\.canon_[a-f0-9]{12}$/u);
    expect(view.nextActions.map(({ actionId }) => actionId)).toEqual([
      "action.penelope.test_testimony",
      "action.penelope.order_washing",
      "action.penelope.observe",
    ]);
    expect(view.nextActions.map(({ suggestedInput }) => suggestedInput).join(" ")).not.toContain(
      "Odysseus",
    );
    expect(view.narration.paragraphs.length).toBeGreaterThan(0);
    expect(view.narration.prose).toBe(
      view.narration.paragraphs.map(({ text }) => text).join("\n\n"),
    );
    expect(view.narration).not.toHaveProperty("title");
    expect(view.narration).not.toHaveProperty("segments");
    expect(view.narration).not.toHaveProperty("grounding");
    expect(view.narration).not.toHaveProperty("planReceipt");
    expect(view.narration.paragraphs[0]).not.toHaveProperty("sentencePlanIds");
    expect(view.narration.prose).not.toMatch(/disguised Odysseus|the stranger is Odysseus/iu);
    expect(view.narratorTrace.provenance).toBe("fixture");
    expect(creatorAccessToken).not.toBe("");
    const checkpoint = loadWorldSessionCheckpoint(view.sessionId);
    expect(checkpoint?.previousVisibleSceneSummary).toContain(
      "Penelope keeps the late interview at the hearth",
    );
    expect(checkpoint?.previousVisibleSceneSummary).not.toBe(view.narration.prose);
    expect(JSON.stringify(view)).not.toMatch(
      /creatorReceipt|Disguised Odysseus|premise\.stranger_identity/u,
    );
  });

  it("serves private world truth only through the creator capability route", async () => {
    const { view, creatorAccessToken } = await startFixture();
    const body = {
      sessionId: view.sessionId,
      expectedStateHash: view.stateHash,
    };
    const denied = await inspectWorld(request("/api/world/creator", body));
    const allowed = await inspectWorld(
      request("/api/world/creator", body, {
        [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: creatorAccessToken,
      }),
    );
    const receipt = WorldCreatorReceiptSchema.parse(await allowed.json());

    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(receipt.actors.map(({ creatorName }) => creatorName)).toContain(
      "Disguised Odysseus",
    );
    expect(
      receipt.actors
        .flatMap(({ knownPremiseIds }) => knownPremiseIds)
        .includes("premise.stranger_identity"),
    ).toBe(true);
    expect(receipt.ruleReview.sourceGroundedIds).toContain(
      "reaction.eurycleia.recognize_scar",
    );
    expect(receipt.ruleReview.creatorApprovedNotSourceCanonIds).toContain(
      "ending.controlled_discovery",
    );
    expect(receipt.ruleReview.creatorApprovedNotSourceCanonIds).toContain(
      "reaction.eurycleia.controlled_disclosure",
    );
    expect(receipt.ruleReview.creatorReviewRequiredIds).toEqual([]);
    expect(
      receipt.ruleReview.sourceGroundedIds.filter((ruleId) =>
        receipt.ruleReview.creatorApprovedNotSourceCanonIds.includes(ruleId),
      ),
    ).toEqual([]);
  });

  it("elicits creator tacit knowledge without consuming a checkpoint turn", async () => {
    const { view: opening } = await startFixture();
    const before = loadWorldSessionCheckpoint(opening.sessionId);
    const clarificationResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "Penelope asks Melantho to leave before she questions the stranger.",
        forkBeforeAction: false,
        transport: "fixture",
        creatorDialogue: { answers: [] },
      }),
    );
    const clarification = CreatorCDialogueResponseSchema.parse(
      await clarificationResponse.json(),
    );
    const after = loadWorldSessionCheckpoint(opening.sessionId);

    expect(clarificationResponse.status).toBe(200);
    expect(clarification).toMatchObject({
      kind: "creator_clarification",
      baseSessionId: opening.sessionId,
      baseStateHash: opening.stateHash,
      stateChanged: false,
      question: { questionId: "desired_outcome" },
    });
    expect(after?.session.state).toEqual(before?.session.state);
    expect(after?.session.turns).toEqual([]);

    const ordinaryTurn = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "bring the basin",
        preparedActionId: "action.penelope.order_washing",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    expect(ordinaryTurn.status).toBe(200);
  });

  it("executes only the world action disclosed in a confirmed creator proposal", async () => {
    const { view: opening, creatorAccessToken } = await startFixture();
    const action =
      "Penelope asks Melantho to leave before she questions the stranger.";
    const proposalResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action,
        forkBeforeAction: false,
        transport: "fixture",
        creatorDialogue: { answers: creatorAnswers },
      }),
    );
    const proposal = CreatorCDialogueResponseSchema.parse(
      await proposalResponse.json(),
    );

    expect(proposal).toMatchObject({
      kind: "creator_confirmation",
      stateChanged: false,
      proposal: {
        registeredActionId: "action.penelope.clear_room",
        canonicalExecution: {
          verb: "clear the room",
          targetEntityId: "entity.melantho",
          targetZoneId: null,
        },
      },
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.turn).toBe(0);
    if (proposal.kind !== "creator_confirmation") {
      throw new Error("Expected a creator confirmation proposal.");
    }

    const confirmedResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action,
        forkBeforeAction: false,
        transport: "fixture",
        creatorDialogue: {
          answers: creatorAnswers,
          confirmedProposalHash: proposal.proposal.proposalHash,
        },
      }),
    );
    const confirmed = WorldParticipantSessionViewSchema.parse(
      await confirmedResponse.json(),
    );
    const checkpoint = loadWorldSessionCheckpoint(confirmed.sessionId);

    expect(confirmedResponse.status).toBe(200);
    expect(confirmed.turn).toBe(1);
    expect(checkpoint?.session.turns.at(-1)?.action.actionId).toBe(
      "action.penelope.clear_room",
    );
    expect(checkpoint?.session.turns.at(-1)?.creatorDirection).toMatchObject({
      source: "creator_c",
      proposalHash: proposal.proposal.proposalHash,
      originalAction: action,
      registeredActionId: "action.penelope.clear_room",
      acceptedCost: creatorAnswers[2]?.answer,
      forkBeforeAction: false,
    });
    expect(JSON.stringify(confirmed)).not.toContain(creatorAnswers[1]?.answer);
    const creatorResponse = await inspectWorld(
      request(
        "/api/world/creator",
        {
          sessionId: confirmed.sessionId,
          expectedStateHash: confirmed.stateHash,
        },
        { [WORLD_CREATOR_ACCESS_TOKEN_HEADER]: creatorAccessToken },
      ),
    );
    const creatorReceipt = WorldCreatorReceiptSchema.parse(
      await creatorResponse.json(),
    );
    expect(creatorReceipt.creatorDirections).toEqual([
      checkpoint?.session.turns.at(-1)?.creatorDirection,
    ]);
  });

  it("fails closed when a creator confirms a proposal with the wrong hash", async () => {
    const { view: opening } = await startFixture();
    const response = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "Penelope asks Melantho to leave before she questions the stranger.",
        forkBeforeAction: false,
        transport: "fixture",
        creatorDialogue: {
          answers: creatorAnswers,
          confirmedProposalHash: "a".repeat(64),
        },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "world_creator_proposal_stale" },
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.turn).toBe(0);
  });

  it("preserves a creator's aim but refuses an unsupported magical mechanism", async () => {
    const { view: opening } = await startFixture();
    const answers: CreatorTacitKnowledgeAnswer[] = [
      {
        questionId: "desired_outcome",
        answer: "Give Penelope certainty without relying on the stranger's words.",
      },
      {
        questionId: "character_motive",
        answer: "She cannot risk trusting a practiced liar while the suitors control the hall.",
      },
      {
        questionId: "accepted_cost",
        answer: "Using the proof may expose her suspicion to the household.",
      },
    ];
    const response = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "Penelope uses a hidden magical mirror to see through the disguise.",
        forkBeforeAction: false,
        transport: "fixture",
        creatorDialogue: { answers },
      }),
    );
    const result = CreatorCDialogueResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      kind: "creator_expansion_required",
      preservedIntent: answers[0]?.answer,
      stateChanged: false,
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.turn).toBe(0);
  });

  it("keeps a parent checkpoint while a creator forks a controlled IF ending", async () => {
    const { view: opening } = await startFixture();
    const recognitionResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "Please bring the basin for Eurycleia.",
        preparedActionId: "action.penelope.order_washing",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    const recognition = WorldParticipantSessionViewSchema.parse(
      await recognitionResponse.json(),
    );
    expect(recognition.status).toBe("active");
    expect(recognition.visibleEvents.map(({ summary }) => summary).join(" ")).not.toMatch(
      /recognizes Odysseus|knows the identity/iu,
    );

    const controlledResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: recognition.sessionId,
        expectedStateHash: recognition.stateHash,
        action: "Confront the stranger and ask Eurycleia to answer privately.",
        preparedActionId: "action.penelope.confront_privately",
        forkBeforeAction: true,
        transport: "fixture",
      }),
    );
    const controlled = WorldParticipantSessionViewSchema.parse(
      await controlledResponse.json(),
    );
    expect(controlledResponse.status).toBe(200);
    expect(controlled.forked).toBe(true);
    expect(controlled.cursor.parentBranchId).toBe(recognition.cursor.branchId);
    expect(controlled.ending?.id).toBe("ending.controlled_discovery");

    const canonResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: recognition.sessionId,
        expectedStateHash: recognition.stateHash,
        action: "Observe without intervening.",
        preparedActionId: "action.penelope.observe",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    const canon = WorldParticipantSessionViewSchema.parse(await canonResponse.json());
    expect(canonResponse.status).toBe(200);
    expect(canon.cursor.branchId).toBe(recognition.cursor.branchId);
    expect(canon.ending?.id).toBe("ending.canon_contained");
    expect(canon.stateHash).not.toBe(controlled.stateHash);
  });

  it("rejects an arbitrary direct action that has neither prepared nor C authority", async () => {
    const { view: opening } = await startFixture();
    const impossibleResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "Command Zeus to erase every suitor from the palace now.",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    expect(impossibleResponse.status).toBe(400);
    await expect(impossibleResponse.json()).resolves.toMatchObject({
      error: { code: "world_turn_request_invalid" },
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.turn).toBe(0);
  });

  it("rejects a hidden registered action disguised as a prepared A or B route", async () => {
    const { view: opening } = await startFixture();
    const response = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "dismiss Melantho",
        preparedActionId: "action.penelope.clear_room",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "world_prepared_action_invalid" },
    });
    expect(loadWorldSessionCheckpoint(opening.sessionId)?.session.state.turn).toBe(0);
  });

  it("rejects missing and stale checkpoint authority", async () => {
    const { view: opening } = await startFixture();
    const stale = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: "a".repeat(64),
        action: "wait",
        preparedActionId: "action.penelope.observe",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    const missing = await turnWorld(
      request("/api/world/turn", {
        sessionId: crypto.randomUUID(),
        expectedStateHash: opening.stateHash,
        action: "wait",
        preparedActionId: "action.penelope.observe",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );

    expect(stale.status).toBe(409);
    expect(missing.status).toBe(404);
  });

  it("prevents a checkpoint from advancing the same mainline twice", async () => {
    const { view: opening } = await startFixture();
    const action = {
      sessionId: opening.sessionId,
      expectedStateHash: opening.stateHash,
      action: "bring the basin",
      preparedActionId: "action.penelope.order_washing",
      forkBeforeAction: false,
      transport: "fixture" as const,
    };

    expect((await turnWorld(request("/api/world/turn", action))).status).toBe(200);
    const duplicate = await turnWorld(request("/api/world/turn", action));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({
      error: { code: "world_session_advanced" },
    });

    const explicitIf = await turnWorld(
      request("/api/world/turn", { ...action, forkBeforeAction: true }),
    );
    expect(explicitIf.status).toBe(200);
  });

  it("atomically rejects one of two concurrent mainline submissions", async () => {
    const { view: opening } = await startFixture();
    const base = {
      sessionId: opening.sessionId,
      expectedStateHash: opening.stateHash,
      forkBeforeAction: false,
      transport: "fixture" as const,
    };
    const responses = await Promise.all([
      turnWorld(
        request("/api/world/turn", {
          ...base,
          action: "Please bring the basin for Eurycleia.",
          preparedActionId: "action.penelope.order_washing",
        }),
      ),
      turnWorld(
        request("/api/world/turn", {
          ...base,
          action: "wash his feet Eurycleia",
          preparedActionId: "action.penelope.order_washing",
        }),
      ),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const rejected = responses.find(({ status }) => status === 409);
    if (!rejected) throw new Error("Expected one rejected concurrent turn.");
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: expect.stringMatching(/^world_session_(busy|advanced)$/u) },
    });
  });

  it("keeps the Codex CLI lane disabled unless the local live gate is explicit", async () => {
    const original = process.env.PENELOPE_STORY_CODEX_CLI_ENABLED;
    delete process.env.PENELOPE_STORY_CODEX_CLI_ENABLED;
    try {
      const response = await startWorld(
        request("/api/world/session", { transport: "codex_cli" }),
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "story_live_disabled" },
      });
    } finally {
      if (original === undefined) delete process.env.PENELOPE_STORY_CODEX_CLI_ENABLED;
      else process.env.PENELOPE_STORY_CODEX_CLI_ENABLED = original;
    }
  });
});

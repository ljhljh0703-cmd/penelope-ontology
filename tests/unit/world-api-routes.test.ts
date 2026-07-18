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

  it("keeps a parent checkpoint while a creator forks a controlled IF ending", async () => {
    const { view: opening } = await startFixture();
    const recognitionResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "Please bring the basin for Eurycleia.",
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

  it("turns an impossible intervention into a no-gain beat and continues to an ending", async () => {
    const { view: opening } = await startFixture();
    const openingCheckpoint = loadWorldSessionCheckpoint(opening.sessionId);
    const impossibleResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: opening.stateHash,
        action: "Command Zeus to erase every suitor from the palace now.",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    const impossible = WorldParticipantSessionViewSchema.parse(
      await impossibleResponse.json(),
    );

    expect(impossibleResponse.status).toBe(200);
    expect(impossible).toMatchObject({
      turn: 1,
      status: "active",
      narratorTrace: {
        provenance: "fixture",
        adapterId: "world.unsupported_no_render.v1",
      },
    });
    expect(impossible.narration.prose).toContain(
      "nothing shifts in her favor",
    );
    expect(impossible.visibleEvents[0]?.summary).not.toMatch(
      /unsupported|registered world action/iu,
    );
    const impossibleCheckpoint = loadWorldSessionCheckpoint(
      impossible.sessionId,
    );
    expect(impossibleCheckpoint?.session.turns.at(-1)?.action.status).toBe(
      "unsupported",
    );
    expect(impossibleCheckpoint?.session.state.flags).toEqual(
      openingCheckpoint?.session.state.flags,
    );
    expect(impossibleCheckpoint?.session.state.clocks).toEqual(
      openingCheckpoint?.session.state.clocks,
    );

    const recoveredResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: impossible.sessionId,
        expectedStateHash: impossible.stateHash,
        action: "bring the basin",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    const recovered = WorldParticipantSessionViewSchema.parse(
      await recoveredResponse.json(),
    );
    expect(recoveredResponse.status).toBe(200);
    expect(recovered).toMatchObject({
      turn: 2,
      status: "complete",
      ending: { id: "ending.canon_contained" },
    });
  });

  it("rejects missing and stale checkpoint authority", async () => {
    const { view: opening } = await startFixture();
    const stale = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.sessionId,
        expectedStateHash: "a".repeat(64),
        action: "wait",
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    const missing = await turnWorld(
      request("/api/world/turn", {
        sessionId: crypto.randomUUID(),
        expectedStateHash: opening.stateHash,
        action: "wait",
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
          action: "bring the basin",
        }),
      ),
      turnWorld(
        request("/api/world/turn", {
          ...base,
          action: "dismiss Melantho",
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

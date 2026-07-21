import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as postStorySession } from "@/app/api/story/session/route";
import { POST as postStoryTurn } from "@/app/api/story/turn/route";
import {
  STORY_CODEX_CLI_ENABLED_ENV,
  STORY_CODEX_CLI_TOKEN_ENV,
  STORY_LIVE_TOKEN_HEADER,
} from "@/src/application/story-live-gate";
import {
  StorySessionPayloadSchema,
  StorySessionSchema,
  type StorySession,
} from "@/src/contracts/story";
import { sha256Canonical } from "@/src/domain/canonical-json";

const LIVE_TOKEN = "route-live-token-".padEnd(64, "8");

const jsonRequest = (
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const rehashStorySession = (session: StorySession): StorySession => {
  const { sessionHash: _discardedHash, ...payload } = session;
  void _discardedHash;
  const parsed = StorySessionPayloadSchema.parse(payload);
  return StorySessionSchema.parse({
    ...parsed,
    sessionHash: sha256Canonical(parsed),
  });
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("story session API", () => {
  it("opens the formal Scene 1 fixture with real choices and a style receipt", async () => {
    const response = await postStorySession(
      jsonRequest("http://127.0.0.1:3210/api/story/session", {
        transport: "fixture",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transport).toBe("fixture");
    expect(body.opening).toMatchObject({
      sceneNumber: 1,
      title: "The Signal",
      centralQuestionClosed: false,
    });
    expect(body.opening.suggestedContinuations).toHaveLength(2);
    expect(body.choices.map(({ choiceId }: { choiceId: string }) => choiceId)).toEqual([
      "choice.keep_quiet_watch",
      "choice.ring_public_bell",
    ]);
    expect(body.styleProfile).toMatchObject({
      id: "style.red_sail_live",
      label: "Playable mythic restraint",
    });
    expect(StorySessionSchema.safeParse(body.session).success).toBe(true);
    expect(body.openingTrace).toMatchObject({
      mode: "fixture",
      requestedModel: "fixture-story-v1",
      outputSha256: body.opening.sceneHash,
    });
  });

  it("carries the quiet-watch choice into a cost and a closed payoff", async () => {
    const bootstrap = await (
      await postStorySession(
        jsonRequest("http://127.0.0.1:3210/api/story/session", {
          transport: "fixture",
        }),
      )
    ).json();
    const quiet = bootstrap.choices.find(
      ({ choiceId }: { choiceId: string }) =>
        choiceId === "choice.keep_quiet_watch",
    );
    const secondResponse = await postStoryTurn(
      jsonRequest("http://127.0.0.1:3210/api/story/turn", {
        authority: bootstrap.session,
        transport: "fixture",
        action: quiet.intent,
        choiceId: quiet.choiceId,
      }),
    );
    expect(secondResponse.status).toBe(200);
    const second = await secondResponse.json();
    expect(second).toMatchObject({
      status: "advanced",
      scene: {
        sceneNumber: 2,
        title: "The Cost",
        centralQuestionClosed: false,
      },
      resolution: { outcome: "success_with_cost" },
    });
    expect(second.scene.prose).toContain("what his mother bought with silence");
    expect(second.scopeReceipt.allowedClaimIds.length).toBeGreaterThan(0);
    expect(second).not.toHaveProperty("knowledgeScope");
    expect(JSON.stringify(second)).not.toContain(
      "claim.odyssey.odysseus_at_ogygia",
    );

    const payoffChoice = second.scene.suggestedContinuations[0];
    const thirdResponse = await postStoryTurn(
      jsonRequest("http://127.0.0.1:3210/api/story/turn", {
        authority: second.session,
        transport: "fixture",
        action: payoffChoice.intent,
        choiceId: payoffChoice.choiceId,
      }),
    );
    expect(thirdResponse.status).toBe(200);
    const third = await thirdResponse.json();
    expect(third).toMatchObject({
      status: "completed",
      session: { status: "completed", currentSceneNumber: 3 },
      scene: {
        sceneNumber: 3,
        title: "The Payoff",
        centralQuestionClosed: true,
        suggestedContinuations: [],
      },
    });
    expect(third.scene.prose).toContain("not as proof of Odysseus");
    expect(third.session.choiceHistory).toHaveLength(2);
  });

  it("rejects an unsupported direct action without advancing or selecting A", async () => {
    const bootstrap = await (
      await postStorySession(
        jsonRequest("http://127.0.0.1:3210/api/story/session", {
          transport: "fixture",
        }),
      )
    ).json();
    const action = "Swim alone to the red-sailed ship and demand its captain surrender.";
    const response = await postStoryTurn(
      jsonRequest("http://127.0.0.1:3210/api/story/turn", {
        authority: bootstrap.session,
        transport: "fixture",
        action,
      }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "story_creator_direction_requires_interview",
        message:
          "This rehearsal only executes its prepared routes. Use the World Workbench C interview to develop a creator direction before the world changes.",
      },
    });
    expect(body).not.toHaveProperty("session");
    expect(body).not.toHaveProperty("scene");
    expect(body).not.toHaveProperty("resolution");
  });

  it("does not infer A or B from choice-less prepared text or a paraphrase", async () => {
    const bootstrap = await (
      await postStorySession(
        jsonRequest("http://127.0.0.1:3210/api/story/session", {
          transport: "fixture",
        }),
      )
    ).json();
    for (const action of [
      bootstrap.choices[1].intent,
      "Raise the public alarm and assemble the harbor guard.",
    ]) {
      const response = await postStoryTurn(
        jsonRequest("http://127.0.0.1:3210/api/story/turn", {
          authority: bootstrap.session,
          transport: "fixture",
          action,
        }),
      );
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "story_creator_direction_requires_interview" },
      });
    }
  });

  it.each([
    ["style profile", (session: StorySession) => {
      session.styleProfile.label = "Counterfeit style authority";
    }],
    ["character drives", (session: StorySession) => {
      session.characterDrives[0]!.desire = "Replace the creator-owned drive.";
    }],
    ["story spine", (session: StorySession) => {
      session.spine.targetEnding = "Replace the registered ending authority.";
    }],
  ])(
    "rejects a client-rehashed session with tampered %s",
    async (_label, mutate) => {
      const bootstrap = await (
        await postStorySession(
          jsonRequest("http://127.0.0.1:3210/api/story/session", {
            transport: "fixture",
          }),
        )
      ).json();
      const tampered = structuredClone(bootstrap.session) as StorySession;
      mutate(tampered);
      const authority = rehashStorySession(tampered);
      const quiet = bootstrap.choices.find(
        ({ choiceId }: { choiceId: string }) =>
          choiceId === "choice.keep_quiet_watch",
      );
      const response = await postStoryTurn(
        jsonRequest("http://127.0.0.1:3210/api/story/turn", {
          authority,
          transport: "fixture",
          action: quiet.intent,
          choiceId: quiet.choiceId,
        }),
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: {
          code: "story_session_authority_mismatch",
          message:
            "The submitted story session does not match the server-loaded scenario authority.",
        },
      });
    },
  );

  it("reports registered-ID text tampering as its actual presentation error", async () => {
    const bootstrap = await (
      await postStorySession(
        jsonRequest("http://127.0.0.1:3210/api/story/session", {
          transport: "fixture",
        }),
      )
    ).json();
    const quiet = bootstrap.choices.find(
      ({ choiceId }: { choiceId: string }) =>
        choiceId === "choice.keep_quiet_watch",
    );
    const response = await postStoryTurn(
      jsonRequest("http://127.0.0.1:3210/api/story/turn", {
        authority: bootstrap.session,
        transport: "fixture",
        action: "Ring the public bell instead.",
        choiceId: quiet.choiceId,
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "story_choice_text_changed",
        message:
          "The selected choice text does not match its registered scene authority.",
      },
    });
  });

  it("does not silently enable local Codex", async () => {
    const response = await postStorySession(
      jsonRequest("http://127.0.0.1:3210/api/story/session", {
        transport: "codex_cli",
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "story_live_disabled",
        message: "Local Codex story generation is not enabled.",
      },
    });
  });

  it("keeps Codex local-only even if a public host copies the flag", async () => {
    vi.stubEnv(STORY_CODEX_CLI_ENABLED_ENV, "1");
    vi.stubEnv(STORY_CODEX_CLI_TOKEN_ENV, LIVE_TOKEN);
    const response = await postStorySession(
      jsonRequest(
        "https://penelope.example/api/story/session",
        { transport: "codex_cli" },
        { [STORY_LIVE_TOKEN_HEADER]: LIVE_TOKEN },
      ),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("story_live_local_only");
  });

  it("requires the private header on an enabled loopback live session", async () => {
    vi.stubEnv(STORY_CODEX_CLI_ENABLED_ENV, "1");
    vi.stubEnv(STORY_CODEX_CLI_TOKEN_ENV, LIVE_TOKEN);
    const response = await postStorySession(
      jsonRequest("http://127.0.0.1:3210/api/story/session", {
        transport: "codex_cli",
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "story_live_token_required",
        message: "A local live-story authorization token is required.",
      },
    });
  });

  it("rejects a wrong live token without echoing either credential", async () => {
    vi.stubEnv(STORY_CODEX_CLI_ENABLED_ENV, "1");
    vi.stubEnv(STORY_CODEX_CLI_TOKEN_ENV, LIVE_TOKEN);
    const wrongToken = "wrong-live-token-".padEnd(64, "9");
    const response = await postStorySession(
      jsonRequest(
        "http://127.0.0.1:3210/api/story/session",
        { transport: "codex_cli" },
        { [STORY_LIVE_TOKEN_HEADER]: wrongToken },
      ),
    );
    expect(response.status).toBe(403);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("story_live_token_invalid");
    expect(serialized).not.toContain(LIVE_TOKEN);
    expect(serialized).not.toContain(wrongToken);
  });

  it("authorizes a valid local live session without placing the token in JSON", async () => {
    vi.stubEnv(STORY_CODEX_CLI_ENABLED_ENV, "1");
    vi.stubEnv(STORY_CODEX_CLI_TOKEN_ENV, LIVE_TOKEN);
    const response = await postStorySession(
      jsonRequest(
        "http://127.0.0.1:3210/api/story/session",
        { transport: "codex_cli" },
        { [STORY_LIVE_TOKEN_HEADER]: LIVE_TOKEN },
      ),
    );
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain('"transport":"codex_cli"');
    expect(serialized).not.toContain(LIVE_TOKEN);
    expect(serialized).not.toContain(STORY_LIVE_TOKEN_HEADER);
  });

  it("applies the same token gate to live story turns before model execution", async () => {
    const bootstrap = await (
      await postStorySession(
        jsonRequest("http://127.0.0.1:3210/api/story/session", {
          transport: "fixture",
        }),
      )
    ).json();
    vi.stubEnv(STORY_CODEX_CLI_ENABLED_ENV, "1");
    vi.stubEnv(STORY_CODEX_CLI_TOKEN_ENV, LIVE_TOKEN);
    const response = await postStoryTurn(
      jsonRequest("http://127.0.0.1:3210/api/story/turn", {
        authority: bootstrap.session,
        transport: "codex_cli",
        action: bootstrap.choices[0].intent,
        choiceId: bootstrap.choices[0].choiceId,
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe(
      "story_live_token_required",
    );
  });
});

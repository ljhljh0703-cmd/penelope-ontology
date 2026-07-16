import { describe, expect, it } from "vitest";
import {
  STORY_CODEX_CLI_ENABLED_ENV,
  STORY_CODEX_CLI_TOKEN_ENV,
  StoryLiveGateError,
  assertStoryTransportAllowed,
} from "@/src/application/story-live-gate";

const LIVE_TOKEN = "local-live-token-".padEnd(64, "7");

describe("story live transport gate", () => {
  it("always allows the deterministic fixture", () => {
    expect(() =>
      assertStoryTransportAllowed({
        transport: "fixture",
        requestUrl: "https://public.example/story",
        env: { NODE_ENV: "test" },
      }),
    ).not.toThrow();
  });

  it("requires an explicit local enable flag", () => {
    expect(() =>
      assertStoryTransportAllowed({
        transport: "codex_cli",
        requestUrl: "http://127.0.0.1:3210/story",
        env: { NODE_ENV: "test" },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryLiveGateError>>({
        code: "story_live_disabled",
      }),
    );
  });

  it("does not treat an enabled loopback hostname as authorization", () => {
    expect(() =>
      assertStoryTransportAllowed({
        transport: "codex_cli",
        requestUrl: "http://localhost:3210/api/story/turn",
        env: {
          NODE_ENV: "test",
          [STORY_CODEX_CLI_ENABLED_ENV]: "1",
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryLiveGateError>>({
        code: "story_live_token_not_configured",
      }),
    );
  });

  it("still blocks an enabled public host", () => {
    expect(() =>
      assertStoryTransportAllowed({
        transport: "codex_cli",
        requestUrl: "https://penelope.example/api/story/turn",
        env: {
          NODE_ENV: "test",
          [STORY_CODEX_CLI_ENABLED_ENV]: "1",
          [STORY_CODEX_CLI_TOKEN_ENV]: LIVE_TOKEN,
        },
        presentedToken: LIVE_TOKEN,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryLiveGateError>>({
        code: "story_live_local_only",
      }),
    );
  });

  it("requires the request token when the local lane is configured", () => {
    expect(() =>
      assertStoryTransportAllowed({
        transport: "codex_cli",
        requestUrl: "http://localhost:3210/api/story/turn",
        env: {
          NODE_ENV: "test",
          [STORY_CODEX_CLI_ENABLED_ENV]: "1",
          [STORY_CODEX_CLI_TOKEN_ENV]: LIVE_TOKEN,
        },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryLiveGateError>>({
        code: "story_live_token_required",
      }),
    );
  });

  it("rejects a wrong token without comparing raw variable-length buffers", () => {
    expect(() =>
      assertStoryTransportAllowed({
        transport: "codex_cli",
        requestUrl: "http://localhost:3210/api/story/turn",
        env: {
          NODE_ENV: "test",
          [STORY_CODEX_CLI_ENABLED_ENV]: "1",
          [STORY_CODEX_CLI_TOKEN_ENV]: LIVE_TOKEN,
        },
        presentedToken: `${LIVE_TOKEN}-wrong`,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryLiveGateError>>({
        code: "story_live_token_invalid",
      }),
    );
  });

  it("rejects a weak configured token", () => {
    expect(() =>
      assertStoryTransportAllowed({
        transport: "codex_cli",
        requestUrl: "http://localhost:3210/api/story/turn",
        env: {
          NODE_ENV: "test",
          [STORY_CODEX_CLI_ENABLED_ENV]: "1",
          [STORY_CODEX_CLI_TOKEN_ENV]: "too-short",
        },
        presentedToken: "too-short",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<StoryLiveGateError>>({
        code: "story_live_token_not_configured",
      }),
    );
  });

  it("allows live generation only when flag, token, and loopback checks all pass", () => {
    expect(() =>
      assertStoryTransportAllowed({
        transport: "codex_cli",
        requestUrl: "http://localhost:3210/api/story/turn",
        env: {
          NODE_ENV: "test",
          [STORY_CODEX_CLI_ENABLED_ENV]: "1",
          [STORY_CODEX_CLI_TOKEN_ENV]: LIVE_TOKEN,
        },
        presentedToken: LIVE_TOKEN,
      }),
    ).not.toThrow();
  });
});

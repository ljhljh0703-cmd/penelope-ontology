import { createHash, timingSafeEqual } from "node:crypto";
import type { StoryPresentationTransport } from "@/src/contracts/story-api";

export const STORY_CODEX_CLI_ENABLED_ENV =
  "PENELOPE_STORY_CODEX_CLI_ENABLED" as const;
export const STORY_CODEX_CLI_TOKEN_ENV =
  "PENELOPE_STORY_CODEX_CLI_TOKEN" as const;
export const STORY_LIVE_TOKEN_HEADER =
  "x-penelope-story-token" as const;

const MIN_STORY_LIVE_TOKEN_BYTES = 32;
const MAX_STORY_LIVE_TOKEN_BYTES = 512;

export type StoryLiveGateFailureCode =
  | "story_live_disabled"
  | "story_live_local_only"
  | "story_live_token_not_configured"
  | "story_live_token_required"
  | "story_live_token_invalid";

export class StoryLiveGateError extends Error {
  constructor(readonly code: StoryLiveGateFailureCode) {
    super(code);
    this.name = "StoryLiveGateError";
  }
}

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]";

const isBoundedToken = (token: string): boolean => {
  const byteLength = Buffer.byteLength(token, "utf8");
  return (
    byteLength >= MIN_STORY_LIVE_TOKEN_BYTES &&
    byteLength <= MAX_STORY_LIVE_TOKEN_BYTES &&
    !/\s/u.test(token)
  );
};

const tokenDigest = (token: string): Buffer =>
  createHash("sha256").update(token, "utf8").digest();

const tokensMatch = (configured: string, presented: string): boolean =>
  timingSafeEqual(tokenDigest(configured), tokenDigest(presented));

/**
 * Codex CLI generation is a locally authorized lane. A deployment can expose
 * the deterministic fixture, but the live route requires both an explicit
 * server flag and a bounded high-entropy token. Loopback is defense-in-depth;
 * request-derived hostnames are not treated as the authorization boundary.
 */
export const assertStoryTransportAllowed = ({
  transport,
  requestUrl,
  presentedToken,
  env = process.env,
}: {
  transport: StoryPresentationTransport;
  requestUrl: string;
  presentedToken?: string | null;
  env?: NodeJS.ProcessEnv;
}): void => {
  if (transport === "fixture") return;
  if (env[STORY_CODEX_CLI_ENABLED_ENV] !== "1") {
    throw new StoryLiveGateError("story_live_disabled");
  }
  if (!isLoopbackHostname(new URL(requestUrl).hostname)) {
    throw new StoryLiveGateError("story_live_local_only");
  }
  const configuredToken = env[STORY_CODEX_CLI_TOKEN_ENV];
  if (!configuredToken || !isBoundedToken(configuredToken)) {
    throw new StoryLiveGateError("story_live_token_not_configured");
  }
  if (!presentedToken) {
    throw new StoryLiveGateError("story_live_token_required");
  }
  if (!tokensMatch(configuredToken, presentedToken)) {
    throw new StoryLiveGateError("story_live_token_invalid");
  }
};

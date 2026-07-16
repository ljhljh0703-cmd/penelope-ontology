import { z } from "zod";
import type { CodexCliUsage } from "@/src/adapters/codex-cli/contracts";

const ThreadStartedEventSchema = z
  .object({
    type: z.literal("thread.started"),
    thread_id: z.uuid(),
  })
  .passthrough();

const TurnStartedEventSchema = z
  .object({ type: z.literal("turn.started") })
  .passthrough();

const RawUsageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative(),
    cached_input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    reasoning_output_tokens: z.number().int().nonnegative(),
  })
  .strict();

const TurnCompletedEventSchema = z
  .object({
    type: z.literal("turn.completed"),
    usage: RawUsageSchema,
  })
  .passthrough();

const ItemEventSchema = z
  .object({
    type: z.enum(["item.started", "item.updated", "item.completed"]),
    item: z
      .object({
        id: z.string().min(1),
        type: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

const EventHeaderSchema = z
  .object({ type: z.string().min(1) })
  .passthrough();

const PROHIBITED_ITEM_TYPE = /(command|file|mcp|web|tool)/iu;
const ALLOWED_PASSIVE_ITEM_TYPES = new Set(["agent_message", "reasoning"]);

export type CodexCliEventStreamErrorCode =
  | "jsonl_empty"
  | "jsonl_malformed"
  | "event_sequence_invalid"
  | "event_type_unrecognized"
  | "prohibited_activity"
  | "provenance_missing"
  | "final_message_mismatch";

export class CodexCliEventStreamError extends Error {
  constructor(readonly code: CodexCliEventStreamErrorCode) {
    super(code);
    this.name = "CodexCliEventStreamError";
  }
}

export type ParsedCodexCliEventStream = {
  threadId: string;
  usage: CodexCliUsage;
  finalAgentMessage: string;
  eventCount: number;
};

const fail = (code: CodexCliEventStreamErrorCode): never => {
  throw new CodexCliEventStreamError(code);
};

const parseJsonLines = (source: string): unknown[] => {
  const lines = source.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return fail("jsonl_empty");
  try {
    return lines.map((line) => JSON.parse(line) as unknown);
  } catch {
    return fail("jsonl_malformed");
  }
};

const mapUsage = (
  usage: z.infer<typeof RawUsageSchema>,
): CodexCliUsage => ({
  inputTokens: usage.input_tokens,
  cachedInputTokens: usage.cached_input_tokens,
  outputTokens: usage.output_tokens,
  reasoningOutputTokens: usage.reasoning_output_tokens,
});

/**
 * Parses the documented `codex exec --json` event stream and fails closed.
 *
 * This adapter is a renderer, not an agent runtime. Any command, filesystem,
 * MCP, web, or other tool-shaped item invalidates the attempt even if Codex
 * ultimately returns schema-valid JSON.
 */
export const parseCodexCliEventStream = (
  source: string,
  expectedFinalMessage: string,
): ParsedCodexCliEventStream => {
  const events = parseJsonLines(source);
  let threadId: string | null = null;
  let sawTurnStarted = false;
  let usage: CodexCliUsage | null = null;
  const agentMessages: string[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const input = events[index];
    const header = EventHeaderSchema.safeParse(input);
    if (!header.success) return fail("jsonl_malformed");

    if (header.data.type === "thread.started") {
      const parsed = ThreadStartedEventSchema.safeParse(input);
      if (!parsed.success || index !== 0 || threadId !== null) {
        return fail("event_sequence_invalid");
      }
      threadId = parsed.data.thread_id;
      continue;
    }

    if (header.data.type === "turn.started") {
      if (
        !TurnStartedEventSchema.safeParse(input).success ||
        threadId === null ||
        sawTurnStarted ||
        usage !== null
      ) {
        return fail("event_sequence_invalid");
      }
      sawTurnStarted = true;
      continue;
    }

    if (header.data.type === "turn.completed") {
      const parsed = TurnCompletedEventSchema.safeParse(input);
      if (
        !parsed.success ||
        !sawTurnStarted ||
        usage !== null ||
        index !== events.length - 1
      ) {
        return fail("event_sequence_invalid");
      }
      usage = mapUsage(parsed.data.usage);
      continue;
    }

    if (
      header.data.type === "turn.failed" ||
      header.data.type === "error"
    ) {
      return fail("event_sequence_invalid");
    }

    if (header.data.type.startsWith("item.")) {
      const parsed = ItemEventSchema.safeParse(input);
      if (!parsed.success || !sawTurnStarted || usage !== null) {
        return fail("event_sequence_invalid");
      }
      const itemType = parsed.data.item.type;
      if (PROHIBITED_ITEM_TYPE.test(itemType)) {
        return fail("prohibited_activity");
      }
      if (!ALLOWED_PASSIVE_ITEM_TYPES.has(itemType)) {
        return fail("event_type_unrecognized");
      }
      if (
        parsed.data.type === "item.completed" &&
        itemType === "agent_message"
      ) {
        const text = parsed.data.item.text;
        if (typeof text !== "string" || text.trim().length === 0) {
          return fail("provenance_missing");
        }
        agentMessages.push(text);
      }
      continue;
    }

    return fail("event_type_unrecognized");
  }

  if (
    threadId === null ||
    !sawTurnStarted ||
    usage === null ||
    agentMessages.length !== 1
  ) {
    return fail("provenance_missing");
  }
  if (agentMessages[0]?.trim() !== expectedFinalMessage.trim()) {
    return fail("final_message_mismatch");
  }

  return {
    threadId,
    usage,
    finalAgentMessage: agentMessages[0],
    eventCount: events.length,
  };
};

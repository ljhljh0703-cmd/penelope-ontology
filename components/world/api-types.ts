import type {
  WorldPresentationTransport,
  WorldTurnApiRequest,
  WorldParticipantSessionView,
  WorldCreatorReceiptSchema,
} from "@/src/contracts/world-api";
import type { z } from "zod";

export const WORLD_LIVE_TOKEN_HEADER = "x-penelope-story-token" as const;
export const WORLD_CREATOR_ACCESS_HEADER = "x-penelope-creator-access" as const;

export type WorldSessionView = WorldParticipantSessionView;
export type WorldCreatorReceipt = z.infer<typeof WorldCreatorReceiptSchema>;
export type WorldTransport = WorldPresentationTransport;
export type WorldTurnRequest = WorldTurnApiRequest;
export type WorldEvent = WorldCreatorReceipt["events"][number];
export type WorldEffect = WorldEvent["effects"][number];

export type WorldApiError = {
  error?:
    | string
    | {
        code?: string;
        message?: string;
      };
};

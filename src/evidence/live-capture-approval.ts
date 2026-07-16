import { z } from "zod";
import {
  LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID,
  LIVE_RED_SAIL_REQUEST_SHA256,
  LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
  LIVE_RED_SAIL_SCENARIO_CONTRACT,
} from "@/src/evidence/live-scenario-contract";

export const LiveCaptureApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    evidenceType: z.literal("live_capture_approval"),
    scenarioContractId: z.literal(LIVE_RED_SAIL_SCENARIO_CONTRACT.id),
    requestSha256: z.literal(LIVE_RED_SAIL_REQUEST_SHA256),
    attemptId: z.union([
      z.literal(LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID),
      z.literal(LIVE_RED_SAIL_RETRY_ATTEMPT_ID),
    ]),
    approved: z.literal(true),
  })
  .strict();

export type LiveCaptureApproval = z.infer<typeof LiveCaptureApprovalSchema>;

export const buildLiveCaptureApproval = (
  attemptId:
    | typeof LIVE_RED_SAIL_CAPTURE_ATTEMPT_ID
    | typeof LIVE_RED_SAIL_RETRY_ATTEMPT_ID,
): LiveCaptureApproval =>
  LiveCaptureApprovalSchema.parse({
    schemaVersion: 1,
    evidenceType: "live_capture_approval",
    scenarioContractId: LIVE_RED_SAIL_SCENARIO_CONTRACT.id,
    requestSha256: LIVE_RED_SAIL_REQUEST_SHA256,
    attemptId,
    approved: true,
  });

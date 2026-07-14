import { NextResponse } from "next/server";
import liveReadiness from "@/artifacts/evidence/live-readiness.json";

export const dynamic = "force-dynamic";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

const isGpt56Model = (value: unknown): value is string =>
  typeof value === "string" && /^gpt-5\.6(?:$|-[A-Za-z0-9._-]+$)/.test(value);

export const isLiveEvidenceVerified = (value: unknown): boolean =>
  isRecord(value) &&
  value.evidenceType === "live_readiness" &&
  value.status === "verified" &&
  value.sanitizedEvidencePath === "artifacts/evidence/live-sanitized.json" &&
  isGpt56Model(value.requestedModel) &&
  isGpt56Model(value.actualModel) &&
  value.authorityBindingVerified === true &&
  value.captureReceiptPath === "artifacts/evidence/live-capture-receipt.json" &&
  isSha256(value.captureReceiptSha256) &&
  value.captureBindingVerified === true &&
  isSha256(value.worldPackSha256) &&
  isSha256(value.requestSha256) &&
  value.rawResponsePersistedPublicly === false;

export const GET = () =>
  NextResponse.json(
    {
      status: "ok",
      phase: "core-vertical-slice",
      buildSha: process.env.BUILD_COMMIT_SHA ?? "unknown",
      publicMode: "fixture",
      liveModelImplemented: true,
      liveEvidenceVerified: isLiveEvidenceVerified(liveReadiness),
      corePipelineImplemented: true,
      frozenReplayImplemented: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );

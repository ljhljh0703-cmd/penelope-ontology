import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = () =>
  NextResponse.json(
    {
      status: "ok",
      phase: "core-vertical-slice",
      buildSha: process.env.BUILD_COMMIT_SHA ?? "unknown",
      publicMode: "fixture",
      liveModelImplemented: true,
      liveEvidenceVerified: false,
      corePipelineImplemented: true,
      frozenReplayImplemented: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );

import { NextResponse } from "next/server";

export const GET = () =>
  NextResponse.json({
    status: "ok",
    phase: "core-vertical-slice",
    publicMode: "fixture",
    liveModelImplemented: true,
    liveEvidenceVerified: false,
    corePipelineImplemented: true,
    frozenReplayImplemented: true,
  });

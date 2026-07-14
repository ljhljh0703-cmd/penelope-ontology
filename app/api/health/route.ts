import { NextResponse } from "next/server";

export const GET = () =>
  NextResponse.json({
    status: "ok",
    phase: "day-0-scaffold",
    liveModelImplemented: false,
    corePipelineImplemented: false,
  });

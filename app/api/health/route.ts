import { NextResponse } from "next/server";
import liveReadiness from "@/artifacts/evidence/live-readiness.json";
import { hasLiveReadinessShape } from "@/src/evidence/live-readiness";

export const dynamic = "force-dynamic";

export const GET = () =>
  NextResponse.json(
    {
      status: "ok",
      phase: "core-vertical-slice",
      buildSha: process.env.BUILD_COMMIT_SHA ?? "unknown",
      publicMode: "fixture",
      liveModelImplemented: true,
      // This runtime flag reports only the tracked readiness record. The local
      // release gate separately verifies raw source, receipt, manifest, and
      // current authority without tracing private files into the deployment.
      liveEvidenceReadinessRecorded: hasLiveReadinessShape(liveReadiness),
      corePipelineImplemented: true,
      frozenReplayImplemented: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );

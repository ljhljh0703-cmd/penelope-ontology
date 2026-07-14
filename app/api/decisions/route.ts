import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  loadDemoBundle,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import {
  FixtureCreatorAuthorityError,
  verifyFixtureCreatorDecision,
} from "@/src/application/fixture-creator-authority";
import { runApprovedOverlayReplay } from "@/src/application/replay-runner";
import { RunInputError } from "@/src/application/run-orchestrator";
import { CreatorDecisionSchema } from "@/src/contracts/creator-decision";
import { FixtureRunRequestSchema } from "@/src/contracts/run";
import { buildGraphDescriptor } from "@/src/domain/graph-descriptor";
import { normalizeParticipantIntents } from "@/src/domain/participants";
import { retrieveEvidence } from "@/src/domain/retrieval";

export const runtime = "nodejs";

const DecisionRequestSchema = z
  .object({
    runRequest: FixtureRunRequestSchema,
    decision: CreatorDecisionSchema,
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = DecisionRequestSchema.parse(await request.json());
    const [{ worldPack, replayCases }, registeredOverlay, registeredSnapshot] = await Promise.all([
      loadDemoBundle(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const {
      verifiedRun,
      proposal: proposalFromRun,
      completedDraft,
      decision,
    } = await verifyFixtureCreatorDecision({
      worldPack,
      registeredOverlay,
      registeredSnapshot,
      runRequest: body.runRequest,
      creatorDecision: body.decision,
      fixtureModel: fixtureNarrativeModel,
    });
    const participants = normalizeParticipantIntents(
      body.runRequest.participantIntents,
      worldPack,
    );
    const remainingProposals = verifiedRun.proposals.filter(
      ({ id }) => id !== proposalFromRun.id,
    );
    const remainingViolations = verifiedRun.hardViolations.filter(
      ({ code, evidenceIds }) =>
        code !== "unapproved_expansion" || !evidenceIds.includes(proposalFromRun.id),
    );
    const graph =
      decision.status === "applied"
        ? (() => {
            const evidence = retrieveEvidence({
              pack: worldPack,
              overlay: decision.overlay,
              snapshot: decision.snapshot,
              participantIntents: participants.intents,
              brief: body.runRequest.brief,
            });
            return buildGraphDescriptor({
              pack: worldPack,
              overlay: decision.overlay,
              snapshot: decision.snapshot,
              draft: completedDraft,
              characterViews: evidence.characterViews,
              violations: remainingViolations,
              proposals: remainingProposals,
            });
          })()
        : verifiedRun.graph;
    const overlayReplay =
      decision.status === "applied"
        ? await runApprovedOverlayReplay({
            worldPack,
            replayCases,
            fixtureModel: fixtureNarrativeModel,
            overlay: decision.overlay,
          })
        : null;
    if (overlayReplay && !overlayReplay.passed) {
      return NextResponse.json(
        {
          error: {
            code: "creator_decision_regression_failed",
            message: "The candidate overlay failed its frozen safety controls and was not returned as applied canon.",
          },
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      decision,
      graph,
      overlayReplay: overlayReplay
        ? {
            suiteId: overlayReplay.suiteId,
            overlayId: overlayReplay.overlayId,
            overlayVersion: overlayReplay.overlayVersion,
            overlayHash: overlayReplay.overlayHash,
            allPassed: overlayReplay.passed,
            replayResults: overlayReplay.cases.map((result) => ({
              id: result.id,
              label: result.description,
              status: result.passed ? "pass" : "fail",
              detail: result.stages
                .map(({ stageId, passed }) => `${stageId}:${passed ? "PASS" : "FAIL"}`)
                .join(" · "),
            })),
          }
        : null,
    });
  } catch (error) {
    if (error instanceof FixtureCreatorAuthorityError) {
      return NextResponse.json(
        {
          error: {
            code: "creator_decision_authority_invalid",
            message: error.message,
          },
        },
        { status: 409 },
      );
    }
    if (error instanceof ZodError || error instanceof RunInputError) {
      return NextResponse.json(
        {
          error: {
            code: "creator_decision_invalid",
            message:
              error instanceof ZodError
                ? error.issues[0]?.message ?? "Creator decision failed validation."
                : error.message,
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "creator_decision_failed", message: "Creator decision could not be applied." } },
      { status: 500 },
    );
  }
}

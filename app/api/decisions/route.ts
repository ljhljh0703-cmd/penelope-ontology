import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  loadDemoWorldPack,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import {
  RunInputError,
  createRunOrchestrator,
} from "@/src/application/run-orchestrator";
import {
  CreatorDecisionResultSchema,
  CreatorDecisionSchema,
} from "@/src/contracts/creator-decision";
import { FixtureRunRequestSchema } from "@/src/contracts/run";
import { applyCreatorDecision } from "@/src/domain/canon-overlay";
import { sha256Canonical } from "@/src/domain/canonical-json";
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
    const [worldPack, registeredOverlay, registeredSnapshot] = await Promise.all([
      loadDemoWorldPack(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
    ]);
    const registeredBaseAuthorityIsValid =
      sha256Canonical(body.runRequest.overlay) === sha256Canonical(registeredOverlay) &&
      sha256Canonical(body.runRequest.snapshot) === sha256Canonical(registeredSnapshot);
    if (!registeredBaseAuthorityIsValid) {
      return NextResponse.json(
        {
          error: {
            code: "creator_decision_authority_invalid",
            message: "The public fixture decision must start from its registered base authority.",
          },
        },
        { status: 409 },
      );
    }
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel: fixtureNarrativeModel,
    });
    const verifiedRun = await run(body.runRequest);
    const proposalFromRun = verifiedRun.proposals.find(
      ({ id, proposalHash }) =>
        id === body.decision.proposalId && proposalHash === body.decision.proposalHash,
    );
    const completedDraft =
      verifiedRun.modelOutcome.outcome === "completed"
        ? verifiedRun.modelOutcome.draft
        : null;
    const fixtureAuthorityIsValid =
      Boolean(proposalFromRun) &&
      Boolean(completedDraft) &&
      verifiedRun.status === "needs_creator_decision" &&
      verifiedRun.modelOutcome.trace.mode === "fixture" &&
      verifiedRun.proposedNextSnapshot.stateHash === verifiedRun.currentSnapshot.stateHash &&
      verifiedRun.hardViolations.length > 0 &&
      verifiedRun.hardViolations.every(
        ({ code, evidenceIds }) =>
          code === "unapproved_expansion" &&
          verifiedRun.proposals.some(({ id }) => evidenceIds.includes(id)),
      );
    if (!fixtureAuthorityIsValid || !proposalFromRun || !completedDraft) {
      return NextResponse.json(
        {
          error: {
            code: "creator_decision_authority_invalid",
            message: "The public fixture decision must reference its verified run authority.",
          },
        },
        { status: 409 },
      );
    }

    const decision = CreatorDecisionResultSchema.parse(
      applyCreatorDecision({
        worldPack,
        overlay: body.runRequest.overlay,
        snapshot: body.runRequest.snapshot,
        proposal: proposalFromRun,
        decision: body.decision,
      }),
    );
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
    return NextResponse.json({ decision, graph });
  } catch (error) {
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

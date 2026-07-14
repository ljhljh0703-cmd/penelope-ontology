import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  loadDemoBundle,
  loadDraftFixture,
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
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { validateOutputLineage } from "@/src/domain/participants";
import { activeRules } from "@/src/domain/retrieval";
import { applySimulationAction } from "@/src/domain/simulation";

export const runtime = "nodejs";

const TransitionRequestSchema = z
  .object({
    runRequest: FixtureRunRequestSchema,
    decision: CreatorDecisionSchema,
    snapshot: SimulationSnapshotSchema,
    step: z.union([z.literal(1), z.literal(2)]),
  })
  .strict();

const authorityFailure = (message = "Transition authority is stale or inconsistent.") =>
  NextResponse.json(
    { error: { code: "transition_authority_invalid", message } },
    { status: 409 },
  );

export async function POST(request: Request) {
  try {
    const body = TransitionRequestSchema.parse(await request.json());
    const [
      { worldPack, replayCases },
      registeredOverlay,
      registeredSnapshot,
      step1Draft,
      requestedDraft,
    ] = await Promise.all([
      loadDemoBundle(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
      loadDraftFixture("draft.red_sail_step_1"),
      loadDraftFixture(`draft.red_sail_step_${body.step}`),
    ]);
    const authority = await verifyFixtureCreatorDecision({
      worldPack,
      registeredOverlay,
      registeredSnapshot,
      runRequest: body.runRequest,
      creatorDecision: body.decision,
      fixtureModel: fixtureNarrativeModel,
    });
    if (authority.decision.status !== "applied") {
      return authorityFailure("A transition requires an applied creator decision.");
    }

    const regression = await runApprovedOverlayReplay({
      worldPack,
      replayCases,
      fixtureModel: fixtureNarrativeModel,
      overlay: authority.decision.overlay,
    });
    if (!regression.passed) {
      return NextResponse.json(
        {
          error: {
            code: "transition_regression_failed",
            message: "The approved overlay failed its frozen safety controls.",
          },
        },
        { status: 409 },
      );
    }

    const scenario = worldPack.simulationScenarios.find(
      ({ id }) => id === authority.decision.snapshot.scenarioId,
    );
    const step1Action = step1Draft.actions[0];
    const requestedAction = requestedDraft.actions[0];
    if (
      !scenario ||
      !step1Action ||
      step1Draft.actions.length !== 1 ||
      !requestedAction ||
      requestedDraft.actions.length !== 1
    ) {
      return authorityFailure("The registered transition fixtures are incomplete.");
    }

    const controls = Object.fromEntries(
      body.runRequest.participantIntents.map(({ intentId, controlledEntityIds }) => [
        intentId,
        controlledEntityIds,
      ]),
    );
    const requestedLineage = validateOutputLineage([], [requestedAction], controls);
    if (requestedLineage.length > 0) {
      return NextResponse.json({
        status: "blocked",
        snapshot: body.snapshot,
        transition: {
          status: "blocked",
          action: requestedAction,
          fromStateHash: body.snapshot.stateHash,
          toStateHash: body.snapshot.stateHash,
          toSnapshot: body.snapshot,
        },
        violations: requestedLineage,
      });
    }

    const approvedRules = new Set(
      activeRules(
        worldPack,
        authority.decision.overlay,
        authority.decision.snapshot,
      ).map(({ id }) => id),
    );
    const expectedSnapshot =
      body.step === 1
        ? authority.decision.snapshot
        : applySimulationAction({
            scenario,
            snapshot: authority.decision.snapshot,
            action: step1Action,
            activeRuleIds: approvedRules,
          }).snapshot;
    if (sha256Canonical(body.snapshot) !== sha256Canonical(expectedSnapshot)) {
      return authorityFailure();
    }

    return NextResponse.json(
      applySimulationAction({
        scenario,
        snapshot: expectedSnapshot,
        action: requestedAction,
        activeRuleIds: approvedRules,
      }),
    );
  } catch (error) {
    if (error instanceof FixtureCreatorAuthorityError || error instanceof RunInputError) {
      return authorityFailure();
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "transition_request_invalid",
            message: error.issues[0]?.message ?? "Transition request failed validation.",
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "transition_failed", message: "Transition could not be evaluated." } },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { loadDemoWorldPack, loadDraftFixture } from "@/src/adapters/filesystem/demo-data";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import { ParticipantIntentSetSchema } from "@/src/contracts/participant-intent";
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";
import { validateOutputLineage } from "@/src/domain/participants";
import { activeRules } from "@/src/domain/retrieval";
import { applySimulationAction, hasValidSnapshotHash } from "@/src/domain/simulation";

export const runtime = "nodejs";

const TransitionRequestSchema = z
  .object({
    overlay: CanonOverlaySchema,
    snapshot: SimulationSnapshotSchema,
    step: z.union([z.literal(1), z.literal(2)]),
    participantIntents: ParticipantIntentSetSchema,
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = TransitionRequestSchema.parse(await request.json());
    const [worldPack, draft] = await Promise.all([
      loadDemoWorldPack(),
      loadDraftFixture(`draft.red_sail_step_${body.step}`),
    ]);
    const scenario = worldPack.simulationScenarios.find(
      ({ id }) => id === body.snapshot.scenarioId,
    );
    const action = draft.actions[0];
    if (
      !scenario ||
      !action ||
      draft.actions.length !== 1 ||
      body.snapshot.turnIndex !== body.step - 1 ||
      !hasValidSnapshotHash(body.snapshot) ||
      body.snapshot.canonHash !== body.overlay.hash ||
      body.snapshot.overlayVersion !== body.overlay.version
    ) {
      return NextResponse.json(
        { error: { code: "transition_authority_invalid", message: "Transition authority is stale or inconsistent." } },
        { status: 409 },
      );
    }

    const controls = Object.fromEntries(
      body.participantIntents.map(({ intentId, controlledEntityIds }) => [
        intentId,
        controlledEntityIds,
      ]),
    );
    const lineage = validateOutputLineage([], [action], controls);
    if (lineage.length > 0) {
      return NextResponse.json({
        status: "blocked",
        snapshot: body.snapshot,
        transition: {
          status: "blocked",
          action,
          fromStateHash: body.snapshot.stateHash,
          toStateHash: body.snapshot.stateHash,
          toSnapshot: body.snapshot,
        },
        violations: lineage,
      });
    }

    return NextResponse.json(
      applySimulationAction({
        scenario,
        snapshot: body.snapshot,
        action,
        activeRuleIds: new Set(
          activeRules(worldPack, body.overlay, body.snapshot).map(({ id }) => id),
        ),
      }),
    );
  } catch (error) {
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

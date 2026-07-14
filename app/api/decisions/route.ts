import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { CanonOverlaySchema } from "@/src/contracts/canon-overlay";
import {
  CreatorDecisionResultSchema,
  CreatorDecisionSchema,
} from "@/src/contracts/creator-decision";
import { CanonProposalSchema } from "@/src/contracts/proposal";
import { SimulationSnapshotSchema } from "@/src/contracts/simulation";
import { applyCreatorDecision } from "@/src/domain/canon-overlay";

export const runtime = "nodejs";

const DecisionRequestSchema = z
  .object({
    overlay: CanonOverlaySchema,
    snapshot: SimulationSnapshotSchema,
    proposal: CanonProposalSchema,
    decision: CreatorDecisionSchema,
  })
  .strict();

export async function POST(request: Request) {
  try {
    const body = DecisionRequestSchema.parse(await request.json());
    return NextResponse.json(
      CreatorDecisionResultSchema.parse(applyCreatorDecision(body)),
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "creator_decision_invalid",
            message: error.issues[0]?.message ?? "Creator decision failed validation.",
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

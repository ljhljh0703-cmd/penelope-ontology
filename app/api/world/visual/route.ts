import { NextResponse } from "next/server";
import { fixtureIllustrationProvider } from "@/src/adapters/fixtures/illustration-provider";
import { createVisualMomentCandidate } from "@/src/application/visual-moment-service";
import { VisualMomentRequestSchema } from "@/src/contracts/visual-moment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VISUAL_MOMENT_REQUEST_BYTES = 65_536;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_VISUAL_MOMENT_REQUEST_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "visual_moment_request_too_large",
            message: "The visible scene request is too large for one Fate Frame.",
          },
        },
        { status: 413 },
      );
    }
    const parsed = VisualMomentRequestSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "visual_moment_request_invalid",
            message: "Fate Frame accepts only the declared participant-visible scene surface.",
          },
        },
        { status: 400 },
      );
    }
    const candidate = await createVisualMomentCandidate({
      request: parsed.data,
      provider: fixtureIllustrationProvider,
    });
    return NextResponse.json(candidate, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: {
            code: "visual_moment_request_invalid",
            message: "The Fate Frame request is not valid JSON.",
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "visual_moment_generation_failed",
          message: "The story continues, but this Fate Frame could not be generated.",
        },
      },
      { status: 422 },
    );
  }
}

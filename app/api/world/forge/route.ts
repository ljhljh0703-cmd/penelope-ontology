import { NextResponse } from "next/server";
import { compileWorldForgeDraft } from "@/src/application/world-forge-service";
import { WorldForgeCompileRequestSchema } from "@/src/contracts/world-forge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WORLD_FORGE_REQUEST_BYTES = 32_768;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_WORLD_FORGE_REQUEST_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: "world_forge_request_too_large",
            message: "The World Forge draft is too large for a one-scene intake.",
          },
        },
        { status: 413 },
      );
    }

    const parsedJson = JSON.parse(rawBody) as unknown;
    const parsed = WorldForgeCompileRequestSchema.safeParse(parsedJson);
    if (!parsed.success) {
      const hasUnapprovedFact = parsed.error.issues.some(
        ({ path }) => path.at(-1) === "approval",
      );
      return NextResponse.json(
        {
          error: {
            code: hasUnapprovedFact
              ? "world_forge_draft_unapproved"
              : "world_forge_request_invalid",
            message: hasUnapprovedFact
              ? "Every World Forge fact needs explicit creator approval before compilation."
              : "The World Forge draft is incomplete or invalid.",
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(compileWorldForgeDraft(parsed.data), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: {
            code: "world_forge_request_invalid",
            message: "The World Forge request is not valid JSON.",
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "world_forge_compile_failed",
          message:
            "The approved facts could not be compiled into a sealed Penelope world pack.",
        },
      },
      { status: 422 },
    );
  }
}

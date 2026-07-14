import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { loadDemoWorldPack } from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import {
  RunInputError,
  createRunOrchestrator,
} from "@/src/application/run-orchestrator";

export const runtime = "nodejs";

const isLiveRequest = (body: unknown): boolean =>
  typeof body === "object" &&
  body !== null &&
  "modelMode" in body &&
  body.modelMode === "live";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (isLiveRequest(body)) {
      return NextResponse.json(
        {
          error: {
            code: "public_live_disabled",
            message:
              "The public run route is fixture-only. Use the local evidence command for live GPT-5.6 runs.",
          },
        },
        { status: 403 },
      );
    }

    const worldPack = await loadDemoWorldPack();
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      // The public route cannot construct a network-backed adapter. The raw
      // modelMode guard above rejects live requests before orchestration.
      liveModel: fixtureNarrativeModel,
    });
    return NextResponse.json(await run(body));
  } catch (error) {
    if (error instanceof ZodError || error instanceof RunInputError) {
      return NextResponse.json(
        {
          error: {
            code: "run_request_invalid",
            message:
              error instanceof ZodError
                ? error.issues[0]?.message ?? "Run request failed schema validation."
                : error.message,
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "run_failed", message: "The bounded run could not be completed." } },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { loadDemoWorldPack } from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createOpenAiNarrativeModel } from "@/src/adapters/openai/narrative-model";
import {
  RunInputError,
  createRunOrchestrator,
} from "@/src/application/run-orchestrator";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const [body, worldPack] = await Promise.all([request.json(), loadDemoWorldPack()]);
    const liveModel = createOpenAiNarrativeModel({
      styleProfiles: worldPack.styleProfiles,
    });
    const run = createRunOrchestrator({
      worldPack,
      fixtureModel: fixtureNarrativeModel,
      liveModel,
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

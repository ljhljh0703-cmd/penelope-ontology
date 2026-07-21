import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/world/visual/route";
import { VisualMomentCandidateSchema } from "@/src/contracts/visual-moment";

const body = {
  format: "penelope_visual_moment_request",
  schemaVersion: 1,
  momentId: "visual.forge.ending_a",
  checkpointId: "123e4567-e89b-42d3-a456-426614174000",
  scenarioId: "scenario.creator_owned.forge_demo",
  trigger: "ending_divergence",
  sceneTitle: "The Last Beacon Ledger",
  visibleFacts: [
    {
      id: "fact.ledger_limit",
      summary: "The ledger predicts a beacon failure but cannot prevent it alone.",
    },
  ],
  visibleEvents: [
    {
      eventId: "event.visible_1",
      source: "npc",
      summary: "Mira shares the rescue route after Elian accepts responsibility.",
    },
  ],
  palette: ["#0b1114", "#34484d", "#b55f3d", "#d8bf8d"],
  variant: 0,
};

const request = (input: unknown) =>
  new Request("http://localhost/api/world/visual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

describe("Fate Frame API", () => {
  it("returns a public-safe fixture candidate without persisting it", async () => {
    const response = await POST(request(body));
    const candidate = VisualMomentCandidateSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(candidate).toMatchObject({
      status: "candidate",
      checkpointId: body.checkpointId,
      providerTrace: { provenance: "fixture" },
    });
    expect(candidate).not.toHaveProperty("approvedAt");
  });

  it("rejects any undeclared hidden-state field", async () => {
    const response = await POST(
      request({ ...body, hiddenFacts: ["The counterpart is secretly the heir."] }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: { code: "visual_moment_request_invalid" },
    });
  });
});

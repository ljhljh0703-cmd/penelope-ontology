import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/world/forge/route";
import { WorldForgeCompileResponseSchema } from "@/src/contracts/world-forge";
import worldForgeFixture from "@/tests/fixtures/world-forge-approved.json";

const request = (body: unknown) =>
  new Request("http://localhost/api/world/forge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("World Forge API", () => {
  it("returns a session-private definition only after explicit creator approval", async () => {
    const response = await POST(request({ draft: worldForgeFixture }));
    const payload = WorldForgeCompileResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(payload.definition).not.toHaveProperty("definitionDigest");
    expect(payload.definitionDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(payload.approvedFacts).toHaveLength(24);
    expect(payload.definition.scenario.episodeBlueprint?.scenes).toHaveLength(5);
    expect(payload.definition.worldCodex?.relationships).toHaveLength(1);
  });

  it("fails closed when a proposed fact is still pending", async () => {
    const response = await POST(
      request({
        draft: {
          ...worldForgeFixture,
          knowledgeAsymmetry: {
            ...worldForgeFixture.knowledgeAsymmetry,
            origin: "model_proposed",
            approval: "pending",
          },
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: { code: "world_forge_draft_unapproved" },
    });
  });
});

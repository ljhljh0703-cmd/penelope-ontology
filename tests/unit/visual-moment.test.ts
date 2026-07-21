import { describe, expect, it } from "vitest";
import {
  VisualMomentRequestSchema,
  VisualMomentDecisionSchema,
} from "@/src/contracts/visual-moment";
import { fixtureIllustrationProvider } from "@/src/adapters/fixtures/illustration-provider";
import { createVisualMomentCandidate } from "@/src/application/visual-moment-service";
import {
  applyVisualMomentDecision,
  selectVisualMomentTrigger,
} from "@/src/domain/visual-moment";

const request = () =>
  VisualMomentRequestSchema.parse({
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
  });

describe("Fate Frame visual moments", () => {
  it("accepts only the participant-visible request surface", () => {
    expect(() =>
      VisualMomentRequestSchema.parse({
        ...request(),
        hiddenFacts: ["Mira knows the ledger has never failed."],
      }),
    ).toThrow();
  });

  it("renders the same limited-color ASCII frame for the same visible request", async () => {
    const first = await createVisualMomentCandidate({
      request: request(),
      provider: fixtureIllustrationProvider,
    });
    const second = await createVisualMomentCandidate({
      request: request(),
      provider: fixtureIllustrationProvider,
    });

    expect(first).toEqual(second);
    expect(first.status).toBe("candidate");
    expect(first.frame.palette).toHaveLength(4);
    expect(first.frame.glyphRows).toHaveLength(24);
    expect(first.frame.glyphRows.every((row) => row.length === 48)).toBe(true);
    expect(first.frame.colorRows.every((row) => /^[0-3]{48}$/u.test(row))).toBe(true);
    expect(first.frame.altText).toContain("Mira shares the rescue route");
    expect(JSON.stringify(first)).not.toContain(
      "Mira knows the ledger has never failed",
    );
  });

  it("makes regeneration explicit through a variant-bound render hash", async () => {
    const first = await createVisualMomentCandidate({
      request: request(),
      provider: fixtureIllustrationProvider,
    });
    const regenerated = await createVisualMomentCandidate({
      request: { ...request(), variant: 1 },
      provider: fixtureIllustrationProvider,
    });

    expect(regenerated.requestDigest).not.toBe(first.requestDigest);
    expect(regenerated.frame.renderHash).not.toBe(first.frame.renderHash);
  });

  it("binds only an approved candidate to its checkpoint", async () => {
    const candidate = await createVisualMomentCandidate({
      request: request(),
      provider: fixtureIllustrationProvider,
    });
    const reference = applyVisualMomentDecision({
      candidate,
      action: "reference_only",
    });
    const rejected = applyVisualMomentDecision({
      candidate,
      action: "reject",
    });
    const approved = applyVisualMomentDecision({
      candidate,
      action: "approve",
    });

    expect(VisualMomentDecisionSchema.parse(reference).bindsToCheckpoint).toBe(false);
    expect(VisualMomentDecisionSchema.parse(rejected).bindsToCheckpoint).toBe(false);
    expect(VisualMomentDecisionSchema.parse(approved)).toMatchObject({
      status: "approved",
      checkpointId: request().checkpointId,
      bindsToCheckpoint: true,
    });
  });

  it("triggers only at a typed important branch instead of every turn", () => {
    expect(
      selectVisualMomentTrigger({
        status: "active",
        forked: false,
        turn: 1,
        ending: null,
      }),
    ).toBeNull();
    expect(
      selectVisualMomentTrigger({
        status: "active",
        forked: true,
        turn: 1,
        ending: null,
      }),
    ).toBe("irreversible_choice");
    expect(
      selectVisualMomentTrigger({
        status: "complete",
        forked: false,
        turn: 1,
        ending: { id: "ending.route", kind: "route_shared", summary: "The route is shared." },
      }),
    ).toBe("ending_divergence");
  });
});

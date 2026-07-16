import { describe, expect, it } from "vitest";
import { loadRedSailStoryBundle } from "@/src/adapters/filesystem/story-data";
import { StorySceneDraftSchema } from "@/src/contracts/story";
import {
  buildScopedStoryKnowledge,
  validateStoryDraftScope,
} from "@/src/domain/story-scope";

describe("story knowledge scope", () => {
  it("withholds Ogygia from Penelope and the speakers sharing her scene", async () => {
    const { scenario, worldPack, overlay, snapshot } =
      await loadRedSailStoryBundle();
    const scope = buildScopedStoryKnowledge({
      pack: worldPack,
      overlay,
      snapshot,
      focalCharacterId: scenario.opening.contract.focalCharacterId,
      presentSpeakerIds: scenario.opening.contract.presentSpeakerIds,
      activeClaimIds: scenario.ontology.activeClaimIds,
    });

    expect(scope.allowedClaimIds).toEqual([
      "claim.odyssey.penelope_uncertain_fate",
    ]);
    expect(scope.allowedClaimIds).not.toContain(
      "claim.odyssey.odysseus_at_ogygia",
    );
    expect(scope.withheldClaimIds).toContain(
      "claim.odyssey.odysseus_at_ogygia",
    );
    expect(scope.context.toLocaleLowerCase("en-US")).not.toContain("ogygia");
  });

  it("blocks the exact Ogygia prose bypass even without a grounding citation", async () => {
    const { scenario, worldPack, overlay, snapshot } =
      await loadRedSailStoryBundle();
    const scope = buildScopedStoryKnowledge({
      pack: worldPack,
      overlay,
      snapshot,
      focalCharacterId: scenario.opening.contract.focalCharacterId,
      presentSpeakerIds: scenario.opening.contract.presentSpeakerIds,
      activeClaimIds: scenario.ontology.activeClaimIds,
    });
    const segments = scenario.opening.draft.segments.map((segment, index) =>
      index === 0
        ? {
            ...segment,
            text: `${segment.text} Odysseus waits on Ogygia, though Penelope cannot know it.`,
          }
        : segment,
    );
    const malicious = StorySceneDraftSchema.parse({
      ...scenario.opening.draft,
      segments,
      prose: segments.map(({ text }) => text).join("\n\n"),
    });

    const violations = validateStoryDraftScope({
      draft: malicious,
      scope,
      availableEchoEffectIds: new Set(["effect.red_sail.seen"]),
      pack: worldPack,
    });
    expect(violations).toContainEqual(
      expect.objectContaining({
        code: "scope_claim_forbidden",
        evidenceIds: expect.arrayContaining([
          "claim.odyssey.odysseus_at_ogygia",
        ]),
      }),
    );
  });

  it("blocks narrator-style knowledge reports that replace dramatized uncertainty", async () => {
    const { scenario, worldPack, overlay, snapshot } =
      await loadRedSailStoryBundle();
    const scope = buildScopedStoryKnowledge({
      pack: worldPack,
      overlay,
      snapshot,
      focalCharacterId: scenario.opening.contract.focalCharacterId,
      presentSpeakerIds: scenario.opening.contract.presentSpeakerIds,
      activeClaimIds: scenario.ontology.activeClaimIds,
    });
    const segments = scenario.opening.draft.segments.map((segment, index) =>
      index === 0
        ? {
            ...segment,
            text: `${segment.text} His fate remains beyond what she can conclude.`,
          }
        : segment,
    );
    const reportLike = StorySceneDraftSchema.parse({
      ...scenario.opening.draft,
      segments,
      prose: segments.map(({ text }) => text).join("\n\n"),
    });

    expect(
      validateStoryDraftScope({
        draft: reportLike,
        scope,
        availableEchoEffectIds: new Set(["effect.red_sail.seen"]),
        pack: worldPack,
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: "scope_prose_style_violation",
        evidenceIds: ["segment.scene1.narration_1"],
      }),
    );
  });

  it("rejects dialogue assigned to a character outside the current scene", async () => {
    const { scenario, worldPack, overlay, snapshot } =
      await loadRedSailStoryBundle();
    const quiet = scenario.fixtureTurns.find(
      ({ branchId }) => branchId === "branch.quiet.scene2",
    )!;
    const scope = buildScopedStoryKnowledge({
      pack: worldPack,
      overlay,
      snapshot,
      focalCharacterId: quiet.contract.focalCharacterId,
      presentSpeakerIds: quiet.contract.presentSpeakerIds,
      activeClaimIds: scenario.ontology.activeClaimIds,
    });
    const segments = quiet.draft.segments.map((segment) =>
      segment.kind === "dialogue"
        ? { ...segment, speakerId: "penelope" }
        : segment,
    );
    const draft = StorySceneDraftSchema.parse({
      ...quiet.draft,
      segments,
      prose: segments.map(({ text }) => text).join("\n\n"),
    });

    expect(
      validateStoryDraftScope({
        draft,
        scope,
        availableEchoEffectIds: new Set([
          "effect.red_sail.seen",
          ...quiet.resolution.effects.map(({ effectId }) => effectId),
        ]),
        pack: worldPack,
      }),
    ).toContainEqual(
      expect.objectContaining({ code: "scope_speaker_unknown" }),
    );
  });

  it("rejects an ungrounded scene when a relevant world claim is available", async () => {
    const { scenario, worldPack, overlay, snapshot } =
      await loadRedSailStoryBundle();
    const scope = buildScopedStoryKnowledge({
      pack: worldPack,
      overlay,
      snapshot,
      focalCharacterId: scenario.opening.contract.focalCharacterId,
      presentSpeakerIds: scenario.opening.contract.presentSpeakerIds,
      activeClaimIds: scenario.ontology.activeClaimIds,
    });
    const ungrounded = StorySceneDraftSchema.parse({
      ...scenario.opening.draft,
      segments: scenario.opening.draft.segments.map((segment) => ({
        ...segment,
        groundingClaimIds: [],
      })),
    });

    expect(
      validateStoryDraftScope({
        draft: ungrounded,
        scope,
        availableEchoEffectIds: new Set(["effect.red_sail.seen"]),
        pack: worldPack,
      }),
    ).toContainEqual(expect.objectContaining({ code: "scope_claim_missing" }));
  });
});

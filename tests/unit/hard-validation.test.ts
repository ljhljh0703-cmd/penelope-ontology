import { describe, expect, it } from "vitest";
import {
  loadDemoWorldPack,
  loadDraftFixture,
  loadOverlayFixture,
  loadReplayCases,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import type { ParticipantIntent } from "@/src/contracts/participant-intent";
import { buildCharacterAgentViews } from "@/src/domain/retrieval";
import { statusForViolations, validateDraft } from "@/src/domain/validation";

const validateFixture = async (draftFixtureId: string) => {
  const [pack, replayCases] = await Promise.all([
    loadDemoWorldPack(),
    loadReplayCases(),
  ]);
  const stage = replayCases
    .flatMap(({ stages }) => stages)
    .find(
      (candidate) =>
        (candidate.kind === "run" || candidate.kind === "transition") &&
        candidate.draftFixtureId === draftFixtureId,
    );
  if (!stage || (stage.kind !== "run" && stage.kind !== "transition")) {
    throw new Error(`No replay stage owns ${draftFixtureId}.`);
  }

  const [overlay, snapshot, draft] = await Promise.all([
    loadOverlayFixture(stage.overlayFixtureId),
    loadSnapshotFixture(stage.snapshotFixtureId),
    loadDraftFixture(stage.draftFixtureId),
  ]);
  const styleProfile = pack.styleProfiles.find(({ id }) => id === snapshot.styleProfileId);
  const scenario = pack.simulationScenarios.find(({ id }) => id === snapshot.scenarioId);
  const state = pack.states.find(({ id }) => id === snapshot.baseStateId);
  const canonProfile = pack.canonProfiles.find(({ id }) => id === snapshot.canonProfileId);
  if (!styleProfile || !scenario || !state || !canonProfile) {
    throw new Error(`Incomplete validation context for ${draftFixtureId}.`);
  }
  const participantIntents: ParticipantIntent[] = stage.participantIntents;
  const characterViews = buildCharacterAgentViews({
    pack,
    overlay,
    snapshot,
    participantIntents,
  });
  const violations = validateDraft(draft, {
    pack,
    overlay,
    state,
    scenario,
    snapshot,
    styleProfile,
    participantIntents,
    characterViews,
    activeLayerIds: new Set(canonProfile.activeLayerIds),
  });

  return {
    violations,
    status: statusForViolations(violations),
    characterViews,
  };
};

describe("hard validation against frozen fixtures", () => {
  it("passes the grounded Penelope exchange", async () => {
    const result = await validateFixture("draft.grounded_penelope");
    expect(result.violations).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("blocks living Hector as both deceased and absent", async () => {
    const result = await validateFixture("draft.living_hector");
    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["entity_state_invalid", "location_path_missing"]),
    );
  });

  it("blocks Penelope upgrading hidden Ogygia knowledge to certainty", async () => {
    const result = await validateFixture("draft.penelope_knows_ogygia");
    expect(result.status).toBe("blocked");
    expect(result.violations.map(({ code }) => code)).toContain("belief_scope_violation");
    const penelope = result.characterViews.find(({ characterId }) => characterId === "penelope");
    expect(penelope?.knownClaimIds).not.toContain("claim.odyssey.odysseus_at_ogygia");
    expect(penelope?.uncertainClaimIds).not.toContain("claim.odyssey.odysseus_at_ogygia");
  });

  it("routes the unresolved Helen traditions to creator decision", async () => {
    const result = await validateFixture("draft.helen_conflict");
    expect(result.status).toBe("needs_creator_decision");
    expect(result.violations.map(({ code }) => code)).toContain(
      "tradition_conflict_unresolved",
    );
  });

  it("keeps the red-sail rule outside canon as a creator decision", async () => {
    const result = await validateFixture("draft.red_sail_proposal");
    expect(result.violations.map(({ code }) => code)).toEqual(["unapproved_expansion"]);
    expect(result.status).toBe("needs_creator_decision");
  });
});

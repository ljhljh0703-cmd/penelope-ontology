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

const loadValidationFixture = async (draftFixtureId: string) => {
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
  return {
    draft,
    context: {
      pack,
      overlay,
      state,
      scenario,
      snapshot,
      styleProfile,
      participantIntents,
      characterViews,
      activeLayerIds: new Set(canonProfile.activeLayerIds),
    },
  };
};

const validateFixture = async (draftFixtureId: string) => {
  const { draft, context } = await loadValidationFixture(draftFixtureId);
  const violations = validateDraft(draft, context);

  return {
    violations,
    status: statusForViolations(violations),
    characterViews: context.characterViews,
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

  it("blocks a hidden relational fact in dialogue even when the model omits its claim id", async () => {
    const { draft, context } = await loadValidationFixture("draft.grounded_penelope");
    const candidate = {
      ...draft,
      mentionedEntityIds: [
        ...draft.mentionedEntityIds,
        "calypso",
        "ogygia",
      ],
      utterances: draft.utterances.map((utterance, index) =>
        index === 0
          ? {
              ...utterance,
              text: "Odysseus is on Ogygia with Calypso.",
              assertedClaimIds: [],
              certainty: "certain" as const,
            }
          : utterance,
      ),
    };

    const violations = validateDraft(candidate, context);

    expect(statusForViolations(violations)).toBe("blocked");
    expect(violations).toContainEqual(
      expect.objectContaining({
        code: "belief_scope_violation",
        evidenceIds: ["claim.odyssey.odysseus_at_ogygia", "penelope"],
      }),
    );
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

  it("rejects unknown and inactive action evidence claims exactly once", async () => {
    const { draft, context } = await loadValidationFixture("draft.red_sail_step_1");
    const candidate = {
      ...draft,
      actions: draft.actions.map((action) => ({
        ...action,
        evidenceClaimIds: [
          "claim.action.missing",
          "claim.helen.real_helen_in_egypt",
          "claim.action.missing",
        ],
      })),
    };

    const first = validateDraft(candidate, context);
    const second = validateDraft(candidate, context);

    expect(second).toEqual(first);
    expect(first.map(({ code, evidenceIds }) => ({ code, evidenceIds }))).toEqual([
      {
        code: "tradition_inactive",
        evidenceIds: ["claim.helen.real_helen_in_egypt", "later_tragedy.euripides_helen"],
      },
      { code: "unsupported_claim", evidenceIds: ["claim.action.missing"] },
    ]);
  });

  it("rejects inactive and unknown action evidence rules exactly once", async () => {
    const { draft, context } = await loadValidationFixture("draft.red_sail_step_1");
    const inactiveRule = {
      id: "rule.inactive.tradition",
      kind: "world" as const,
      description: "A rule retained only for inactive-tradition validation.",
      layerId: "later_tragedy.euripides_helen",
      status: "active" as const,
    };
    const candidate = {
      ...draft,
      actions: draft.actions.map((action) => ({
        ...action,
        evidenceRuleIds: [
          ...action.evidenceRuleIds,
          inactiveRule.id,
          "rule.action.missing",
          inactiveRule.id,
          "rule.action.missing",
        ],
      })),
    };
    const validationContext = {
      ...context,
      pack: {
        ...context.pack,
        rules: [...context.pack.rules, inactiveRule],
      },
    };

    const first = validateDraft(candidate, validationContext);
    const second = validateDraft(candidate, validationContext);

    expect(second).toEqual(first);
    expect(first.map(({ code, evidenceIds }) => ({ code, evidenceIds }))).toEqual([
      {
        code: "tradition_inactive",
        evidenceIds: ["later_tragedy.euripides_helen", "rule.inactive.tradition"],
      },
      { code: "unapproved_expansion", evidenceIds: ["rule.action.missing"] },
    ]);
  });

  it("requires action evidence claims to pass through the temporally checked claim ledger", async () => {
    const { draft, context } = await loadValidationFixture("draft.helen_conflict");
    const candidate = {
      ...draft,
      actions: [
        {
          actorEntityId: "helen",
          authorizingIntentId: "intent.helen",
          contributingIntentIds: [],
          op: "set_variable" as const,
          variableId: "harbor_watch",
          from: "idle",
          to: "watching",
          evidenceClaimIds: ["claim.odyssey.odysseus_at_ogygia"],
          evidenceRuleIds: [],
        },
      ],
    };
    const violations = validateDraft(candidate, {
      ...context,
      activeLayerIds: new Set([...context.activeLayerIds, "homeric.odyssey"]),
    });

    expect(violations).toContainEqual(
      expect.objectContaining({
        code: "unsupported_claim",
        evidenceIds: ["claim.odyssey.odysseus_at_ogygia"],
      }),
    );
  });

  it("keeps direct regression coverage for the remaining named hard invariants", async () => {
    const grounded = await loadValidationFixture("draft.grounded_penelope");

    expect(
      validateDraft(
        { ...grounded.draft, mentionedEntityIds: [...grounded.draft.mentionedEntityIds, "entity.missing"] },
        grounded.context,
      ).map(({ code }) => code),
    ).toContain("entity_unknown");

    expect(
      validateDraft(
        { ...grounded.draft, usedClaimIds: [...grounded.draft.usedClaimIds, "claim.missing"] },
        grounded.context,
      ).map(({ code }) => code),
    ).toContain("unsupported_claim");

    expect(
      validateDraft(
        {
          ...grounded.draft,
          appliedStyleConstraintIds: grounded.draft.appliedStyleConstraintIds.filter(
            (id) => id !== "style.table_ready_mythic.cadence",
          ),
        },
        grounded.context,
      ).map(({ code }) => code),
    ).toContain("style_constraint_invalid");

    expect(
      validateDraft(
        {
          ...grounded.draft,
          mentionedEntityIds: grounded.draft.mentionedEntityIds.filter((id) => id !== "penelope"),
        },
        grounded.context,
      ).map(({ code }) => code),
    ).toContain("entity_alias_mismatch");

    expect(
      validateDraft(grounded.draft, {
        ...grounded.context,
        snapshot: {
          ...grounded.context.snapshot,
          overlayVersion: grounded.context.snapshot.overlayVersion + 1,
        },
      }).map(({ code }) => code),
    ).toContain("overlay_mismatch");

    const actionFixture = await loadValidationFixture("draft.red_sail_step_1");
    expect(
      validateDraft(
        {
          ...actionFixture.draft,
          actions: actionFixture.draft.actions.map((action) => ({
            ...action,
            variableId: "unknown_state_variable",
          })),
        },
        actionFixture.context,
      ).map(({ code }) => code),
    ).toContain("state_variable_invalid");

    const historical = await loadValidationFixture("draft.helen_conflict");
    const futureDraft = {
      ...historical.draft,
      narrative: "The narration reaches beyond the selected fixed point.",
      mentionedEntityIds: [],
      usedClaimIds: ["claim.odyssey.odysseus_at_ogygia"],
      utterances: [],
      unknowns: [],
    };
    expect(
      validateDraft(futureDraft, {
        ...historical.context,
        activeLayerIds: new Set([
          ...historical.context.activeLayerIds,
          "homeric.odyssey",
        ]),
      }).map(({ code }) => code),
    ).toContain("temporal_order_violation");
  });
});

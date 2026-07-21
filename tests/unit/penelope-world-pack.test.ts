import { describe, expect, it } from "vitest";
import { getOdysseyBook19WorldPack } from "@/src/adapters/world-packs/odyssey-book19";
import {
  PenelopeWorldPackDefinitionSchema,
  PenelopeWorldPackV1Schema,
  bindSessionToWorldPack,
  computePenelopeWorldPackDigest,
  doesSessionBindingMatchWorldPack,
  sealPenelopeWorldPack,
  type PenelopeWorldPackDefinition,
} from "@/src/contracts/penelope-world-pack";

const definition = (): PenelopeWorldPackDefinition => {
  const { definitionDigest: _digest, ...seed } = getOdysseyBook19WorldPack();
  void _digest;
  return {
    ...structuredClone(seed),
    packId: "pack.ithaca.night_of_the_scar",
  };
};

describe("PenelopeWorldPackV1", () => {
  it("seals a versioned world definition and binds a session to its digest", () => {
    const pack = sealPenelopeWorldPack(definition());
    const binding = bindSessionToWorldPack(pack);

    expect(PenelopeWorldPackV1Schema.parse(pack)).toEqual(pack);
    expect(pack.definitionDigest).toBe(computePenelopeWorldPackDigest(pack));
    expect(doesSessionBindingMatchWorldPack(binding, pack)).toBe(true);
    expect(binding).toEqual({
      packId: "pack.ithaca.night_of_the_scar",
      packVersion: "1.0.0",
      definitionDigest: pack.definitionDigest,
    });
  });

  it("rejects a pack whose payload changes after its digest was sealed", () => {
    const pack = sealPenelopeWorldPack(definition());
    const tampered = structuredClone(pack);
    tampered.presentation.hook = "A changed hook must require a new immutable pack digest.";

    const result = PenelopeWorldPackV1Schema.safeParse(tampered);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some(({ message }) => message.includes("definitionDigest"))).toBe(true);
  });

  it("binds creator-declared World Codex relationships into the pack digest", () => {
    const original = sealPenelopeWorldPack(definition());
    const changed = definition();
    changed.worldCodex = {
      dramaticQuestion:
        "Can Penelope recover the truth without exposing it to the hostile household?",
      relationships: [
        {
          id: "relationship.penelope.odysseus.marriage",
          subjectEntityId: "entity.penelope",
          objectEntityId: "entity.odysseus",
          axisId: "marriage",
          label: "married to",
          direction: "mutual",
          provenance: "source_grounded",
          summary:
            "Penelope and Odysseus are spouses, though concealment keeps that bond unconfirmed in this scene.",
        },
      ],
    };
    const resealed = sealPenelopeWorldPack(changed);

    expect(resealed.definitionDigest).not.toBe(original.definitionDigest);
    expect(resealed.worldCodex?.relationships).toHaveLength(1);
  });

  it("rejects World Codex relationships that invent an actor or self-edge", () => {
    const unknownActor = definition();
    unknownActor.worldCodex = {
      dramaticQuestion: null,
      relationships: [
        {
          id: "relationship.penelope.ghost",
          subjectEntityId: "entity.penelope",
          objectEntityId: "entity.not_registered",
          axisId: "suspects",
          label: "suspects",
          direction: "directed",
          provenance: "creator_approved",
          summary: "A relationship may only connect actors declared by this pack.",
        },
      ],
    };
    const selfEdge = definition();
    selfEdge.worldCodex = {
      dramaticQuestion: null,
      relationships: [
        {
          id: "relationship.penelope.self",
          subjectEntityId: "entity.penelope",
          objectEntityId: "entity.penelope",
          axisId: "trust",
          label: "trusts",
          direction: "directed",
          provenance: "creator_approved",
          summary: "A relationship edge must connect two different declared actors.",
        },
      ],
    };

    expect(PenelopeWorldPackDefinitionSchema.safeParse(unknownActor).success).toBe(false);
    expect(PenelopeWorldPackDefinitionSchema.safeParse(selfEdge).success).toBe(false);
  });

  it("rejects policy and creator vocabulary references that do not belong to the scenario", () => {
    const invalid = structuredClone(definition());
    invalid.creatorInput.recommendedActionPolicies = [
      {
        whenFlagId: null,
        whenFlagValue: null,
        actionIds: ["action.not_registered"],
      },
    ];
    invalid.identityPolicy.actorAliases = [
      {
        entityId: "entity.not_registered",
        modelFacingEntityId: "entity.reader_alias",
        renderText: "an unknown actor",
      },
    ];

    const result = PenelopeWorldPackV1Schema.safeParse({
      ...invalid,
      definitionDigest: "0".repeat(64),
    });
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(({ message }) => message.includes("unknown scenario action")),
    ).toBe(true);
    expect(
      result.error?.issues.some(({ message }) => message.includes("unknown scenario identifier")),
    ).toBe(true);
  });

  it("does not let a session binding cross a pack version or digest", () => {
    const first = sealPenelopeWorldPack(definition());
    const secondDefinition = definition();
    secondDefinition.packVersion = "1.0.1";
    const second = sealPenelopeWorldPack(secondDefinition);

    expect(doesSessionBindingMatchWorldPack(bindSessionToWorldPack(first), second)).toBe(false);
  });

  it("requires creator-visible hidden state and complete render coverage", () => {
    const hiddenStateDisabled: unknown = {
      ...definition(),
      identityPolicy: {
        ...definition().identityPolicy,
        creatorMayInspectHiddenState: false,
      },
    };
    expect(PenelopeWorldPackDefinitionSchema.safeParse(hiddenStateDisabled).success).toBe(false);

    const missingRender = definition();
    delete missingRender.renderPolicy.currentTurnConsequenceTextByActionId[
      "action.penelope.order_washing"
    ];
    const result = PenelopeWorldPackDefinitionSchema.safeParse(missingRender);
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(({ message }) =>
        message.includes("missing required render coverage"),
      ),
    ).toBe(true);

    const missingVocabulary = definition();
    missingVocabulary.creatorInput.actionVocabulary =
      missingVocabulary.creatorInput.actionVocabulary.filter(
        ({ actionId }) => actionId !== "action.penelope.order_washing",
      );
    const vocabularyResult = PenelopeWorldPackDefinitionSchema.safeParse(
      missingVocabulary,
    );
    expect(vocabularyResult.success).toBe(false);
    expect(
      vocabularyResult.error?.issues.some(
        ({ path, message }) =>
          path.join(".") === "creatorInput.actionVocabulary" &&
          message.includes("missing required render coverage"),
      ),
    ).toBe(true);
  });

  it("rejects a hidden fact in the pre-action opening but not in creator-only or later action text", () => {
    const leaked = definition();
    leaked.renderPolicy.openingEvent.summary =
      "The stranger is Odysseus, and Penelope must decide what the household may hear.";

    const leakResult = PenelopeWorldPackDefinitionSchema.safeParse(leaked);
    expect(leakResult.success).toBe(false);
    expect(
      leakResult.error?.issues.some(
        ({ path, message }) =>
          path.join(".") === "renderPolicy.openingEvent.summary" &&
          message.includes("hidden-knowledge forbidden pattern"),
      ),
    ).toBe(true);

    const creatorOnlyMention = definition();
    creatorOnlyMention.creatorInput.expansionPrompt =
      "The stranger is Odysseus is a creator-only explanation and must not be used as reader copy.";
    expect(PenelopeWorldPackDefinitionSchema.safeParse(creatorOnlyMention).success).toBe(true);

    const chosenActionMention = definition();
    chosenActionMention.renderPolicy.registeredEventTextByActionId[
      "action.penelope.confront_privately"
    ] = "Penelope asks whether the stranger is Odysseus.";
    expect(PenelopeWorldPackDefinitionSchema.safeParse(chosenActionMention).success).toBe(
      true,
    );
  });

  it("locks portable packs to the reviewed English lane", () => {
    const nonEnglish: unknown = {
      ...definition(),
      presentation: {
        ...definition().presentation,
        defaultLocale: "ko",
        availableLocales: ["ko"],
      },
    };
    const multipleLocales: unknown = {
      ...definition(),
      presentation: {
        ...definition().presentation,
        defaultLocale: "en",
        availableLocales: ["en", "ja"],
      },
    };

    expect(PenelopeWorldPackDefinitionSchema.safeParse(nonEnglish).success).toBe(false);
    expect(PenelopeWorldPackDefinitionSchema.safeParse(multipleLocales).success).toBe(false);
  });

  it("requires two focal-participant A/B actions and full boolean policy coverage", () => {
    const oneChoice = definition();
    oneChoice.creatorInput.recommendedActionPolicies[0]!.actionIds = [
      "action.penelope.test_testimony",
    ];
    const oneChoiceResult = PenelopeWorldPackDefinitionSchema.safeParse(oneChoice);
    expect(oneChoiceResult.success).toBe(false);
    expect(
      oneChoiceResult.error?.issues.some(({ message }) =>
        message.includes("at least two distinct focal-participant actions"),
      ),
    ).toBe(true);

    const missingBooleanBranch = definition();
    missingBooleanBranch.creatorInput.recommendedActionPolicies = [
      missingBooleanBranch.creatorInput.recommendedActionPolicies[0]!,
    ];
    const missingBooleanBranchResult = PenelopeWorldPackDefinitionSchema.safeParse(
      missingBooleanBranch,
    );
    expect(missingBooleanBranchResult.success).toBe(false);
    expect(
      missingBooleanBranchResult.error?.issues.some(({ message }) =>
        message.includes("must cover both boolean values"),
      ),
    ).toBe(true);

    const npcRecommendation = definition();
    npcRecommendation.creatorInput.recommendedActionPolicies[0]!.actionIds = [
      "action.penelope.test_testimony",
      "action.odysseus.answer_carefully",
    ];
    const npcRecommendationResult = PenelopeWorldPackDefinitionSchema.safeParse(
      npcRecommendation,
    );
    expect(npcRecommendationResult.success).toBe(false);
    expect(
      npcRecommendationResult.error?.issues.some(({ message }) =>
        message.includes("must belong to the focal participant"),
      ),
    ).toBe(true);
  });

  it("rejects ambiguous model-facing aliases and duplicate private knowledge ids", () => {
    const invalid = definition();
    invalid.identityPolicy.actorAliases = [
      {
        entityId: "entity.odysseus",
        modelFacingEntityId: "entity.penelope",
        renderText: "the stranger",
      },
      {
        entityId: "entity.eurycleia",
        modelFacingEntityId: "entity.penelope",
        renderText: "the nurse",
      },
    ];
    invalid.identityPolicy.hiddenKnowledge = [
      ...invalid.identityPolicy.hiddenKnowledge,
      {
        premiseId: "premise.scar_recognition",
        privateKnowledgeId: "private.stranger_identity",
        withheldPremiseIds: [],
        forbiddenPatterns: ["the stranger is Odysseus"],
      },
    ];

    const result = PenelopeWorldPackDefinitionSchema.safeParse(invalid);

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        ({ path, message }) =>
          path.join(".") === "identityPolicy.actorAliases" &&
          message.includes("must not reuse a model-facing"),
      ),
    ).toBe(true);
    expect(
      result.error?.issues.some(
        ({ path, message }) =>
          path.join(".") ===
            "identityPolicy.actorAliases.0.modelFacingEntityId" &&
          message.includes("may not impersonate"),
      ),
    ).toBe(true);
    expect(
      result.error?.issues.some(
        ({ path, message }) =>
          path.join(".") === "identityPolicy.hiddenKnowledge" &&
          message.includes("must not reuse a private knowledge"),
      ),
    ).toBe(true);
  });
});

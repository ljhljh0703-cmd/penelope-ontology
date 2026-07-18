import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import authorityContract from "@/_dev/dispatch-2026-07-18/contracts/FABLE-NARRATIVE-AUTHORITY-CONTRACT.json";
import styleProfile from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  ModelNarrationOutputSchema,
  NarrationInputEnvelopeSchema,
  NarrationPipelineEnvelopeSchema,
  PenelopeEnglishStyleProfileSchema,
} from "@/src/contracts/world-narrator";
import {
  PenelopeNarrationPreflightReceiptSchema,
  PenelopeScenePlanSchema,
} from "@/src/contracts/narration-license";

const contractsDirectory = resolve(
  process.cwd(),
  "_dev/dispatch-2026-07-18/contracts",
);

const validReferenceReceipt = {
  status: "available",
  referenceId: "creator-craft-reference-2026-07-17-01",
  transferableTechniqueIds: ["TT-01"],
  sceneApplicability: [
    { techniqueId: "TT-01", plainReason: "The resolved response carries the beat." },
  ],
  forbiddenImitation: true,
  excludedGimmicks: ["FC-04"],
} as const;

const noDialogueAuthority = {
  mode: "none",
  speakerId: null,
  speechAct: null,
  speechEventIds: [],
  speechActLicenseIds: [],
  authorizedContentIds: [],
  plainIntent: null,
  plainIntentSourceAuthorityIds: [],
} as const;

const makePreflightReceipt = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  preflightId: "pf-test-1",
  sceneMode: "setup",
  sceneAuthority: {
    factIds: ["fact.a"],
    eventIds: ["event.a"],
    actorEntityIds: ["entity.a"],
    licensedRenderingDetailIds: [],
    licensedRenderingDetails: [],
  },
  referenceReceipt: validReferenceReceipt,
  plainDramaticPlan: {
    focalActorId: "entity.a",
    actionSourceEventIds: [],
    reactionSourceEventIds: [],
    changeSourceEventIds: [],
  },
  dialogueAuthority: noDialogueAuthority,
  creatorReviewRequired: true,
  ...overrides,
});

const makeSentencePlan = (
  role: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  sentencePlanId: `sp-${role.replaceAll("_", "-")}`,
  role,
  actorId: null,
  speakerId: null,
  sourceFactIds: ["fact.a"],
  sourceEventIds: [],
  speechEventIds: [],
  licensedRenderingDetailIds: [],
  plainFunction: "Carry the registered beat.",
  plainFunctionSourceAuthorityIds: ["fact.a"],
  plainIntent: null,
  plainIntentSourceAuthorityIds: [],
  changesState: false,
  ...overrides,
});

const validSetupScenePlan = {
  scenePlanId: "scene.setup",
  sceneMode: "setup",
  sentencePlans: [
    makeSentencePlan("orientation"),
    makeSentencePlan("in_world_stop"),
  ],
};

const validModelFacing = {
  sceneMode: "setup",
  languageProfileId: "en-penelope-v1",
  referenceReceiptId: "creator-craft-reference-2026-07-17-01",
  focalActorId: "entity.a",
  presentActors: [
    {
      entityId: "entity.a",
      renderDescriptor: "A woman stands beside the hearth.",
      sourceFactIds: ["fact.a"],
    },
  ],
  visibleFacts: [{ factId: "fact.a", renderText: "A lamp burns." }],
  resolvedEvents: [],
  authorizedActionEventIds: [],
  authorizedReactionEventIds: [],
  authorizedChangeEventIds: [],
  authorizedAnchors: [],
  licensedRenderingDetails: [],
  styleStateId: "en-penelope-state-baseline",
  reservedActionIds: [],
};

const privateValidation = {
  forbiddenKnowledgeIds: [],
  forbiddenInferenceRuleIds: [],
  creatorOnlyReviewNoteIds: [],
};

const validModelOutput = {
  planReceipt: [
    {
      sentencePlanId: "sp-orientation",
      role: "orientation",
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    },
    {
      sentencePlanId: "sp-stop",
      role: "in_world_stop",
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    },
  ],
  readerProse: {
    format: "english_prose_paragraphs",
    paragraphs: [
      {
        paragraphId: "paragraph.one",
        sentencePlanIds: ["sp-orientation", "sp-stop"],
        text: "A lamp burns beside the hearth. The woman waits by the door.",
      },
    ],
  },
};

const validRenderAudit = {
  generatedBy: "deterministic_post_validator",
  usedSourceIds: ["fact.a"],
  findings: [{ ruleCode: "AC-SEP-01", severity: "info", count: 0 }],
  hardPass: true,
  warningCount: 0,
};

describe("candidate-2.2 schema behavior mirror", () => {
  it("T01 AC-LADDER-01 validates the registered style-profile instance", () => {
    expect(PenelopeEnglishStyleProfileSchema.safeParse(styleProfile).success).toBe(true);
  });

  it("T02 AC-MODE-01 rejects setup with a forced change beat", () => {
    const receipt = makePreflightReceipt({
      plainDramaticPlan: {
        focalActorId: "entity.a",
        actionSourceEventIds: [],
        reactionSourceEventIds: [],
        changeSourceEventIds: ["event.a"],
      },
    });
    expect(PenelopeNarrationPreflightReceiptSchema.safeParse(receipt).success).toBe(false);
  });

  it("T03 AC-MODE-02 accepts a complete turn preflight", () => {
    const receipt = makePreflightReceipt({
      sceneMode: "turn",
      plainDramaticPlan: {
        focalActorId: "entity.a",
        actionSourceEventIds: ["event.a"],
        reactionSourceEventIds: ["event.a"],
        changeSourceEventIds: ["event.a"],
        changeInPlainTerms: { text: "The door opens.", sourceAuthorityIds: ["event.a"] },
      },
    });
    expect(PenelopeNarrationPreflightReceiptSchema.safeParse(receipt).success).toBe(true);
  });

  it("T04 AC-MODE-01 accepts a setup without a change beat", () => {
    expect(
      PenelopeNarrationPreflightReceiptSchema.safeParse(makePreflightReceipt()).success,
    ).toBe(true);
  });

  it("T05 AC-DLG-01 rejects licensed dialogue without plain intent", () => {
    const receipt = makePreflightReceipt({
      dialogueAuthority: {
        mode: "licensed",
        speakerId: "entity.a",
        speechAct: "question",
        speechEventIds: ["event.speech.a"],
        speechActLicenseIds: [],
        authorizedContentIds: ["fact.a"],
        plainIntent: null,
        plainIntentSourceAuthorityIds: [],
      },
    });
    expect(PenelopeNarrationPreflightReceiptSchema.safeParse(receipt).success).toBe(false);
  });

  it("T06 AC-DLG-01 rejects general-event-only dialogue authority", () => {
    const receipt = makePreflightReceipt({
      dialogueAuthority: {
        mode: "licensed",
        speakerId: "entity.a",
        speechAct: "question",
        speechEventIds: [],
        speechActLicenseIds: [],
        authorizedContentIds: ["event.a"],
        plainIntent: "Ask what happened.",
        plainIntentSourceAuthorityIds: ["event.a"],
      },
    });
    expect(PenelopeNarrationPreflightReceiptSchema.safeParse(receipt).success).toBe(false);
  });

  it("T07 structurally accepts the speechActLicenseIds authority slot before AC-DLG-01 registry resolution", () => {
    const receipt = makePreflightReceipt({
      dialogueAuthority: {
        mode: "licensed",
        speakerId: "entity.a",
        speechAct: "question",
        speechEventIds: [],
        speechActLicenseIds: ["lic.speech.a"],
        authorizedContentIds: ["fact.a"],
        plainIntent: "Ask what happened.",
        plainIntentSourceAuthorityIds: ["fact.a"],
      },
    });
    expect(PenelopeNarrationPreflightReceiptSchema.safeParse(receipt).success).toBe(true);
  });

  it("T08 AC-AUTH-02 rejects an unbound sentence plan", () => {
    const unbound = makeSentencePlan("orientation", {
      sourceFactIds: [],
      plainFunctionSourceAuthorityIds: ["fact.a"],
    });
    expect(
      PenelopeScenePlanSchema.safeParse({
        ...validSetupScenePlan,
        sentencePlans: [unbound, makeSentencePlan("in_world_stop")],
      }).success,
    ).toBe(false);
  });

  it("T09 AC-MODE-01 rejects a change-claiming role in setup", () => {
    const consequence = makeSentencePlan("resolved_consequence", {
      sourceFactIds: [],
      sourceEventIds: ["event.a"],
      changesState: true,
    });
    expect(
      PenelopeScenePlanSchema.safeParse({
        ...validSetupScenePlan,
        sentencePlans: [makeSentencePlan("orientation"), consequence],
      }).success,
    ).toBe(false);
  });

  it("T10 AC-MODE-01 accepts a complete setup plan", () => {
    expect(PenelopeScenePlanSchema.safeParse(validSetupScenePlan).success).toBe(true);
  });

  it("T11 AC-MODE-02 rejects a turn without action reaction and consequence", () => {
    expect(
      PenelopeScenePlanSchema.safeParse({
        ...validSetupScenePlan,
        sceneMode: "turn",
      }).success,
    ).toBe(false);
  });

  it("T12 AC-DLG-01 rejects a dialogue sentence bound only to a general event", () => {
    const dialogue = makeSentencePlan("licensed_dialogue", {
      speakerId: "entity.a",
      sourceFactIds: [],
      sourceEventIds: ["event.a"],
      plainIntent: "Ask what happened.",
      plainIntentSourceAuthorityIds: ["event.a"],
    });
    expect(
      PenelopeScenePlanSchema.safeParse({
        ...validSetupScenePlan,
        sentencePlans: [makeSentencePlan("orientation"), dialogue],
      }).success,
    ).toBe(false);
  });

  it("T13 structurally accepts the speechEventIds authority slot before AC-DLG-01 kind resolution", () => {
    const dialogue = makeSentencePlan("licensed_dialogue", {
      speakerId: "entity.a",
      sourceFactIds: [],
      speechEventIds: ["event.speech.a"],
      plainIntent: "Ask what happened.",
      plainIntentSourceAuthorityIds: ["event.speech.a"],
    });
    expect(
      PenelopeScenePlanSchema.safeParse({
        ...validSetupScenePlan,
        sentencePlans: [makeSentencePlan("orientation"), dialogue, makeSentencePlan("in_world_stop")],
      }).success,
    ).toBe(true);
  });

  it("T14 AC-DLG-01 rejects speechEventIds on a non-dialogue role", () => {
    const leaky = makeSentencePlan("orientation", {
      speechEventIds: ["event.speech.a"],
    });
    expect(
      PenelopeScenePlanSchema.safeParse({
        ...validSetupScenePlan,
        sentencePlans: [leaky, makeSentencePlan("in_world_stop")],
      }).success,
    ).toBe(false);
  });

  it("T15 AC-PRIV-01 accepts physically separated model-facing and private input", () => {
    expect(
      NarrationInputEnvelopeSchema.safeParse({
        modelFacing: validModelFacing,
        privateValidation,
      }).success,
    ).toBe(true);
  });

  it("T16 AC-PRIV-01 rejects private fields inside model-facing input", () => {
    expect(
      NarrationInputEnvelopeSchema.safeParse({
        modelFacing: { ...validModelFacing, forbiddenKnowledgeIds: ["secret.a"] },
        privateValidation,
      }).success,
    ).toBe(false);
  });

  it("T17 AC-MODE-02 rejects turn input without authorized beat events", () => {
    expect(
      NarrationInputEnvelopeSchema.safeParse({
        modelFacing: { ...validModelFacing, sceneMode: "turn" },
        privateValidation,
      }).success,
    ).toBe(false);
  });

  it("T18 accepts ModelNarrationOutput without renderAudit at the split root", () => {
    expect(ModelNarrationOutputSchema.safeParse(validModelOutput).success).toBe(true);
  });

  it("T19 rejects renderAudit inside the model output root", () => {
    expect(
      ModelNarrationOutputSchema.safeParse({
        ...validModelOutput,
        renderAudit: validRenderAudit,
      }).success,
    ).toBe(false);
  });

  it("T20 accepts the deterministic pipeline envelope root", () => {
    expect(
      NarrationPipelineEnvelopeSchema.safeParse({
        modelOutput: validModelOutput,
        renderAudit: validRenderAudit,
      }).success,
    ).toBe(true);
  });

  it("T21 rejects free text inside renderAudit", () => {
    expect(
      NarrationPipelineEnvelopeSchema.safeParse({
        modelOutput: validModelOutput,
        renderAudit: { ...validRenderAudit, note: "private detail" },
      }).success,
    ).toBe(false);
  });

  it("T22 AC-DLG-01 rejects a dialogue receipt bound only to a general event", () => {
    const dialogueReceipt = {
      sentencePlanId: "sp-dialogue",
      role: "licensed_dialogue",
      sourceFactIds: [],
      sourceEventIds: ["event.a"],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    };
    expect(
      ModelNarrationOutputSchema.safeParse({
        ...validModelOutput,
        planReceipt: [validModelOutput.planReceipt[0], dialogueReceipt],
      }).success,
    ).toBe(false);
  });

  it("T23 scans Markdown and JSON contract artifacts for the listed public markers", () => {
    const markers = [
      "[[eldritch-seoul-rpg-tone-bible]]",
      "\ubcf4\uc774\uc2a4\ub294 \uc18d\uc5ec\ub3c4 \uc2dc\ud2b8\ub294 \ubabb \uc18d\uc778\ub2e4",
      "\ubcf4\uc774\uc2a4\ub294 \uac70\uc9d3\ub9d0\ud574\ub3c4 \uc2dc\ud2b8\ub294 \uac70\uc9d3\ub9d0\ud558\uc9c0 \uc54a\ub294\ub2e4",
      "\ub9c9\ucc28",
      "\uae30\uc0dd\ucda9",
      "\ud569\uc1fc\uccb4",
      "\uc5d8\ub4dc\ub9ac\uce58",
      "\uc11c\uc6b8 \uc5b4\ud718",
      "\uc2a4\ud06c\ub9b0\ub3c4\uc5b4",
      "\ubb34\uc784\uc2b9\ucc28",
      "\ud130\ub110",
      "\ubc18\ub9d0",
      "\uc904\ud45c",
      "\ub3c4\uce58 \uc5ec\uc6b4",
      "tone-bible",
      "\ud1a4 \ubc14\uc774\ube14",
    ];
    const violations = readdirSync(contractsDirectory)
      .filter((name) => name.endsWith(".md") || name.endsWith(".json"))
      .flatMap((name) => {
        const text = readFileSync(resolve(contractsDirectory, name), "utf8");
        return markers.filter((marker) => text.includes(marker)).map((marker) => ({ name, marker }));
      });

    expect(violations).toEqual([]);
  });
});

describe("human-owned authority remains human-owned", () => {
  const rules = new Map(authorityContract.rules.map((rule) => [rule.id, rule]));

  it("AC-SAMPLE-01 remains a human_review contract", () => {
    expect(rules.get("AC-SAMPLE-01")).toMatchObject({ severity: "human", enforcementOwner: "human_review" });
  });

  it("AC-CORR-01 remains a human_review contract", () => {
    expect(rules.get("AC-CORR-01")).toMatchObject({ severity: "human", enforcementOwner: "human_review" });
  });

  it("AC-HUMAN-01 remains a human verdict that defaults outside automation", () => {
    expect(rules.get("AC-HUMAN-01")).toMatchObject({ severity: "human", enforcementOwner: "human_review" });
  });

  it("AC-SEV-01 gives every rule exactly one severity and owner", () => {
    expect(rules.get("AC-SEV-01")).toMatchObject({ severity: "human", enforcementOwner: "human_review" });
    expect(authorityContract.rules).toHaveLength(36);
    expect(new Set(authorityContract.rules.map((rule) => rule.id)).size).toBe(36);
    expect(authorityContract.rules.every((rule) => rule.severity && rule.enforcementOwner)).toBe(true);
  });

  it("AC-REF-02 remains an originality and imitation human_review boundary", () => {
    expect(rules.get("AC-REF-02")).toMatchObject({ severity: "human", enforcementOwner: "human_review" });
  });

  it("T24 candidate-2.2 resolves the five severity-owner mappings and keeps every rule inside the matrix", () => {
    expect(authorityContract.version).toBe("candidate-2.2");

    const resolvedMappings = {
      "AC-SAMPLE-01": { severity: "human", enforcementOwner: "human_review" },
      "AC-CORR-01": { severity: "human", enforcementOwner: "human_review" },
      "AC-SEV-01": { severity: "human", enforcementOwner: "human_review" },
      "AC-VOICE-01": {
        severity: "hard",
        enforcementOwner: "deterministic_post_validator",
      },
      "AC-REF-02": { severity: "human", enforcementOwner: "human_review" },
    } as const;

    for (const [ruleId, mapping] of Object.entries(resolvedMappings)) {
      expect(rules.get(ruleId)).toMatchObject(mapping);
    }

    const allowedSeverityOwnerPairs = new Set(
      authorityContract.severityMatrix.classes.flatMap((entry) =>
        entry.owners.map((owner) => `${entry.class}:${owner}`),
      ),
    );
    expect(
      authorityContract.rules.filter(
        (rule) =>
          !allowedSeverityOwnerPairs.has(
            `${rule.severity}:${rule.enforcementOwner}`,
          ),
      ),
    ).toEqual([]);
  });
});

describe("runtime authority migration", () => {
  it.todo(
    "MIGRATION-GUARD activates after Lane D rewires runtime and Lane A removes deprecated WorldNarrationSchema exports",
  );
});

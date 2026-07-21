import { describe, expect, it } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  ModelNarrationOutputSchema,
  NarrationInputEnvelopeSchema,
  NarrationPipelineEnvelopeSchema,
  PenelopeEnglishStyleProfileSchema,
} from "@/src/contracts/world-narrator";
import { PenelopeScenePlanSchema } from "@/src/contracts/narration-license";
import {
  NARRATION_POSTVALIDATOR_RULE_IDS,
  buildNarrationValidationSubjectFingerprint,
  comparePublicFidelityRecords,
  extractPublicFidelityRecord,
  fingerprintNarrationEvidencePayload,
  fingerprintPublicFidelityRecord,
  validateNarrationPostGeneration,
  type NarrationEvidenceBinding,
  type NarrationEvidenceKind,
  type NarrationPostvalidationInput,
  type NarrationPostvalidationResult,
  type NarrationSemanticEvidence,
  type NarrationTrustedEvidenceReceipt,
} from "@/src/domain/narration-postvalidator";
import type { NarrationPreflightResult } from "@/src/domain/narration-preflight";

const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);

const inputEnvelope = NarrationInputEnvelopeSchema.parse({
  modelFacing: {
    sceneMode: "setup",
    languageProfileId: styleProfile.profileId,
    referenceReceiptId: "creator-craft-reference-2026-07-17-01",
    focalActorId: "entity.a",
    presentActors: [
      {
        entityId: "entity.a",
        renderDescriptor: "A woman stands beside the hearth.",
        sourceFactIds: ["fact.a"],
      },
    ],
    visibleFacts: [{ factId: "fact.a", renderText: "A lamp burns beside the door." }],
    resolvedEvents: [],
    authorizedActionEventIds: [],
    authorizedReactionEventIds: [],
    authorizedChangeEventIds: [],
    authorizedAnchors: [],
    licensedRenderingDetails: [],
    styleStateId: "en-penelope-state-baseline",
    reservedActionIds: ["action.open-door"],
  },
  privateValidation: {
    forbiddenKnowledgeIds: [],
    forbiddenInferenceRuleIds: [],
    creatorOnlyReviewNoteIds: [],
  },
});

const sentence = (
  sentencePlanId: string,
  role: "orientation" | "licensed_dialogue" | "in_world_stop",
  overrides: Record<string, unknown> = {},
) => ({
  sentencePlanId,
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

const scenePlan = PenelopeScenePlanSchema.parse({
  scenePlanId: "scene.setup",
  sceneMode: "setup",
  sentencePlans: [
    sentence("sp.orientation", "orientation"),
    sentence("sp.stop", "in_world_stop"),
  ],
});

const modelOutput = ModelNarrationOutputSchema.parse({
  planReceipt: [
    {
      sentencePlanId: "sp.orientation",
      role: "orientation",
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    },
    {
      sentencePlanId: "sp.stop",
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
        sentencePlanIds: ["sp.orientation", "sp.stop"],
        text: "She keeps her place. Light falls across the threshold.",
      },
    ],
  },
});

const preflightResult: NarrationPreflightResult = {
  outcome: "render",
  hardPass: true,
  findings: [],
  reservedParticipantActionIds: ["action.open-door"],
  renderabilityReasons: [],
};

const emptyFidelity = extractPublicFidelityRecord({});

const RUNTIME_AUTHORITY_ID = "runtime.narration-evidence.v1";
const CREATOR_AUTHORITY_ID = "creator.narration-review.v1";

const placeholderBinding = <Kind extends NarrationEvidenceKind>(
  evidenceKind: Kind,
  receiptId: string,
): NarrationEvidenceBinding<Kind> => ({
  receiptId,
  evidenceKind,
  subjectFingerprint: "unbound",
  issuer: "deterministic_runtime",
  issuerAuthorityId: RUNTIME_AUTHORITY_ID,
});

const bindCurrentEvidence = (input: NarrationPostvalidationInput): void => {
  const subjectFingerprint = buildNarrationValidationSubjectFingerprint(input);
  const trustedReceipts: NarrationTrustedEvidenceReceipt[] = [];
  const register = (
    evidence: NarrationSemanticEvidence,
    evidenceKind: NarrationEvidenceKind,
    receiptId: string,
    deterministic: boolean,
  ): void => {
    const mutableEvidence = evidence as {
      binding: NarrationEvidenceBinding;
    };
    mutableEvidence.binding = {
      receiptId,
      evidenceKind,
      subjectFingerprint,
      issuer: deterministic ? "deterministic_runtime" : "creator",
      issuerAuthorityId: deterministic
        ? RUNTIME_AUTHORITY_ID
        : CREATOR_AUTHORITY_ID,
    };
    trustedReceipts.push({
      ...mutableEvidence.binding,
      payloadFingerprint: fingerprintNarrationEvidencePayload(evidence),
    });
  };

  if (input.contentTraceEvidence) {
    register(
      input.contentTraceEvidence,
      "content_trace",
      "receipt.content-trace",
      input.contentTraceEvidence.basis === "deterministic_receipt",
    );
  }
  if (input.privateScreeningEvidence) {
    register(
      input.privateScreeningEvidence,
      "private_screening",
      "receipt.private-screening",
      input.privateScreeningEvidence.basis === "deterministic_resolver",
    );
  }
  input.reservedActionAssessments?.forEach((assessment, index) => {
    register(
      assessment,
      "reserved_action",
      `receipt.reserved-action.${index}`,
      assessment.basis === "deterministic_rule",
    );
  });
  input.licenseRealizations.forEach((realization, index) => {
    register(
      realization,
      "license_realization",
      `receipt.license-realization.${index}`,
      realization.assessmentBasis === "deterministic_rule",
    );
  });
  if (input.fidelityEvidence) {
    register(
      input.fidelityEvidence,
      "public_fidelity",
      "receipt.public-fidelity",
      input.fidelityEvidence.basis === "deterministic_extractor",
    );
  }
  input.evidenceAuthorityRegistry = {
    trustedReceipts,
    deterministicRuntimeAuthorityIds: [RUNTIME_AUTHORITY_ID],
    creatorAuthorityIds: [CREATOR_AUTHORITY_ID],
  };
};

const basePostInput = (): NarrationPostvalidationInput => {
  const input: NarrationPostvalidationInput = {
  inputEnvelope: structuredClone(inputEnvelope),
  scenePlan: structuredClone(scenePlan),
  modelOutput: structuredClone(modelOutput),
  styleProfile: structuredClone(styleProfile),
  preflightResult: structuredClone(preflightResult),
  evidenceAuthorityRegistry: {
    trustedReceipts: [],
    deterministicRuntimeAuthorityIds: [RUNTIME_AUTHORITY_ID],
    creatorAuthorityIds: [CREATOR_AUTHORITY_ID],
  },
  privateValidationMaterial: {
    forbiddenKnowledge: [],
    forbiddenInferences: [],
  },
  reservedActionDescriptors: [
    { actionId: "action.open-door", text: "The woman opens the barred door." },
  ],
  reservedActionAssessments: [
    {
      binding: placeholderBinding(
        "reserved_action",
        "receipt.reserved-action.0",
      ),
      actionId: "action.open-door",
      status: "not_realized",
      basis: "deterministic_rule",
    },
  ],
  licenseRealizations: [],
  contentTraceEvidence: {
    binding: placeholderBinding("content_trace", "receipt.content-trace"),
    status: "complete",
    basis: "deterministic_receipt",
  },
  fidelityEvidence: {
    binding: placeholderBinding("public_fidelity", "receipt.public-fidelity"),
    status: "complete",
    basis: "deterministic_extractor",
    extractorId: "WF-PUBLIC-01",
    beforeFingerprint: fingerprintPublicFidelityRecord(emptyFidelity),
    afterFingerprint: fingerprintPublicFidelityRecord(emptyFidelity),
  },
  fidelityBefore: structuredClone(emptyFidelity),
  fidelityAfter: structuredClone(emptyFidelity),
  };
  bindCurrentEvidence(input);
  return input;
};

const unsafe = <T>(value: unknown): T => value as T;

const setProse = (input: NarrationPostvalidationInput, text: string): void => {
  input.modelOutput.readerProse.paragraphs[0]!.text = text;
};

const ruleFindings = (result: NarrationPostvalidationResult, ruleId: string) =>
  result.findings.filter((finding) => finding.ruleId === ruleId);

const expectHard = (
  input: NarrationPostvalidationInput,
  ruleId: (typeof NARRATION_POSTVALIDATOR_RULE_IDS)[number],
): NarrationPostvalidationResult => {
  bindCurrentEvidence(input);
  const result = validateNarrationPostGeneration(input);
  expect(ruleFindings(result, ruleId)).toContainEqual(
    expect.objectContaining({
      ruleId,
      classification: "deterministic",
      severity: "hard_fail",
    }),
  );
  expect(result.hardPass).toBe(false);
  expect(result.envelope).toBeNull();
  expect(result.renderAudit.hardPass).toBe(false);
  return result;
};

const expectCreatorReview = (
  input: NarrationPostvalidationInput,
  ruleId: (typeof NARRATION_POSTVALIDATOR_RULE_IDS)[number],
): NarrationPostvalidationResult => {
  bindCurrentEvidence(input);
  const result = validateNarrationPostGeneration(input);
  expect(ruleFindings(result, ruleId)).toContainEqual(
    expect.objectContaining({
      ruleId,
      classification: "creator_review",
      severity: "creator_review",
    }),
  );
  expect(result.disposition).toBe("creator_review");
  expect(result.creatorReviewRequired).toBe(true);
  expect(result.publishReady).toBe(false);
  expect(result.stateTransitionAllowed).toBe(false);
  return result;
};

const attachGestureLicense = (input: NarrationPostvalidationInput): void => {
  input.inputEnvelope.modelFacing.licensedRenderingDetails = [
    {
      licenseId: "license.gesture.a",
      issuer: "creator",
      issuerAuthorityId: "creator.receipt.a",
      issuedBeforeGeneration: true,
      category: "gesture",
      contentBoundary: "The woman raises one hand.",
      sourceAuthorityIds: ["fact.a"],
    },
  ];
  input.scenePlan.sentencePlans[0]!.licensedRenderingDetailIds = ["license.gesture.a"];
  input.modelOutput.planReceipt[0]!.licensedRenderingDetailIds = ["license.gesture.a"];
};

describe("deterministic narration post-validator", () => {
  it("exposes exactly the 12 post-validator rule IDs", () => {
    expect(NARRATION_POSTVALIDATOR_RULE_IDS).toHaveLength(12);
    expect(new Set(NARRATION_POSTVALIDATOR_RULE_IDS).size).toBe(12);
  });

  it("accepts a fully traced short scene without any word-count minimum", () => {
    const result = validateNarrationPostGeneration(basePostInput());
    expect(result.hardPass).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.envelope).not.toBeNull();
    expect(result.disposition).toBe("accepted");
    expect(result.creatorReviewRequired).toBe(false);
    expect(result.publishReady).toBe(true);
    expect(result.stateTransitionAllowed).toBe(true);
    expect(NarrationPipelineEnvelopeSchema.safeParse(result.envelope).success).toBe(true);
  });

  it("AC-DATA-02 hard-fails an exact plan-receipt mismatch", () => {
    const input = basePostInput();
    input.modelOutput.planReceipt[0]!.role = "pressure";
    expectHard(input, "AC-DATA-02");
  });

  it("counts dialogue ending in a closing quotation mark as one sentence", () => {
    const input = basePostInput();
    setProse(input, "She asks, “Wait?” Light falls across the threshold.");
    bindCurrentEvidence(input);

    const result = validateNarrationPostGeneration(input);

    expect(
      ruleFindings(result, "AC-DATA-02").filter(
        ({ classification, severity }) =>
          classification === "deterministic" && severity === "hard_fail",
      ),
    ).toEqual([]);
  });

  it("keeps a lower-case dialogue attribution with its quoted sentence", () => {
    const input = basePostInput();
    setProse(input, "She waits. “Wait?” she asks the stranger.");
    bindCurrentEvidence(input);

    const result = validateNarrationPostGeneration(input);

    expect(
      ruleFindings(result, "AC-DATA-02").filter(
        ({ classification, severity }) =>
          classification === "deterministic" && severity === "hard_fail",
      ),
    ).toEqual([]);
  });

  it("AC-DATA-02 hard-fails duplicate planReceipt IDs instead of trusting Map collapse", () => {
    const input = basePostInput();
    input.modelOutput.planReceipt = [
      structuredClone(input.modelOutput.planReceipt[0]!),
      structuredClone(input.modelOutput.planReceipt[0]!),
      structuredClone(input.modelOutput.planReceipt[1]!),
    ];
    expectHard(input, "AC-DATA-02");
  });

  it("AC-DATA-02 rejects replayed semantic receipts and prose sentences with no one-to-one plan coverage", () => {
    const input = basePostInput();
    input.inputEnvelope.privateValidation.forbiddenInferenceRuleIds = [
      "private.returning-ruler",
    ];
    input.privateValidationMaterial.forbiddenInferences = [
      { id: "private.returning-ruler", patterns: ["the stranger is the king"] },
    ];
    input.privateScreeningEvidence = {
      binding: placeholderBinding(
        "private_screening",
        "receipt.private-screening",
      ),
      screenedIds: ["private.returning-ruler"],
      status: "clear",
      basis: "deterministic_resolver",
    };
    setProse(
      input,
      "A beggar has taken Ithaca's throne. She lifts the latch and pushes the door wide. A bronze key gleams in her hand.",
    );

    bindCurrentEvidence(input);
    const result = validateNarrationPostGeneration(input);

    expect(result.hardPass).toBe(false);
    expect(result.envelope).toBeNull();
    expect(ruleFindings(result, "AC-DATA-02")).toContainEqual(
      expect.objectContaining({
        classification: "deterministic",
        severity: "hard_fail",
      }),
    );
    const publicResult = JSON.stringify(result).toLocaleLowerCase("en-US");
    expect(publicResult).not.toContain("a beggar has taken ithaca's throne");
    expect(publicResult).not.toContain("she lifts the latch");
    expect(publicResult).not.toContain("a bronze key gleams");
  });

  it("AC-DATA-02 rejects semantic receipts replayed onto a changed two-sentence output", () => {
    const input = basePostInput();
    input.inputEnvelope.privateValidation.forbiddenInferenceRuleIds = [
      "private.returning-ruler",
    ];
    input.privateValidationMaterial.forbiddenInferences = [
      { id: "private.returning-ruler", patterns: ["the stranger is the king"] },
    ];
    input.privateScreeningEvidence = {
      binding: placeholderBinding(
        "private_screening",
        "receipt.private-screening",
      ),
      screenedIds: ["private.returning-ruler"],
      status: "clear",
      basis: "deterministic_resolver",
    };
    bindCurrentEvidence(input);
    const priorSceneFingerprint =
      input.contentTraceEvidence!.binding.subjectFingerprint;
    setProse(
      input,
      "A beggar sits on Ithaca's throne while she lifts the latch and pushes the door wide. A bronze key gleams in her hand.",
    );
    const currentSceneFingerprint =
      buildNarrationValidationSubjectFingerprint(input);

    const result = validateNarrationPostGeneration(input);

    expect(currentSceneFingerprint).not.toBe(priorSceneFingerprint);
    expect(result.hardPass).toBe(false);
    expect(result.envelope).toBeNull();
    expect(ruleFindings(result, "AC-DATA-02")).toContainEqual(
      expect.objectContaining({
        classification: "deterministic",
        severity: "hard_fail",
      }),
    );
  });

  it("AC-DATA-02 rejects a current-scene receipt that is absent from the trust registry", () => {
    const input = basePostInput();
    const currentFingerprint = buildNarrationValidationSubjectFingerprint(input);
    expect(input.contentTraceEvidence!.binding.subjectFingerprint).toBe(
      currentFingerprint,
    );
    input.evidenceAuthorityRegistry.trustedReceipts =
      input.evidenceAuthorityRegistry.trustedReceipts.filter(
        ({ receiptId }) => receiptId !== "receipt.content-trace",
      );

    const result = validateNarrationPostGeneration(input);

    expect(result.disposition).toBe("hard_fail");
    expect(result.publishReady).toBe(false);
    expect(result.stateTransitionAllowed).toBe(false);
    expect(ruleFindings(result, "AC-DATA-02")).toContainEqual(
      expect.objectContaining({
        classification: "deterministic",
        severity: "hard_fail",
      }),
    );
  });

  it("AC-DATA-02 rejects a current-bound creator receipt self-asserting deterministic trace authority", () => {
    const input = basePostInput();
    const evidence = input.contentTraceEvidence!;
    evidence.binding = {
      ...evidence.binding,
      issuer: "creator",
      issuerAuthorityId: CREATOR_AUTHORITY_ID,
    };
    input.evidenceAuthorityRegistry.trustedReceipts =
      input.evidenceAuthorityRegistry.trustedReceipts.map((receipt) =>
        receipt.receiptId === evidence.binding.receiptId
          ? {
              ...evidence.binding,
              payloadFingerprint: fingerprintNarrationEvidencePayload(evidence),
            }
          : receipt,
      );

    const result = validateNarrationPostGeneration(input);

    expect(result.validationSubjectFingerprint).toBe(
      evidence.binding.subjectFingerprint,
    );
    expect(result.disposition).toBe("hard_fail");
    expect(result.publishReady).toBe(false);
    expect(ruleFindings(result, "AC-DATA-02")).toContainEqual(
      expect.objectContaining({
        classification: "deterministic",
        severity: "hard_fail",
      }),
    );
  });

  it("AC-DATA-02 leaves missing semantic evidence in creator_review without publish authority", () => {
    const input = basePostInput();
    input.contentTraceEvidence = undefined;
    bindCurrentEvidence(input);

    const result = validateNarrationPostGeneration(input);

    expect(result.hardPass).toBe(true);
    expect(result.disposition).toBe("creator_review");
    expect(result.creatorReviewRequired).toBe(true);
    expect(result.publishReady).toBe(false);
    expect(result.stateTransitionAllowed).toBe(false);
    expect(ruleFindings(result, "AC-DATA-02")).toContainEqual(
      expect.objectContaining({
        classification: "creator_review",
        severity: "creator_review",
      }),
    );
  });

  it("AC-DATA-02 fail-closes when preflight says no_render even without detailed findings", () => {
    const input = basePostInput();
    input.preflightResult = {
      outcome: "no_render",
      hardPass: false,
      findings: [],
      reservedParticipantActionIds: ["action.open-door"],
      renderabilityReasons: ["hard_failure"],
    };
    expectHard(input, "AC-DATA-02");
  });

  it("AC-DATA-02 routes uncertain semantic trace coverage to creator_review", () => {
    const input = basePostInput();
    input.contentTraceEvidence = {
      binding: placeholderBinding("content_trace", "receipt.content-trace"),
      status: "uncertain",
      basis: "creator_review",
    };
    const result = expectCreatorReview(input, "AC-DATA-02");
    expect(result.hardPass).toBe(true);
  });

  it("AC-LIC-04 hard-fails a deterministically outside contentBoundary realization", () => {
    const input = basePostInput();
    attachGestureLicense(input);
    input.licenseRealizations = [
      {
        binding: placeholderBinding(
          "license_realization",
          "receipt.license-realization.0",
        ),
        licenseId: "license.gesture.a",
        realizedText: "The woman crosses the room.",
        assessment: "outside",
        assessmentBasis: "deterministic_rule",
      },
    ];
    expectHard(input, "AC-LIC-04");
  });

  it("AC-LIC-04 routes missing or semantically uncertain realization evidence to creator_review", () => {
    const input = basePostInput();
    attachGestureLicense(input);
    const result = expectCreatorReview(input, "AC-LIC-04");
    expect(result.hardPass).toBe(true);
  });

  it("AC-PRIV-02 hard-fails an exact private phrase without leaking private IDs or text", () => {
    const input = basePostInput();
    input.inputEnvelope.privateValidation.forbiddenKnowledgeIds = ["private.identity.a"];
    input.privateValidationMaterial.forbiddenKnowledge = [
      { id: "private.identity.a", patterns: ["the stranger is the king"] },
    ];
    setProse(input, "The stranger is the king. The woman waits.");
    const result = expectHard(input, "AC-PRIV-02");
    const publicAudit = JSON.stringify(result.renderAudit).toLocaleLowerCase("en-US");
    expect(publicAudit).not.toContain("private.identity.a");
    expect(publicAudit).not.toContain("the stranger is the king");
    const serializedResult = JSON.stringify(result).toLocaleLowerCase("en-US");
    expect(serializedResult).not.toContain("private.identity.a");
    expect(serializedResult).not.toContain("the stranger is the king");
  });

  it("AC-PRIV-02 routes missing private resolver material to creator_review", () => {
    const input = basePostInput();
    input.inputEnvelope.privateValidation.forbiddenKnowledgeIds = ["private.identity.a"];
    const result = expectCreatorReview(input, "AC-PRIV-02");
    expect(result.hardPass).toBe(true);
  });

  it("AC-PRIV-02 routes unresolved forbidden-inference paraphrase risk to creator_review", () => {
    const input = basePostInput();
    input.inputEnvelope.privateValidation.forbiddenInferenceRuleIds = ["private.returning-ruler"];
    input.privateValidationMaterial.forbiddenInferences = [
      { id: "private.returning-ruler", patterns: ["the stranger is the king"] },
    ];
    setProse(input, "The beggar is Ithaca's returning ruler. The woman waits.");
    const result = expectCreatorReview(input, "AC-PRIV-02");
    expect(result.hardPass).toBe(true);
  });

  it("AC-SEP-01 hard-fails process lexicon and raw rule codes", () => {
    const input = basePostInput();
    setProse(input, "The pipeline reports AC-SEP-01 before the woman waits.");
    expectHard(input, "AC-SEP-01");
  });

  it("AC-SEP-01 hard-fails raw source IDs and hash tokens in reader prose", () => {
    const input = basePostInput();
    const hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    setProse(input, `The woman cites fact.a and ${hash}.`);
    expectHard(input, "AC-SEP-01");
  });

  it("AC-PRIV-02 keeps invented regex-valid rule IDs out of the public renderAudit", () => {
    const input = basePostInput();
    input.additionalFindings = [
      {
        ruleId: "AC-SECRET-CODE",
        classification: "creator_review",
        severity: "creator_review",
        count: 1,
      },
    ];
    const result = validateNarrationPostGeneration(input);
    expect(result.renderAudit.findings.map(({ ruleCode }) => ruleCode)).not.toContain(
      "AC-SECRET-CODE",
    );
  });

  it("AC-SEP-02 hard-fails schema field names inside reader prose", () => {
    const input = basePostInput();
    setProse(input, "The planReceipt closes while the woman waits.");
    expectHard(input, "AC-SEP-02");
  });

  it("AC-SEP-03 hard-fails a verbatim eight-word input run but flags reordered overlap only", () => {
    const input = basePostInput();
    const source = "The woman stands beside the hearth and watches the doorway.";
    input.inputEnvelope.modelFacing.presentActors[0]!.renderDescriptor = source;
    setProse(input, source);
    expectHard(input, "AC-SEP-03");

    const reordered = basePostInput();
    reordered.inputEnvelope.modelFacing.presentActors[0]!.renderDescriptor = source;
    setProse(
      reordered,
      "Beside the doorway, the woman watches and stands by the hearth. The lamp burns.",
    );
    bindCurrentEvidence(reordered);
    const result = validateNarrationPostGeneration(reordered);
    expect(ruleFindings(result, "AC-SEP-03")).toContainEqual(
      expect.objectContaining({ classification: "heuristic", severity: "warning" }),
    );
    expect(result.hardPass).toBe(true);
  });

  it("AC-ACT-01 hard-fails an exact reserved action but routes missing descriptors to creator_review", () => {
    const input = basePostInput();
    setProse(input, "The woman opens the barred door. The guard waits.");
    expectHard(input, "AC-ACT-01");

    const unresolved = basePostInput();
    unresolved.reservedActionDescriptors = [];
    const result = expectCreatorReview(unresolved, "AC-ACT-01");
    expect(result.hardPass).toBe(true);
  });

  it("AC-ACT-01 routes a plausible reserved-action paraphrase to creator_review", () => {
    const input = basePostInput();
    input.reservedActionAssessments = [
      {
        binding: placeholderBinding(
          "reserved_action",
          "receipt.reserved-action.0",
        ),
        actionId: "action.open-door",
        status: "uncertain",
        basis: "creator_review",
      },
    ];
    setProse(input, "She lifts the latch and pushes the door wide. The guard waits.");
    const result = expectCreatorReview(input, "AC-ACT-01");
    expect(result.hardPass).toBe(true);
  });

  it("AC-END-01 hard-fails reader address and choice instructions", () => {
    const input = basePostInput();
    setProse(input, "What do you do? The scene stops here.");
    expectHard(input, "AC-END-01");
  });

  it("AC-END-03 hard-fails an ending label in a terminal scene", () => {
    const input = basePostInput();
    input.scenePlan = unsafe<typeof input.scenePlan>({
      ...input.scenePlan,
      sceneMode: "ending",
    });
    setProse(input, "This is the good ending. The hall grows quiet.");
    expectHard(input, "AC-END-03");
  });

  it("AC-FID-01 hard-fails exact public-fidelity drift", () => {
    const input = basePostInput();
    input.fidelityBefore = extractPublicFidelityRecord({ names: ["Penelope"] });
    input.fidelityAfter = extractPublicFidelityRecord({ names: ["Eurycleia"] });
    input.fidelityEvidence = {
      binding: placeholderBinding("public_fidelity", "receipt.public-fidelity"),
      status: "complete",
      basis: "deterministic_extractor",
      extractorId: "WF-PUBLIC-01",
      beforeFingerprint: fingerprintPublicFidelityRecord(input.fidelityBefore),
      afterFingerprint: fingerprintPublicFidelityRecord(input.fidelityAfter),
    };
    const result = expectHard(input, "AC-FID-01");
    expect(result.fidelityMismatches).toEqual(["names"]);
    expect(
      comparePublicFidelityRecords(input.fidelityBefore, input.fidelityAfter),
    ).toEqual(["names"]);
  });

  it("AC-FID-01 routes incomplete extraction evidence to creator_review before comparison", () => {
    const input = basePostInput();
    input.fidelityEvidence = {
      binding: placeholderBinding("public_fidelity", "receipt.public-fidelity"),
      status: "incomplete",
      basis: "creator_review",
      extractorId: null,
      beforeFingerprint: null,
      afterFingerprint: null,
    };
    const result = expectCreatorReview(input, "AC-FID-01");
    expect(result.hardPass).toBe(true);
  });

  it("AC-FID-01 does not certify records bound only to creator_review extraction", () => {
    const input = basePostInput();
    input.fidelityEvidence = {
      binding: placeholderBinding("public_fidelity", "receipt.public-fidelity"),
      status: "complete",
      basis: "creator_review",
      extractorId: null,
      beforeFingerprint: null,
      afterFingerprint: null,
    };
    const result = expectCreatorReview(input, "AC-FID-01");
    expect(result.hardPass).toBe(true);
  });

  it("AC-VOICE-01 hard-fails presentation directives embedded in prose", () => {
    const input = basePostInput();
    setProse(input, "[voice: whisper] The woman waits beside the door.");
    expectHard(input, "AC-VOICE-01");
  });

  it("AC-LEN-01 hard-fails only sentences above the selected hard ceiling", () => {
    const input = basePostInput();
    const words = Array.from({ length: 31 }, (_, index) => `word${index + 1}`).join(" ");
    setProse(input, `${words}.`);
    expectHard(input, "AC-LEN-01");

    const short = basePostInput();
    setProse(short, "She waits. Light falls.");
    bindCurrentEvidence(short);
    expect(ruleFindings(validateNarrationPostGeneration(short), "AC-LEN-01")).toEqual([]);
  });

  it("forces hardPass false when any supplied finding is hard_fail", () => {
    const input = basePostInput();
    input.additionalFindings = [
      {
        ruleId: "AC-SEP-01",
        classification: "deterministic",
        severity: "hard_fail",
        count: 1,
      },
    ];
    const result = validateNarrationPostGeneration(input);
    expect(result.hardPass).toBe(false);
    expect(result.envelope).toBeNull();
    expect(result.renderAudit.hardPass).toBe(false);
  });
});

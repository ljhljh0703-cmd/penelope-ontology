import { describe, expect, it } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  NarrationInputEnvelopeSchema,
  PenelopeEnglishStyleProfileSchema,
} from "@/src/contracts/world-narrator";
import {
  PenelopeNarrationPreflightReceiptSchema,
  PenelopeScenePlanSchema,
} from "@/src/contracts/narration-license";
import {
  NARRATION_PREFLIGHT_RULE_IDS,
  runNarrationPreflight,
  type NarrationPreflightInput,
  type NarrationPreflightResult,
} from "@/src/domain/narration-preflight";

const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);

const baseModelFacing = {
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
};

const baseInputEnvelope = NarrationInputEnvelopeSchema.parse({
  modelFacing: baseModelFacing,
  privateValidation: {
    forbiddenKnowledgeIds: [],
    forbiddenInferenceRuleIds: [],
    creatorOnlyReviewNoteIds: [],
  },
});

const sentence = (
  sentencePlanId: string,
  role: "orientation" | "authorized_action" | "observable_reaction" | "resolved_consequence" | "pressure" | "licensed_dialogue" | "in_world_stop",
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

const baseScenePlan = PenelopeScenePlanSchema.parse({
  scenePlanId: "scene.setup",
  sceneMode: "setup",
  sentencePlans: [
    sentence("sp.orientation", "orientation"),
    sentence("sp.stop", "in_world_stop"),
  ],
});

const baseReceipt = PenelopeNarrationPreflightReceiptSchema.parse({
  preflightId: "pf-test-1",
  sceneMode: "setup",
  sceneAuthority: {
    factIds: ["fact.a"],
    eventIds: [],
    actorEntityIds: ["entity.a"],
    licensedRenderingDetailIds: [],
    licensedRenderingDetails: [],
  },
  referenceReceipt: {
    status: "available",
    referenceId: "creator-craft-reference-2026-07-17-01",
    transferableTechniqueIds: ["TT-01"],
    sceneApplicability: [
      { techniqueId: "TT-01", plainReason: "The registered response carries the beat." },
    ],
    forbiddenImitation: true,
    excludedGimmicks: ["FC-04"],
  },
  plainDramaticPlan: {
    focalActorId: "entity.a",
    actionSourceEventIds: [],
    reactionSourceEventIds: [],
    changeSourceEventIds: [],
  },
  dialogueAuthority: {
    mode: "none",
    speakerId: null,
    speechAct: null,
    speechEventIds: [],
    speechActLicenseIds: [],
    authorizedContentIds: [],
    plainIntent: null,
    plainIntentSourceAuthorityIds: [],
  },
  creatorReviewRequired: true,
});

const basePreflightInput = (): NarrationPreflightInput => ({
  inputEnvelope: structuredClone(baseInputEnvelope),
  scenePlan: structuredClone(baseScenePlan),
  preflightReceipt: structuredClone(baseReceipt),
  styleProfile: structuredClone(styleProfile),
  authorityRegistry: {
    typedSpeechEvents: [],
    creatorAuthorityIds: ["creator.receipt.a"],
    deterministicRuntimeAuthorityIds: ["runtime.rule.a"],
    approvedReferenceReceiptIds: ["creator-craft-reference-2026-07-17-01"],
  },
  cameraSafeProvenance: [
    {
      fieldKey: "present_actor:entity.a",
      text: "A woman stands beside the hearth.",
      authoredBy: "creator",
      authorityId: "creator.receipt.a",
      rawSourceTexts: [],
    },
    {
      fieldKey: "visible_fact:fact.a",
      text: "A lamp burns beside the door.",
      authoredBy: "deterministic_runtime",
      authorityId: "runtime.rule.a",
      rawSourceTexts: [],
    },
  ],
  continuityProvenance: {
    source: "registered_events",
    authority: "deterministic_runtime",
    registeredEventIds: [],
    readerProseImported: false,
  },
  renderability: {
    renderFunctionAvailable: true,
    authoringInputsComplete: true,
  },
});

const unsafe = <T>(value: unknown): T => value as T;

const finding = (
  result: NarrationPreflightResult,
  ruleId: (typeof NARRATION_PREFLIGHT_RULE_IDS)[number],
) => result.findings.find((candidate) => candidate.ruleId === ruleId);

const expectHard = (
  input: NarrationPreflightInput,
  ruleId: (typeof NARRATION_PREFLIGHT_RULE_IDS)[number],
): NarrationPreflightResult => {
  const result = runNarrationPreflight(input);
  expect(finding(result, ruleId)).toMatchObject({
    ruleId,
    classification: "deterministic",
    severity: "hard_fail",
  });
  expect(result.hardPass).toBe(false);
  expect(result.outcome).toBe("no_render");
  return result;
};

const makeTurnInput = (): NarrationPreflightInput => {
  const input = basePreflightInput();
  const event = {
    eventId: "event.turn.a",
    observableText: "The woman opens the door and the guard steps back.",
    sourceAuthorityIds: ["fact.a"],
  };
  input.inputEnvelope.modelFacing.sceneMode = "turn";
  input.inputEnvelope.modelFacing.resolvedEvents = [event];
  input.inputEnvelope.modelFacing.authorizedActionEventIds = [event.eventId];
  input.inputEnvelope.modelFacing.authorizedReactionEventIds = [event.eventId];
  input.inputEnvelope.modelFacing.authorizedChangeEventIds = [event.eventId];
  input.continuityProvenance = {
    source: "registered_events",
    authority: "deterministic_runtime",
    registeredEventIds: [event.eventId],
    readerProseImported: false,
  };
  input.cameraSafeProvenance = [
    ...input.cameraSafeProvenance,
    {
      fieldKey: "resolved_event:event.turn.a",
      text: event.observableText,
      authoredBy: "deterministic_runtime",
      authorityId: "runtime.rule.a",
      rawSourceTexts: [],
    },
  ];
  input.scenePlan = unsafe<typeof input.scenePlan>({
    scenePlanId: "scene.turn",
    sceneMode: "turn",
    sentencePlans: [
      sentence("sp.action", "authorized_action", {
        actorId: "entity.a",
        sourceFactIds: [],
        sourceEventIds: [event.eventId],
      }),
      sentence("sp.reaction", "observable_reaction", {
        sourceFactIds: [],
        sourceEventIds: [event.eventId],
      }),
      sentence("sp.consequence", "resolved_consequence", {
        sourceFactIds: [],
        sourceEventIds: [event.eventId],
        changesState: true,
      }),
      sentence("sp.stop", "in_world_stop"),
    ],
  });
  input.preflightReceipt = unsafe<typeof input.preflightReceipt>({
    ...structuredClone(baseReceipt),
    sceneMode: "turn",
    sceneAuthority: {
      ...structuredClone(baseReceipt.sceneAuthority),
      eventIds: [event.eventId],
    },
    plainDramaticPlan: {
      focalActorId: "entity.a",
      actionSourceEventIds: [event.eventId],
      reactionSourceEventIds: [event.eventId],
      changeSourceEventIds: [event.eventId],
      changeInPlainTerms: {
        text: "The door opens.",
        sourceAuthorityIds: [event.eventId],
      },
    },
  });
  return input;
};

describe("deterministic narration preflight", () => {
  it("exposes exactly the 18 deterministic preflight rule IDs", () => {
    expect(NARRATION_PREFLIGHT_RULE_IDS).toHaveLength(18);
    expect(new Set(NARRATION_PREFLIGHT_RULE_IDS).size).toBe(18);
  });

  it("renders a fully registered setup baseline", () => {
    expect(runNarrationPreflight(basePreflightInput())).toMatchObject({
      outcome: "render",
      hardPass: true,
      findings: [],
      reservedParticipantActionIds: ["action.open-door"],
    });
  });

  it("AC-DATA-01 rejects missing camera-safe provenance", () => {
    const input = basePreflightInput();
    input.cameraSafeProvenance = input.cameraSafeProvenance.slice(0, 1);
    expectHard(input, "AC-DATA-01");
  });

  it("AC-DATA-01 rejects an exact eight-word run copied from raw engine text", () => {
    const input = basePreflightInput();
    const copied = "The woman stands beside the hearth and watches the doorway.";
    input.inputEnvelope.modelFacing.presentActors[0]!.renderDescriptor = copied;
    input.cameraSafeProvenance = input.cameraSafeProvenance.map((entry) =>
      entry.fieldKey === "present_actor:entity.a"
        ? { ...entry, text: copied, rawSourceTexts: [copied] }
        : entry,
    );
    expectHard(input, "AC-DATA-01");
  });

  it("AC-DATA-01 rejects a short camera field copied exactly from raw engine text", () => {
    const input = basePreflightInput();
    const copied = "A lamp burns.";
    input.inputEnvelope.modelFacing.visibleFacts[0]!.renderText = copied;
    input.cameraSafeProvenance = input.cameraSafeProvenance.map((entry) =>
      entry.fieldKey === "visible_fact:fact.a"
        ? { ...entry, text: copied, rawSourceTexts: [copied] }
        : entry,
    );
    expectHard(input, "AC-DATA-01");
  });

  it("AC-DATA-01 rejects duplicate camera-safe provenance keys", () => {
    const input = basePreflightInput();
    input.cameraSafeProvenance = [
      ...input.cameraSafeProvenance,
      structuredClone(input.cameraSafeProvenance[0]!),
    ];
    expectHard(input, "AC-DATA-01");
  });

  it("AC-DATA-03 rejects analytic vocabulary in camera-safe fields", () => {
    const input = basePreflightInput();
    input.inputEnvelope.modelFacing.visibleFacts[0]!.renderText = "The schema field name records an inference.";
    input.cameraSafeProvenance = input.cameraSafeProvenance.map((entry) =>
      entry.fieldKey === "visible_fact:fact.a"
        ? { ...entry, text: "The schema field name records an inference." }
        : entry,
    );
    expectHard(input, "AC-DATA-03");
  });

  it("AC-DATA-03 rejects camelCase engine field names", () => {
    const input = basePreflightInput();
    const leaked = "The eventId points to sourceAuthorityIds.";
    input.inputEnvelope.modelFacing.visibleFacts[0]!.renderText = leaked;
    input.cameraSafeProvenance = input.cameraSafeProvenance.map((entry) =>
      entry.fieldKey === "visible_fact:fact.a"
        ? { ...entry, text: leaked }
        : entry,
    );
    expectHard(input, "AC-DATA-03");
  });

  it("AC-AUTH-01 rejects authorized IDs absent from resolved events", () => {
    const input = basePreflightInput();
    input.inputEnvelope.modelFacing.authorizedActionEventIds = ["event.unknown"];
    expectHard(input, "AC-AUTH-01");
  });

  it("AC-AUTH-02 rejects unknown sentence-plan source IDs", () => {
    const input = basePreflightInput();
    input.scenePlan.sentencePlans[0]!.sourceFactIds = ["fact.unknown"];
    expectHard(input, "AC-AUTH-02");
  });

  it("AC-AUTH-02 rejects duplicate sentencePlanId values before Map collapse", () => {
    const input = basePreflightInput();
    input.scenePlan.sentencePlans[1]!.sentencePlanId =
      input.scenePlan.sentencePlans[0]!.sentencePlanId;
    expectHard(input, "AC-AUTH-02");
  });

  it("AC-AUTH-02 AC-LIC-02 AC-DLG-01 reject duplicate authority-object IDs before Map or Set collapse", () => {
    const authorityDuplicates: Array<{
      name: string;
      ruleId: "AC-AUTH-02" | "AC-LIC-02" | "AC-DLG-01";
      mutate: (input: NarrationPreflightInput) => void;
    }> = [
      {
        name: "present actor",
        ruleId: "AC-AUTH-02",
        mutate: (input) => {
          input.inputEnvelope.modelFacing.presentActors.push(
            structuredClone(input.inputEnvelope.modelFacing.presentActors[0]!),
          );
        },
      },
      {
        name: "visible fact",
        ruleId: "AC-AUTH-02",
        mutate: (input) => {
          input.inputEnvelope.modelFacing.visibleFacts.push(
            structuredClone(input.inputEnvelope.modelFacing.visibleFacts[0]!),
          );
        },
      },
      {
        name: "resolved event",
        ruleId: "AC-AUTH-02",
        mutate: (input) => {
          const event = {
            eventId: "event.duplicate",
            observableText: "The guard turns toward the door.",
            sourceAuthorityIds: ["fact.a"],
          };
          input.inputEnvelope.modelFacing.resolvedEvents = [event, { ...event, observableText: "The guard looks away." }];
          input.cameraSafeProvenance = [
            ...input.cameraSafeProvenance,
            {
              fieldKey: "resolved_event:event.duplicate",
              text: "The guard looks away.",
              authoredBy: "deterministic_runtime",
              authorityId: "runtime.rule.a",
              rawSourceTexts: [],
            },
          ];
        },
      },
      {
        name: "authorized anchor",
        ruleId: "AC-AUTH-02",
        mutate: (input) => {
          const anchor = {
            anchorId: "anchor.door",
            renderDescriptor: "A barred door faces the hearth.",
            sourceFactIds: ["fact.a"],
          };
          input.inputEnvelope.modelFacing.authorizedAnchors = [anchor, structuredClone(anchor)];
          input.cameraSafeProvenance = [
            ...input.cameraSafeProvenance,
            {
              fieldKey: "authorized_anchor:anchor.door",
              text: anchor.renderDescriptor,
              authoredBy: "creator",
              authorityId: "creator.receipt.a",
              rawSourceTexts: [],
            },
          ];
        },
      },
      {
        name: "rendering license",
        ruleId: "AC-LIC-02",
        mutate: (input) => {
          const license = {
            licenseId: "license.duplicate",
            issuer: "creator" as const,
            issuerAuthorityId: "creator.receipt.a",
            issuedBeforeGeneration: true as const,
            category: "gesture" as const,
            contentBoundary: "The woman raises one hand.",
            sourceAuthorityIds: ["fact.a"],
          };
          input.inputEnvelope.modelFacing.licensedRenderingDetails = [
            license,
            { ...license, contentBoundary: "The woman crosses the room." },
          ];
        },
      },
      {
        name: "typed speech registry entry",
        ruleId: "AC-DLG-01",
        mutate: (input) => {
          input.authorityRegistry.typedSpeechEvents = [
            { eventId: "event.speech.duplicate", registeredKind: "speech" },
            { eventId: "event.speech.duplicate", registeredKind: "speech" },
          ];
        },
      },
    ];

    for (const duplicate of authorityDuplicates) {
      const input = basePreflightInput();
      duplicate.mutate(input);
      expectHard(input, duplicate.ruleId);
    }
  });

  it("AC-AUTH-03 rejects a beat role outside its authorized event list", () => {
    const input = makeTurnInput();
    input.inputEnvelope.modelFacing.authorizedActionEventIds = ["event.other"];
    input.inputEnvelope.modelFacing.resolvedEvents.push({
      eventId: "event.other",
      observableText: "A second registered event occurs.",
      sourceAuthorityIds: ["fact.a"],
    });
    input.cameraSafeProvenance = [
      ...input.cameraSafeProvenance,
      {
        fieldKey: "resolved_event:event.other",
        text: "A second registered event occurs.",
        authoredBy: "deterministic_runtime",
        authorityId: "runtime.rule.a",
        rawSourceTexts: [],
      },
    ];
    expectHard(input, "AC-AUTH-03");
  });

  it("AC-LIC-01 rejects an unknown rendering-detail license binding", () => {
    const input = basePreflightInput();
    input.scenePlan.sentencePlans[0]!.licensedRenderingDetailIds = ["license.unknown"];
    expectHard(input, "AC-LIC-01");
  });

  it("AC-LIC-02 rejects a license without a valid pre-generation boundary", () => {
    const input = basePreflightInput();
    input.inputEnvelope.modelFacing.licensedRenderingDetails = unsafe<
      typeof input.inputEnvelope.modelFacing.licensedRenderingDetails
    >([
      {
        licenseId: "license.gesture.a",
        issuer: "creator",
        issuerAuthorityId: "creator.receipt.a",
        issuedBeforeGeneration: false,
        category: "gesture",
        contentBoundary: "",
        sourceAuthorityIds: [],
      },
    ]);
    expectHard(input, "AC-LIC-02");
  });

  it("AC-LIC-03 rejects a self-issued or unregistered authority chain", () => {
    const input = basePreflightInput();
    input.inputEnvelope.modelFacing.licensedRenderingDetails = [
      {
        licenseId: "license.gesture.a",
        issuer: "creator",
        issuerAuthorityId: "agent.self",
        issuedBeforeGeneration: true,
        category: "gesture",
        contentBoundary: "The woman raises one hand.",
        sourceAuthorityIds: ["fact.a"],
      },
    ];
    expectHard(input, "AC-LIC-03");
  });

  it("AC-DLG-01 rejects general-event-only and registry-only dialogue authority", () => {
    const input = basePreflightInput();
    input.inputEnvelope.modelFacing.resolvedEvents = [
      {
        eventId: "event.general.a",
        observableText: "The woman turns toward the guard.",
        sourceAuthorityIds: ["fact.a"],
      },
    ];
    input.cameraSafeProvenance = [
      ...input.cameraSafeProvenance,
      {
        fieldKey: "resolved_event:event.general.a",
        text: "The woman turns toward the guard.",
        authoredBy: "deterministic_runtime",
        authorityId: "runtime.rule.a",
        rawSourceTexts: [],
      },
    ];
    input.scenePlan = unsafe<typeof input.scenePlan>({
      ...input.scenePlan,
      sentencePlans: [
        input.scenePlan.sentencePlans[0],
        sentence("sp.dialogue", "licensed_dialogue", {
          speakerId: "entity.a",
          sourceFactIds: [],
          sourceEventIds: ["event.general.a"],
          plainIntent: "Ask the guard to wait.",
          plainIntentSourceAuthorityIds: ["event.general.a"],
        }),
        input.scenePlan.sentencePlans[1],
      ],
    });
    expectHard(input, "AC-DLG-01");

    const registryOnly = structuredClone(input);
    registryOnly.scenePlan.sentencePlans[1]!.sourceEventIds = [];
    registryOnly.scenePlan.sentencePlans[1]!.speechEventIds = ["event.speech.a"];
    registryOnly.authorityRegistry.typedSpeechEvents = [
      { eventId: "event.speech.a", registeredKind: "speech" },
    ];
    expectHard(registryOnly, "AC-DLG-01");
  });

  it("AC-DLG-01 accepts only a resolved typed speech event or a speech_act license", () => {
    const typed = basePreflightInput();
    typed.inputEnvelope.modelFacing.resolvedEvents = [
      {
        eventId: "event.speech.a",
        observableText: "The woman asks the guard to wait.",
        sourceAuthorityIds: ["fact.a"],
      },
    ];
    typed.cameraSafeProvenance = [
      ...typed.cameraSafeProvenance,
      {
        fieldKey: "resolved_event:event.speech.a",
        text: "The woman asks the guard to wait.",
        authoredBy: "deterministic_runtime",
        authorityId: "runtime.rule.a",
        rawSourceTexts: [],
      },
    ];
    typed.scenePlan = unsafe<typeof typed.scenePlan>({
      ...typed.scenePlan,
      sentencePlans: [
        typed.scenePlan.sentencePlans[0],
        sentence("sp.dialogue", "licensed_dialogue", {
          speakerId: "entity.a",
          sourceFactIds: [],
          speechEventIds: ["event.speech.a"],
          plainIntent: "Ask the guard to wait.",
          plainIntentSourceAuthorityIds: ["event.speech.a"],
        }),
        typed.scenePlan.sentencePlans[1],
      ],
    });
    typed.authorityRegistry.typedSpeechEvents = [
      { eventId: "event.speech.a", registeredKind: "speech" },
    ];
    expect(finding(runNarrationPreflight(typed), "AC-DLG-01")).toBeUndefined();

    const licensed = basePreflightInput();
    licensed.inputEnvelope.modelFacing.licensedRenderingDetails = [
      {
        licenseId: "license.speech.a",
        issuer: "creator",
        issuerAuthorityId: "creator.receipt.a",
        issuedBeforeGeneration: true,
        category: "speech_act",
        contentBoundary: "The woman may ask the guard to wait.",
        sourceAuthorityIds: ["fact.a"],
      },
    ];
    licensed.scenePlan = unsafe<typeof licensed.scenePlan>({
      ...licensed.scenePlan,
      sentencePlans: [
        licensed.scenePlan.sentencePlans[0],
        sentence("sp.dialogue", "licensed_dialogue", {
          speakerId: "entity.a",
          sourceFactIds: [],
          licensedRenderingDetailIds: ["license.speech.a"],
          plainIntent: "Ask the guard to wait.",
          plainIntentSourceAuthorityIds: ["fact.a"],
        }),
        licensed.scenePlan.sentencePlans[1],
      ],
    });
    expect(finding(runNarrationPreflight(licensed), "AC-DLG-01")).toBeUndefined();
  });

  it("AC-AUTH-02 AC-DLG-01 reject an unknown dialogue speaker despite valid speech authority", () => {
    const input = basePreflightInput();
    input.inputEnvelope.modelFacing.resolvedEvents = [
      {
        eventId: "event.speech.a",
        observableText: "A registered question is spoken.",
        sourceAuthorityIds: ["fact.a"],
      },
    ];
    input.continuityProvenance = {
      source: "registered_events",
      authority: "deterministic_runtime",
      registeredEventIds: ["event.speech.a"],
      readerProseImported: false,
    };
    input.cameraSafeProvenance = [
      ...input.cameraSafeProvenance,
      {
        fieldKey: "resolved_event:event.speech.a",
        text: "A registered question is spoken.",
        authoredBy: "deterministic_runtime",
        authorityId: "runtime.rule.a",
        rawSourceTexts: [],
      },
    ];
    input.authorityRegistry.typedSpeechEvents = [
      { eventId: "event.speech.a", registeredKind: "speech" },
    ];
    input.scenePlan = unsafe<typeof input.scenePlan>({
      ...input.scenePlan,
      sentencePlans: [
        input.scenePlan.sentencePlans[0],
        sentence("sp.dialogue", "licensed_dialogue", {
          speakerId: "entity.unknown",
          sourceFactIds: [],
          speechEventIds: ["event.speech.a"],
          plainIntent: "Ask the registered question.",
          plainIntentSourceAuthorityIds: ["event.speech.a"],
        }),
        input.scenePlan.sentencePlans[1],
      ],
    });
    expectHard(input, "AC-AUTH-02");
  });

  it("AC-PRIV-01 rejects overlap between public and private IDs", () => {
    const input = basePreflightInput();
    input.inputEnvelope.privateValidation.forbiddenKnowledgeIds = ["fact.a"];
    expectHard(input, "AC-PRIV-01");
  });

  it("AC-FID-02 rejects continuity imported from reader prose", () => {
    const input = basePreflightInput();
    input.continuityProvenance = {
      source: "reader_prose",
      authority: "unverified",
      registeredEventIds: [],
      readerProseImported: true,
    };
    expectHard(input, "AC-FID-02");
  });

  it("AC-FID-02 rejects a caller label without deterministic continuity provenance", () => {
    const input = basePreflightInput();
    input.continuityProvenance = undefined;
    input.continuityOrigin = "registered_events";
    expectHard(input, "AC-FID-02");
  });

  it("AC-MODE-01 rejects a setup plan that claims state change", () => {
    const input = basePreflightInput();
    input.scenePlan.sentencePlans[0]!.changesState = true;
    expectHard(input, "AC-MODE-01");
  });

  it("AC-MODE-02 rejects a turn missing an authorized reaction role", () => {
    const input = makeTurnInput();
    input.scenePlan.sentencePlans = input.scenePlan.sentencePlans.filter(
      ({ role }) => role !== "observable_reaction",
    );
    expectHard(input, "AC-MODE-02");
  });

  it("AC-MODE-03 rejects an aftermath that introduces a new action", () => {
    const input = makeTurnInput();
    input.inputEnvelope.modelFacing.sceneMode = "aftermath";
    input.inputEnvelope.modelFacing.authorizedActionEventIds = [];
    input.scenePlan.sceneMode = "aftermath";
    input.preflightReceipt.sceneMode = "aftermath";
    expectHard(input, "AC-MODE-03");
  });

  it("AC-MODE-04 rejects a transition that claims state change", () => {
    const input = basePreflightInput();
    input.inputEnvelope.modelFacing.sceneMode = "transition";
    input.scenePlan.sceneMode = "transition";
    input.preflightReceipt.sceneMode = "transition";
    input.scenePlan.sentencePlans[0]!.changesState = true;
    expectHard(input, "AC-MODE-04");
  });

  it("AC-MODE-05 rejects an ending that introduces a new action", () => {
    const input = makeTurnInput();
    input.inputEnvelope.modelFacing.sceneMode = "ending";
    input.inputEnvelope.modelFacing.authorizedActionEventIds = [];
    input.scenePlan.sceneMode = "ending";
    input.preflightReceipt.sceneMode = "ending";
    expectHard(input, "AC-MODE-05");
  });

  it("AC-LADDER-01 rejects an unregistered runtime style state", () => {
    const input = basePreflightInput();
    input.inputEnvelope.modelFacing.styleStateId = "en-penelope-state-unknown";
    expectHard(input, "AC-LADDER-01");
  });

  it("AC-REF-01 rejects a reference receipt absent from the approved registry", () => {
    const input = basePreflightInput();
    input.authorityRegistry.approvedReferenceReceiptIds = [];
    expectHard(input, "AC-REF-01");
  });

  it("AC-REF-01 rejects applicability techniques not selected for transfer", () => {
    const input = basePreflightInput();
    input.preflightReceipt.referenceReceipt.sceneApplicability = [
      ...input.preflightReceipt.referenceReceipt.sceneApplicability,
      { techniqueId: "TT-02", plainReason: "An extra unselected technique." },
    ];
    expectHard(input, "AC-REF-01");
  });

  it("AC-REF-01 rejects selected techniques without applicability reasons", () => {
    const input = basePreflightInput();
    input.preflightReceipt.referenceReceipt.transferableTechniqueIds = [
      "TT-01",
      "TT-02",
    ];
    expectHard(input, "AC-REF-01");
  });

  it("returns needs_authoring without pretending missing authoring is a rule pass", () => {
    const input = basePreflightInput();
    input.renderability.authoringInputsComplete = false;
    expect(runNarrationPreflight(input)).toMatchObject({
      outcome: "needs_authoring",
      hardPass: true,
      renderabilityReasons: ["authoring_inputs_incomplete"],
    });
  });
});

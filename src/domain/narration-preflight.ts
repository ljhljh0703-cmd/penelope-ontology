import type {
  ModelFacingNarrationRequest,
  NarrationInputEnvelope,
  PenelopeEnglishStyleProfile,
  PenelopeNarrationPreflightReceipt,
  PenelopeScenePlan,
  TypedSpeechEventReference,
} from "@/src/contracts/world-narrator";

export const NARRATION_PREFLIGHT_RULE_IDS = [
  "AC-DATA-01",
  "AC-DATA-03",
  "AC-AUTH-01",
  "AC-AUTH-02",
  "AC-AUTH-03",
  "AC-LIC-01",
  "AC-LIC-02",
  "AC-LIC-03",
  "AC-DLG-01",
  "AC-PRIV-01",
  "AC-FID-02",
  "AC-MODE-01",
  "AC-MODE-02",
  "AC-MODE-03",
  "AC-MODE-04",
  "AC-MODE-05",
  "AC-LADDER-01",
  "AC-REF-01",
] as const;

export type NarrationPreflightRuleId =
  (typeof NARRATION_PREFLIGHT_RULE_IDS)[number];

export type NarrationValidationClassification =
  | "deterministic"
  | "heuristic"
  | "creator_review";

export type NarrationFindingSeverity =
  | "hard_fail"
  | "warning"
  | "creator_review";

export type NarrationRuleFinding<RuleId extends string = string> = {
  ruleId: RuleId;
  classification: NarrationValidationClassification;
  severity: NarrationFindingSeverity;
  count: number;
};

export type CameraSafeFieldKey =
  | `present_actor:${string}`
  | `visible_fact:${string}`
  | `resolved_event:${string}`
  | `authorized_anchor:${string}`;

export type CameraSafeField = {
  fieldKey: CameraSafeFieldKey;
  text: string;
};

export type CameraSafeProvenance = CameraSafeField & {
  authoredBy: "creator" | "deterministic_runtime";
  authorityId: string;
  rawSourceTexts: ReadonlyArray<string>;
};

export type NarrationAuthorityRegistry = {
  typedSpeechEvents: ReadonlyArray<TypedSpeechEventReference>;
  creatorAuthorityIds: ReadonlyArray<string>;
  deterministicRuntimeAuthorityIds: ReadonlyArray<string>;
  approvedReferenceReceiptIds: ReadonlyArray<string>;
};

export type NarrationRenderabilityInput = {
  renderFunctionAvailable: boolean;
  authoringInputsComplete: boolean;
};

export type NarrationContinuityProvenance = {
  source: "registered_events" | "reader_prose";
  authority: "deterministic_runtime" | "unverified";
  registeredEventIds: ReadonlyArray<string>;
  readerProseImported: boolean;
};

export type NarrationPreflightInput = {
  inputEnvelope: NarrationInputEnvelope;
  scenePlan: PenelopeScenePlan;
  preflightReceipt: PenelopeNarrationPreflightReceipt;
  styleProfile: PenelopeEnglishStyleProfile;
  authorityRegistry: NarrationAuthorityRegistry;
  cameraSafeProvenance: ReadonlyArray<CameraSafeProvenance>;
  continuityProvenance?: NarrationContinuityProvenance;
  /** @deprecated A source label is not proof; supply continuityProvenance. */
  continuityOrigin?: "registered_events" | "reader_prose";
  renderability: NarrationRenderabilityInput;
};

export type NarrationRenderabilityOutcome =
  | "render"
  | "no_render"
  | "needs_authoring";

export type NarrationPreflightResult = {
  outcome: NarrationRenderabilityOutcome;
  hardPass: boolean;
  findings: ReadonlyArray<NarrationRuleFinding<NarrationPreflightRuleId>>;
  reservedParticipantActionIds: ReadonlyArray<string>;
  renderabilityReasons: ReadonlyArray<
    | "hard_failure"
    | "reference_unavailable"
    | "render_function_unavailable"
    | "authoring_inputs_incomplete"
  >;
};

const CAMERA_SAFE_ANALYTIC_PATTERN =
  /(?:\b(?:analysis|analytic|epistemic|inference|ontology|schema|field name|event id|fact id|rule id|source authority|public description|plan receipt|render audit)\b|\b(?:eventId|factId|ruleId|sourceAuthorityIds|publicDescription|planReceipt|renderAudit)\b)/u;

const TRANSFERABLE_TECHNIQUE_IDS = new Set([
  "TT-01",
  "TT-02",
  "TT-03",
  "TT-04",
  "TT-05",
]);

const FORBIDDEN_CONSTRUCTION_IDS = new Set([
  "FC-01",
  "FC-02",
  "FC-03",
  "FC-04",
  "FC-05",
  "FC-06",
  "FC-07",
  "FC-08",
  "FC-09",
  "FC-10",
]);

const PRIVATE_FIELD_NAMES = [
  "forbiddenKnowledgeIds",
  "forbiddenInferenceRuleIds",
  "creatorOnlyReviewNoteIds",
] as const;

const asSet = (values: ReadonlyArray<string>): Set<string> => new Set(values);

const sortedUnique = (values: ReadonlyArray<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const normalizeWords = (text: string): string[] =>
  text
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9'\s-]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);

const containsVerbatimRun = (
  candidate: string,
  source: string,
  minimumWords = 8,
): boolean => {
  const candidateWords = normalizeWords(candidate);
  const sourceWords = normalizeWords(source);
  if (
    candidateWords.length > 0 &&
    candidateWords.join(" ") === sourceWords.join(" ")
  ) {
    return true;
  }
  if (
    candidateWords.length < minimumWords ||
    sourceWords.length < minimumWords
  ) {
    return false;
  }
  const candidateText = candidateWords.join(" ");
  for (let index = 0; index <= sourceWords.length - minimumWords; index += 1) {
    if (
      candidateText.includes(sourceWords.slice(index, index + minimumWords).join(" "))
    ) {
      return true;
    }
  }
  return false;
};

const countUnknown = (
  values: ReadonlyArray<string>,
  allowed: ReadonlySet<string>,
): number => values.filter((value) => !allowed.has(value)).length;

const countIntersection = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number => [...left].filter((value) => right.has(value)).length;

const duplicateCount = (values: ReadonlyArray<string>): number =>
  values.length - new Set(values).size;

const pushFinding = (
  findings: NarrationRuleFinding<NarrationPreflightRuleId>[],
  ruleId: NarrationPreflightRuleId,
  count: number,
  classification: NarrationValidationClassification = "deterministic",
  severity: NarrationFindingSeverity = "hard_fail",
): void => {
  if (count <= 0) return;
  const existing = findings.find(
    (finding) =>
      finding.ruleId === ruleId &&
      finding.classification === classification &&
      finding.severity === severity,
  );
  if (existing) {
    existing.count += count;
    return;
  }
  findings.push({ ruleId, classification, severity, count });
};

export const listCameraSafeFields = (
  request: ModelFacingNarrationRequest,
): CameraSafeField[] => [
  ...request.presentActors.map(({ entityId, renderDescriptor }) => ({
    fieldKey: `present_actor:${entityId}` as const,
    text: renderDescriptor,
  })),
  ...request.visibleFacts.map(({ factId, renderText }) => ({
    fieldKey: `visible_fact:${factId}` as const,
    text: renderText,
  })),
  ...request.resolvedEvents.map(({ eventId, observableText }) => ({
    fieldKey: `resolved_event:${eventId}` as const,
    text: observableText,
  })),
  ...request.authorizedAnchors.map(({ anchorId, renderDescriptor }) => ({
    fieldKey: `authorized_anchor:${anchorId}` as const,
    text: renderDescriptor,
  })),
];

const collectPublicIds = (request: ModelFacingNarrationRequest): Set<string> =>
  asSet([
    request.languageProfileId,
    request.referenceReceiptId,
    request.focalActorId,
    request.styleStateId,
    ...request.authorizedActionEventIds,
    ...request.authorizedReactionEventIds,
    ...request.authorizedChangeEventIds,
    ...request.reservedActionIds,
    ...request.presentActors.flatMap((actor) => [
      actor.entityId,
      ...actor.sourceFactIds,
    ]),
    ...request.visibleFacts.map((fact) => fact.factId),
    ...request.resolvedEvents.flatMap((event) => [
      event.eventId,
      ...event.sourceAuthorityIds,
    ]),
    ...request.authorizedAnchors.flatMap((anchor) => [
      anchor.anchorId,
      ...anchor.sourceFactIds,
    ]),
    ...request.licensedRenderingDetails.flatMap((license) => [
      license.licenseId,
      license.issuerAuthorityId,
      ...license.sourceAuthorityIds,
    ]),
    ...request.speechDisclosures.flatMap((disclosure) => [
      disclosure.eventId,
      disclosure.speakerId,
      ...disclosure.addresseeIds,
      ...disclosure.lineOfSightIds,
      ...disclosure.confirmedHearerIds,
      ...disclosure.deliveryCueLicenseIds,
    ]),
  ]);

const expectedModeRule = (
  sceneMode: ModelFacingNarrationRequest["sceneMode"],
): NarrationPreflightRuleId =>
  ({
    setup: "AC-MODE-01",
    turn: "AC-MODE-02",
    aftermath: "AC-MODE-03",
    transition: "AC-MODE-04",
    ending: "AC-MODE-05",
  } as const)[sceneMode];

export const runNarrationPreflight = ({
  inputEnvelope,
  scenePlan,
  preflightReceipt,
  styleProfile,
  authorityRegistry,
  cameraSafeProvenance,
  continuityProvenance,
  continuityOrigin,
  renderability,
}: NarrationPreflightInput): NarrationPreflightResult => {
  const findings: NarrationRuleFinding<NarrationPreflightRuleId>[] = [];
  const request = inputEnvelope.modelFacing;
  const receiptDialogueAuthorities = [
    preflightReceipt.dialogueAuthority,
    ...(preflightReceipt.additionalDialogueAuthorities ?? []),
  ];
  const resolvedEventIds = asSet(
    request.resolvedEvents.map(({ eventId }) => eventId),
  );
  const factIds = asSet([
    ...request.visibleFacts.map(({ factId }) => factId),
    ...request.presentActors.flatMap(({ sourceFactIds }) => sourceFactIds),
    ...request.authorizedAnchors.flatMap(({ sourceFactIds }) => sourceFactIds),
  ]);
  const licenseById = new Map(
    request.licensedRenderingDetails.map((license) => [license.licenseId, license]),
  );
  const registeredSpeechEventIds = asSet(
    authorityRegistry.typedSpeechEvents
      .filter(({ registeredKind }) => registeredKind === "speech")
      .map(({ eventId }) => eventId),
  );
  const typedSpeechEventIds = asSet(
    [...registeredSpeechEventIds].filter((eventId) =>
      resolvedEventIds.has(eventId),
    ),
  );
  const publicIds = collectPublicIds(request);
  const privateIds = asSet([
    ...inputEnvelope.privateValidation.forbiddenKnowledgeIds,
    ...inputEnvelope.privateValidation.forbiddenInferenceRuleIds,
    ...inputEnvelope.privateValidation.creatorOnlyReviewNoteIds,
  ]);

  const creatorAuthorityIds = asSet(authorityRegistry.creatorAuthorityIds);
  const runtimeAuthorityIds = asSet(
    authorityRegistry.deterministicRuntimeAuthorityIds,
  );
  const actorIds = asSet(request.presentActors.map(({ entityId }) => entityId));
  const baseAuthorityIds = asSet([
    ...factIds,
    ...resolvedEventIds,
    ...actorIds,
    ...request.authorizedAnchors.map(({ anchorId }) => anchorId),
    request.referenceReceiptId,
    request.languageProfileId,
    request.styleStateId,
    ...licenseById.keys(),
    ...creatorAuthorityIds,
    ...runtimeAuthorityIds,
  ]);

  pushFinding(
    findings,
    "AC-AUTH-02",
    duplicateCount(scenePlan.sentencePlans.map(({ sentencePlanId }) => sentencePlanId)) +
      duplicateCount(request.presentActors.map(({ entityId }) => entityId)) +
      duplicateCount(request.visibleFacts.map(({ factId }) => factId)) +
      duplicateCount(request.resolvedEvents.map(({ eventId }) => eventId)) +
      duplicateCount(request.authorizedAnchors.map(({ anchorId }) => anchorId)),
  );
  pushFinding(
    findings,
    "AC-LIC-02",
    duplicateCount(
      request.licensedRenderingDetails.map(({ licenseId }) => licenseId),
    ),
  );
  pushFinding(
    findings,
    "AC-DLG-01",
    duplicateCount(
      authorityRegistry.typedSpeechEvents.map(({ eventId }) => eventId),
    ) + duplicateCount(request.speechDisclosures.map(({ eventId }) => eventId)),
  );

  for (const disclosure of request.speechDisclosures) {
    pushFinding(
      findings,
      "AC-DLG-01",
      countUnknown([disclosure.eventId], typedSpeechEventIds) +
        Number(!actorIds.has(disclosure.speakerId)) +
        countUnknown(disclosure.addresseeIds, actorIds) +
        countUnknown(disclosure.lineOfSightIds, actorIds) +
        countUnknown(disclosure.confirmedHearerIds, actorIds) +
        countUnknown(
          disclosure.deliveryCueLicenseIds,
          new Set(licenseById.keys()),
        ),
    );
  }

  pushFinding(
    findings,
    "AC-AUTH-01",
    countUnknown(request.authorizedActionEventIds, resolvedEventIds) +
      countUnknown(request.authorizedReactionEventIds, resolvedEventIds) +
      countUnknown(request.authorizedChangeEventIds, resolvedEventIds),
  );
  pushFinding(
    findings,
    "AC-AUTH-02",
    request.resolvedEvents.reduce(
      (count, event) =>
        count + countUnknown(event.sourceAuthorityIds, baseAuthorityIds),
      0,
    ),
  );

  for (const plan of scenePlan.sentencePlans) {
    const unknownFacts = countUnknown(plan.sourceFactIds, factIds);
    const unknownEvents = countUnknown(plan.sourceEventIds, resolvedEventIds);
    const unknownSpeechEvents = countUnknown(
      plan.speechEventIds,
      typedSpeechEventIds,
    );
    const unknownLicenses = countUnknown(
      plan.licensedRenderingDetailIds,
      new Set(licenseById.keys()),
    );
    const hasAnySource =
      plan.sourceFactIds.length +
        plan.sourceEventIds.length +
        plan.speechEventIds.length +
        plan.licensedRenderingDetailIds.length >
      0;
    pushFinding(
      findings,
      "AC-AUTH-02",
      unknownFacts +
        unknownEvents +
        unknownSpeechEvents +
        unknownLicenses +
        (hasAnySource ? 0 : 1),
    );

    pushFinding(
      findings,
      "AC-AUTH-02",
      countUnknown(plan.plainFunctionSourceAuthorityIds, baseAuthorityIds) +
        countUnknown(plan.plainIntentSourceAuthorityIds, baseAuthorityIds) +
        Number(plan.actorId !== null && !actorIds.has(plan.actorId)) +
        Number(plan.speakerId !== null && !actorIds.has(plan.speakerId)),
    );

    const authorizedByRole =
      plan.role === "authorized_action"
        ? asSet(request.authorizedActionEventIds)
        : plan.role === "observable_reaction"
          ? asSet(request.authorizedReactionEventIds)
          : plan.role === "resolved_consequence"
            ? asSet(request.authorizedChangeEventIds)
            : undefined;
    if (authorizedByRole) {
      pushFinding(
        findings,
        "AC-AUTH-03",
        countUnknown(plan.sourceEventIds, authorizedByRole) +
          (plan.sourceEventIds.length === 0 ? 1 : 0),
      );
    }

    pushFinding(
      findings,
      "AC-LIC-01",
      countUnknown(
        plan.licensedRenderingDetailIds,
        new Set(licenseById.keys()),
      ),
    );

    if (plan.role === "licensed_dialogue") {
      const speechLicenseIds = plan.licensedRenderingDetailIds.filter(
        (licenseId) => licenseById.get(licenseId)?.category === "speech_act",
      );
      const invalidSpeechEventCount = countUnknown(
        plan.speechEventIds,
        typedSpeechEventIds,
      );
      const hasTypedAuthority =
        plan.speechEventIds.length > invalidSpeechEventCount ||
        speechLicenseIds.length > 0;
      const nonSpeechLicenseCount = plan.licensedRenderingDetailIds.length -
        speechLicenseIds.length;
      pushFinding(
        findings,
        "AC-DLG-01",
        invalidSpeechEventCount +
          nonSpeechLicenseCount +
          (hasTypedAuthority ? 0 : 1),
      );
    }
  }

  for (const license of request.licensedRenderingDetails) {
    const issuerRegistry =
      license.issuer === "creator" ? creatorAuthorityIds : runtimeAuthorityIds;
    pushFinding(
      findings,
      "AC-LIC-02",
      license.issuedBeforeGeneration &&
        license.contentBoundary.trim().length > 0 &&
        license.sourceAuthorityIds.length > 0
        ? 0
        : 1,
    );
    pushFinding(
      findings,
      "AC-LIC-03",
      issuerRegistry.has(license.issuerAuthorityId) ? 0 : 1,
    );
    pushFinding(
      findings,
      "AC-LIC-02",
      countUnknown(license.sourceAuthorityIds, baseAuthorityIds),
    );
  }

  const scenePlanIds = scenePlan.sentencePlans.flatMap((plan) => [
    plan.sentencePlanId,
    ...(plan.actorId === null ? [] : [plan.actorId]),
    ...(plan.speakerId === null ? [] : [plan.speakerId]),
    ...plan.sourceFactIds,
    ...plan.sourceEventIds,
    ...plan.speechEventIds,
    ...plan.licensedRenderingDetailIds,
    ...plan.plainFunctionSourceAuthorityIds,
    ...plan.plainIntentSourceAuthorityIds,
  ]);
  const receiptIds = [
    preflightReceipt.preflightId,
    ...preflightReceipt.sceneAuthority.factIds,
    ...preflightReceipt.sceneAuthority.eventIds,
    ...preflightReceipt.sceneAuthority.actorEntityIds,
    ...preflightReceipt.sceneAuthority.licensedRenderingDetailIds,
    ...preflightReceipt.sceneAuthority.licensedRenderingDetails.flatMap(
      (license) => [
        license.licenseId,
        license.issuerAuthorityId,
        ...license.sourceAuthorityIds,
      ],
    ),
    preflightReceipt.referenceReceipt.referenceId,
    ...preflightReceipt.referenceReceipt.transferableTechniqueIds,
    ...preflightReceipt.referenceReceipt.sceneApplicability.map(
      ({ techniqueId }) => techniqueId,
    ),
    ...preflightReceipt.referenceReceipt.excludedGimmicks,
    preflightReceipt.plainDramaticPlan.focalActorId,
    ...preflightReceipt.plainDramaticPlan.actionSourceEventIds,
    ...preflightReceipt.plainDramaticPlan.reactionSourceEventIds,
    ...preflightReceipt.plainDramaticPlan.changeSourceEventIds,
    ...(preflightReceipt.plainDramaticPlan.immediateWant?.sourceAuthorityIds ?? []),
    ...(preflightReceipt.plainDramaticPlan.immediateObstacle?.sourceAuthorityIds ?? []),
    ...(preflightReceipt.plainDramaticPlan.changeInPlainTerms?.sourceAuthorityIds ?? []),
    ...receiptDialogueAuthorities.flatMap((authority) => [
      ...(authority.speakerId === null ? [] : [authority.speakerId]),
      ...authority.speechEventIds,
      ...authority.speechActLicenseIds,
      ...authority.authorizedContentIds,
      ...authority.plainIntentSourceAuthorityIds,
    ]),
  ];
  const allPublicIds = asSet([...publicIds, ...scenePlanIds, ...receiptIds]);
  pushFinding(
    findings,
    "AC-PRIV-01",
    countIntersection(allPublicIds, privateIds) +
      PRIVATE_FIELD_NAMES.filter((fieldName) =>
        Object.prototype.hasOwnProperty.call(request, fieldName),
      ).length,
  );

  const expectedCameraSafeFields = listCameraSafeFields(request);
  const provenanceByKey = new Map(
    cameraSafeProvenance.map((entry) => [entry.fieldKey, entry]),
  );
  const duplicateProvenanceCount =
    cameraSafeProvenance.length - provenanceByKey.size;
  const expectedCameraFieldKeys = asSet(
    expectedCameraSafeFields.map(({ fieldKey }) => fieldKey),
  );
  const extraProvenanceCount = cameraSafeProvenance.filter(
    ({ fieldKey }) => !expectedCameraFieldKeys.has(fieldKey),
  ).length;
  pushFinding(
    findings,
    "AC-DATA-01",
    duplicateProvenanceCount + extraProvenanceCount,
  );
  for (const field of expectedCameraSafeFields) {
    const provenance = provenanceByKey.get(field.fieldKey);
    const registry =
      provenance?.authoredBy === "creator"
        ? creatorAuthorityIds
        : runtimeAuthorityIds;
    const provenanceValid =
      provenance !== undefined &&
      provenance.text === field.text &&
      registry.has(provenance.authorityId);
    const copiedFromRaw =
      provenance?.rawSourceTexts.some((source) =>
        containsVerbatimRun(field.text, source),
      ) ?? false;
    pushFinding(
      findings,
      "AC-DATA-01",
      (provenanceValid ? 0 : 1) + (copiedFromRaw ? 1 : 0),
    );
    pushFinding(
      findings,
      "AC-DATA-03",
      CAMERA_SAFE_ANALYTIC_PATTERN.test(field.text) ? 1 : 0,
    );
  }

  pushFinding(
    findings,
    "AC-FID-02",
    continuityProvenance === undefined
      ? 1
      : Number(continuityProvenance.source !== "registered_events") +
          Number(continuityProvenance.authority !== "deterministic_runtime") +
          Number(continuityProvenance.readerProseImported) +
          countUnknown(
            request.resolvedEvents.map(({ eventId }) => eventId),
            asSet(continuityProvenance.registeredEventIds),
          ) +
          countUnknown(continuityProvenance.registeredEventIds, resolvedEventIds),
  );
  if (continuityOrigin === "reader_prose") {
    pushFinding(findings, "AC-FID-02", 1);
  }

  const modeRule = expectedModeRule(request.sceneMode);
  const modeMismatchCount =
    Number(scenePlan.sceneMode !== request.sceneMode) +
    Number(preflightReceipt.sceneMode !== request.sceneMode);
  pushFinding(findings, modeRule, modeMismatchCount);

  const receipt = preflightReceipt;
  const planRoles = new Set(scenePlan.sentencePlans.map(({ role }) => role));
  const requiredRolesByMode: Record<
    ModelFacingNarrationRequest["sceneMode"],
    ReadonlyArray<(typeof scenePlan.sentencePlans)[number]["role"]>
  > = {
    setup: ["orientation", "in_world_stop"],
    turn: [
      "authorized_action",
      "observable_reaction",
      "resolved_consequence",
      "in_world_stop",
    ],
    aftermath: ["resolved_consequence", "in_world_stop"],
    transition: ["orientation", "in_world_stop"],
    ending: ["resolved_consequence", "in_world_stop"],
  };
  pushFinding(
    findings,
    modeRule,
    requiredRolesByMode[request.sceneMode].filter((role) => !planRoles.has(role))
      .length,
  );
  pushFinding(
    findings,
    "AC-AUTH-02",
    countUnknown(receipt.sceneAuthority.actorEntityIds, actorIds) +
      Number(!actorIds.has(receipt.plainDramaticPlan.focalActorId)) +
      countUnknown(receipt.plainDramaticPlan.actionSourceEventIds, resolvedEventIds) +
      countUnknown(receipt.plainDramaticPlan.reactionSourceEventIds, resolvedEventIds) +
      countUnknown(receipt.plainDramaticPlan.changeSourceEventIds, resolvedEventIds) +
      countUnknown(
        receipt.plainDramaticPlan.immediateWant?.sourceAuthorityIds ?? [],
        baseAuthorityIds,
      ) +
      countUnknown(
        receipt.plainDramaticPlan.immediateObstacle?.sourceAuthorityIds ?? [],
        baseAuthorityIds,
      ) +
      countUnknown(
        receipt.plainDramaticPlan.changeInPlainTerms?.sourceAuthorityIds ?? [],
        baseAuthorityIds,
      ),
  );

  const receiptAuthorityFactIds = asSet(receipt.sceneAuthority.factIds);
  const receiptAuthorityEventIds = asSet(receipt.sceneAuthority.eventIds);
  const receiptAuthorityLicenseIds = asSet(
    receipt.sceneAuthority.licensedRenderingDetailIds,
  );
  const receiptLicenseIds = asSet(
    receipt.sceneAuthority.licensedRenderingDetails.map(({ licenseId }) =>
      licenseId,
    ),
  );
  const embeddedLicenseMismatchCount =
    countUnknown([...receiptAuthorityLicenseIds], receiptLicenseIds) +
    countUnknown([...receiptLicenseIds], receiptAuthorityLicenseIds) +
    receipt.sceneAuthority.licensedRenderingDetails.filter((receiptLicense) => {
      const inputLicense = licenseById.get(receiptLicense.licenseId);
      return (
        inputLicense === undefined ||
        JSON.stringify(inputLicense) !== JSON.stringify(receiptLicense)
      );
    }).length;
  pushFinding(
    findings,
    "AC-LIC-02",
    embeddedLicenseMismatchCount,
  );
  pushFinding(
    findings,
    "AC-LIC-02",
    receipt.sceneAuthority.licensedRenderingDetails.reduce(
      (count, license) =>
        count + countUnknown(license.sourceAuthorityIds, baseAuthorityIds),
      0,
    ),
  );
  if (request.sceneMode === "setup" || request.sceneMode === "transition") {
    pushFinding(
      findings,
      modeRule,
      scenePlan.sentencePlans.filter(({ changesState }) => changesState).length,
    );
  }
  if (request.sceneMode === "aftermath" || request.sceneMode === "ending") {
    pushFinding(
      findings,
      modeRule,
      scenePlan.sentencePlans.filter(({ role }) => role === "authorized_action")
        .length,
    );
  }

  pushFinding(
    findings,
    "AC-AUTH-02",
    countUnknown([...receiptAuthorityFactIds], factIds) +
      countUnknown([...receiptAuthorityEventIds], resolvedEventIds) +
      countUnknown([...receiptAuthorityLicenseIds], new Set(licenseById.keys())),
  );

  for (const dialogueAuthority of receiptDialogueAuthorities) {
    if (dialogueAuthority.mode !== "licensed") continue;
    const speechLicenseIds = dialogueAuthority.speechActLicenseIds.filter(
      (licenseId) => licenseById.get(licenseId)?.category === "speech_act",
    );
    const invalidSpeechEventCount = countUnknown(
      dialogueAuthority.speechEventIds,
      typedSpeechEventIds,
    );
    const hasTypedAuthority =
      dialogueAuthority.speechEventIds.length > invalidSpeechEventCount ||
      speechLicenseIds.length > 0;
    pushFinding(
      findings,
      "AC-DLG-01",
      invalidSpeechEventCount +
        (dialogueAuthority.speechActLicenseIds.length - speechLicenseIds.length) +
        (hasTypedAuthority ? 0 : 1),
    );
    pushFinding(
      findings,
      "AC-AUTH-02",
      Number(
        dialogueAuthority.speakerId !== null &&
          !actorIds.has(dialogueAuthority.speakerId),
      ) +
        countUnknown(dialogueAuthority.authorizedContentIds, baseAuthorityIds) +
        countUnknown(
          dialogueAuthority.plainIntentSourceAuthorityIds,
          baseAuthorityIds,
        ),
    );
  }

  pushFinding(
    findings,
    "AC-AUTH-03",
    countUnknown(
      receipt.plainDramaticPlan.actionSourceEventIds,
      asSet(request.authorizedActionEventIds),
    ) +
      countUnknown(
        receipt.plainDramaticPlan.reactionSourceEventIds,
        asSet(request.authorizedReactionEventIds),
      ) +
      countUnknown(
        receipt.plainDramaticPlan.changeSourceEventIds,
        asSet(request.authorizedChangeEventIds),
      ),
  );

  const selectedStyleState = styleProfile.styleStates.find(
    ({ stateId }) => stateId === request.styleStateId,
  );
  pushFinding(
    findings,
    "AC-LADDER-01",
    Number(styleProfile.profileId !== request.languageProfileId) +
      Number(selectedStyleState === undefined),
  );

  const approvedReferences = asSet(
    authorityRegistry.approvedReferenceReceiptIds,
  );
  const applicabilityTechniqueIds = asSet(
    receipt.referenceReceipt.sceneApplicability.map(({ techniqueId }) =>
      techniqueId,
    ),
  );
  const transferableTechniqueIds = asSet(
    receipt.referenceReceipt.transferableTechniqueIds,
  );
  pushFinding(
    findings,
    "AC-REF-01",
    Number(receipt.referenceReceipt.referenceId !== request.referenceReceiptId) +
      Number(receipt.referenceReceipt.status !== "available") +
      Number(!approvedReferences.has(request.referenceReceiptId)) +
      countUnknown(
        receipt.referenceReceipt.transferableTechniqueIds,
        applicabilityTechniqueIds,
      ) +
      countUnknown([...applicabilityTechniqueIds], transferableTechniqueIds) +
      countUnknown(
        receipt.referenceReceipt.transferableTechniqueIds,
        TRANSFERABLE_TECHNIQUE_IDS,
      ) +
      countUnknown([...applicabilityTechniqueIds], TRANSFERABLE_TECHNIQUE_IDS) +
      countUnknown(
        receipt.referenceReceipt.excludedGimmicks,
        FORBIDDEN_CONSTRUCTION_IDS,
      ),
  );

  const hardPass = !findings.some(({ severity }) => severity === "hard_fail");
  const renderabilityReasons: NarrationPreflightResult["renderabilityReasons"] = [
    ...(hardPass ? [] : (["hard_failure"] as const)),
    ...(receipt.referenceReceipt.status === "unavailable"
      ? (["reference_unavailable"] as const)
      : []),
    ...(renderability.renderFunctionAvailable
      ? []
      : (["render_function_unavailable"] as const)),
    ...(renderability.authoringInputsComplete
      ? []
      : (["authoring_inputs_incomplete"] as const)),
  ];
  const outcome: NarrationRenderabilityOutcome =
    !hardPass || receipt.referenceReceipt.status === "unavailable"
      ? "no_render"
      : !renderability.renderFunctionAvailable ||
          !renderability.authoringInputsComplete
        ? "needs_authoring"
        : "render";

  return {
    outcome,
    hardPass,
    findings: findings.sort((left, right) =>
      left.ruleId.localeCompare(right.ruleId),
    ),
    reservedParticipantActionIds: sortedUnique(request.reservedActionIds),
    renderabilityReasons,
  };
};

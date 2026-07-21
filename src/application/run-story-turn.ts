import { prepareCampaignTurn } from "@/src/application/campaign-turn";
import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { CampaignEventInput, CampaignLedger } from "@/src/contracts/campaign";
import type { SimulationSnapshot } from "@/src/contracts/simulation";
import {
  ResolutionEnvelopeSchema,
  StoryModelRequestSchema,
  StoryModelOutcomeSchema,
  StoryScenarioSchema,
  StorySceneDraftSchema,
  StorySceneSchema,
  StorySessionBootstrapSchema,
  StorySessionPayloadSchema,
  StorySessionSchema,
  StoryTurnRequestSchema,
  StoryTurnResultSchema,
  type ResolutionEnvelope,
  type SceneContract,
  type ScopedStoryKnowledge,
  type StoryChoice,
  type StoryModelOutcome,
  type StoryModelRequest,
  type StoryScenario,
  type StoryScene,
  type StorySession,
  type StorySessionBootstrap,
  type StoryTurnRequest,
  type StoryTurnResult,
} from "@/src/contracts/story";
import { sha256Canonical, sortedUniqueIds } from "@/src/domain/canonical-json";
import {
  buildCampaignEventAuthorityHash,
  createCampaignLedger,
  verifyParsedCampaignLedgerIntegrity,
} from "@/src/domain/campaign";
import {
  advanceStorySpine,
  bindFixtureResolutionToChoice,
  validateSceneResolutionContract,
  validateStoryResolution,
} from "@/src/domain/story-resolution";
import { validateReservedStoryActionSemantics } from "@/src/domain/story-action-boundary";
import {
  buildScopedStoryKnowledge,
  validateStoryDraftScope,
} from "@/src/domain/story-scope";
import type { WorldPack } from "@/src/domain/schemas";
import type { StoryModel } from "@/src/ports/story-model";

export class StoryTurnError extends Error {
  readonly code = "story_turn_invalid";
}

const fixtureTrace = (outputSha256: string) => ({
  mode: "fixture" as const,
  requestedModel: "fixture-story-v1",
  actualModel: null,
  responseId: null,
  inputTokens: null,
  outputTokens: null,
  outputSha256,
  processDiagnostics: null,
});

const sessionPayload = (session: StorySession) => {
  const { sessionHash, ...payload } = session;
  void sessionHash;
  return StorySessionPayloadSchema.parse(payload);
};

const buildStorySession = (
  payload: Parameters<typeof StorySessionPayloadSchema.parse>[0],
): StorySession => {
  const parsed = StorySessionPayloadSchema.parse(payload);
  return StorySessionSchema.parse({
    ...parsed,
    sessionHash: sha256Canonical(parsed),
  });
};

/**
 * A deterministic event-sourced story fingerprint, not a materialized
 * SimulationSnapshot hash. Array order is preserved so effect order remains
 * part of the registered narrative consequence.
 */
export const deriveStoryStateFingerprint = ({
  priorStoryStateHash,
  resolution,
}: {
  priorStoryStateHash: string;
  resolution: ResolutionEnvelope;
}): string =>
  sha256Canonical({
    schemaVersion: "story-state-fingerprint-v1",
    priorStoryStateHash,
    resolutionId: resolution.resolutionId,
    actionTypeId: resolution.actionTypeId,
    effects: resolution.effects,
  });

export const hasValidStorySession = (input: StorySession): boolean => {
  const parsed = StorySessionSchema.safeParse(input);
  if (!parsed.success || !verifyParsedCampaignLedgerIntegrity(parsed.data.ledger)) {
    return false;
  }
  const derivedStoryStateHash = parsed.data.scenes.reduce(
    (priorStoryStateHash, { resolution }) =>
      deriveStoryStateFingerprint({ priorStoryStateHash, resolution }),
    parsed.data.ledger.cursor.baseStateHash,
  );
  return (
    derivedStoryStateHash === parsed.data.storyStateHash &&
    sha256Canonical(sessionPayload(parsed.data)) === parsed.data.sessionHash
  );
};

const assertScenarioAuthorities = ({
  scenario,
  worldPack,
  overlay,
  snapshot,
}: {
  scenario: StoryScenario;
  worldPack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
}): void => {
  if (
    scenario.worldPackId !== worldPack.meta.id ||
    scenario.worldPackVersion !== worldPack.meta.version ||
    overlay.worldPackId !== worldPack.meta.id ||
    overlay.worldPackVersion !== worldPack.meta.version ||
    snapshot.worldPackVersion !== worldPack.meta.version ||
    scenario.baseCanonHash !== overlay.hash ||
    scenario.baseStateHash !== snapshot.stateHash
  ) {
    throw new StoryTurnError(
      "Story scenario, World Pack, overlay, and snapshot authorities differ.",
    );
  }
};

const eventSource = ({
  sceneNumber,
  choice,
}: {
  sceneNumber: number;
  choice: StoryChoice | null;
}): CampaignEventInput["source"] =>
  choice
    ? {
        kind: "player",
        actorEntityId: choice.actorEntityId,
        authorizingIntentId: choice.choiceId,
      }
    : {
        kind: "world",
        triggerId: `trigger.story.scene_${sceneNumber}`,
      };

const appendResolvedStoryEvent = ({
  scenario,
  ledger,
  resolution,
  contract,
  choice,
  traceId,
}: {
  scenario: StoryScenario;
  ledger: CampaignLedger;
  resolution: ResolutionEnvelope;
  contract: SceneContract;
  choice: StoryChoice | null;
  traceId: string;
}) => {
  const source = eventSource({ sceneNumber: contract.sceneNumber, choice });
  const event: CampaignEventInput = {
    id: `event.story.${contract.sceneNumber}.${resolution.resolutionId}`,
    baseCursorHash: ledger.cursor.cursorHash,
    worldTick: contract.sceneNumber,
    source,
    actionTypeId: resolution.actionTypeId,
    targetEntityIds: resolution.targetEntityIds,
    scope: "scene",
    visibility: { scope: "public", entityIds: [] },
    causeEntryHashes: ledger.cursor.headEntryHash ? [ledger.cursor.headEntryHash] : [],
    evidenceClaimIds: resolution.evidenceClaimIds,
    evidenceRuleIds: resolution.evidenceRuleIds,
    traceIds: [traceId],
    reversibility: "reversible",
    irreversibleRuling: null,
    effects: resolution.effects,
    beforeStateHash: ledger.cursor.currentStateHash,
    afterStateHash: ledger.cursor.currentStateHash,
    transitionReceiptHash: null,
  };
  const authorityHash = buildCampaignEventAuthorityHash(event);
  const viewerParticipantId = "participant.story.viewer";
  const prepared = prepareCampaignTurn({
    ledger,
    event,
    knownEntityIds: new Set(scenario.ontology.knownEntityIds),
    activeClaimIds: new Set(scenario.ontology.activeClaimIds),
    activeRuleIds: new Set(scenario.ontology.activeRuleIds),
    activeActionTypeIds: new Set(scenario.ontology.actionTypeIds),
    activeRelationAxisIds: new Set(scenario.ontology.relationAxisIds),
    activeResourceIds: new Set(scenario.ontology.resourceIds),
    activeFlagIds: new Set(scenario.ontology.flagIds),
    activeClockIds: new Set(scenario.ontology.clockIds),
    activeDebtKindIds: new Set(scenario.ontology.debtKindIds),
    authorizedIntentReceipts:
      source.kind === "player"
        ? new Map([[source.authorizingIntentId, authorityHash]])
        : new Map<string, string>(),
    activeTriggerReceipts:
      source.kind === "world"
        ? new Map([[source.triggerId, authorityHash]])
        : new Map<string, string>(),
    approvedRulingReceipts: new Map<string, string>(),
    transitionAuthority: null,
    focalEntityIds: [contract.focalCharacterId],
    viewer: { kind: "participant", participantId: viewerParticipantId },
    verifiedParticipantControl: new Map([
      [viewerParticipantId, new Set([contract.focalCharacterId])],
    ]),
  });
  if (prepared.status !== "applied") {
    throw new StoryTurnError(
      prepared.violations.map(({ code, message }) => `${code}: ${message}`).join(" "),
    );
  }
  return prepared;
};

const buildScene = ({
  sceneNumber,
  resolution,
  contract,
  draft: draftInput,
}: {
  sceneNumber: number;
  resolution: ResolutionEnvelope;
  contract: SceneContract;
  draft: unknown;
}): StoryScene => {
  const draft = StorySceneDraftSchema.parse(draftInput);
  const echoedEffectIds = sortedUniqueIds(
    draft.segments.flatMap(({ echoedEffectIds: ids }) => ids),
  );
  const payload = {
    sceneId: `scene.red_sail.${sceneNumber}.${sha256Canonical({
      resolutionId: resolution.resolutionId,
      choiceId: resolution.choiceId,
    }).slice(0, 12)}`,
    sceneNumber,
    resolution,
    contract,
    ...draft,
    echoedEffectIds,
  };
  return StorySceneSchema.parse({
    ...payload,
    sceneHash: sha256Canonical(payload),
  });
};

const sceneDraftOnly = (scene: StoryScene) =>
  StorySceneDraftSchema.parse({
    title: scene.title,
    prose: scene.prose,
    segments: scene.segments,
    suggestedContinuations: scene.suggestedContinuations,
    actionBoundary: scene.actionBoundary,
    centralQuestionClosed: scene.centralQuestionClosed,
    residualHook: scene.residualHook,
  });

const assertDraftAndEcho = ({
  worldPack,
  draft,
  scope,
  ledger,
  sceneNumber,
}: {
  worldPack: WorldPack;
  draft: ReturnType<typeof StorySceneDraftSchema.parse>;
  scope: ScopedStoryKnowledge;
  ledger: CampaignLedger;
  sceneNumber: number;
}): void => {
  const allEffects = new Set(
    ledger.entries.flatMap(({ effects }) => effects.map(({ effectId }) => effectId)),
  );
  const scopeViolations = validateStoryDraftScope({
    draft,
    scope,
    availableEchoEffectIds: allEffects,
    pack: worldPack,
  });
  if (scopeViolations.length > 0) {
    throw new StoryTurnError(scopeViolations.map(({ message }) => message).join(" "));
  }
  if (sceneNumber > 1) {
    const priorEffectIds = new Set(
      ledger.entries
        .filter(({ worldTick }) => worldTick < sceneNumber)
        .flatMap(({ effects }) => effects.map(({ effectId }) => effectId)),
    );
    const echoesPriorChoice = draft.segments.some(({ echoedEffectIds }) =>
      echoedEffectIds.some((effectId) => priorEffectIds.has(effectId)),
    );
    if (!echoesPriorChoice) {
      throw new StoryTurnError("Every scene after the opening must visibly echo a prior effect.");
    }
  }
};

export const createFixtureStorySession = ({
  scenario: scenarioInput,
  worldPack,
  overlay,
  snapshot,
}: {
  scenario: StoryScenario;
  worldPack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
}): StorySessionBootstrap => {
  const scenario = StoryScenarioSchema.parse(scenarioInput);
  assertScenarioAuthorities({ scenario, worldPack, overlay, snapshot });
  const emptyLedger = createCampaignLedger({
    campaignId: `campaign.${scenario.id}`,
    branchId: "branch.main",
    parentBranchId: null,
    forkedFromEntryHash: null,
    worldPackId: worldPack.meta.id,
    worldPackVersion: worldPack.meta.version,
    baseCanonHash: overlay.hash,
    baseStateHash: snapshot.stateHash,
  });
  const resolutionViolations = validateStoryResolution({
    scenario,
    resolution: scenario.opening.resolution,
  });
  const contractViolations = validateSceneResolutionContract({
    resolution: scenario.opening.resolution,
    contract: scenario.opening.contract,
    priorLedger: emptyLedger,
  });
  if (resolutionViolations.length > 0 || contractViolations.length > 0) {
    throw new StoryTurnError("The formal opening violates its scenario authority.");
  }
  const prepared = appendResolvedStoryEvent({
    scenario,
    ledger: emptyLedger,
    resolution: scenario.opening.resolution,
    contract: scenario.opening.contract,
    choice: null,
    traceId: "trace.story.fixture.opening",
  });
  const scope = buildScopedStoryKnowledge({
    pack: worldPack,
    overlay,
    snapshot,
    activeClaimIds: scenario.ontology.activeClaimIds,
    focalCharacterId: scenario.opening.contract.focalCharacterId,
    presentSpeakerIds: scenario.opening.contract.presentSpeakerIds,
  });
  assertDraftAndEcho({
    worldPack,
    draft: scenario.opening.draft,
    scope,
    ledger: prepared.ledger,
    sceneNumber: 1,
  });
  const opening = buildScene({
    sceneNumber: 1,
    resolution: scenario.opening.resolution,
    contract: scenario.opening.contract,
    draft: scenario.opening.draft,
  });
  const spine = advanceStorySpine({
    spine: scenario.spine,
    contract: scenario.opening.contract,
  });
  const session = buildStorySession({
    sessionId: `session.${sha256Canonical({
      scenarioId: scenario.id,
      canonHash: overlay.hash,
      stateHash: snapshot.stateHash,
    }).slice(0, 16)}`,
    scenarioId: scenario.id,
    worldPackId: scenario.worldPackId,
    worldPackVersion: scenario.worldPackVersion,
    focalEntityId: scenario.focalEntityId,
    currentSceneNumber: 1,
    status: "active",
    spine,
    characterDrives: scenario.characterDrives,
    styleProfile: scenario.styleProfile,
    storyStateHash: deriveStoryStateFingerprint({
      priorStoryStateHash: snapshot.stateHash,
      resolution: scenario.opening.resolution,
    }),
    ledger: prepared.ledger,
    scenes: [opening],
    selectedChoiceIds: [],
    choiceHistory: [],
  });
  return StorySessionBootstrapSchema.parse({
    scenario: {
      id: scenario.id,
      title: scenario.title,
      dramaticQuestion: scenario.spine.dramaticQuestion,
      maximumSceneCount: scenario.spine.maximumSceneCount,
    },
    session,
    opening,
    choices: opening.suggestedContinuations,
  });
};

const samePath = (left: string[], right: string[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const relevantFixtureTurn = ({
  scenario,
  session,
  choice,
}: {
  scenario: StoryScenario;
  session: StorySession;
  choice: StoryChoice;
}) => {
  const sceneNumber = session.currentSceneNumber + 1;
  const visibleChoices = session.scenes.at(-1)?.suggestedContinuations ?? [];
  const registeredChoice = visibleChoices.find(
    ({ choiceId }) => choiceId === choice.choiceId,
  );
  const isRegisteredChoice =
    choice.source === "suggested" &&
    registeredChoice !== undefined &&
    sha256Canonical(choice) === sha256Canonical(registeredChoice);
  if (!isRegisteredChoice) {
    throw new StoryTurnError(
      "The submitted choice has no exact registered story branch.",
    );
  }
  const pathTurns = scenario.fixtureTurns.filter(
    (turn) =>
      turn.sceneNumber === sceneNumber &&
      samePath(turn.priorChoiceIds, session.selectedChoiceIds),
  );
  const exact = pathTurns.find((turn) =>
    turn.acceptedChoiceIds.includes(registeredChoice.choiceId),
  );
  if (!exact) {
    throw new StoryTurnError(
      "The submitted choice has no exact registered story branch.",
    );
  }
  return { turn: exact };
};

const bindDraftToChoice = ({
  draft,
  choice,
}: {
  draft: ReturnType<typeof StorySceneDraftSchema.parse>;
  choice: StoryChoice;
}) =>
  StorySceneDraftSchema.parse({
    ...draft,
    actionBoundary: {
      ...draft.actionBoundary,
      performedAction: {
        choiceId: choice.choiceId,
        actionTypeId: choice.actionTypeId,
        actorEntityId: choice.actorEntityId,
      },
    },
  });

const assertReservedNextActionSemantics = ({
  prose,
  boundary,
}: {
  prose: string;
  boundary: SceneContract["actionBoundary"];
}): void => {
  const semanticViolations = validateReservedStoryActionSemantics({
    prose,
    boundary,
  });
  if (semanticViolations.length > 0) {
    throw new StoryTurnError(
      `The scene prose violates reserved next-action authority: ${semanticViolations
        .map(({ code, actionTypeId }) => `${code}:${actionTypeId}`)
        .join(", ")}.`,
    );
  }
};

const assertSceneActionBoundary = ({
  resolution,
  contract,
  draft,
  choice,
}: {
  resolution: ResolutionEnvelope;
  contract: SceneContract;
  draft: ReturnType<typeof StorySceneDraftSchema.parse>;
  choice: StoryChoice;
}): void => {
  const expectedPerformed = {
    choiceId: choice.choiceId,
    actionTypeId: choice.actionTypeId,
    actorEntityId: choice.actorEntityId,
  };
  if (
    resolution.choiceId !== choice.choiceId ||
    resolution.actionTypeId !== choice.actionTypeId ||
    sha256Canonical(contract.actionBoundary.performedAction) !==
      sha256Canonical(expectedPerformed) ||
    sha256Canonical(draft.actionBoundary) !==
      sha256Canonical(contract.actionBoundary)
  ) {
    throw new StoryTurnError(
      "The scene performed action or actor differs from the selected choice authority.",
    );
  }
  assertReservedNextActionSemantics({
    prose: draft.prose,
    boundary: draft.actionBoundary,
  });
};

export const buildStoryModelRequest = ({
  scenario,
  session,
  choice,
  resolution,
  contract,
  knowledgeScope,
  causalContext,
  allowedNextChoices,
  failedReason,
}: {
  scenario: StoryScenario;
  session: StorySession;
  choice: StoryChoice;
  resolution: ResolutionEnvelope;
  contract: SceneContract;
  knowledgeScope: ScopedStoryKnowledge;
  causalContext: string;
  allowedNextChoices: StoryChoice[];
  failedReason: string | null;
}): StoryModelRequest =>
  StoryModelRequestSchema.parse({
    scenarioId: scenario.id,
    sceneNumber: contract.sceneNumber,
    outputLocale: "en",
    spine: session.spine,
    characterDrives: session.characterDrives,
    styleProfile: session.styleProfile,
    acceptedChoice: choice,
    allowedNextChoices,
    choiceHistory: session.choiceHistory,
    resolution,
    resolutionInterpretation: {
      attemptedIntent: choice.intent,
      interpretation: resolution.summary,
      failedReason,
      progress: resolution.summary,
      cost:
        resolution.outcome === "success"
          ? "No additional cost was registered."
          : resolution.outcome.replaceAll("_", " "),
    },
    sceneContract: contract,
    knowledgeScope,
    causalContext,
    previousScene: session.scenes.at(-1)
      ? sceneDraftOnly(session.scenes.at(-1)!)
      : null,
  });

export const runFixtureStoryTurn = ({
  scenario: scenarioInput,
  worldPack,
  overlay,
  snapshot,
  request: requestInput,
}: {
  scenario: StoryScenario;
  worldPack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  request: StoryTurnRequest;
}): StoryTurnResult => {
  const scenario = StoryScenarioSchema.parse(scenarioInput);
  const request = StoryTurnRequestSchema.parse(requestInput);
  assertScenarioAuthorities({ scenario, worldPack, overlay, snapshot });
  if (!hasValidStorySession(request.session)) {
    throw new StoryTurnError("Story session hash or causal ledger integrity failed.");
  }
  if (
    request.session.scenarioId !== scenario.id ||
    request.session.status !== "active" ||
    request.session.currentSceneNumber >= scenario.spine.maximumSceneCount ||
    request.session.ledger.cursor.baseCanonHash !== overlay.hash ||
    request.session.ledger.cursor.baseStateHash !== snapshot.stateHash
  ) {
    throw new StoryTurnError("The story session is closed or targets another scenario.");
  }

  const selected = relevantFixtureTurn({
    scenario,
    session: request.session,
    choice: request.choice,
  });
  const baseResolution = bindFixtureResolutionToChoice(
    selected.turn.resolution,
    request.choice,
  );
  const resolution = ResolutionEnvelopeSchema.parse({
    ...baseResolution,
    actionTypeId: request.choice.actionTypeId,
  });
  const contract = selected.turn.contract;
  const resolutionViolations = validateStoryResolution({ scenario, resolution });
  const contractViolations = validateSceneResolutionContract({
    resolution,
    contract,
    priorLedger: request.session.ledger,
  });
  if (resolutionViolations.length > 0 || contractViolations.length > 0) {
    throw new StoryTurnError(
      [...resolutionViolations, ...contractViolations]
        .map(({ message }) => message)
        .join(" "),
    );
  }
  const prepared = appendResolvedStoryEvent({
    scenario,
    ledger: request.session.ledger,
    resolution,
    contract,
    choice: request.choice,
    traceId: `trace.story.fixture.${selected.turn.sceneNumber}.${sha256Canonical({
      resolutionId: resolution.resolutionId,
      choiceId: request.choice.choiceId,
    }).slice(0, 12)}`,
  });
  const scope = buildScopedStoryKnowledge({
    pack: worldPack,
    overlay,
    snapshot,
    activeClaimIds: scenario.ontology.activeClaimIds,
    focalCharacterId: contract.focalCharacterId,
    presentSpeakerIds: contract.presentSpeakerIds,
  });
  const draft = bindDraftToChoice({
    draft: selected.turn.draft,
    choice: request.choice,
  });
  assertSceneActionBoundary({
    resolution,
    contract,
    draft,
    choice: request.choice,
  });
  assertDraftAndEcho({
    worldPack,
    draft,
    scope,
    ledger: prepared.ledger,
    sceneNumber: selected.turn.sceneNumber,
  });
  const scene = buildScene({
    sceneNumber: selected.turn.sceneNumber,
    resolution,
    contract,
    draft,
  });
  const spine = advanceStorySpine({
    spine: request.session.spine,
    contract,
  });
  const terminal =
    selected.turn.sceneNumber === spine.maximumSceneCount &&
    contract.closedThreadIds.includes("thread.red_sail_question") &&
    !spine.mustPayOffObligations.some(({ status }) => status === "open");
  const choiceHistory = [
    ...request.session.choiceHistory,
    {
      choiceId: request.choice.choiceId,
      actorEntityId: request.choice.actorEntityId,
      intent: request.choice.intent,
      interpretation: resolution.summary,
      source: request.choice.source,
      ...(request.choice.proposalAssessment
        ? { proposalAssessment: request.choice.proposalAssessment }
        : {}),
      sceneNumber: selected.turn.sceneNumber,
      resolutionId: resolution.resolutionId,
    },
  ];
  const session = buildStorySession({
    ...sessionPayload(request.session),
    currentSceneNumber: selected.turn.sceneNumber,
    status: terminal ? "completed" : "active",
    spine,
    storyStateHash: deriveStoryStateFingerprint({
      priorStoryStateHash: request.session.storyStateHash,
      resolution,
    }),
    ledger: prepared.ledger,
    scenes: [...request.session.scenes, scene],
    selectedChoiceIds: [
      ...request.session.selectedChoiceIds,
      request.choice.choiceId,
    ],
    choiceHistory,
  });
  return StoryTurnResultSchema.parse({
    status: terminal ? "completed" : "advanced",
    session,
    scene,
    resolution,
    whatChanged: resolution.effects,
    causalContext: prepared.nextNarrativeContext,
    knowledgeScope: scope,
    trace: fixtureTrace(scene.sceneHash),
  });
};

/**
 * Runs a live writer through the same bounded branch, causal ledger, scope, and
 * session commit gates as the deterministic fixture. The prepared ledger is
 * provisional until the model draft passes every post-generation check.
 */
export const runStoryTurn = async ({
  scenario: scenarioInput,
  worldPack,
  overlay,
  snapshot,
  request: requestInput,
  model,
  transport,
}: {
  scenario: StoryScenario;
  worldPack: WorldPack;
  overlay: CanonOverlay;
  snapshot: SimulationSnapshot;
  request: StoryTurnRequest;
  model: StoryModel;
  transport: "codex_cli" | "responses_api";
}): Promise<StoryTurnResult> => {
  const scenario = StoryScenarioSchema.parse(scenarioInput);
  const request = StoryTurnRequestSchema.parse(requestInput);
  assertScenarioAuthorities({ scenario, worldPack, overlay, snapshot });
  if (!hasValidStorySession(request.session)) {
    throw new StoryTurnError("Story session hash or causal ledger integrity failed.");
  }
  if (
    request.session.scenarioId !== scenario.id ||
    request.session.status !== "active" ||
    request.session.currentSceneNumber >= scenario.spine.maximumSceneCount ||
    request.session.ledger.cursor.baseCanonHash !== overlay.hash ||
    request.session.ledger.cursor.baseStateHash !== snapshot.stateHash
  ) {
    throw new StoryTurnError("The story session is closed or targets another authority.");
  }

  const selected = relevantFixtureTurn({
    scenario,
    session: request.session,
    choice: request.choice,
  });
  const baseResolution = bindFixtureResolutionToChoice(
    selected.turn.resolution,
    request.choice,
  );
  const resolution = ResolutionEnvelopeSchema.parse({
    ...baseResolution,
    actionTypeId: request.choice.actionTypeId,
  });
  const contract = selected.turn.contract;
  const resolutionViolations = validateStoryResolution({ scenario, resolution });
  const contractViolations = validateSceneResolutionContract({
    resolution,
    contract,
    priorLedger: request.session.ledger,
  });
  if (resolutionViolations.length > 0 || contractViolations.length > 0) {
    throw new StoryTurnError(
      [...resolutionViolations, ...contractViolations]
        .map(({ message }) => message)
        .join(" "),
    );
  }

  const eventTraceId = `trace.story.${transport}.${selected.turn.sceneNumber}.${sha256Canonical({
    resolutionId: resolution.resolutionId,
    choiceId: request.choice.choiceId,
  }).slice(0, 12)}`;
  const prepared = appendResolvedStoryEvent({
    scenario,
    ledger: request.session.ledger,
    resolution,
    contract,
    choice: request.choice,
    traceId: eventTraceId,
  });
  const scope = buildScopedStoryKnowledge({
    pack: worldPack,
    overlay,
    snapshot,
    activeClaimIds: scenario.ontology.activeClaimIds,
    focalCharacterId: contract.focalCharacterId,
    presentSpeakerIds: contract.presentSpeakerIds,
  });
  const allowedNextChoices = selected.turn.draft.suggestedContinuations;
  const modelRequest = buildStoryModelRequest({
    scenario,
    session: request.session,
    choice: request.choice,
    resolution,
    contract,
    knowledgeScope: scope,
    causalContext: prepared.nextNarrativeContext,
    allowedNextChoices,
    failedReason: null,
  });
  let outcome: StoryModelOutcome;
  try {
    outcome = StoryModelOutcomeSchema.parse(await model.generate(modelRequest));
  } catch {
    throw new StoryTurnError(
      `The ${transport} story model returned output outside the strict story schema.`,
    );
  }
  if (outcome.outcome !== "completed") {
    throw new StoryTurnError(
      `The ${transport} story model did not produce a committable scene: ${outcome.error.code}.`,
    );
  }
  if (outcome.trace.mode !== transport) {
    throw new StoryTurnError(
      `Story trace mode ${outcome.trace.mode} does not match requested transport ${transport}.`,
    );
  }

  const draft = StorySceneDraftSchema.parse(outcome.draft);
  if (
    sha256Canonical(draft.suggestedContinuations) !==
    sha256Canonical(allowedNextChoices)
  ) {
    throw new StoryTurnError(
      "The live writer returned continuation choices outside the registered branch authority.",
    );
  }
  assertSceneActionBoundary({
    resolution,
    contract,
    draft,
    choice: request.choice,
  });
  const spine = advanceStorySpine({
    spine: request.session.spine,
    contract,
  });
  const terminal =
    selected.turn.sceneNumber === spine.maximumSceneCount &&
    contract.closedThreadIds.includes("thread.red_sail_question") &&
    !spine.mustPayOffObligations.some(({ status }) => status === "open");
  if (draft.centralQuestionClosed !== terminal) {
    throw new StoryTurnError(
      "The live scene's closure claim does not match the registered story contract.",
    );
  }
  assertDraftAndEcho({
    worldPack,
    draft,
    scope,
    ledger: prepared.ledger,
    sceneNumber: selected.turn.sceneNumber,
  });

  const scene = buildScene({
    sceneNumber: selected.turn.sceneNumber,
    resolution,
    contract,
    draft,
  });
  const choiceHistory = [
    ...request.session.choiceHistory,
    {
      choiceId: request.choice.choiceId,
      actorEntityId: request.choice.actorEntityId,
      intent: request.choice.intent,
      interpretation: resolution.summary,
      source: request.choice.source,
      ...(request.choice.proposalAssessment
        ? { proposalAssessment: request.choice.proposalAssessment }
        : {}),
      sceneNumber: selected.turn.sceneNumber,
      resolutionId: resolution.resolutionId,
    },
  ];
  const session = buildStorySession({
    ...sessionPayload(request.session),
    currentSceneNumber: selected.turn.sceneNumber,
    status: terminal ? "completed" : "active",
    spine,
    storyStateHash: deriveStoryStateFingerprint({
      priorStoryStateHash: request.session.storyStateHash,
      resolution,
    }),
    ledger: prepared.ledger,
    scenes: [...request.session.scenes, scene],
    selectedChoiceIds: [
      ...request.session.selectedChoiceIds,
      request.choice.choiceId,
    ],
    choiceHistory,
  });
  return StoryTurnResultSchema.parse({
    status: terminal ? "completed" : "advanced",
    session,
    scene,
    resolution,
    whatChanged: resolution.effects,
    causalContext: prepared.nextNarrativeContext,
    knowledgeScope: scope,
    trace: outcome.trace,
  });
};

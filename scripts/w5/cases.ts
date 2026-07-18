import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import {
  buildWorldNarrationPipelineArtifacts,
  type WorldNarrationPipelineArtifacts,
} from "@/src/application/world-simulation-service";
import {
  NarrationRendererRequestSchema,
  PenelopeEnglishStyleProfileSchema,
  type NarrationRendererRequest,
  type PenelopeEnglishStyleProfile,
} from "@/src/contracts/world-narrator";
import type { WorldSimulationScenario } from "@/src/contracts/world-simulation";
import type {
  WorldSimulationSession,
  WorldTurnReceipt,
} from "@/src/contracts/world-runtime";
import {
  canonicalJson,
  sha256Canonical,
} from "@/src/domain/canonical-json";
import {
  createWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";
import {
  W5CaseDefinitionSchema,
  W5CommonSceneAuthorityProjectionSchema,
  W5CommonSceneAuthoritySchema,
  type W5CaseDefinition,
  type W5CommonSceneAuthority,
  type W5PreparedCaseRun,
  type W5PreparedTurn,
} from "@/scripts/w5/contracts";

export const W5_CASE_DEFINITIONS = [
  {
    caseId: "case.normal_observation",
    publicLabel: "Normal observation",
    purpose:
      "Measure the ordinary scar-recognition turn before the contained canonical ending.",
    inputSequence: ["bring the basin", "observe"],
    targetTurn: 1,
    targetDisposition: "prose_ab",
    expectedActionStatuses: ["accepted", "accepted"],
    expectedEndingId: "ending.canon_contained",
  },
  {
    caseId: "case.controlled_discovery",
    publicLabel: "Risky but rational discovery",
    purpose:
      "Measure the creator-approved private confirmation after Penelope earns the risky branch.",
    inputSequence: ["bring the basin", "confront the stranger"],
    targetTurn: 2,
    targetDisposition: "prose_ab",
    expectedActionStatuses: ["accepted", "accepted"],
    expectedEndingId: "ending.controlled_discovery",
  },
  {
    caseId: "case.absurd_no_render",
    publicLabel: "Absurd unsupported command",
    purpose:
      "Prove that an impossible command advances time without gain, prose generation, or loss of the recoverable ending.",
    inputSequence: [
      "Command Zeus to erase every suitor from the palace now.",
      "bring the basin",
    ],
    targetTurn: 1,
    targetDisposition: "structural_no_render",
    expectedActionStatuses: ["unsupported", "accepted"],
    expectedEndingId: "ending.canon_contained",
  },
] as const satisfies readonly W5CaseDefinition[];

for (const definition of W5_CASE_DEFINITIONS) {
  W5CaseDefinitionSchema.parse(definition);
}

const DEFAULT_W5_STYLE_PROFILE = PenelopeEnglishStyleProfileSchema.parse(
  styleProfileJson,
);

const rendererRequestFromArtifacts = (
  artifacts: WorldNarrationPipelineArtifacts,
): NarrationRendererRequest =>
  NarrationRendererRequestSchema.parse({
    modelFacingRequest: artifacts.inputEnvelope.modelFacing,
    scenePlan: artifacts.scenePlan,
    preflightReceipt: artifacts.preflightReceipt,
    styleProfile: artifacts.styleProfile,
  });

const buildPreparedTurn = ({
  scenario,
  beforeSession,
  participantInput,
  turn,
  styleProfile,
}: {
  scenario: WorldSimulationScenario;
  beforeSession: WorldSimulationSession;
  participantInput: string;
  turn: 1 | 2;
  styleProfile: PenelopeEnglishStyleProfile;
}): W5PreparedTurn => {
  const result = runWorldSimulationTurn({
    scenario,
    session: beforeSession,
    input: participantInput,
  });
  if (result.receipt.action.status === "unsupported") {
    return {
      disposition: "no_render",
      turn,
      participantInput,
      beforeSession,
      session: result.session,
      receipt: result.receipt,
      artifacts: null,
      rendererRequest: null,
      reason: "unsupported_action",
      expectedRendererCallCount: 0,
      expectedCriticCallCount: 0,
    };
  }
  const artifacts = buildWorldNarrationPipelineArtifacts({
    scenario,
    session: result.session,
    receipt: result.receipt,
    styleProfile,
  });
  return {
    disposition: "render",
    turn,
    participantInput,
    beforeSession,
    session: result.session,
    receipt: result.receipt,
    artifacts,
    rendererRequest: rendererRequestFromArtifacts(artifacts),
  };
};

const assertExpectedRun = (run: W5PreparedCaseRun): void => {
  const statuses = run.turns.map(({ receipt }) => receipt.action.status);
  if (canonicalJson(statuses) !== canonicalJson(run.definition.expectedActionStatuses)) {
    throw new Error(
      `W5 case ${run.definition.caseId} action statuses drifted from preregistration.`,
    );
  }
  if (run.finalSession.state.endingId !== run.definition.expectedEndingId) {
    throw new Error(
      `W5 case ${run.definition.caseId} ending drifted from preregistration.`,
    );
  }
  const targetDisposition =
    run.target.disposition === "render" ? "prose_ab" : "structural_no_render";
  if (targetDisposition !== run.definition.targetDisposition) {
    throw new Error(
      `W5 case ${run.definition.caseId} target disposition drifted from preregistration.`,
    );
  }
};

const buildOneCase = ({
  definition,
  scenario,
  styleProfile,
}: {
  definition: W5CaseDefinition;
  scenario: WorldSimulationScenario;
  styleProfile: PenelopeEnglishStyleProfile;
}): W5PreparedCaseRun => {
  const initialSession = createWorldSimulationSession({ scenario });
  const setupArtifacts = buildWorldNarrationPipelineArtifacts({
    scenario,
    session: initialSession,
    receipt: null,
    styleProfile,
  });
  const first = buildPreparedTurn({
    scenario,
    beforeSession: initialSession,
    participantInput: definition.inputSequence[0]!,
    turn: 1,
    styleProfile,
  });
  const second = buildPreparedTurn({
    scenario,
    beforeSession: first.session,
    participantInput: definition.inputSequence[1]!,
    turn: 2,
    styleProfile,
  });
  const turns = [first, second] as const;
  const target = turns[definition.targetTurn - 1];
  if (!target) {
    throw new Error(`W5 case ${definition.caseId} has no registered target turn.`);
  }
  const run: W5PreparedCaseRun = {
    definition,
    initialSession,
    setupArtifacts,
    setupRendererRequest: rendererRequestFromArtifacts(setupArtifacts),
    turns,
    finalSession: second.session,
    target,
  };
  assertExpectedRun(run);
  return run;
};

export const buildW5CaseSessions = ({
  scenario = getOdysseyBook19WorldSimulation(),
  styleProfile = DEFAULT_W5_STYLE_PROFILE,
}: {
  scenario?: WorldSimulationScenario;
  styleProfile?: PenelopeEnglishStyleProfile;
} = {}): W5PreparedCaseRun[] =>
  W5_CASE_DEFINITIONS.map((definition) =>
    buildOneCase({
      definition: W5CaseDefinitionSchema.parse(definition),
      scenario: structuredClone(scenario),
      styleProfile: PenelopeEnglishStyleProfileSchema.parse(styleProfile),
    }),
  );

const runtimeEvents = (receipt: WorldTurnReceipt) =>
  receipt.events.map(({ eventId, actionId, summary, visibleToEntityIds }) => ({
    eventId,
    actionId,
    summary,
    visibleToEntityIds,
  }));

export const buildW5CommonSceneAuthority = (
  caseRun: W5PreparedCaseRun,
): W5CommonSceneAuthority => {
  const { target, definition } = caseRun;
  const rendererAuthority =
    target.disposition === "render"
      ? {
          sceneMode: target.rendererRequest.modelFacingRequest.sceneMode,
          focalActorId: target.rendererRequest.modelFacingRequest.focalActorId,
          presentActors: target.rendererRequest.modelFacingRequest.presentActors,
          visibleFacts: target.rendererRequest.modelFacingRequest.visibleFacts,
          resolvedEvents: target.rendererRequest.modelFacingRequest.resolvedEvents,
          authorizedActionEventIds:
            target.rendererRequest.modelFacingRequest.authorizedActionEventIds,
          authorizedReactionEventIds:
            target.rendererRequest.modelFacingRequest.authorizedReactionEventIds,
          authorizedChangeEventIds:
            target.rendererRequest.modelFacingRequest.authorizedChangeEventIds,
          licensedRenderingDetails:
            target.rendererRequest.modelFacingRequest.licensedRenderingDetails.map(
              ({ licenseId, category, contentBoundary, sourceAuthorityIds }) => ({
                licenseId,
                category,
                contentBoundary,
                sourceAuthorityIds,
              }),
            ),
          reservedActionIds:
            target.rendererRequest.modelFacingRequest.reservedActionIds,
          reservedActionSourceBindings:
            target.artifacts.reservedActionSourceBindings,
        }
      : null;
  const projection = W5CommonSceneAuthorityProjectionSchema.parse({
    schemaVersion: "w5.common_scene_authority.v1",
    caseId: definition.caseId,
    targetTurn: definition.targetTurn,
    targetDisposition: definition.targetDisposition,
    scenarioId: target.session.scenarioId,
    participantInput: target.participantInput,
    beforeStateHash: target.receipt.beforeStateHash,
    afterStateHash: target.receipt.afterStateHash,
    receiptHash: target.receipt.receiptHash,
    action: {
      status: target.receipt.action.status,
      normalizedInput: target.receipt.action.normalizedInput,
      actionId: target.receipt.action.actionId,
      actorEntityId: target.receipt.action.actorEntityId,
      targetEntityId: target.receipt.action.targetEntityId,
      targetZoneId: target.receipt.action.targetZoneId,
    },
    runtimeEvents: runtimeEvents(target.receipt),
    endingId: target.receipt.endingId,
    rendererAuthority,
  });
  return W5CommonSceneAuthoritySchema.parse({
    projection,
    commonAuthorityHash: sha256Canonical(projection),
  });
};

export const canonicalW5CommonSceneAuthority = (
  authority: W5CommonSceneAuthority,
): string => canonicalJson(W5CommonSceneAuthoritySchema.parse(authority).projection);

export const hasValidW5CommonSceneAuthorityHash = (
  authority: W5CommonSceneAuthority,
): boolean => {
  const parsed = W5CommonSceneAuthoritySchema.safeParse(authority);
  return (
    parsed.success &&
    sha256Canonical(parsed.data.projection) === parsed.data.commonAuthorityHash
  );
};

export const assertW5CommonSceneAuthorityParity = (
  left: W5CommonSceneAuthority,
  right: W5CommonSceneAuthority,
): void => {
  if (!hasValidW5CommonSceneAuthorityHash(left)) {
    throw new Error("Left W5 common authority hash is invalid.");
  }
  if (!hasValidW5CommonSceneAuthorityHash(right)) {
    throw new Error("Right W5 common authority hash is invalid.");
  }
  if (
    left.commonAuthorityHash !== right.commonAuthorityHash ||
    canonicalW5CommonSceneAuthority(left) !== canonicalW5CommonSceneAuthority(right)
  ) {
    throw new Error("W5 A/B common authority mismatch.");
  }
};

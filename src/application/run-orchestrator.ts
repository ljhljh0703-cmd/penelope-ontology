import type { ModelDraft } from "@/src/contracts/model-draft";
import type { NarrativeModelOutcome } from "@/src/contracts/model-outcome";
import {
  RunRequestSchema,
  RunResultSchema,
  type HardViolation,
  type RunRequest,
  type RunResult,
} from "@/src/contracts/run";
import type { WorldPack } from "@/src/domain/schemas";
import { WorldPackSchema } from "@/src/domain/schemas";
import { createCanonProposal, hasValidOverlayHash } from "@/src/domain/canon-overlay";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { buildGraphDescriptor } from "@/src/domain/graph-descriptor";
import { normalizeParticipantIntents } from "@/src/domain/participants";
import { activeRules, retrieveEvidence } from "@/src/domain/retrieval";
import {
  applySimulationAction,
  hasValidSnapshotHash,
} from "@/src/domain/simulation";
import { statusForViolations, validateDraft } from "@/src/domain/validation";
import type { NarrativeModel } from "@/src/ports/narrative-model";

export class RunInputError extends Error {
  readonly code = "run_input_invalid";
}

type OrchestratorDependencies = {
  worldPack: WorldPack;
  fixtureModel: NarrativeModel;
  liveModel: NarrativeModel;
};

const inputError = (message: string): never => {
  throw new RunInputError(message);
};

const validateAuthorities = (request: RunRequest, pack: WorldPack): void => {
  if (!hasValidOverlayHash(request.overlay)) inputError("Overlay hash verification failed.");
  if (!hasValidSnapshotHash(request.snapshot)) inputError("Snapshot hash verification failed.");
  if (
    request.overlay.worldPackId !== pack.meta.id ||
    request.overlay.worldPackVersion !== pack.meta.version ||
    request.snapshot.worldPackVersion !== pack.meta.version
  ) {
    inputError("Run authorities target a different World Pack version.");
  }
  if (
    request.snapshot.overlayId !== request.overlay.id ||
    request.snapshot.overlayVersion !== request.overlay.version ||
    request.snapshot.canonHash !== request.overlay.hash
  ) {
    inputError("Snapshot is not rebased onto the supplied creator canon overlay.");
  }
  if (
    request.styleProfileId !== request.snapshot.styleProfileId ||
    !pack.styleProfiles.some(({ id }) => id === request.styleProfileId)
  ) {
    inputError("Selected style profile does not match the fixed snapshot.");
  }
  const scenario = pack.simulationScenarios.find(
    ({ id }) => id === request.snapshot.scenarioId,
  );
  if (!scenario || scenario.baseStateId !== request.snapshot.baseStateId) {
    inputError("Snapshot scenario and fixed state are inconsistent.");
  }
};

const emptyAuditDraft = (request: RunRequest, pack: WorldPack): ModelDraft => ({
  styleProfileId: request.styleProfileId,
  narrative: "Model generation did not produce a draft.",
  mentionedEntityIds: [],
  appliedStyleConstraintIds:
    pack.styleProfiles.find(({ id }) => id === request.styleProfileId)?.constraints.map(
      ({ id }) => id,
    ) ?? [],
  usedClaimIds: [],
  utterances: [],
  actions: [],
  assertedClaims: [],
  unknowns: [],
  proposals: [],
});

const modelFailureStatus = (
  outcome: Exclude<NarrativeModelOutcome["outcome"], "completed">,
): RunResult["status"] => (outcome === "refused" ? "refused" : "error");

const extraActionViolations = (draft: ModelDraft): HardViolation[] =>
  draft.actions.length > 1
    ? [
        {
          code: "state_transition_invalid",
          message: "A run may propose at most one deterministic state transition.",
          evidenceIds: draft.actions.map(
            ({ variableId, from, to }) => `${variableId}.${from}.${to}`,
          ),
        },
      ]
    : [];

export const createRunOrchestrator = ({
  worldPack: worldPackInput,
  fixtureModel,
  liveModel,
}: OrchestratorDependencies) => {
  const worldPack = WorldPackSchema.parse(worldPackInput);

  return async (input: unknown): Promise<RunResult> => {
    const request = RunRequestSchema.parse(input);
    validateAuthorities(request, worldPack);
    const participants = normalizeParticipantIntents(request.participantIntents, worldPack);
    const evidence = retrieveEvidence({
      pack: worldPack,
      overlay: request.overlay,
      snapshot: request.snapshot,
      participantIntents: participants.intents,
      brief: request.brief,
    });
    const model = request.modelMode === "fixture" ? fixtureModel : liveModel;
    const modelOutcome = await model.generate(
      { ...request, participantIntents: participants.intents },
      evidence,
    );

    if (modelOutcome.outcome !== "completed") {
      const auditDraft = emptyAuditDraft(request, worldPack);
      const graph = buildGraphDescriptor({
        pack: worldPack,
        overlay: request.overlay,
        snapshot: request.snapshot,
        draft: auditDraft,
        characterViews: evidence.characterViews,
        violations: [],
        proposals: [],
      });
      return RunResultSchema.parse({
        status: modelFailureStatus(modelOutcome.outcome),
        runId: `run.${sha256Canonical({ request, trace: modelOutcome.trace }).slice(0, 20)}`,
        evidence,
        modelOutcome,
        hardViolations: [],
        proposals: [],
        graph,
        transitionCandidate: null,
        currentSnapshot: request.snapshot,
        proposedNextSnapshot: request.snapshot,
      });
    }

    const state = worldPack.states.find(({ id }) => id === request.snapshot.baseStateId);
    const scenario = worldPack.simulationScenarios.find(
      ({ id }) => id === request.snapshot.scenarioId,
    );
    const styleProfile = worldPack.styleProfiles.find(
      ({ id }) => id === request.styleProfileId,
    );
    const canonProfile = worldPack.canonProfiles.find(
      ({ id }) => id === request.snapshot.canonProfileId,
    );
    if (!state) throw new RunInputError("The referenced fixed state is missing.");
    if (!scenario) throw new RunInputError("The referenced scenario is missing.");
    if (!styleProfile) throw new RunInputError("The referenced style profile is missing.");
    if (!canonProfile) throw new RunInputError("The referenced canon profile is missing.");

    const proposals = modelOutcome.draft.proposals.map((proposal) =>
      createCanonProposal(proposal, request.overlay),
    );
    let hardViolations = [
      ...validateDraft(modelOutcome.draft, {
        pack: worldPack,
        overlay: request.overlay,
        state,
        scenario,
        snapshot: request.snapshot,
        styleProfile,
        participantIntents: participants.intents,
        characterViews: evidence.characterViews,
        activeLayerIds: new Set(canonProfile.activeLayerIds),
      }),
      ...extraActionViolations(modelOutcome.draft),
    ];

    const transitionCandidate =
      modelOutcome.draft.actions.length === 1 ? modelOutcome.draft.actions[0] : null;
    let proposedNextSnapshot = request.snapshot;
    if (transitionCandidate && statusForViolations(hardViolations) === "passed") {
      const preview = applySimulationAction({
        scenario,
        snapshot: request.snapshot,
        action: transitionCandidate,
        activeRuleIds: new Set(
          activeRules(worldPack, request.overlay, request.snapshot).map(({ id }) => id),
        ),
      });
      hardViolations = [...hardViolations, ...preview.violations];
      proposedNextSnapshot = preview.snapshot;
    }

    const status = statusForViolations(hardViolations);
    const graph = buildGraphDescriptor({
      pack: worldPack,
      overlay: request.overlay,
      snapshot: request.snapshot,
      draft: modelOutcome.draft,
      characterViews: evidence.characterViews,
      violations: hardViolations,
      proposals,
    });

    return RunResultSchema.parse({
      status,
      runId: `run.${sha256Canonical({ request, modelOutcome }).slice(0, 20)}`,
      evidence,
      modelOutcome,
      hardViolations,
      proposals,
      graph,
      transitionCandidate,
      currentSnapshot: request.snapshot,
      proposedNextSnapshot,
    });
  };
};

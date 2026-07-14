import type { CanonOverlay } from "@/src/contracts/canon-overlay";
import type { HardViolation } from "@/src/contracts/run";
import {
  SimulationSnapshotPayloadSchema,
  SimulationSnapshotSchema,
  type CandidateAction,
  type SimulationScenario,
  type SimulationSnapshot,
  type SimulationSnapshotPayload,
  type SimulationTransitionRecord,
} from "@/src/contracts/simulation";
import type { WorldPack } from "@/src/domain/schemas";
import { sha256Canonical, sortedUniqueIds } from "@/src/domain/canonical-json";

const normalizeSnapshotPayload = (
  payload: SimulationSnapshotPayload,
): SimulationSnapshotPayload => ({
  ...payload,
  presentEntityIds: sortedUniqueIds(payload.presentEntityIds),
  deceasedEntityIds: sortedUniqueIds(payload.deceasedEntityIds),
  variables: [...payload.variables].sort(({ id: left }, { id: right }) =>
    left.localeCompare(right),
  ),
});

export const buildSimulationSnapshot = (
  input: SimulationSnapshotPayload,
): SimulationSnapshot => {
  const payload = normalizeSnapshotPayload(SimulationSnapshotPayloadSchema.parse(input));
  return SimulationSnapshotSchema.parse({
    ...payload,
    stateHash: sha256Canonical(payload),
  });
};

export const snapshotPayload = (
  snapshot: SimulationSnapshot,
): SimulationSnapshotPayload => {
  const parsed = SimulationSnapshotSchema.parse(snapshot);
  return {
    scenarioId: parsed.scenarioId,
    turnIndex: parsed.turnIndex,
    canonProfileId: parsed.canonProfileId,
    styleProfileId: parsed.styleProfileId,
    baseStateId: parsed.baseStateId,
    worldPackVersion: parsed.worldPackVersion,
    overlayId: parsed.overlayId,
    overlayVersion: parsed.overlayVersion,
    canonHash: parsed.canonHash,
    presentEntityIds: parsed.presentEntityIds,
    deceasedEntityIds: parsed.deceasedEntityIds,
    variables: parsed.variables,
  };
};

export const hasValidSnapshotHash = (snapshot: SimulationSnapshot): boolean =>
  sha256Canonical(normalizeSnapshotPayload(snapshotPayload(snapshot))) === snapshot.stateHash;

export const createInitialSnapshot = (
  pack: WorldPack,
  overlay: CanonOverlay,
): SimulationSnapshot => {
  const scenario = pack.simulationScenarios.find(
    ({ id }) => id === pack.defaultSimulationScenarioId,
  );
  const state = pack.states.find(({ id }) => id === scenario?.baseStateId);
  if (!scenario || !state) {
    throw new Error("Default simulation scenario or base state is unavailable.");
  }
  if (overlay.worldPackId !== pack.meta.id || overlay.worldPackVersion !== pack.meta.version) {
    throw new Error("Overlay does not target the selected World Pack.");
  }

  return buildSimulationSnapshot({
    scenarioId: scenario.id,
    turnIndex: 0,
    canonProfileId: pack.defaultCanonProfileId,
    styleProfileId: pack.defaultStyleProfileId,
    baseStateId: state.id,
    worldPackVersion: pack.meta.version,
    overlayId: overlay.id,
    overlayVersion: overlay.version,
    canonHash: overlay.hash,
    presentEntityIds: state.presentEntityIds,
    deceasedEntityIds: state.deceasedEntityIds,
    variables: scenario.variables.map(({ id, initialValue }) => ({ id, value: initialValue })),
  });
};

export const rebaseSnapshot = (
  snapshot: SimulationSnapshot,
  overlay: CanonOverlay,
): SimulationSnapshot => {
  if (!hasValidSnapshotHash(snapshot)) {
    throw new Error("Cannot rebase a snapshot with an invalid state hash.");
  }
  if (snapshot.worldPackVersion !== overlay.worldPackVersion) {
    throw new Error("Cannot rebase across World Pack versions.");
  }

  return buildSimulationSnapshot({
    ...snapshotPayload(snapshot),
    overlayId: overlay.id,
    overlayVersion: overlay.version,
    canonHash: overlay.hash,
  });
};

const simulationViolation = (
  code: Extract<
    HardViolation["code"],
    | "overlay_mismatch"
    | "state_variable_invalid"
    | "state_transition_invalid"
    | "step_limit_exceeded"
    | "unapproved_expansion"
  >,
  message: string,
  evidenceIds: string[],
): HardViolation => ({ code, message, evidenceIds });

export type SimulationActionResult = {
  status: "applied" | "blocked";
  snapshot: SimulationSnapshot;
  transition: SimulationTransitionRecord;
  violations: HardViolation[];
};

export const applySimulationAction = ({
  scenario,
  snapshot,
  action,
  activeRuleIds,
}: {
  scenario: SimulationScenario;
  snapshot: SimulationSnapshot;
  action: CandidateAction;
  activeRuleIds: ReadonlySet<string>;
}): SimulationActionResult => {
  const violations: HardViolation[] = [];

  if (!hasValidSnapshotHash(snapshot)) {
    violations.push(
      simulationViolation(
        "overlay_mismatch",
        "The current snapshot hash is invalid.",
        [snapshot.stateHash],
      ),
    );
  }
  if (snapshot.scenarioId !== scenario.id) {
    violations.push(
      simulationViolation(
        "state_variable_invalid",
        `Snapshot scenario ${snapshot.scenarioId} does not match ${scenario.id}.`,
        [snapshot.scenarioId, scenario.id],
      ),
    );
  }
  if (snapshot.turnIndex >= scenario.maxSteps) {
    violations.push(
      simulationViolation(
        "step_limit_exceeded",
        `Scenario ${scenario.id} permits only ${scenario.maxSteps} steps.`,
        [scenario.id],
      ),
    );
  }

  const definition = scenario.variables.find(({ id }) => id === action.variableId);
  const current = snapshot.variables.find(({ id }) => id === action.variableId);
  if (!definition || !current) {
    violations.push(
      simulationViolation(
        "state_variable_invalid",
        `Unknown scenario variable ${action.variableId}.`,
        [action.variableId],
      ),
    );
  } else {
    if (current.value !== action.from) {
      violations.push(
        simulationViolation(
          "state_transition_invalid",
          `Variable ${action.variableId} is ${current.value}, not ${action.from}.`,
          [action.variableId, current.value, action.from],
        ),
      );
    }
    const allowed = definition.transitions.find(
      ({ from, to }) => from === action.from && to === action.to,
    );
    if (!allowed) {
      violations.push(
        simulationViolation(
          "state_transition_invalid",
          `Transition ${action.from} -> ${action.to} is not registered.`,
          [action.variableId, action.from, action.to],
        ),
      );
    } else {
      const missingRules = allowed.requiredRuleIds.filter(
        (ruleId) => !activeRuleIds.has(ruleId) || !action.evidenceRuleIds.includes(ruleId),
      );
      if (missingRules.length > 0) {
        violations.push(
          simulationViolation(
            "unapproved_expansion",
            `Transition requires approved rule evidence: ${missingRules.join(", ")}.`,
            missingRules,
          ),
        );
      }
    }
  }

  if (violations.length > 0) {
    return {
      status: "blocked",
      snapshot,
      transition: {
        status: "blocked",
        action,
        fromStateHash: snapshot.stateHash,
        toStateHash: snapshot.stateHash,
        toSnapshot: snapshot,
      },
      violations,
    };
  }

  const next = buildSimulationSnapshot({
    ...snapshotPayload(snapshot),
    turnIndex: snapshot.turnIndex + 1,
    variables: snapshot.variables.map((variable) =>
      variable.id === action.variableId ? { ...variable, value: action.to } : variable,
    ),
  });

  return {
    status: "applied",
    snapshot: next,
    transition: {
      status: "applied",
      action,
      fromStateHash: snapshot.stateHash,
      toStateHash: next.stateHash,
      toSnapshot: next,
    },
    violations: [],
  };
};

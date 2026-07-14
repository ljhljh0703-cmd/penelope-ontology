import {
  loadDemoBundle,
  loadDraftFixture,
  loadOverlayFixture,
  loadSnapshotFixture,
} from "@/src/adapters/filesystem/demo-data";
import { fixtureNarrativeModel } from "@/src/adapters/fixtures/narrative-model";
import { createRunOrchestrator } from "@/src/application/run-orchestrator";
import { runFrozenReplay } from "@/src/application/replay-runner";
import type { NarrativeModel } from "@/src/ports/narrative-model";
import { applyCreatorDecision } from "@/src/domain/canon-overlay";
import { sha256Canonical } from "@/src/domain/canonical-json";
import { buildGraphDescriptor } from "@/src/domain/graph-descriptor";
import { activeRules } from "@/src/domain/retrieval";
import { applySimulationAction } from "@/src/domain/simulation";

const participantIntents = [
  {
    intentId: "intent.penelope",
    participantId: "participant.one",
    controlledEntityIds: ["penelope"],
    intent: "Keep the household from confusing a signal with certainty.",
  },
  {
    intentId: "intent.telemachus",
    participantId: "participant.two",
    controlledEntityIds: ["telemachus"],
    intent: "Propose a red-sail harbor signal and organize a watch.",
  },
];

const disabledLiveModel: NarrativeModel = {
  async generate() {
    return {
      outcome: "configuration_error",
      error: {
        code: "public_evidence_fixture_only",
        message: "Public evidence generation is fixture-only.",
        retryable: false,
      },
      trace: {
        mode: "live",
        outcome: "configuration_error",
        requestedModel: "gpt-5.6",
        actualModel: null,
        responseId: null,
        inputTokens: null,
        outputTokens: null,
      },
    };
  },
};

const countBy = (values: ReadonlyArray<string>): Record<string, number> =>
  Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );

export const buildPublicEvidence = async () => {
  const [
    { worldPack, replayCases },
    overlayV0,
    snapshotS0,
    helenSnapshot,
    step1Draft,
    step2Draft,
  ] =
    await Promise.all([
      loadDemoBundle(),
      loadOverlayFixture("overlay.v0"),
      loadSnapshotFixture("snapshot.s0"),
      loadSnapshotFixture("snapshot.helen_s0"),
      loadDraftFixture("draft.red_sail_step_1"),
      loadDraftFixture("draft.red_sail_step_2"),
    ]);
  const run = createRunOrchestrator({
    worldPack,
    fixtureModel: fixtureNarrativeModel,
    liveModel: disabledLiveModel,
  });
  const proposalRun = await run({
    modelMode: "fixture",
    draftFixtureId: "draft.red_sail_proposal",
    overlay: overlayV0,
    snapshot: snapshotS0,
    styleProfileId: worldPack.defaultStyleProfileId,
    taskType: "expand",
    brief: "Propose a red-sail signal, but do not treat it as canon before approval.",
    participantIntents,
  });
  const proposal = proposalRun.proposals[0];
  if (!proposal) throw new Error("The proposal fixture did not produce a creator proposal.");
  const conflictRun = await run({
    modelMode: "fixture",
    draftFixtureId: "draft.helen_conflict",
    overlay: overlayV0,
    snapshot: helenSnapshot,
    styleProfileId: worldPack.defaultStyleProfileId,
    taskType: "query",
    brief: "Expose the unresolved Helen traditions without selecting one.",
    participantIntents: [
      {
        intentId: "intent.helen",
        participantId: "participant.one",
        controlledEntityIds: ["helen"],
        intent: "Keep both active traditions visible for creator review.",
      },
    ],
  });
  if (conflictRun.status !== "needs_creator_decision") {
    throw new Error("The conflict fixture did not preserve creator authority.");
  }

  const decision = applyCreatorDecision({
    worldPack,
    overlay: overlayV0,
    snapshot: snapshotS0,
    proposal,
    decision: {
      action: "accept",
      proposalId: proposal.id,
      proposalHash: proposal.proposalHash,
      baseOverlayId: proposal.baseOverlayId,
      baseOverlayVersion: proposal.baseOverlayVersion,
      baseOverlayHash: proposal.baseOverlayHash,
    },
  });
  if (decision.status !== "applied") throw new Error("The fixture proposal was not applied.");
  if (proposalRun.modelOutcome.outcome !== "completed") {
    throw new Error("The fixture proposal did not return a structured draft.");
  }
  const approvedGraph = buildGraphDescriptor({
    pack: worldPack,
    overlay: decision.overlay,
    snapshot: decision.snapshot,
    draft: proposalRun.modelOutcome.draft,
    characterViews: proposalRun.evidence.characterViews,
    violations: proposalRun.hardViolations.filter(
      ({ code, evidenceIds }) =>
        code !== "unapproved_expansion" || !evidenceIds.includes(proposal.id),
    ),
    proposals: [],
  });

  const scenario = worldPack.simulationScenarios.find(
    ({ id }) => id === decision.snapshot.scenarioId,
  );
  const step1Action = step1Draft.actions[0];
  const step2Action = step2Draft.actions[0];
  if (!scenario || !step1Action || !step2Action) {
    throw new Error("The bounded simulation fixtures are incomplete.");
  }
  const activeRuleIds = new Set(
    activeRules(worldPack, decision.overlay, decision.snapshot).map(({ id }) => id),
  );
  const step1 = applySimulationAction({
    scenario,
    snapshot: decision.snapshot,
    action: step1Action,
    activeRuleIds,
  });
  const step2 = applySimulationAction({
    scenario,
    snapshot: step1.snapshot,
    action: step2Action,
    activeRuleIds,
  });
  const thirdStep = applySimulationAction({
    scenario,
    snapshot: step2.snapshot,
    action: step2Action,
    activeRuleIds,
  });
  const replay = await runFrozenReplay({
    worldPack,
    replayCases,
    fixtureModel: fixtureNarrativeModel,
  });
  const styleProfile = worldPack.styleProfiles.find(
    ({ id }) => id === worldPack.defaultStyleProfileId,
  );
  if (!styleProfile) throw new Error("The selected style profile is unavailable.");

  const fixtureReplay = {
    evidenceType: "fixture_replay" as const,
    allPassed: replay.every(({ passed }) => passed),
    caseCount: replay.length,
    stageCount: replay.flatMap(({ stages }) => stages).length,
    cases: replay,
    digest: sha256Canonical(replay),
  };
  const graph = {
    evidenceType: "derived_graph" as const,
    descriptor: proposalRun.graph,
    descriptorDigest: sha256Canonical(proposalRun.graph),
    approvedDescriptor: approvedGraph,
    approvedDescriptorDigest: sha256Canonical(approvedGraph),
    conflictDescriptor: conflictRun.graph,
    conflictDescriptorDigest: sha256Canonical(conflictRun.graph),
    nodeCount: proposalRun.graph.nodes.length,
    edgeCount: proposalRun.graph.edges.length,
    approvedNodeCount: approvedGraph.nodes.length,
    approvedEdgeCount: approvedGraph.edges.length,
    nodeVisualStates: countBy(proposalRun.graph.nodes.map(({ visualState }) => visualState)),
    edgeStatuses: countBy(proposalRun.graph.edges.map(({ status }) => status)),
    approvedNodeVisualStates: countBy(approvedGraph.nodes.map(({ visualState }) => visualState)),
    approvedEdgeStatuses: countBy(approvedGraph.edges.map(({ status }) => status)),
    conflictEdgeStatuses: countBy(conflictRun.graph.edges.map(({ status }) => status)),
  };
  const simulation = {
    evidenceType: "deterministic_simulation" as const,
    maxSteps: scenario.maxSteps,
    proposalBeforeApproval: {
      status: proposalRun.status,
      overlayVersion: proposalRun.currentSnapshot.overlayVersion,
      stateHash: proposalRun.currentSnapshot.stateHash,
      variableValues: proposalRun.currentSnapshot.variables,
    },
    creatorDecision: {
      status: decision.status,
      proposalId: proposal.id,
      proposalHash: proposal.proposalHash,
      overlayVersion: decision.overlay.version,
      overlayHash: decision.overlay.hash,
      rebasedStateHash: decision.snapshot.stateHash,
      turnIndex: decision.snapshot.turnIndex,
    },
    transitions: [step1.transition, step2.transition],
    finalVariables: step2.snapshot.variables,
    finalTurnIndex: step2.snapshot.turnIndex,
    thirdStep: {
      status: thirdStep.status,
      violations: thirdStep.violations.map(({ code }) => code),
      stateHashUnchanged: thirdStep.snapshot.stateHash === step2.snapshot.stateHash,
    },
    digest: sha256Canonical({
      decision,
      step1: step1.transition,
      step2: step2.transition,
      thirdStep,
    }),
  };
  const styleHarness = {
    evidenceType: "harness_mechanism" as const,
    claimBoundary:
      "This demonstrates explicit prose-control inputs, mechanisms, and auditability; a live ablation is required before claiming a measured writing effect or model-vendor comparison.",
    selectedProfile: styleProfile,
    modelInputBoundary: [
      "selected style profile",
      "participant intents",
      "character-scoped evidence",
    ],
    modelOutputReceipts: {
      styleProfileId: proposalRun.modelOutcome.outcome === "completed"
        ? proposalRun.modelOutcome.draft.styleProfileId
        : null,
      appliedStyleConstraintIds: proposalRun.modelOutcome.outcome === "completed"
        ? proposalRun.modelOutcome.draft.appliedStyleConstraintIds
        : [],
    },
    deterministicChecks: styleProfile.constraints
      .filter(({ checkMode }) => checkMode === "deterministic")
      .map(({ id }) => id),
    humanReviewChecks: styleProfile.constraints
      .filter(({ checkMode }) => checkMode === "human")
      .map(({ id }) => id),
    worldConsistencyChecks: proposalRun.hardViolations.map(({ code }) => code),
  };
  const liveReadiness = {
    evidenceType: "live_readiness" as const,
    status: "not_executed" as const,
    reason: "No API key was available in the build process.",
    requiredServerConfiguration: ["ENABLE_OPENAI_LIVE=true", "OPENAI_API_KEY"],
    adapterContract: {
      model: "gpt-5.6",
      api: "Responses API",
      structuredOutput: "zodTextFormat(ModelDraftSchema)",
      rawResponsePersisted: false,
    },
  };
  const evidencePacket = {
    schemaVersion: 1,
    project: {
      id: "narrative-ontology-harness",
      worldPackId: worldPack.meta.id,
      worldPackVersion: worldPack.meta.version,
    },
    scope: {
      primaryUsers: ["professional GMs", "narrative production teams", "quest designers"],
      localParticipantIntentCount: participantIntents.length,
      remoteCollaboration: false,
      persistentAutonomousSimulation: false,
    },
    determinismBoundary: {
      deterministic: [
        "fixture selection",
        "retrieval ordering",
        "validation",
        "proposal and overlay hashes",
        "graph descriptor",
        "state transitions",
        "frozen replay",
      ],
      nondeterministic: ["live GPT-5.6 wording"],
    },
    proposalRun: {
      runId: proposalRun.runId,
      status: proposalRun.status,
      modelTrace: proposalRun.modelOutcome.trace,
      hardViolationCodes: proposalRun.hardViolations.map(({ code }) => code),
      evidenceIds: {
        entities: proposalRun.evidence.entityIds,
        claims: proposalRun.evidence.claimIds,
        events: proposalRun.evidence.eventIds,
        rules: proposalRun.evidence.ruleIds,
      },
    },
    fixtureReplaySummary: {
      allPassed: fixtureReplay.allPassed,
      caseCount: fixtureReplay.caseCount,
      stageCount: fixtureReplay.stageCount,
      digest: fixtureReplay.digest,
    },
    graphSummary: {
      beforeApproval: {
        nodeCount: graph.nodeCount,
        edgeCount: graph.edgeCount,
        descriptorDigest: graph.descriptorDigest,
      },
      afterApproval: {
        nodeCount: graph.approvedNodeCount,
        edgeCount: graph.approvedEdgeCount,
        descriptorDigest: graph.approvedDescriptorDigest,
      },
      conflictControlDigest: graph.conflictDescriptorDigest,
    },
    simulationSummary: {
      overlayHash: simulation.creatorDecision.overlayHash,
      rebasedStateHash: simulation.creatorDecision.rebasedStateHash,
      transitionHashes: simulation.transitions.map(({ fromStateHash, toStateHash }) => ({
        fromStateHash,
        toStateHash,
      })),
      finalTurnIndex: simulation.finalTurnIndex,
      thirdStepBlocked: simulation.thirdStep.status === "blocked",
    },
    styleHarnessSummary: {
      constraintCount: styleProfile.constraints.length,
      deterministicCheckCount: styleHarness.deterministicChecks.length,
      humanReviewCheckCount: styleHarness.humanReviewChecks.length,
      claimBoundary: styleHarness.claimBoundary,
    },
    liveEvidenceStatus: liveReadiness.status,
  };

  return { evidencePacket, fixtureReplay, graph, simulation, styleHarness, liveReadiness };
};

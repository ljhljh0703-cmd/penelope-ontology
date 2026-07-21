import { describe, expect, it } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import { getOdysseyBook19WorldSimulation } from "@/src/adapters/fixtures/odyssey-world-simulation";
import { getOdysseyBook19WorldPack } from "@/src/adapters/world-packs/odyssey-book19";
import {
  fixtureNarrationCritic,
  fixtureNarrationRenderer,
} from "@/src/adapters/fixtures/world-narrator";
import {
  buildWorldCreatorReceipt,
  buildWorldNarrationPipelineArtifacts,
  buildWorldParticipantView,
  buildWorldSessionProjections,
  buildWorldVisibleSceneMemory,
  runWorldSessionNarrationPipeline,
  WorldNarrationError,
} from "@/src/application/world-simulation-service";
import {
  projectModelNarrationOutputForWorldApi,
  WorldNarrationProjectionSchema,
  WorldParticipantSessionViewSchema,
} from "@/src/contracts/world-api";
import { sealPenelopeWorldPack } from "@/src/contracts/penelope-world-pack";
import { PenelopeEnglishStyleProfileSchema } from "@/src/contracts/world-narrator";
import {
  createWorldSimulationSession,
  runWorldSimulationTurn,
} from "@/src/domain/world-runtime";

const scenario = getOdysseyBook19WorldSimulation();
const worldPack = getOdysseyBook19WorldPack();
const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);

describe("world simulation service privacy boundary", () => {
  it("rejects a sealed pack when its scenario id does not match the active simulation", () => {
    const initial = createWorldSimulationSession({ scenario });
    const { definitionDigest, ...definition } = worldPack;
    void definitionDigest;
    const scenarioId = "scenario.wrong_pack";
    const foreignPack = sealPenelopeWorldPack({
      ...structuredClone(definition),
      scenario: {
        ...definition.scenario,
        id: scenarioId,
        creatorRuleApprovalReceipts:
          definition.scenario.creatorRuleApprovalReceipts.map((receipt) => ({
            ...receipt,
            scenarioId,
          })),
      },
    });

    expect(() =>
      buildWorldNarrationPipelineArtifacts({
        scenario,
        worldPack: foreignPack,
        session: initial,
        receipt: null,
        styleProfile,
      }),
    ).toThrow(/does not belong to this simulation scenario/u);
  });

  it("keeps an imported creator pack active even when it is absent from the public selector", () => {
    const { definitionDigest, ...definition } = worldPack;
    void definitionDigest;
    const scenarioId = "scenario.creator.private_rehearsal";
    const importedPack = sealPenelopeWorldPack({
      ...structuredClone(definition),
      packId: "pack.creator.private_rehearsal",
      packVersion: "1.0.1",
      provenance: {
        kind: "creator_owned",
        sourceTitle: "Creator rehearsal",
        sourceEdition: "private working draft",
        sourceUrl: null,
        rightsNote: "Creator-owned material remains inside this session pack.",
        sourceStatus: "creator_attested",
      },
      presentation: {
        ...definition.presentation,
        publicTitle: "Creator rehearsal",
        demoOrder: 99,
      },
      scenario: {
        ...definition.scenario,
        id: scenarioId,
        creatorRuleApprovalReceipts:
          definition.scenario.creatorRuleApprovalReceipts.map((receipt) => ({
            ...receipt,
            scenarioId,
          })),
      },
    });
    const importedScenario = importedPack.scenario;
    const session = createWorldSimulationSession({ scenario: importedScenario });
    const view = buildWorldParticipantView({
      scenario: importedScenario,
      worldPack: importedPack,
      session,
      sessionId: crypto.randomUUID(),
      parentCheckpointId: null,
      forked: false,
      transport: "fixture",
      receipt: null,
      narration: WorldNarrationProjectionSchema.parse({
        format: "english_prose_paragraphs",
        paragraphs: [{ paragraphId: "paragraph.test", text: "The rehearsal waits." }],
        prose: "The rehearsal waits.",
      }),
      trace: { provenance: "fixture", adapterId: "test.private_pack" },
    });

    expect(view.worldPack.packId).toBe("pack.creator.private_rehearsal");
    expect(view.availableWorldPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ packId: "pack.creator.private_rehearsal" }),
      ]),
    );
  });

  it("derives continuation memory from registered visible events, not model prose", () => {
    const initial = createWorldSimulationSession({ scenario });
    const result = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const memory = buildWorldVisibleSceneMemory({
      scenario,
      worldPack,
      receipt: result.receipt,
    });

    expect(memory).toContain("Penelope asks Eurycleia to wash the stranger's feet");
    expect(memory).toContain("Eurycleia's hands stop at the old scar");
    expect(memory).not.toMatch(/narration|model prose|invented fact/iu);
  });

  it("keeps the hidden identity outside model-facing input until focal knowledge is granted", () => {
    const initial = createWorldSimulationSession({ scenario });
    const before = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: initial,
      receipt: null,
      styleProfile,
    });
    const modelFacingBefore = JSON.stringify(before.inputEnvelope.modelFacing);

    expect(modelFacingBefore).not.toMatch(/odysseus|ulysses|laertiades/iu);
    expect(before.inputEnvelope.privateValidation.forbiddenKnowledgeIds).toEqual([
      "private.stranger_identity",
    ]);
    expect(before.privateValidationMaterial.forbiddenKnowledge).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "private.stranger_identity" }),
      ]),
    );

    const recognition = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "order washing",
    });
    const discovery = runWorldSimulationTurn({
      scenario,
      session: recognition.session,
      input: "confront the stranger",
    });
    const after = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: discovery.session,
      receipt: discovery.receipt,
      styleProfile,
    });

    expect(
      discovery.session.state.knowledge
        .find(({ entityId }) => entityId === scenario.focalParticipantEntityId)
        ?.premiseIds,
    ).toContain("premise.stranger_identity");
    expect(after.inputEnvelope.privateValidation.forbiddenKnowledgeIds).toEqual([]);
    expect(after.privateValidationMaterial.forbiddenKnowledge).toEqual([]);
  });

  it("shows latent disclosure risk to the creator without making it reader-facing canon", () => {
    const initial = createWorldSimulationSession({ scenario });
    const recognition = runWorldSimulationTurn({
      scenario,
      session: initial,
      input: "bring the basin",
    });
    const disclosure = runWorldSimulationTurn({
      scenario,
      session: recognition.session,
      input: "confront the stranger",
    });
    const creatorReceipt = buildWorldCreatorReceipt({
      scenario,
      worldPack,
      session: disclosure.session,
      receipt: disclosure.receipt,
    });
    const artifacts = buildWorldNarrationPipelineArtifacts({
      scenario,
      worldPack,
      session: disclosure.session,
      receipt: disclosure.receipt,
      styleProfile,
    });

    expect(creatorReceipt.behindCurtainRisks).toEqual([
      {
        riskId:
          "risk.speech.eurycleia.controlled_disclosure.potential_audience",
        eventId:
          "event.turn_2.reaction.reaction.eurycleia.controlled_disclosure",
        exposureStatus: "latent",
        summary:
          "Eurycleia's answer may have reached Melantho. This is a live possibility, not a resolved fact.",
        potentialHearers: [
          { entityId: "entity.melantho", label: "Melantho" },
        ],
      },
    ]);
    expect(creatorReceipt.behindCurtainPremises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          premiseId: "premise.stranger_identity",
          approvalStatus: "source_verified",
          sourceGrounding: expect.stringContaining("Odyssey"),
          whyWithheld: expect.stringContaining("concealed fact directly"),
        }),
      ]),
    );
    expect(JSON.stringify(artifacts.inputEnvelope.modelFacing)).not.toContain(
      "entity.melantho",
    );
    expect(JSON.stringify(artifacts.inputEnvelope.modelFacing)).not.toContain(
      "potentialHearerIds",
    );
  });

  it("projects validated reader prose separately from the creator receipt", async () => {
    const session = createWorldSimulationSession({ scenario });
    const narrated = await runWorldSessionNarrationPipeline({
      scenario,
      worldPack,
      session,
      receipt: null,
      styleProfile,
      renderer: fixtureNarrationRenderer,
      critic: fixtureNarrationCritic,
    });
    if (narrated.outcome !== "accepted") {
      throw new Error(
        `Expected accepted fixture narration, received ${
          narrated.outcome === "no_render"
            ? narrated.reason
            : narrated.pipeline.disposition
        }.`,
      );
    }
    const projections = buildWorldSessionProjections({
      scenario,
      worldPack,
      session,
      sessionId: crypto.randomUUID(),
      parentCheckpointId: null,
      forked: false,
      transport: "fixture",
      receipt: null,
      narration: projectModelNarrationOutputForWorldApi(narrated.modelOutput),
      trace: narrated.trace,
    });
    const participantJson = JSON.stringify(projections.participantView);
    const creatorJson = JSON.stringify(projections.creatorReceipt);
    const concealedIdentity = projections.creatorReceipt.behindCurtainPremises.find(
      ({ premiseId }) => premiseId === "premise.stranger_identity",
    );

    expect(projections.participantView).not.toHaveProperty("creatorReceipt");
    expect(
      WorldParticipantSessionViewSchema.safeParse({
        ...projections.participantView,
        creatorReceipt: projections.creatorReceipt,
      }).success,
    ).toBe(false);
    expect(
      projections.participantView.visibleEvents.every(
        (event) => !("effects" in event),
      ),
    ).toBe(true);
    expect(participantJson).not.toMatch(
      /disguised odysseus|premise\.stranger_identity/iu,
    );
    expect(concealedIdentity).toBeDefined();
    expect(participantJson).not.toContain(concealedIdentity?.summary ?? "");
    expect(participantJson).not.toContain("worldCodex");
    expect(projections.participantView).not.toHaveProperty("behindCurtainPremises");
    expect(creatorJson).toContain("Disguised Odysseus");
    expect(creatorJson).toContain("premise.stranger_identity");
    expect(creatorJson).toContain("concealed fact directly");
    expect(
      projections.creatorReceipt.ruleReview.creatorApprovedNotSourceCanonIds,
    ).toContain("ending.controlled_discovery");
    expect(projections.creatorReceipt.worldCodex).toMatchObject({
      scenarioSummary: scenario.summary,
      dramaticQuestion: expect.any(String),
      relationships: expect.arrayContaining([
        expect.objectContaining({
          subjectEntityId: "entity.penelope",
          objectEntityId: "entity.odysseus",
        }),
      ]),
      possibleEndings: expect.arrayContaining([
        expect.objectContaining({ id: "ending.canon_contained" }),
      ]),
    });
    expect(new WorldNarrationError("blocked", "blocked").code).toBe("blocked");
  });
});

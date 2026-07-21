import { beforeEach, describe, expect, it } from "vitest";
import { POST as startWorld } from "@/app/api/world/session/route";
import { POST as turnWorld } from "@/app/api/world/turn/route";
import { getOzDiscoveryWorldPack } from "@/src/adapters/world-packs/oz-discovery";
import { resetWorldSessionStoreForTests } from "@/src/application/world-session-store";
import {
  MAX_WORLD_SESSION_REQUEST_BYTES,
  WorldParticipantSessionViewSchema,
} from "@/src/contracts/world-api";
import {
  CreatorCDialogueResponseSchema,
  type CreatorTacitKnowledgeAnswer,
} from "@/src/contracts/creator-c-dialogue";
import type { PenelopeWorldPackDefinition } from "@/src/contracts/penelope-world-pack";

const request = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const startOz = async () => {
  const response = await startWorld(
    request("/api/world/session", {
      transport: "fixture",
      packId: "pack.oz.discovery_of_the_wizard",
    }),
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Expected Oz session to open: ${JSON.stringify(payload)}`);
  }
  return {
    response,
    view: WorldParticipantSessionViewSchema.parse(payload),
  };
};

const creatorOwnedOzDefinition = (): PenelopeWorldPackDefinition => {
  const { definitionDigest: _digest, ...definition } = getOzDiscoveryWorldPack();
  void _digest;
  return {
    ...definition,
    packId: "pack.creator.portable_oz_test",
    provenance: {
      kind: "creator_owned",
      sourceTitle: "Creator-owned causal rehearsal",
      sourceEdition: "Private draft used only for the current test session",
      sourceUrl: null,
      rightsNote:
        "The creator attests ownership of this private adaptation and requests no persistent storage.",
      sourceStatus: "creator_attested",
    },
    presentation: {
      ...definition.presentation,
      publicTitle: "My Private Emerald Room",
      demoOrder: 3,
    },
  };
};

const creatorAnswers: CreatorTacitKnowledgeAnswer[] = [
  {
    questionId: "desired_outcome",
    answer: "Keep Toto safe while preserving the screen long enough to question the Voice.",
  },
  {
    questionId: "character_motive",
    answer: "Dorothy wants control of the room before anyone creates an accidental revelation.",
  },
  {
    questionId: "accepted_cost",
    answer: "The Voice may use the intact screen to delay the group again.",
  },
];

describe("portable world-pack API", () => {
  beforeEach(() => resetWorldSessionStoreForTests());

  it("runs the registered Oz pack from opening through a distinct two-turn ending", async () => {
    const opening = await startOz();
    expect(opening.response.status).toBe(200);
    expect(opening.view.worldPack).toMatchObject({
      packId: "pack.oz.discovery_of_the_wizard",
      availability: "registered",
      publicTitle: "Behind the Green Screen",
    });
    expect(opening.view.narration.prose).not.toContain(
      "The world answers the visible change.",
    );
    expect(JSON.stringify(opening.view)).not.toMatch(
      /Odysseus|Ithaca|Eurycleia|Melantho/u,
    );

    const pressureAction = opening.view.nextActions.find(
      ({ actionId }) => actionId === "action.dorothy.challenge_voice",
    );
    if (!pressureAction) throw new Error("Expected the Oz pressure route.");
    const pressureResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.view.sessionId,
        expectedStateHash: opening.view.stateHash,
        action: pressureAction.suggestedInput,
        preparedActionId: pressureAction.actionId,
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    expect(pressureResponse.status).toBe(200);
    const pressured = WorldParticipantSessionViewSchema.parse(
      await pressureResponse.json(),
    );
    expect(pressured.status).toBe("active");

    const roarAction = pressured.nextActions.find(
      ({ actionId }) => actionId === "action.dorothy.call_lion_roar",
    );
    if (!roarAction) throw new Error("Expected the Oz reveal route.");
    const endingResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: pressured.sessionId,
        expectedStateHash: pressured.stateHash,
        action: roarAction.suggestedInput,
        preparedActionId: roarAction.actionId,
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    expect(endingResponse.status).toBe(200);
    const ending = WorldParticipantSessionViewSchema.parse(
      await endingResponse.json(),
    );
    expect(ending.ending?.kind).toBe("public_pressure_exposure");
  });

  it("keeps an imported creator-owned definition session-private and out of public output", async () => {
    const registered = await startOz();
    const response = await startWorld(
      request("/api/world/session", {
        transport: "fixture",
        creatorPackDefinition: creatorOwnedOzDefinition(),
      }),
    );
    expect(response.status).toBe(200);
    const raw = await response.json();
    const view = WorldParticipantSessionViewSchema.parse(raw);

    expect(view.worldPack).toMatchObject({
      packId: "pack.creator.portable_oz_test",
      availability: "session_private",
      publicTitle: "My Private Emerald Room",
    });
    expect(view.worldPack.packId).not.toBe(registered.view.worldPack.packId);
    expect(view.worldPack.definitionDigest).not.toBe(
      registered.view.worldPack.definitionDigest,
    );
    expect(JSON.stringify(raw)).not.toMatch(
      /private\.wizard_behind_screen|forbiddenPatterns|renderPolicy|creatorInput/u,
    );

    const pressureAction = view.nextActions.find(
      ({ actionId }) => actionId === "action.dorothy.challenge_voice",
    );
    if (!pressureAction) throw new Error("Expected an imported-pack action.");
    const turnResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: view.sessionId,
        expectedStateHash: view.stateHash,
        action: pressureAction.suggestedInput,
        preparedActionId: pressureAction.actionId,
        forkBeforeAction: false,
        transport: "fixture",
      }),
    );
    expect(turnResponse.status).toBe(200);
    const continued = WorldParticipantSessionViewSchema.parse(
      await turnResponse.json(),
    );
    expect(continued.worldPack).toMatchObject({
      packId: view.worldPack.packId,
      definitionDigest: view.worldPack.definitionDigest,
      availability: "session_private",
      publicTitle: "My Private Emerald Room",
    });
  });

  it("rejects reserved creator identifiers and oversized raw imports before parsing", async () => {
    const conflictingDefinition = creatorOwnedOzDefinition();
    conflictingDefinition.packId = "pack.oz.discovery_of_the_wizard";
    const collisionResponse = await startWorld(
      request("/api/world/session", {
        transport: "fixture",
        creatorPackDefinition: conflictingDefinition,
      }),
    );
    expect(collisionResponse.status).toBe(409);
    await expect(collisionResponse.json()).resolves.toEqual({
      error: {
        code: "world_creator_pack_id_reserved",
        message: "The creator pack must use an unregistered pack identifier.",
      },
    });

    const oversizedResponse = await startWorld(
      new Request("http://localhost/api/world/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(MAX_WORLD_SESSION_REQUEST_BYTES + 1),
      }),
    );
    expect(oversizedResponse.status).toBe(413);
    await expect(oversizedResponse.json()).resolves.toEqual({
      error: {
        code: "world_session_request_too_large",
        message: "The world session request is too large.",
      },
    });
  });

  it("turns C into an explicit proposal and rejects unsupported source material immediately", async () => {
    const opening = await startOz();
    const action = "Dorothy keeps Toto at her side.";
    const proposalResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.view.sessionId,
        expectedStateHash: opening.view.stateHash,
        action,
        forkBeforeAction: true,
        transport: "fixture",
        creatorDialogue: { answers: creatorAnswers },
      }),
    );
    const proposal = CreatorCDialogueResponseSchema.parse(
      await proposalResponse.json(),
    );
    expect(proposal).toMatchObject({
      kind: "creator_confirmation",
      proposal: {
        registeredActionId: "action.dorothy.restrain_toto",
        forkBeforeAction: true,
      },
    });

    const unsupportedResponse = await turnWorld(
      request("/api/world/turn", {
        sessionId: opening.view.sessionId,
        expectedStateHash: opening.view.stateHash,
        action: "Dorothy uses her ruby slippers.",
        forkBeforeAction: true,
        transport: "fixture",
        creatorDialogue: { answers: [] },
      }),
    );
    const unsupported = CreatorCDialogueResponseSchema.parse(
      await unsupportedResponse.json(),
    );
    expect(unsupported).toMatchObject({
      kind: "creator_expansion_required",
      stateChanged: false,
    });
    if (unsupported.kind !== "creator_expansion_required") {
      throw new Error("Expected immediate expansion review.");
    }
    expect(unsupported.missingWorldSupport).toContain("silver shoes");
  });
});

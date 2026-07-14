import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldPackSchema } from "@/src/domain/schemas";
import {
  normalizeParticipantIntents,
  validateOutputLineage,
} from "@/src/domain/participants";

const pack = WorldPackSchema.parse(
  JSON.parse(readFileSync(resolve("data/world-packs/trojan-returns/world.json"), "utf8")),
);

const input = [
  {
    intentId: "intent.b",
    participantId: "participant.b",
    controlledEntityIds: ["eurycleia"],
    intent: "Protect Penelope from false certainty.",
  },
  {
    intentId: "intent.a",
    participantId: "participant.a",
    controlledEntityIds: ["penelope"],
    intent: "Seek a sign without claiming exact knowledge.",
  },
] as const;

describe("participant normalization and lineage", () => {
  it("derives stable focal characters instead of accepting a second authority", () => {
    const normalized = normalizeParticipantIntents(input, pack);
    expect(normalized.intents.map(({ intentId }) => intentId)).toEqual([
      "intent.a",
      "intent.b",
    ]);
    expect(normalized.focalCharacterIds).toEqual(["eurycleia", "penelope"]);
  });

  it("rejects non-character control targets", () => {
    expect(() =>
      normalizeParticipantIntents(
        [
          {
            intentId: "intent.place",
            participantId: "participant.place",
            controlledEntityIds: ["ithaca"],
            intent: "Control a place.",
          },
        ],
        pack,
      ),
    ).toThrow("unknown character ithaca");
  });

  it("does not let contributing intents confer speaker or action authority", () => {
    const controls = normalizeParticipantIntents(input, pack).controlledEntityIdsByIntent;
    const violations = validateOutputLineage(
      [
        {
          speakerId: "penelope",
          authorizingIntentId: "intent.b",
          contributingIntentIds: ["intent.a"],
          text: "I know where he is.",
          assertedClaimIds: [],
          certainty: "certain",
        },
      ],
      [
        {
          actorEntityId: "eurycleia",
          authorizingIntentId: "intent.missing",
          contributingIntentIds: [],
          op: "set_variable",
          variableId: "harbor_watch",
          from: "idle",
          to: "watching",
          evidenceClaimIds: [],
          evidenceRuleIds: [],
        },
      ],
      controls,
    );

    expect(violations.map(({ code }) => code)).toEqual([
      "intent_lineage_invalid",
      "unauthorized_speaker",
    ]);
  });
});

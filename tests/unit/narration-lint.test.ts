import { describe, expect, it } from "vitest";
import styleProfileJson from "@/_dev/dispatch-2026-07-18/contracts/PENELOPE-ENGLISH-STYLE-PROFILE.json";
import {
  ModelNarrationOutputSchema,
  PenelopeEnglishStyleProfileSchema,
} from "@/src/contracts/world-narrator";
import { PenelopeScenePlanSchema } from "@/src/contracts/narration-license";
import {
  NARRATION_FORBIDDEN_CONSTRUCTION_RULE_IDS,
  NARRATION_LINT_RULE_IDS,
  lintNarration,
  measureNarrationStyle,
  type NarrationLintResult,
  type NarrationLintRuleId,
} from "@/src/domain/narration-lint";

const styleProfile = PenelopeEnglishStyleProfileSchema.parse(styleProfileJson);

const scenePlan = PenelopeScenePlanSchema.parse({
  scenePlanId: "scene.setup",
  sceneMode: "setup",
  sentencePlans: [
    {
      sentencePlanId: "sp.orientation",
      role: "orientation",
      actorId: null,
      speakerId: null,
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
      plainFunction: "Orient the registered scene.",
      plainFunctionSourceAuthorityIds: ["fact.a"],
      plainIntent: null,
      plainIntentSourceAuthorityIds: [],
      changesState: false,
    },
    {
      sentencePlanId: "sp.stop",
      role: "in_world_stop",
      actorId: null,
      speakerId: null,
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
      plainFunction: "Stop inside the registered scene.",
      plainFunctionSourceAuthorityIds: ["fact.a"],
      plainIntent: null,
      plainIntentSourceAuthorityIds: [],
      changesState: false,
    },
  ],
});

const modelOutput = ModelNarrationOutputSchema.parse({
  planReceipt: [
    {
      sentencePlanId: "sp.orientation",
      role: "orientation",
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    },
    {
      sentencePlanId: "sp.stop",
      role: "in_world_stop",
      sourceFactIds: ["fact.a"],
      sourceEventIds: [],
      speechEventIds: [],
      licensedRenderingDetailIds: [],
    },
  ],
  readerProse: {
    format: "english_prose_paragraphs",
    paragraphs: [
      {
        paragraphId: "paragraph.one",
        sentencePlanIds: ["sp.orientation", "sp.stop"],
        text: "She waits.",
      },
    ],
  },
});

const lintText = (
  text: string,
  options: {
    dialogue?: boolean;
    plainIntent?: string;
    unbound?: boolean;
    sceneMode?: "setup" | "ending";
  } = {},
): NarrationLintResult => {
  const output = structuredClone(modelOutput);
  output.readerProse.paragraphs[0]!.text = text;
  if (options.unbound) {
    output.readerProse.paragraphs[0]!.sentencePlanIds = ["sp.unbound"];
  }
  const plan = structuredClone(scenePlan);
  if (options.dialogue) {
    plan.sentencePlans[0]!.role = "licensed_dialogue";
    plan.sentencePlans[0]!.plainIntent = options.plainIntent ?? "Perform an allowed speech act.";
    plan.sentencePlans[0]!.plainIntentSourceAuthorityIds = ["fact.a"];
  }
  if (options.sceneMode) {
    plan.sceneMode = options.sceneMode;
  }
  return lintNarration({
    modelOutput: output,
    scenePlan: plan,
    styleProfile,
    styleStateId: "en-penelope-state-baseline",
  });
};

const expectFlagOnly = (
  result: NarrationLintResult,
  ruleId: NarrationLintRuleId,
): void => {
  expect(result.findings).toContainEqual(
    expect.objectContaining({
      ruleId,
      classification: "heuristic",
      severity: "warning",
      blocking: false,
    }),
  );
  expect(result.blocking).toBe(false);
  expect(result.criticRecommended).toBe(true);
  expect(result.warningCount).toBeGreaterThan(0);
};

const expectNoRule = (
  result: NarrationLintResult,
  ruleId: NarrationLintRuleId,
): void => {
  expect(result.findings.filter((finding) => finding.ruleId === ruleId)).toEqual([]);
  expect(result.blocking).toBe(false);
};

describe("narration lint remains flag-only", () => {
  it("exposes FC-01..FC-10 and AC-END-02 without any blocking rule", () => {
    expect(NARRATION_LINT_RULE_IDS).toEqual([
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
      "AC-END-02",
    ]);
    expect(NARRATION_FORBIDDEN_CONSTRUCTION_RULE_IDS).toEqual(
      NARRATION_LINT_RULE_IDS.slice(0, 10),
    );
  });

  it("FC-01 flags a theme-teaching plainIntent without blocking", () => {
    expectFlagOnly(
      lintText('"Leave now."', {
        dialogue: true,
        plainIntent: "Explain the lesson and rules of the world.",
      }),
      "FC-01",
    );
    expectNoRule(
      lintText('"Leave now."', {
        dialogue: true,
        plainIntent: "Warn the guard to leave.",
      }),
      "FC-01",
    );
  });

  it("FC-02 flags a detached general-truth assertion without blocking", () => {
    expectFlagOnly(
      lintText("Life is always a test.", { unbound: true }),
      "FC-02",
    );
    expectNoRule(lintText("Life is always a test."), "FC-02");
  });

  it("FC-03 flags residue in a cryptic plainIntent without blocking", () => {
    expectFlagOnly(
      lintText('"Wait here."', {
        dialogue: true,
        plainIntent: "State an aphorism about fate and the meaning of life.",
      }),
      "FC-03",
    );
    expectNoRule(
      lintText('"Wait here."', {
        dialogue: true,
        plainIntent: "Command the guard to wait.",
      }),
      "FC-03",
    );
  });

  it("FC-04 flags a personified abstraction acting volitionally without blocking", () => {
    expectFlagOnly(lintText("Silence wanted the hall to wait."), "FC-04");
  });

  it("FC-05 flags a surrogate body-part speaker without blocking", () => {
    expectFlagOnly(lintText("Her hands answered before she spoke."), "FC-05");
  });

  it("FC-06 flags ornamental inversion without blocking", () => {
    expectFlagOnly(lintText("Only then did the guard move."), "FC-06");
  });

  it("FC-07 flags a fragmentary afterthought without blocking", () => {
    expectFlagOnly(lintText("She closes the door. A final cold hush."), "FC-07");
  });

  it("FC-08 flags unlicensed fake archaism without blocking", () => {
    expectFlagOnly(lintText("Thou hast waited long enough."), "FC-08");
    expectFlagOnly(lintText("The grey-eyed queen waits."), "FC-08");
    expectNoRule(lintText("The queen waits."), "FC-08");
  });

  it("FC-09 flags nominal abstraction and repeated passive construction without blocking", () => {
    expectFlagOnly(
      lintText(
        "The validation of the relation was recorded. The abstraction of the situation was measured.",
      ),
      "FC-09",
    );
    expectNoRule(
      lintText("The validation of the relation created unnecessary abstraction."),
      "FC-09",
    );
    expectNoRule(
      lintText("The door was opened. The lamp was moved."),
      "FC-09",
    );
  });

  it("FC-10 flags an explicit mirrored wrap-up without blocking", () => {
    expectFlagOnly(
      lintText("Therefore, everything had come full circle."),
      "FC-10",
    );
    expectFlagOnly(
      lintText("She entered the hall alone. At dusk she entered the hall."),
      "FC-10",
    );
    expectNoRule(lintText("She entered the hall. The guard closed the door."), "FC-10");
  });

  it("AC-END-02 flags a closure signal in an open setup without blocking", () => {
    expectFlagOnly(
      lintText("At last, the work was over for good."),
      "AC-END-02",
    );
  });

  it("has no word-count minimum and never pads a short scene", () => {
    const result = lintText("She waits.");
    expect(result).toMatchObject({
      findings: [],
      warningCount: 0,
      criticRecommended: false,
      blocking: false,
    });
    expect(result.metrics.wordCount).toBe(2);
    expect(result.metrics.sentenceWords).toEqual([2]);
  });

  it("measures style levers without emitting a literary-quality verdict", () => {
    const output = structuredClone(modelOutput);
    output.readerProse.paragraphs[0]!.text =
      "Wait here. The decision was recorded as if the room had answered.";
    expect(measureNarrationStyle(output)).toMatchObject({
      paragraphCount: 1,
      sentenceCount: 2,
    });
    expect(Object.keys(measureNarrationStyle(output))).not.toContain("quality");
  });
});

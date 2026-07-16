import { expect, test, type Page } from "@playwright/test";
import {
  STORY_LIVE_TOKEN_HEADER,
  type StoryModelTrace,
  type StorySessionApi,
  type StoryTurnApiResult,
} from "../../components/story/api-types";
/*
 * The credential is synthetic test data. Browser assertions keep it in a
 * request header and prove that it never enters the JSON authority payload.
 */
const LIVE_TOKEN = "browser-live-token-".padEnd(64, "6");

const selectLiveTransport = async (page: Page): Promise<void> => {
  await page.getByTestId("transport-codex-cli").check();
  await expect(page.getByTestId("start-story")).toBeDisabled();
  await page.getByTestId("story-live-token").fill(LIVE_TOKEN);
  await expect(page.getByTestId("start-story")).toBeEnabled();
};

const hash = (character: string): string => character.repeat(64);

const quietChoice = {
  choiceId: "choice.keep_quiet_watch",
  actorEntityId: "penelope",
  label: "Keep a quiet watch",
  intent:
    "Do not ring the bell. Put one covered lamp beneath the western wall and watch before the ship learns it is watched.",
  source: "suggested" as const,
};

const bellChoice = {
  choiceId: "choice.ring_public_bell",
  actorEntityId: "penelope",
  label: "Ring the public bell",
  intent: "Call the harbor guard in force, accepting that the whole island will own the rumor.",
  source: "suggested" as const,
};

const decoyChoice = {
  choiceId: "choice.move_decoy_lamp",
  actorEntityId: "penelope",
  label: "Move the decoy lamp",
  intent: "Move the covered lamp to the east gate and use the watcher's response to expose the coordination.",
  source: "suggested" as const,
};

const confrontChoice = {
  choiceId: "choice.confront_watcher",
  actorEntityId: "telemachus",
  label: "Confront the watcher",
  intent: "Break cover and seize the watcher before the ship can read another signal.",
  source: "suggested" as const,
};

const opening = {
  sceneId: "scene.red_sail.1",
  sceneNumber: 1,
  title: "The Signal",
  prose:
    "The loom stops before the messenger finishes. A red sail is holding beyond the western reef, neither entering nor turning away. The hall fills the silence with Odysseus's name before any lookout can say whose ship it is.\n\nPenelope presses the shuttle flat against the cloth. A color can summon hope faster than any king can cross the sea. Telemachus steps forward, already measuring walls, guards, and the distance to the harbor.\n\nOne choice gathers defenders and gives the whole island a story. The other keeps the story contained but asks Telemachus to carry the watch with fewer hands. Penelope looks from the bell rope to the dark lamp. Outside, the red sail does not move.",
  resolution: {
    resolutionId: "resolution.red_sail_seen",
    choiceId: "choice.world.red_sail_appears",
    authority: { kind: "world_rule", evidenceRefs: ["rule.world.red_sail_appears"] },
    outcome: "success",
    actionTypeId: "action.observe_red_sail",
    targetEntityIds: ["ithaca", "penelope", "telemachus"],
    effects: [
      {
        effectId: "effect.red_sail.seen",
        kind: "flag_set",
        entityId: "ithaca",
        flagId: "red_sail_seen",
        value: true,
      },
    ],
    openedDebtEffectIds: [],
    resolvedDebtEffectIds: [],
    evidenceClaimIds: [],
    evidenceRuleIds: ["rule.world.red_sail_appears"],
    summary: "A red sail appears beyond the reef and forces Ithaca to choose what meaning to give it.",
  },
  contract: {
    sceneNumber: 1,
    focalCharacterId: "penelope",
    goal: "Keep the sighting from becoming proof.",
    opposition: "The hall wants certainty and Telemachus wants action.",
    inheritedConsequenceIds: [],
    requiredDramaticTurn: "Penelope must choose between the bell and a covered lamp.",
    stateDeltaEffectIds: ["effect.red_sail.seen"],
    forwardPressure: "Choose public force and rumor, or private observation and personal risk.",
    closedThreadIds: [],
    openedThreadIds: ["thread.red_sail_question"],
  },
  segments: [
    {
      segmentId: "segment.scene1.pressure",
      kind: "narration",
      speakerId: null,
      text: "A red sail holds beyond the western reef.",
      groundingClaimIds: [],
      echoedEffectIds: [],
    },
  ],
  suggestedContinuations: [quietChoice, bellChoice],
  centralQuestionClosed: false,
  residualHook: "How should Ithaca test the red sail without mistaking it for proof?",
  echoedEffectIds: [],
  sceneHash: hash("1"),
};

const sceneTwo = {
  ...opening,
  sceneId: "scene.red_sail.2",
  sceneNumber: 2,
  title: "The Cost",
  prose:
    "Penelope leaves the bell untouched. One covered lamp rises beneath the western wall, and the hall receives no story it can repeat. Telemachus finds only two guards at the harbor and no crowd from which to borrow courage.\n\nTheir lamp rises once. The ship gives no answer. Instead, a flame opens among the olives above them. Had the bell rung, any shepherd or suitor might be repeating the signal. Now the answering light has intention.\n\nTelemachus takes the hill path alone, not because it is safe, but because a public search would teach the watcher how much the palace knows. Then the red-sailed ship turns toward the harbor.",
  resolution: {
    ...opening.resolution,
    resolutionId: "resolution.quiet_watch",
    choiceId: quietChoice.choiceId,
    authority: { kind: "user_choice", evidenceRefs: [quietChoice.choiceId] },
    outcome: "success_with_cost",
    actionTypeId: "action.keep_quiet_watch",
    effects: [
      {
        effectId: "effect.rumor.contained",
        kind: "flag_set",
        entityId: "ithaca",
        flagId: "public_rumor_contained",
        value: true,
      },
      {
        effectId: "effect.telemachus.exposure.1",
        kind: "clock_delta",
        clockId: "telemachus_exposure",
        delta: 1,
      },
      {
        effectId: "effect.debt.penelope_to_telemachus",
        kind: "debt_open",
        debtorEntityId: "penelope",
        creditorEntityId: "telemachus",
        debtKindId: "owed_explanation",
        weight: 40,
      },
    ],
    openedDebtEffectIds: ["effect.debt.penelope_to_telemachus"],
    evidenceRuleIds: [],
    summary:
      "Silence contains the rumor and makes the answering light meaningful, but Telemachus carries the risk.",
  },
  contract: {
    ...opening.contract,
    sceneNumber: 2,
    focalCharacterId: "telemachus",
    inheritedConsequenceIds: ["effect.red_sail.seen"],
    stateDeltaEffectIds: [
      "effect.rumor.contained",
      "effect.telemachus.exposure.1",
      "effect.debt.penelope_to_telemachus",
    ],
    forwardPressure: "The ship is approaching an opening that only the hidden watcher promised.",
  },
  segments: [
    {
      segmentId: "segment.scene2.choice",
      kind: "narration",
      speakerId: null,
      text: "The answering light has intention.",
      groundingClaimIds: [],
      echoedEffectIds: ["effect.red_sail.seen"],
    },
  ],
  suggestedContinuations: [decoyChoice, confrontChoice],
  echoedEffectIds: ["effect.red_sail.seen"],
  sceneHash: hash("2"),
};

const sceneThree = {
  ...sceneTwo,
  sceneId: "scene.red_sail.3",
  sceneNumber: 3,
  title: "The Payoff",
  prose:
    "Penelope receives Telemachus's three-word message: The hill answered. She does not summon the hall. She sends Eurycleia to move the covered lamp from the western wall to the east gate.\n\nThe light among the olives moves with it. That is enough. Telemachus sees the watcher break from cover and catches him before the road bends. At the harbor, the red-sailed ship finds no promised opening and heels back into the dark.\n\nBy dawn, Ithaca has neither a returned king nor a new rumor. It has a captured spy, a safer harbor, and a mother and son who know what their caution cost.",
  resolution: {
    ...sceneTwo.resolution,
    resolutionId: "resolution.move_decoy_lamp",
    choiceId: decoyChoice.choiceId,
    authority: { kind: "user_choice", evidenceRefs: [decoyChoice.choiceId] },
    actionTypeId: "action.move_decoy_lamp",
    effects: [
      {
        effectId: "effect.spy.captured",
        kind: "flag_set",
        entityId: "ithaca",
        flagId: "spy_captured",
        value: true,
      },
      {
        effectId: "effect.debt.penelope_to_telemachus.resolved",
        kind: "debt_resolve",
        debtEffectId: "effect.debt.penelope_to_telemachus",
      },
    ],
    openedDebtEffectIds: [],
    resolvedDebtEffectIds: ["effect.debt.penelope_to_telemachus"],
    summary:
      "The moved lamp exposes the watcher. Penelope names the cost without converting the signal into proof.",
  },
  contract: {
    ...sceneTwo.contract,
    sceneNumber: 3,
    focalCharacterId: "penelope",
    inheritedConsequenceIds: [
      "effect.rumor.contained",
      "effect.debt.penelope_to_telemachus",
    ],
    stateDeltaEffectIds: [
      "effect.spy.captured",
      "effect.debt.penelope_to_telemachus.resolved",
    ],
    forwardPressure: "The captured spy still refuses to name the suitor who paid him.",
  },
  segments: [
    {
      segmentId: "segment.scene3.payoff",
      kind: "narration",
      speakerId: null,
      text: "The moved lamp exposes the watcher.",
      groundingClaimIds: [],
      echoedEffectIds: ["effect.rumor.contained", "effect.debt.penelope_to_telemachus"],
    },
  ],
  centralQuestionClosed: true,
  residualHook: "Who hired the captured spy?",
  echoedEffectIds: ["effect.rumor.contained", "effect.debt.penelope_to_telemachus"],
  sceneHash: hash("3"),
};

const spine = {
  premise: "A red sail tests whether caution can become action without becoming proof.",
  dramaticQuestion: "Can Ithaca act on a signal without mistaking it for proof?",
  targetEnding:
    "The watcher is exposed, the ship retreats, and Odysseus's location remains unclaimed.",
  maximumSceneCount: 3,
  currentBeat: 1,
  openThreads: [],
  mustPayOffObligations: [
    {
      obligationId: "obligation.quiet_watch_cost",
      sourceChoiceId: quietChoice.choiceId,
      description: "Return the benefit and cost of silence.",
      payoffByScene: 3,
      status: "open",
    },
  ],
  forbiddenResolutions: ["Do not reveal Odysseus's exact location to Penelope."],
};

const characterDrives = [
  {
    characterId: "penelope",
    desire: "Protect Ithaca from hope becoming a political weapon.",
    fear: "A public rumor will create a crisis.",
    tactic: "Convert uncertainty into small tests.",
    redLine: "Do not name a signal as proof.",
    relationshipPressure: "Her caution asks Telemachus to carry the danger.",
  },
  {
    characterId: "telemachus",
    desire: "Act as Ithaca's heir rather than remain a waiting son.",
    fear: "Caution will become paralysis.",
    tactic: "Turn Penelope's tests into field action.",
    redLine: "Do not let uncertainty excuse inaction.",
    relationshipPressure: "He wants Penelope's trust before certainty.",
  },
];

const authority = (
  scene: typeof opening | typeof sceneTwo | typeof sceneThree,
  status: "active" | "completed" = "active",
) =>
  ({
    sessionId: "story.session.red_sail",
    scenarioId: "story.red_sail_trilogy",
    worldPackId: "trojan-returns-demo",
    worldPackVersion: "0.2.0",
    focalEntityId: "penelope",
    currentSceneNumber: scene.sceneNumber,
    status,
    spine: { ...spine, currentBeat: scene.sceneNumber },
    characterDrives,
    ledger: { cursor: {}, entries: [] },
    scenes: [opening, ...(scene.sceneNumber >= 2 ? [sceneTwo] : []), ...(scene.sceneNumber >= 3 ? [sceneThree] : [])],
    selectedChoiceIds: scene.sceneNumber >= 2 ? [quietChoice.choiceId] : [],
    sessionHash: hash(String(scene.sceneNumber + 3)),
  }) as unknown as StorySessionApi["session"];

const fixtureTrace: StoryModelTrace = {
  mode: "fixture",
  requestedModel: "fixture:red-sail-trilogy-v1",
  actualModel: null,
  responseId: null,
  inputTokens: null,
  outputTokens: null,
  outputSha256: hash("a"),
  processDiagnostics: null,
};

const bootstrap = (transport: "fixture" | "codex_cli" = "fixture") =>
  ({
    transport,
    scenario: {
      id: "story.red_sail_trilogy",
      title: "The Red Sail Trilogy",
      dramaticQuestion: spine.dramaticQuestion,
      maximumSceneCount: 3,
    },
    session: authority(opening),
    opening,
    choices: [quietChoice, bellChoice],
    styleProfile: {
      id: "style.table_ready_mythic",
      label: "Table-ready mythic restraint",
      constraints: [
        {
          id: "style.table_ready_mythic.cadence",
          label: "Cadence",
          value: "Measured clauses break into playable beats.",
          checkMode: "creator_review",
        },
        {
          id: "style.table_ready_mythic.max_words",
          label: "Scene length",
          value: "110–220 English words",
          checkMode: "deterministic",
        },
      ],
    },
  }) as unknown as StorySessionApi;

const turnResult = (
  scene: typeof sceneTwo | typeof sceneThree,
  trace: StoryModelTrace = fixtureTrace,
): StoryTurnApiResult =>
  ({
    status: scene.sceneNumber === 3 ? "completed" : "advanced",
    session: authority(scene, scene.sceneNumber === 3 ? "completed" : "active"),
    scene,
    resolution: scene.resolution,
    whatChanged: scene.resolution.effects,
    causalContext: "bounded fixture context",
    scopeReceipt: {
      allowedClaimIds: ["claim.odyssey.penelope_uncertain_fate"],
      scopeHash: hash("f"),
    },
    trace,
  }) as unknown as StoryTurnApiResult;

test("story-first workbench carries one choice into cost and a second into payoff", async ({
  page,
}) => {
  const sessionRequests: unknown[] = [];
  const turnRequests: Array<{
    authority: { sessionId: string };
    transport: string;
    action: string;
    choiceId?: string;
  }> = [];

  await page.route("**/api/story/session", async (route) => {
    sessionRequests.push(route.request().postDataJSON());
    expect(route.request().headers()[STORY_LIVE_TOKEN_HEADER]).toBeUndefined();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bootstrap()) });
  });
  let turn = 0;
  await page.route("**/api/story/turn", async (route) => {
    turnRequests.push(route.request().postDataJSON() as (typeof turnRequests)[number]);
    const result = turn === 0 ? turnResult(sceneTwo) : turnResult(sceneThree);
    turn += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose how the story is written." })).toBeVisible();
  await page.getByTestId("start-story").click();

  expect(sessionRequests).toEqual([{ transport: "fixture" }]);
  await expect(page.getByTestId("story-mode")).toHaveText("FIXTURE STORY");
  await expect(page.getByTestId("story-scene-1")).toContainText("The Signal");
  await expect(page.getByTestId("what-changed-1")).toContainText("Red sail sighted");
  await expect(page.getByTestId("what-changed-1")).toContainText("Recorded");

  const whyOpening = page.getByTestId("why-followed-1");
  await whyOpening.locator("summary").click();
  await expect(whyOpening).toContainText("Table-ready mythic restraint");
  await expect(whyOpening).toContainText("110–220 English words");

  const candidates = page.getByTestId("candidate-choices");
  expect(await candidates.evaluate((node) => (node as HTMLDetailsElement).open)).toBe(false);
  await candidates.locator("summary").click();
  await page.getByTestId(`candidate-${quietChoice.choiceId}`).click();
  await expect(page.getByTestId("story-action")).toHaveValue(quietChoice.intent);
  await page.getByTestId("continue-story").click();

  expect(turnRequests[0]).toMatchObject({
    authority: { sessionId: "story.session.red_sail" },
    transport: "fixture",
    action: quietChoice.intent,
    choiceId: quietChoice.choiceId,
  });
  await expect(page.getByTestId("story-scene-2")).toContainText("The Cost");
  await expect(page.getByTestId("choice-echo-2")).toHaveText("Choice echo");
  await expect(page.getByTestId("what-changed-2")).toContainText("Public Rumor Contained");
  await expect(page.getByTestId("what-changed-2")).toContainText("Telemachus Exposure");

  const whySecond = page.getByTestId("why-followed-2");
  await whySecond.locator("summary").click();
  await expect(whySecond).toContainText(quietChoice.intent);
  await expect(whySecond).toContainText("Deterministic public-safe fixture");

  await page.getByTestId("candidate-choices").locator("summary").click();
  await page.getByTestId(`candidate-${decoyChoice.choiceId}`).click();
  await page.getByTestId("continue-story").click();

  await expect(page.getByTestId("story-scene-3")).toContainText("The Payoff");
  await expect(page.getByTestId("scene-prose-3")).toContainText("The light among the olives moves with it");
  await expect(page.getByTestId("what-changed-3")).toContainText("Spy Captured");
  await expect(page.getByTestId("story-ending")).toContainText("Small arc complete");
  await expect(page.getByTestId("story-ending")).toContainText("Who hired the captured spy");
  await expect(page.getByTestId("story-action")).toHaveCount(0);
  expect(turnRequests).toHaveLength(2);
  expect(turnRequests[1]).toMatchObject({
    authority: { currentSceneNumber: 2 },
    transport: "fixture",
    choiceId: decoyChoice.choiceId,
  });

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
});

test("Live Codex selection is explicit and is not labeled LIVE before a completed trace", async ({
  page,
}) => {
  const requests: Array<{ transport: string }> = [];
  const authHeaders: Array<string | undefined> = [];
  await page.route("**/api/story/session", async (route) => {
    requests.push(route.request().postDataJSON() as { transport: string });
    authHeaders.push(route.request().headers()[STORY_LIVE_TOKEN_HEADER]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(bootstrap("codex_cli")),
    });
  });

  await page.goto("/");
  await expect(page.getByTestId("transport-codex-cli")).toBeEnabled();
  await selectLiveTransport(page);
  await page.getByTestId("start-story").click();

  expect(requests).toEqual([{ transport: "codex_cli" }]);
  expect(JSON.stringify(requests)).not.toContain(LIVE_TOKEN);
  expect(authHeaders).toEqual([LIVE_TOKEN]);
  await expect(page.getByTestId("story-mode")).toHaveText("CODEX LANE · NO TRACE");
  await expect(page.getByTestId("story-product-claim")).toContainText("No completed prose trace yet");
  await expect(page.getByTestId("story-product-claim")).not.toContainText("Written live");
});

test("completed Codex CLI trace earns the LIVE label", async ({ page }) => {
  const liveTrace: StoryModelTrace = {
    mode: "codex_cli",
    requestedModel: "gpt-5.6-sol",
    actualModel: null,
    responseId: null,
    inputTokens: null,
    outputTokens: null,
    outputSha256: hash("c"),
    processDiagnostics: {
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdoutBytes: 2048,
      stderrBytes: 0,
      stdoutSha256: hash("d"),
      stderrSha256: hash("e"),
    },
  };
  await page.route("**/api/story/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(bootstrap("codex_cli")),
    });
  });
  await page.route("**/api/story/turn", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(turnResult(sceneTwo, liveTrace)),
    });
  });

  await page.goto("/");
  await selectLiveTransport(page);
  await page.getByTestId("start-story").click();
  await page.getByTestId("candidate-choices").locator("summary").click();
  await page.getByTestId(`candidate-${quietChoice.choiceId}`).click();
  await page.getByTestId("continue-story").click();

  await expect(page.getByTestId("story-mode")).toHaveText("LIVE");
  await expect(page.getByTestId("story-product-claim")).toHaveText(
    "Built with Codex. Written live through Codex · requested gpt-5.6-sol. Remembered by Penelope.",
  );
});

test("failed live turn does not fall back until the creator explicitly requests rehearsal", async ({
  page,
}) => {
  const turnRequests: Array<{
    authority: { sessionId: string };
    transport: string;
    action: string;
    choiceId?: string;
  }> = [];
  const turnAuthHeaders: Array<string | undefined> = [];
  await page.route("**/api/story/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(bootstrap("codex_cli")),
    });
  });
  await page.route("**/api/story/turn", async (route) => {
    const request = route.request().postDataJSON() as (typeof turnRequests)[number];
    turnRequests.push(request);
    turnAuthHeaders.push(route.request().headers()[STORY_LIVE_TOKEN_HEADER]);
    if (request.transport === "codex_cli") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "codex_cli_failed", message: "Codex process ended before a scene was accepted." },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(turnResult(sceneTwo)),
    });
  });

  await page.goto("/");
  await selectLiveTransport(page);
  await page.getByTestId("start-story").click();
  await page.getByTestId("candidate-choices").locator("summary").click();
  await page.getByTestId(`candidate-${quietChoice.choiceId}`).click();
  await page.getByTestId("continue-story").click();

  await expect(page.getByTestId("story-error")).toContainText("No fixture fallback was used");
  await expect(page.getByTestId("retry-live-turn")).toBeVisible();
  await expect(page.getByTestId("continue-fixture-turn")).toBeVisible();
  expect(turnRequests).toHaveLength(1);
  expect(turnRequests[0]?.transport).toBe("codex_cli");
  expect(turnAuthHeaders).toEqual([LIVE_TOKEN]);
  expect(JSON.stringify(turnRequests[0])).not.toContain(LIVE_TOKEN);

  await page.getByTestId("continue-fixture-turn").click();
  await expect(page.getByTestId("story-scene-2")).toContainText("The Cost");
  await expect(page.getByTestId("story-mode")).toHaveText("FIXTURE STORY");
  expect(turnRequests).toHaveLength(2);
  expect(turnRequests[1]).toMatchObject({
    authority: { sessionId: turnRequests[0]?.authority.sessionId },
    transport: "fixture",
    action: turnRequests[0]?.action,
    choiceId: turnRequests[0]?.choiceId,
  });
  expect(turnAuthHeaders).toEqual([LIVE_TOKEN, undefined]);
});

test("failed Live Codex start stays failed without fixture fallback", async ({ page }) => {
  let sessionCalls = 0;
  await page.route("**/api/story/session", async (route) => {
    sessionCalls += 1;
    expect(route.request().postDataJSON()).toEqual({ transport: "codex_cli" });
    expect(route.request().headers()[STORY_LIVE_TOKEN_HEADER]).toBe(LIVE_TOKEN);
    expect(JSON.stringify(route.request().postDataJSON())).not.toContain(LIVE_TOKEN);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "codex_cli_unavailable", message: "Local Codex CLI is unavailable." } }),
    });
  });

  await page.goto("/");
  await selectLiveTransport(page);
  await page.getByTestId("start-story").click();

  await expect(page.getByTestId("start-error")).toContainText("Live Codex did not start");
  await expect(page.getByTestId("start-error")).toContainText("No fixture fallback was used");
  await expect(page.getByTestId("story-mode")).toHaveCount(0);
  expect(sessionCalls).toBe(1);
});

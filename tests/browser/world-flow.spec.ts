import { expect, test } from "@playwright/test";
import type {
  WorldNarrationDraftDecisionApiRequest,
  WorldParticipantSessionView,
} from "@/src/contracts/world-api";

const isWorldResponse = (url: string, suffix: string): boolean =>
  new URL(url).pathname === suffix;

test("runs a source-bounded Odyssey branch and preserves its parent checkpoint", async ({ page }) => {
  const openingResponsePromise = page.waitForResponse((response) =>
    isWorldResponse(response.url(), "/api/world/session"),
  );
  const openingCreatorPromise = page.waitForResponse((response) =>
    isWorldResponse(response.url(), "/api/world/creator"),
  );
  await page.goto("/world");

  const openingResponse = await openingResponsePromise;
  const openingPayload = await openingResponse.json() as Record<string, unknown>;
  expect(openingPayload).not.toHaveProperty("creatorReceipt");
  expect(JSON.stringify(openingPayload)).not.toContain("Disguised Odysseus");
  const creatorCapability = openingResponse.headers()["x-penelope-creator-access"];
  expect(creatorCapability).toBeTruthy();
  const openingCreatorResponse = await openingCreatorPromise;
  expect(openingCreatorResponse.status()).toBe(200);
  expect(openingCreatorResponse.request().headers()["x-penelope-creator-access"]).toBe(creatorCapability);
  expect(JSON.stringify(openingCreatorResponse.request().postDataJSON())).not.toContain(creatorCapability);

  await expect(
    page
      .getByTestId("world-scene")
      .getByRole("heading", { name: "The Night of the Scar", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("world-scene")).toBeVisible();
  await expect(page.getByTestId("world-provenance")).toContainText("Fixture narration");
  await expect(page.getByTestId("world-provenance")).toContainText("no model call");
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Test the stranger's testimony/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Order the foot washing/u })).toBeVisible();
  await expect(page.getByText("C · Shape another direction")).toBeVisible();
  await expect(page.getByLabel("Suggested actions").getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("world-scene")).not.toContainText("Disguised Odysseus");
  expect(await page.getByTestId("world-prose").locator("p").count()).toBeGreaterThan(0);

  await page.getByText("Open creator inspector").click();
  const ruleProvenance = page.getByRole("heading", { name: "Rule provenance" }).locator("..");
  await expect(ruleProvenance).toContainText("Source-grounded");
  await expect(ruleProvenance).toContainText("Creator-approved · not source canon");
  await expect(ruleProvenance).toContainText("Creator review required");
  await expect(ruleProvenance).toContainText("ending.controlled_discovery");
  const curtainLedger = page.getByTestId("behind-curtain-premises");
  await expect(curtainLedger).toContainText("The curtain ledger");
  await expect(curtainLedger).toContainText("premise.stranger_identity");
  await expect(curtainLedger).toContainText("Withheld because");

  const firstTurnResponsePromise = page.waitForResponse((response) =>
    isWorldResponse(response.url(), "/api/world/turn"),
  );
  const firstTurnCreatorPromise = page.waitForResponse((response) =>
    isWorldResponse(response.url(), "/api/world/creator"),
  );
  await page.getByTestId("world-candidate-2").click();
  await expect(page.getByTestId("world-action")).not.toHaveValue("");
  await page.getByTestId("world-resolve").click();

  const firstTurnResponse = await firstTurnResponsePromise;
  const firstTurnPayload = await firstTurnResponse.json() as Record<string, unknown>;
  expect(firstTurnPayload).not.toHaveProperty("creatorReceipt");
  expect((await firstTurnCreatorPromise).status()).toBe(200);

  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(2);
  await expect(page.getByText(/Checkpoint 2 · Turn 1 of 6/u)).toBeVisible();
  await expect(page.getByTestId("world-scene")).not.toContainText("Disguised Odysseus");

  await page.getByTestId("world-candidate-1").click();
  await page.getByTestId("world-fork").check();
  await page.getByTestId("world-resolve").click();

  await expect(page.getByTestId("world-ending")).toContainText("Controlled Discovery");
  await expect(page.getByTestId("behind-curtain-risks")).toContainText(
    "Eurycleia's answer may have reached Melantho",
  );
  await expect(page.getByTestId("behind-curtain-risks")).toContainText(
    "not reader-facing facts",
  );
  await expect(page.getByTestId("world-scene")).not.toContainText(
    "Melantho may have heard",
  );
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(3);

  await page.getByTestId("world-checkpoint-2").click();
  await expect(page.getByText(/Checkpoint 2 · Turn 1 of 6/u)).toBeVisible();
  await expect(page.getByTestId("world-ending")).toHaveCount(0);
  await page.getByTestId("world-candidate-2").click();
  await page.getByTestId("world-resolve").click();

  await expect(page.getByTestId("world-ending")).toContainText("Canon Contained");
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(4);
  await expect(page.getByTestId("world-checkpoint-3")).toBeVisible();
});

test("shows how removing a witness creates an investigator and changes the ending", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /continues your world/iu })).toBeVisible();
  await expect(page.getByTestId("world-pulse-baseline")).toContainText(
    "The world is armed before the first choice",
  );
  await expect(page.getByTestId("world-npc-card-entity-melantho")).toContainText(
    "Discover irregular behavior",
  );
  await expect(page.getByTestId("world-npc-card-entity-melantho")).toContainText(
    "Different zone / offstage",
  );
  await expect(page.getByTestId("world-compare-left")).toHaveCount(0);
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);

  await page.getByTestId("world-guided-demo-load").click();
  await expect(page.getByTestId("world-action")).toHaveValue(
    "Penelope asks Melantho to leave before she questions the stranger.",
  );
  await expect(page.getByTestId("world-fork")).toBeChecked();
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);
  await page.getByTestId("world-resolve").click();

  await page.getByTestId("world-creator-answer").fill(
    "Keep the interview private while Penelope tests the stranger.",
  );
  await page.getByTestId("world-creator-answer-submit").click();
  await page.getByTestId("world-creator-answer").fill(
    "Penelope suspects the household is listening and needs room to judge safely.",
  );
  await page.getByTestId("world-creator-answer-submit").click();
  await page.getByTestId("world-creator-answer").fill(
    "Melantho may feel excluded and become more suspicious.",
  );
  await page.getByTestId("world-creator-answer-submit").click();

  await expect(page.getByTestId("world-creator-confirmation")).toContainText(
    "Dismiss a witness",
  );
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);
  await page.getByTestId("world-creator-confirm").click();

  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("world-pulse-action")).toContainText(
    "Penelope sends Melantho away",
  );
  await expect(page.getByTestId("world-pulse-actor-entity-melantho")).toContainText(
    "Washing Store",
  );
  await expect(page.getByTestId("world-pulse-clock-clock-suitor-suspicion")).toContainText(
    "0 → 1 / 4",
  );
  await expect(page.getByTestId("world-npc-zone-entity-melantho")).toContainText(
    "Washing Store",
  );
  await expect(page.getByTestId("world-npc-card-entity-melantho")).toContainText(
    "Different zone / offstage",
  );
  await expect(page.getByTestId("world-compare-left")).toBeVisible();

  await page.getByRole("button", { name: /Order the foot washing/iu }).click();
  await page.getByTestId("world-resolve").click();
  await expect(page.getByTestId("world-ending")).toContainText("Plan Compromised");
  await expect(page.getByTestId("world-npc-agenda-entity-melantho")).toContainText(
    "2 premises",
  );

  await page.getByTestId("world-checkpoint-1").click();
  await page.getByRole("button", { name: /Order the foot washing/iu }).click();
  await page.getByTestId("world-resolve").click();
  await page.getByTestId("world-candidate-2").click();
  await page.getByTestId("world-resolve").click();
  await expect(page.getByTestId("world-ending")).toContainText("Canon Contained");

  const comparison = page.getByTestId("world-fork-compare");
  await expect(comparison).toContainText("Plan Compromised");
  await expect(comparison).toContainText("Canon Contained");
  await expect(page.getByTestId("world-compare-common-ancestor")).toContainText(
    "Shared source checkpoint 01",
  );
  await expect(page.getByTestId("world-compare-delta-clock-identity-exposure")).toBeVisible();
  await expect(page.getByTestId("world-compare-delta-position")).toContainText("Melantho");
  await expect(page.getByTestId("world-provenance")).toContainText("no model call");
});

test("elicits a creator's tacit intent before C changes the world", async ({ page }) => {
  await page.goto("/world");
  await expect(page.getByTestId("world-scene")).toBeVisible();
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);

  await page.getByTestId("world-action").fill(
    "Penelope asks Melantho to leave before she questions the stranger.",
  );
  await page.getByTestId("world-resolve").click();

  const dialogue = page.getByTestId("world-creator-dialogue");
  await expect(dialogue).toContainText(
    "If this works, what should Penelope gain, protect, or change?",
  );
  await expect(page.getByText(/Checkpoint 1 · Turn 0 of 6/u)).toBeVisible();
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);

  await page.getByTestId("world-creator-answer").fill(
    "Keep the interview private while Penelope tests the stranger.",
  );
  await page.getByTestId("world-creator-answer-submit").click();
  await expect(dialogue).toContainText(
    "Why does Penelope choose this now",
  );

  await page.getByTestId("world-creator-answer").fill(
    "Penelope suspects the household is listening and needs room to judge safely.",
  );
  await page.getByTestId("world-creator-answer-submit").click();
  await expect(dialogue).toContainText(
    "What consequence is Penelope willing to risk",
  );

  await page.getByTestId("world-creator-answer").fill(
    "Melantho may feel excluded and become more suspicious.",
  );
  await page.getByTestId("world-creator-answer-submit").click();

  const confirmation = page.getByTestId("world-creator-confirmation");
  await expect(confirmation).toContainText("Dismiss a witness");
  await expect(confirmation).toContainText(
    "buying privacy by creating a visible exclusion",
  );
  await expect(confirmation).toContainText(
    "Melantho may feel excluded and become more suspicious.",
  );
  await expect(page.getByTestId("world-creator-proposal-hash")).toHaveText(
    /^[a-f0-9]{12}…$/u,
  );
  await expect(page.getByText(/Checkpoint 1 · Turn 0 of 6/u)).toBeVisible();
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);

  await page.getByTestId("world-creator-confirm").click();

  await expect(page.getByText(/Checkpoint 2 · Turn 1 of 6/u)).toBeVisible();
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("world-scene")).toContainText("Melantho");
  await page.getByText("Open creator inspector").click();
  await expect(page.getByTestId("creator-direction-audit")).toContainText(
    "Penelope asks Melantho to leave before she questions the stranger.",
  );
  await expect(page.getByTestId("creator-direction-audit")).toContainText(
    "action.penelope.clear_room",
  );
});

test("lets a creator abandon an unfinished C interview without spending a turn", async ({ page }) => {
  await page.goto("/world");
  await expect(page.getByTestId("world-scene")).toBeVisible();

  await page.getByTestId("world-action").fill(
    "Penelope tests the stranger without asking him directly.",
  );
  await page.getByTestId("world-resolve").click();
  const dialogue = page.getByTestId("world-creator-dialogue");
  await expect(dialogue).toBeVisible();
  await expect(page.getByText(/Checkpoint 1 · Turn 0 of 6/u)).toBeVisible();

  await dialogue.getByRole("button", { name: "Revise the original direction" }).click();

  await expect(page.getByTestId("world-action")).toHaveValue(
    "Penelope tests the stranger without asking him directly.",
  );
  await expect(page.getByText(/Checkpoint 1 · Turn 0 of 6/u)).toBeVisible();
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);
});

test("exposes the local Codex token only as a restart credential control", async ({ page }) => {
  await page.goto("/world");
  await expect(page.getByTestId("world-scene")).toBeVisible();

  await page.getByTestId("world-transport-codex-cli").check();
  await expect(page.getByTestId("world-live-token")).toBeVisible();
  await expect(page.getByTestId("world-restart")).toBeDisabled();
  await page.getByTestId("world-live-token").fill("local-browser-token");
  await expect(page.getByTestId("world-restart")).toBeEnabled();
  await expect(page.getByText(/x-penelope-story-token/u)).toBeVisible();
});

test("keeps a folded narration candidate outside checkpoints until creator approval", async ({ page }) => {
  let openingPayload: WorldParticipantSessionView | null = null;
  let submittedEdit: WorldNarrationDraftDecisionApiRequest | null = null;

  await page.route("**/api/world/turn", async (route) => {
    if (!openingPayload) throw new Error("Opening payload was not captured.");
    const base = openingPayload;
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "creator_review",
        question: "Does this narration fit what just happened in the world?",
        authority: {
          draftId: "draft.world_narration.browser",
          draftHash: "a".repeat(64),
          baseCheckpointId: base.sessionId,
          baseStateHash: base.stateHash,
          candidateStateHash: "b".repeat(64),
          receiptHash: "c".repeat(64),
          modelOutputHash: "d".repeat(64),
          artifactsHash: "e".repeat(64),
          traceHash: "f".repeat(64),
          transport: base.transport,
          forkBeforeAction: false,
          creatorReviewRuleIds: ["AC-FID-01"],
          expiresAtMs: Date.now() + 60_000,
        },
        narration: {
          format: "english_prose_paragraphs",
          paragraphs: [
            {
              paragraphId: "browser.paragraph.1",
              text: "Eurycleia stops when she sees the old scar.",
            },
          ],
          prose: "Eurycleia stops when she sees the old scar.",
        },
        narratorTrace: {
          provenance: "model",
          adapterId: "browser.codex_cli_narration",
        },
      }),
    });
  });
  await page.route("**/api/world/narration-draft", async (route) => {
    if (!openingPayload) throw new Error("Opening payload was not captured.");
    submittedEdit =
      route.request().postDataJSON() as WorldNarrationDraftDecisionApiRequest;
    if (submittedEdit.decision.action !== "edit") {
      throw new Error("Expected the browser to submit an edited narration.");
    }
    const editedText = submittedEdit.decision.paragraphs[0]?.text;
    if (!editedText) throw new Error("Expected one edited paragraph.");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "approved",
        session: {
          ...openingPayload,
          sessionId: ["00000000", "0000", "4000", "8000", "000000000099"].join("-"),
          parentCheckpointId: openingPayload.sessionId,
          turn: 1,
          stateHash: "9".repeat(64),
          visibleEvents: [],
          narration: {
            format: "english_prose_paragraphs",
            paragraphs: [
              { paragraphId: "browser.paragraph.1", text: editedText },
            ],
            prose: editedText,
          },
          narratorTrace: {
            provenance: "model",
            adapterId: "browser.codex_cli_narration",
          },
        },
      }),
    });
  });

  const openingResponsePromise = page.waitForResponse((response) =>
    isWorldResponse(response.url(), "/api/world/session"),
  );
  await page.goto("/world");
  openingPayload =
    await (await openingResponsePromise).json() as WorldParticipantSessionView;

  await page.getByTestId("world-candidate-2").click();
  await page.getByTestId("world-resolve").click();
  await expect(page.getByTestId("world-narration-review")).toContainText(
    "Does this narration fit what just happened in the world?",
  );
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);
  const details = page.getByTestId("world-pending-draft");
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await page.getByTestId("world-draft-paragraph-1").fill(
    "Eurycleia sees the old scar and stops.",
  );
  await page.getByTestId("world-draft-edit").click();

  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(2);
  await expect(page.getByTestId("world-prose")).toContainText(
    "Eurycleia sees the old scar and stops.",
  );
  expect(submittedEdit).toMatchObject({
    decision: {
      action: "edit",
      paragraphs: [
        {
          paragraphId: "browser.paragraph.1",
          text: "Eurycleia sees the old scar and stops.",
        },
      ],
    },
  });
});

test("keeps the participant scene usable when creator capability inspection fails", async ({ page }) => {
  await page.route("**/api/world/creator", async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "world_creator_access_denied",
          message: "Creator-only world truth requires this workbench's capability.",
        },
      }),
    });
  });

  await page.goto("/world");
  await expect(page.getByTestId("world-scene")).toBeVisible();
  await page.getByText("Open creator inspector").click();
  await expect(page.getByTestId("creator-inspector-locked")).toContainText("Creator inspector locked");
  await expect(page.getByTestId("creator-inspector-locked")).toContainText("Participant narration and actions remain available");

  await page.getByTestId("world-candidate-2").click();
  await page.getByTestId("world-resolve").click();
  await expect(page.getByText(/Checkpoint 2 · Turn 1 of 6/u)).toBeVisible();
  await expect(page.getByTestId("world-scene")).toBeVisible();
});

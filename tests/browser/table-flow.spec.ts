import { expect, test } from "@playwright/test";

test("fixture Table completes proposal, approval, rebase, and exactly two transitions", async ({
  page,
}) => {
  await page.goto("/table");

  await expect(page.getByTestId("fixture-mode")).toContainText("FIXTURE MODE");
  await expect(page.getByTestId("participant-intent-0")).toBeVisible();
  await expect(page.getByTestId("participant-intent-1")).toBeVisible();
  await expect(page.locator("[data-testid^='participant-intent-']")).toHaveCount(2);
  await expect(page.getByTestId("participant-intent-0")).toHaveAttribute("data-frozen", "true");
  await expect(page.getByTestId("participant-intent-1")).toHaveAttribute("data-frozen", "true");
  await expect(page.locator(".participant-card textarea")).toHaveCount(0);
  await expect(page.locator(".participant-card [contenteditable='true']")).toHaveCount(0);
  await expect(page.getByTestId("style-profile")).toHaveAttribute("data-frozen", "true");
  await expect(page.getByTestId("run-candidate")).toHaveText(/Run frozen rehearsal/);
  await expect(page.getByTestId("responsibility-contract")).toContainText(
    "Model proposes · Harness verifies · Creator decides",
  );
  await expect(page.getByTestId("responsibility-contract")).toContainText(
    "The creator owns the style profile, canon changes, and every final release decision.",
  );
  await expect(page.getByTestId("replay-panel")).toBeVisible();
  await expect(page.getByTestId("replay-panel").locator(".status-chip.pass")).toHaveCount(5);
  await expect(page.getByTestId("grounded-proof")).toContainText("GROUNDED SCENE");
  await expect(page.getByTestId("grounded-proof")).toContainText("claim.odyssey.penelope_uncertain_fate");
  await expect(page.getByTestId("knowledge-boundary")).toContainText("Who can know this?");
  await expect(page.getByTestId("knowledge-narrator-visible")).toContainText("Odysseus is on Ogygia");
  await expect(page.getByTestId("knowledge-penelope-withheld")).toContainText(
    "Odysseus's exact Ogygia location",
  );
  await expect(page.getByTestId("knowledge-penelope-uncertain")).toContainText(
    "Odysseus's fate",
  );
  await expect(page.getByTestId("conflict-graph")).toContainText("blocked assertion");
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  const initialCanonHash = await page.getByTestId("canon-hash").textContent();

  const frozenRunRequest = page.waitForRequest(
    (request) => request.url().endsWith("/api/runs") && request.method() === "POST",
  );
  await page.getByTestId("run-candidate").click();
  const runPayload = (await frozenRunRequest).postDataJSON() as {
    draftFixtureId: string;
    brief: string;
    participantIntents: Array<{ intentId: string; intent: string }>;
  };
  expect(runPayload).toMatchObject({
    draftFixtureId: "draft.red_sail_proposal",
    brief: "Propose a red-sail signal, but do not treat it as canon before approval.",
  });
  expect(runPayload.participantIntents.map(({ intentId }) => intentId)).toEqual([
    "intent.penelope",
    "intent.telemachus",
  ]);

  await expect(page.getByTestId("run-status")).toHaveText("Creator decision required");
  await expect(page.getByTestId("proposal")).toContainText("GHOST PROPOSAL");
  await expect(page.getByTestId("proposal-semantic-rule")).toContainText("Locked semantic rule");
  const semanticDescription = page.getByTestId("proposal-semantic-description");
  await expect(semanticDescription).toHaveText(/\S/);
  const lockedSemanticDescription = (await semanticDescription.textContent())?.trim() ?? "";
  const lineage = page.locator(".lineage-card");
  await expect(lineage).toContainText("penelope");
  await expect(lineage).toContainText("telemachus");
  await expect(lineage).toContainText("authorizing intent · intent.penelope");
  await expect(lineage).toContainText("contributing intent · intent.telemachus");
  await expect(lineage).toContainText("authorizing intent · intent.telemachus");
  await expect(lineage).toContainText("contributing intent · intent.penelope");
  await expect(lineage).toContainText(
    "A signal is not a return; let the watch look before the hall believes.",
  );
  await expect(lineage).toContainText(
    "Then let a red sail call the harbor watch, and nothing more.",
  );
  await expect(page.getByTestId("intent-coverage")).toContainText(
    "2/2 intents authorize a playable line",
  );
  await expect(page.getByTestId("style-receipt")).toContainText("MAX_WORDS");
  await expect(page.getByTestId("style-receipt")).toContainText("180");
  await expect(page.getByTestId("style-receipt")).toContainText("PASS");
  await expect(page.getByTestId("style-receipt")).toContainText("creator review required");
  await expect(page.getByTestId("style-receipt")).toContainText(
    "style.table_ready_mythic.cadence",
  );
  await expect(page.getByTestId("style-receipt")).toContainText("Referenced ≠ verified");
  await expect(page.getByTestId("style-receipt")).toContainText("Live AB/BA not measured.");
  const fixtureWordCount = Number(await page.getByTestId("style-word-count").textContent());
  expect(fixtureWordCount).toBeGreaterThan(0);
  expect(fixtureWordCount).toBeLessThanOrEqual(180);
  await expect(page.getByRole("img", { name: "Narrative evidence and proposal graph" })).toBeVisible();
  await expect(page.getByTestId("graph").getByText("Graph as text")).toBeVisible();
  expect(
    await page
      .getByTestId("graph")
      .locator("details")
      .evaluate((details) => (details as HTMLDetailsElement).open),
  ).toBe(false);
  expect(
    await page.evaluate(() => {
      const gate = document.querySelector("[data-testid='proposal']");
      const graph = document.querySelector("[data-testid='graph']");
      return Boolean(
        gate &&
          graph &&
          (gate.compareDocumentPosition(graph) & Node.DOCUMENT_POSITION_FOLLOWING),
      );
    }),
  ).toBe(true);
  await expect(page.getByTestId("decision-reject")).toBeVisible();
  await expect(page.getByTestId("decision-edit")).toBeVisible();
  await expect(page.getByTestId("decision-accept")).toBeVisible();

  await page.getByTestId("decision-accept").click();

  await expect(page.getByTestId("run-status")).toHaveText("Canon approved · state rebased");
  await expect(page.getByTestId("overlay-version")).toHaveText("v1");
  await expect(page.getByTestId("canon-hash")).not.toHaveText(initialCanonHash ?? "");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  await expect(page.getByTestId("state-timeline")).toContainText("S0r");
  await expect(page.getByTestId("state-timeline")).toContainText("Same turn and variables");
  await expect(page.getByTestId("proposal-semantic-description")).toHaveText(
    lockedSemanticDescription,
  );
  await expect(page.getByTestId("graph")).toContainText(lockedSemanticDescription);
  await expect(page.getByTestId("replay-panel")).toContainText("APPROVED-OVERLAY REPLAY");
  await expect(page.getByTestId("replay-authority")).toContainText("overlay v1");
  await expect(page.getByTestId("replay-panel").locator(".status-chip.pass")).toHaveCount(5);
  await expect(page.getByTestId("graph")).toContainText("approved creator canon");
  await expect(page.getByTestId("graph")).not.toContainText("unapproved proposal");

  await page.getByTestId("advance-step-1").click();
  await expect(page.getByTestId("run-status")).toHaveText("Step 1 applied");
  await expect(page.getByTestId("state-value")).toHaveText("watching");

  await page.getByTestId("advance-step-2").click();
  await expect(page.getByTestId("run-status")).toHaveText("Two-step rehearsal complete");
  await expect(page.getByTestId("state-value")).toHaveText("signal_seen");
  await expect(page.getByText("Hash chain continuous across 2 transitions.")).toBeVisible();
  await expect(page.getByText("Scenario limit reached.")).toBeVisible();
  await expect(page.getByText("No third-step action is available.")).toBeVisible();
  await expect(page.getByTestId("completion-summary")).toContainText("fixture only");
  await expect(page.getByTestId("completion-summary")).toContainText("overlay v1");
  await expect(page.getByTestId("completion-summary")).toContainText("4/4 controls pass");
  await expect(page.getByTestId("completion-summary")).toContainText(
    "1 deterministic pass · 6 creator review",
  );
  const reviewPacket = page.getByTestId("production-review-packet");
  expect(await reviewPacket.evaluate((details) => (details as HTMLDetailsElement).open)).toBe(false);
  await reviewPacket.locator("summary").click();
  await expect(reviewPacket).toContainText("Intent lineage");
  await expect(reviewPacket).toContainText("intent.penelope");
  await expect(reviewPacket).toContainText("Creator canon delta");
  await expect(reviewPacket).toContainText("idle → idle → watching → signal_seen");
  await expect(reviewPacket).toContainText("Knowledge boundary · 1 withheld · 1 uncertain");
  await expect(reviewPacket).toContainText("Conflict control · needs creator decision");
  await expect(reviewPacket).toContainText("not production-readiness evidence");
  await expect(page.getByTestId("advance-step-1")).toHaveCount(0);
  await expect(page.getByTestId("advance-step-2")).toHaveCount(0);

  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasPageOverflow).toBe(false);

  await page.getByTestId("replay-demo").click();
  await expect(page.getByTestId("run-status")).toHaveText("Ready for rehearsal");
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
});

test("creator edits display wording without changing locked semantics", async ({ page }) => {
  await page.goto("/table");
  await page.getByTestId("run-candidate").click();

  const semanticDescription = page.getByTestId("proposal-semantic-description");
  const lockedSemanticDescription = (await semanticDescription.textContent())?.trim() ?? "";
  expect(lockedSemanticDescription).not.toBe("");

  await page.getByTestId("decision-edit").click();
  const editedRule = page.getByLabel("Edit display wording");
  await expect(editedRule).toBeVisible();
  await editedRule.fill(
    "A red sail asks the Ithacan watch to observe before declaring a return.",
  );
  await page.getByTestId("decision-apply-edit").click();

  await expect(page.getByTestId("run-status")).toHaveText("Canon approved · state rebased");
  await expect(page.getByTestId("proposal-semantic-description")).toHaveText(
    lockedSemanticDescription,
  );
  await expect(page.getByTestId("proposal-display-wording")).toContainText(
    "A red sail asks the Ithacan watch to observe before declaring a return.",
  );
  const graphText = page.getByTestId("graph").locator("details");
  expect(await graphText.evaluate((details) => (details as HTMLDetailsElement).open)).toBe(false);
  await graphText.locator("summary").click();
  await expect(graphText).toContainText(lockedSemanticDescription);
  await expect(graphText).toContainText("Display wording (non-authoritative)");
  await expect(graphText).toContainText(
    "A red sail asks the Ithacan watch to observe before declaring a return.",
  );
});

test("reject preserves the initial overlay and state", async ({ page }) => {
  await page.goto("/table");
  await page.getByTestId("run-candidate").click();
  await expect(page.getByTestId("decision-reject")).toBeVisible();
  await page.getByTestId("decision-reject").click();

  await expect(page.getByTestId("run-status")).toHaveText("Proposal rejected · state unchanged");
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  await expect(page.getByText("Rejected safely.")).toBeVisible();
});

test("a failed decision replay never advances the visible canon or state", async ({ page }) => {
  await page.goto("/table");
  await page.getByTestId("run-candidate").click();
  await expect(page.getByTestId("decision-accept")).toBeVisible();
  await page.route("**/api/decisions", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "creator_decision_regression_failed",
          message: "Injected approved-overlay replay failure.",
        },
      }),
    });
  });
  await page.getByTestId("decision-accept").click();

  await expect(page.getByTestId("api-error")).toContainText(
    "Injected approved-overlay replay failure",
  );
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  await expect(page.getByTestId("state-timeline")).not.toContainText("S0r");
});

test("a transition error can restart from the registered base without stale decision UI", async ({
  page,
}) => {
  await page.goto("/table");
  await page.getByTestId("run-candidate").click();
  await page.getByTestId("decision-accept").click();
  await expect(page.getByTestId("overlay-version")).toHaveText("v1");

  await page.route("**/api/transitions", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "test_transition_failure", message: "Injected transition failure." },
      }),
    });
  });
  const advanceButton = page.getByTestId("advance-step-1");
  await expect(advanceButton).toBeVisible();
  await expect(advanceButton).toBeEnabled();
  const interceptedTransition = page.waitForRequest(
    (request) => request.url().endsWith("/api/transitions") && request.method() === "POST",
  );
  await advanceButton.click();
  await interceptedTransition;
  await expect(page.getByTestId("api-error")).toContainText("Injected transition failure");
  await page.unroute("**/api/transitions");

  await page.getByTestId("run-candidate").click();
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  await expect(page.getByTestId("decision-accept")).toBeVisible();
  const graphText = page.getByTestId("graph").locator("details");
  expect(await graphText.evaluate((details) => (details as HTMLDetailsElement).open)).toBe(false);
  await graphText.locator("summary").click();
  await expect(
    graphText
      .locator("li")
      .filter({ hasText: "In this creator canon" })
      .filter({ hasText: "unapproved proposal" })
      .first(),
  ).toBeVisible();
});

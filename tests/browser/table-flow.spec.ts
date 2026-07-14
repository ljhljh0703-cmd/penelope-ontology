import { expect, test } from "@playwright/test";

test("fixture Table completes proposal, approval, rebase, and exactly two transitions", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByTestId("fixture-mode")).toContainText("FIXTURE MODE");
  await expect(page.getByTestId("participant-intent-0")).toBeVisible();
  await expect(page.getByTestId("participant-intent-1")).toBeVisible();
  await expect(page.locator("[data-testid^='participant-intent-']")).toHaveCount(2);
  await expect(page.getByTestId("style-profile")).not.toHaveValue("");
  await expect(page.getByTestId("replay-panel")).toBeVisible();
  await expect(page.getByTestId("replay-panel").locator(".status-chip.pass")).toHaveCount(5);
  await expect(page.getByTestId("grounded-proof")).toContainText("GROUNDED SCENE");
  await expect(page.getByTestId("grounded-proof")).toContainText("claim.odyssey.penelope_uncertain_fate");
  await expect(page.getByTestId("conflict-graph")).toContainText("blocked assertion");
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  const initialCanonHash = await page.getByTestId("canon-hash").textContent();

  await page.getByTestId("run-candidate").click();

  await expect(page.getByTestId("run-status")).toHaveText("Creator decision required");
  await expect(page.getByTestId("proposal")).toContainText("GHOST PROPOSAL");
  await expect(page.getByTestId("proposal-semantic-rule")).toContainText("Locked semantic rule");
  const semanticDescription = page.getByTestId("proposal-semantic-description");
  await expect(semanticDescription).toHaveText(/\S/);
  const lockedSemanticDescription = (await semanticDescription.textContent())?.trim() ?? "";
  await expect(page.getByRole("img", { name: "Narrative evidence and proposal graph" })).toBeVisible();
  await expect(page.getByTestId("graph").getByText("Graph as text")).toBeVisible();
  await expect(page.getByTestId("decision-reject")).toBeVisible();
  await expect(page.getByTestId("decision-edit")).toBeVisible();
  await expect(page.getByTestId("decision-accept")).toBeVisible();

  await page.getByTestId("decision-edit").click();
  const editedRule = page.getByLabel("Edit display wording");
  await expect(editedRule).toBeVisible();
  await editedRule.fill(
    "A red sail asks the Ithacan watch to observe before declaring a return.",
  );
  await page.getByTestId("decision-apply-edit").click();

  await expect(page.getByTestId("run-status")).toHaveText("Canon approved · state rebased");
  await expect(page.getByTestId("overlay-version")).toHaveText("v1");
  await expect(page.getByTestId("canon-hash")).not.toHaveText(initialCanonHash ?? "");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  await expect(page.getByTestId("state-timeline")).toContainText("S0r");
  await expect(page.getByTestId("state-timeline")).toContainText("Same turn and variables");
  await expect(page.getByTestId("proposal-semantic-description")).toHaveText(
    lockedSemanticDescription,
  );
  await expect(page.getByTestId("proposal-display-wording")).toContainText(
    "A red sail asks the Ithacan watch to observe before declaring a return.",
  );
  await expect(page.getByTestId("graph")).toContainText(lockedSemanticDescription);
  await expect(page.getByTestId("graph")).toContainText("Display wording (non-authoritative)");
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

test("intent validation is keyboard reachable and does not send an empty intent", async ({ page }) => {
  await page.goto("/");

  const firstIntent = page.getByTestId("participant-intent-0");
  await firstIntent.fill("");
  await page.getByTestId("run-candidate").focus();
  await expect(page.getByTestId("run-candidate")).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.locator(".inline-error")).toContainText("Participant 1 needs an intent");
  await expect(page.getByTestId("run-status")).toHaveText("Ready for rehearsal");
});

test("reject preserves the initial overlay and state", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("run-candidate").click();
  await expect(page.getByTestId("decision-reject")).toBeVisible();
  await page.getByTestId("decision-reject").click();

  await expect(page.getByTestId("run-status")).toHaveText("Proposal rejected · state unchanged");
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  await expect(page.getByText("Rejected safely.")).toBeVisible();
});

test("a failed decision replay never advances the visible canon or state", async ({ page }) => {
  await page.goto("/");
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
  await page.goto("/");
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
  await page.getByTestId("advance-step-1").click();
  await expect(page.getByTestId("api-error")).toContainText("Injected transition failure");
  await page.unroute("**/api/transitions");

  await page.getByTestId("run-candidate").click();
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  await expect(page.getByTestId("decision-accept")).toBeVisible();
  await expect(
    page
      .getByTestId("graph")
      .locator("li")
      .filter({ hasText: "In this creator canon" })
      .filter({ hasText: "unapproved proposal" })
      .first(),
  ).toBeVisible();
});

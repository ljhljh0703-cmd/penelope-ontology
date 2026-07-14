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
  await expect(page.getByTestId("overlay-version")).toHaveText("v0");
  await expect(page.getByTestId("state-value")).toHaveText("idle");

  await page.getByTestId("run-candidate").click();

  await expect(page.getByTestId("run-status")).toHaveText("Creator decision required");
  await expect(page.getByTestId("proposal")).toContainText("GHOST PROPOSAL");
  await expect(page.getByRole("img", { name: "Narrative evidence and proposal graph" })).toBeVisible();
  await expect(page.getByText("Graph as text")).toBeVisible();
  await expect(page.getByTestId("decision-reject")).toBeVisible();
  await expect(page.getByTestId("decision-edit")).toBeVisible();
  await expect(page.getByTestId("decision-accept")).toBeVisible();

  await page.getByTestId("decision-edit").click();
  await expect(page.getByLabel("Edit the rule description")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByTestId("decision-accept").click();

  await expect(page.getByTestId("run-status")).toHaveText("Canon approved · state rebased");
  await expect(page.getByTestId("overlay-version")).toHaveText("v1");
  await expect(page.getByTestId("state-value")).toHaveText("idle");
  await expect(page.getByTestId("state-timeline")).toContainText("S0r");
  await expect(page.getByTestId("state-timeline")).toContainText("Same turn and variables");

  await page.getByTestId("advance-step-1").click();
  await expect(page.getByTestId("run-status")).toHaveText("Step 1 applied");
  await expect(page.getByTestId("state-value")).toHaveText("watching");

  await page.getByTestId("advance-step-2").click();
  await expect(page.getByTestId("run-status")).toHaveText("Two-step rehearsal complete");
  await expect(page.getByTestId("state-value")).toHaveText("signal_seen");
  await expect(page.getByText("Hash chain continuous across 2 transitions.")).toBeVisible();
  await expect(page.getByText("Scenario limit reached.")).toBeVisible();
  await expect(page.getByText("No third-step action is available.")).toBeVisible();
  await expect(page.getByTestId("advance-step-1")).toHaveCount(0);
  await expect(page.getByTestId("advance-step-2")).toHaveCount(0);

  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasPageOverflow).toBe(false);
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

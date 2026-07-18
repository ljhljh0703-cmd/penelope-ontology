import { expect, test } from "@playwright/test";

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

  await expect(page.getByRole("heading", { name: "The Night of the Scar", exact: true })).toBeVisible();
  await expect(page.getByTestId("world-scene")).toBeVisible();
  await expect(page.getByTestId("world-provenance")).toContainText("Fixture narration");
  await expect(page.getByTestId("world-provenance")).toContainText("no model call");
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Test the stranger's testimony/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Order the foot washing/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /Observe without intervening/u })).toBeVisible();
  await expect(page.getByTestId("world-scene")).not.toContainText("Disguised Odysseus");

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

  await page.getByTestId("world-candidate-1").click();
  await page.getByTestId("world-resolve").click();
  await expect(page.getByText(/Checkpoint 2 · Turn 1 of 6/u)).toBeVisible();
  await expect(page.getByTestId("world-scene")).toBeVisible();
});

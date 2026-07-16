import { expect, test } from "@playwright/test";
import type {
  StorySessionApi,
  StoryTurnApiRequest,
  StoryTurnApiResult,
} from "../../components/story/api-types";

const QUIET_CHOICE_ID = "choice.keep_quiet_watch";
const PAYOFF_CHOICE_ID = "choice.move_decoy_lamp";
const SHA256 = /^[a-f0-9]{64}$/;

const isPostTo = (response: { url(): string; request(): { method(): string } }, path: string) =>
  response.url().endsWith(path) && response.request().method() === "POST";

test("real fixture API carries authority through a complete three-scene story", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose how the story is written." }),
  ).toBeVisible();

  const sessionResponsePromise = page.waitForResponse((response) =>
    isPostTo(response, "/api/story/session"),
  );
  await page.getByTestId("start-story").click();
  const sessionResponse = await sessionResponsePromise;
  expect(sessionResponse.status()).toBe(200);

  const bootstrap = (await sessionResponse.json()) as StorySessionApi;
  const openingHash = bootstrap.session.sessionHash;
  expect(bootstrap.transport).toBe("fixture");
  expect(bootstrap.openingTrace?.mode).toBe("fixture");
  expect(bootstrap.session.currentSceneNumber).toBe(1);
  expect(bootstrap.session.scenes).toHaveLength(1);
  expect(bootstrap.opening.title).toBe("The Signal");
  expect(bootstrap.choices.map((choice) => choice.choiceId)).toContain(QUIET_CHOICE_ID);
  expect(openingHash).toMatch(SHA256);

  await expect(page.getByTestId("story-mode")).toHaveText("FIXTURE STORY");
  await expect(page.getByText("Scene 1 of 3", { exact: true })).toBeVisible();
  await expect(page.getByTestId("story-scene-1")).toContainText("The Signal");
  await expect(page.getByTestId("story-product-claim")).toContainText(
    "Rehearsed as a public-safe fixture",
  );
  await expect(page.getByTestId("story-error")).toHaveCount(0);

  await page.getByTestId("candidate-choices").locator("summary").click();
  await page.getByTestId(`candidate-${QUIET_CHOICE_ID}`).click();

  const costResponsePromise = page.waitForResponse((response) =>
    isPostTo(response, "/api/story/turn"),
  );
  await page.getByTestId("continue-story").click();
  const costResponse = await costResponsePromise;
  expect(costResponse.status()).toBe(200);

  const costRequest = costResponse.request().postDataJSON() as StoryTurnApiRequest;
  const costResult = (await costResponse.json()) as StoryTurnApiResult;
  const costHash = costResult.session.sessionHash;
  expect(costRequest.transport).toBe("fixture");
  expect(costRequest.choiceId).toBe(QUIET_CHOICE_ID);
  expect(costRequest.authority.sessionHash).toBe(openingHash);
  expect(costResult.status).toBe("advanced");
  expect(costResult.scene.title).toBe("The Cost");
  expect(costResult.session.currentSceneNumber).toBe(2);
  expect(costResult.session.scenes).toHaveLength(2);
  expect(costResult.scene.suggestedContinuations.map((choice) => choice.choiceId)).toContain(
    PAYOFF_CHOICE_ID,
  );
  expect(costHash).toMatch(SHA256);
  expect(costHash).not.toBe(openingHash);

  await expect(page.getByText("Scene 2 of 3", { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="story-scene-"]')).toHaveCount(2);
  await expect(page.getByTestId("story-scene-2")).toContainText("The Cost");
  await expect(page.getByTestId("story-error")).toHaveCount(0);

  await page.getByTestId("candidate-choices").locator("summary").click();
  await page.getByTestId(`candidate-${PAYOFF_CHOICE_ID}`).click();

  const payoffResponsePromise = page.waitForResponse((response) =>
    isPostTo(response, "/api/story/turn"),
  );
  await page.getByTestId("continue-story").click();
  const payoffResponse = await payoffResponsePromise;
  expect(payoffResponse.status()).toBe(200);

  const payoffRequest = payoffResponse.request().postDataJSON() as StoryTurnApiRequest;
  const payoffResult = (await payoffResponse.json()) as StoryTurnApiResult;
  const payoffHash = payoffResult.session.sessionHash;
  expect(payoffRequest.transport).toBe("fixture");
  expect(payoffRequest.choiceId).toBe(PAYOFF_CHOICE_ID);
  expect(payoffRequest.authority.sessionHash).toBe(costHash);
  expect(payoffResult.status).toBe("completed");
  expect(payoffResult.scene.title).toBe("The Payoff");
  expect(payoffResult.session.status).toBe("completed");
  expect(payoffResult.session.currentSceneNumber).toBe(3);
  expect(payoffResult.session.scenes).toHaveLength(3);
  expect(payoffHash).toMatch(SHA256);
  expect(payoffHash).not.toBe(costHash);
  expect(payoffHash).not.toBe(openingHash);

  await expect(page.getByText("Scene 3 of 3", { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="story-scene-"]')).toHaveCount(3);
  await expect(page.getByTestId("story-scene-3")).toContainText("The Payoff");
  await expect(page.getByTestId("story-ending")).toContainText("Small arc complete");
  await expect(page.getByTestId("story-ending")).toContainText(
    "The signal is answered without becoming proof.",
  );
  await expect(page.getByTestId("story-action")).toHaveCount(0);
  await expect(page.getByTestId("story-error")).toHaveCount(0);
  await expect(page.getByTestId("continue-fixture-turn")).toHaveCount(0);
  await expect(page.getByText("No fixture fallback was used", { exact: false })).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

import { expect, test } from "@playwright/test";
import worldForgeFixture from "@/tests/fixtures/world-forge-approved.json";

const answers = [
  worldForgeFixture.seedText.value,
  worldForgeFixture.title.value,
  worldForgeFixture.focalCharacterName.value,
  worldForgeFixture.counterpartName.value,
  worldForgeFixture.locationName.value,
  worldForgeFixture.immutableFact.value,
  worldForgeFixture.focalDesire.value,
  worldForgeFixture.counterpartDesire.value,
  worldForgeFixture.stakes.value,
  worldForgeFixture.knowledgeAsymmetry.value,
  worldForgeFixture.forbiddenDevelopment.value,
  worldForgeFixture.endingCondition.value,
  worldForgeFixture.acceptedCost.value,
  worldForgeFixture.recommendedAction.value,
  worldForgeFixture.recommendedConsequence.value,
  worldForgeFixture.alternativeAction.value,
  worldForgeFixture.alternativeConsequence.value,
] as const;

test("forges two or three sentences into an approved private world and finishes scene one", async ({
  page,
}) => {
  await page.goto("/world");
  await page.getByTestId("world-forge-open").click();

  for (const answer of answers) {
    await page.getByTestId("world-forge-answer").fill(answer);
    await page.getByTestId("world-forge-next").click();
  }

  await expect(page.getByTestId("world-forge-review").locator("li")).toHaveCount(17);
  await expect(page.getByTestId("world-forge-compile")).toBeDisabled();
  await page.getByTestId("world-forge-approve").check();
  await page.getByTestId("world-forge-compile").click();

  await expect(
    page.getByRole("heading", { level: 1, name: /The Last Beacon Ledger/u }),
  ).toBeVisible();
  await expect(page.getByTestId("world-pack-picker")).toHaveValue(
    "__session_private_pack__",
  );
  await expect(page.getByTestId("world-scene")).not.toContainText(
    worldForgeFixture.knowledgeAsymmetry.value,
  );
  await expect(page.getByTestId("world-candidate-1")).toContainText(
    worldForgeFixture.recommendedAction.value,
  );
  await expect(page.getByTestId("world-candidate-2")).toContainText(
    worldForgeFixture.alternativeAction.value,
  );

  await page.getByTestId("world-candidate-1").click();
  await page.getByTestId("world-resolve").click();
  await expect(page.getByText(/Branch complete/u)).toBeVisible();
  await expect(page.getByTestId("world-pulse")).toContainText(
    worldForgeFixture.recommendedConsequence.value,
  );
  await expect(page.getByTestId("fate-frame")).toBeVisible();
  await expect(page.getByTestId("fate-frame-ascii")).toBeVisible();
  await expect(page.getByTestId("fate-frame-status")).toHaveText("Candidate");
  await page.getByTestId("fate-frame-approve").click();
  await expect(page.getByTestId("fate-frame-status")).toHaveText("Approved asset");
  await expect(page.getByTestId("fate-frame-bound")).toContainText(
    "Bound to checkpoint 1",
  );
  await page.getByTestId("world-checkpoint-1").click();
  await expect(page.getByTestId("fate-frame")).toHaveCount(0);
  await page.getByTestId("world-checkpoint-2").click();
  await expect(page.getByTestId("fate-frame-status")).toHaveText("Approved asset");
});

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
  worldForgeFixture.relationshipLabel.value,
  worldForgeFixture.relationshipAxis.value,
  worldForgeFixture.relationshipPressure.value,
  worldForgeFixture.sceneTwo.value,
  worldForgeFixture.sceneThree.value,
  worldForgeFixture.sceneFour.value,
  worldForgeFixture.sceneFive.value,
] as const;

test("forges two or three sentences into an approved five-scene private world", async ({
  page,
}) => {
  await page.goto("/world");
  await page.getByTestId("world-forge-open").click();

  for (const answer of answers) {
    await page.getByTestId("world-forge-answer").fill(answer);
    await page.getByTestId("world-forge-next").click();
  }

  await expect(page.getByTestId("world-forge-review").locator("li")).toHaveCount(24);
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
  await expect(page.getByTestId("world-scene")).toContainText("Turn 1 of 5");
  await expect(page.getByTestId("world-prose")).toContainText(
    "The cost becomes visible",
  );
  await expect(page.getByTestId("world-pulse")).toContainText(
    worldForgeFixture.recommendedConsequence.value,
  );
  await page.getByRole("button", { name: "Dismiss The Loom" }).click();
  await expect(page.getByTestId("fate-frame")).toHaveCount(0);
  await page.getByTestId("world-surface-codex").click();
  await expect(page.getByTestId("world-codex-overview")).toContainText("2/5");
  await page.getByTestId("world-codex-tab-relations").click();
  await expect(page.getByTestId("world-codex-relations")).toContainText("strengthened");
  await page.getByTestId("world-surface-scene").click();

  for (let turn = 2; turn <= 5; turn += 1) {
    await page.getByTestId("world-candidate-1").click();
    await page.getByTestId("world-resolve").click();
    await expect(page.getByTestId("world-loom")).toContainText(
      "Your choice has entered the world",
    );
    await page.getByRole("button", { name: "Dismiss The Loom" }).click();
    if (turn === 2) {
      await expect(page.getByTestId("world-prose")).toContainText(
        "The balance turns",
      );
    }
  }
  await expect(page.getByText(/Branch complete/u)).toBeVisible();
  await expect(page.getByTestId("world-checkpoints").getByRole("button")).toHaveCount(6);
  await expect(page.getByTestId("fate-frame")).toBeVisible();
  await expect(page.getByTestId("fate-frame-ascii")).toBeVisible();
  await expect(page.getByTestId("fate-frame-status")).toHaveText("Candidate");
  await page.getByTestId("fate-frame-approve").click();
  await expect(page.getByTestId("fate-frame-status")).toHaveText("Approved asset");
  await expect(page.getByTestId("fate-frame-bound")).toContainText(
    "Bound to checkpoint 5",
  );
  await page.getByTestId("world-checkpoint-1").click();
  await expect(page.getByTestId("fate-frame")).toHaveCount(0);
  await page.getByTestId("world-checkpoint-6").click();
  await expect(page.getByTestId("fate-frame-status")).toHaveText("Approved asset");
  await page.getByTestId("world-surface-codex").click();
  await page.getByTestId("world-codex-tab-plot").click();
  await expect(page.getByTestId("world-codex-plot")).toContainText(
    worldForgeFixture.sceneFive.value,
  );
});

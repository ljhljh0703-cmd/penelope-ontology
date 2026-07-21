import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const creatorPackJson = (): Buffer =>
  readFileSync(resolve("examples/world-packs/creator-owned-starter.json"));

test("switches story worlds and continues an imported creator pack without Odyssey leakage", async ({
  page,
}) => {
  await page.goto("/world");
  await expect(page.getByTestId("world-pack-picker")).toBeVisible();

  await page.getByTestId("world-pack-picker").selectOption(
    "pack.oz.discovery_of_the_wizard",
  );
  await expect(
    page.getByRole("heading", { name: /Behind the Green Screen/u }),
  ).toBeVisible();
  await expect(
    page.getByText("The Wonderful Wizard of Oz · Chapter XV", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("world-scene")).not.toContainText(
    /Odysseus|Ithaca|Eurycleia|Melantho/u,
  );
  await expect(
    page.getByRole("button", { name: /Compare the appearances/u }),
  ).toBeVisible();

  await page.getByTestId("world-pack-import").setInputFiles({
    name: "creator-owned-starter.json",
    mimeType: "application/json",
    buffer: creatorPackJson(),
  });
  await expect(
    page.getByRole("heading", { level: 1, name: /The Lantern Ledger/u }),
  ).toBeVisible();
  await expect(
    page.getByText(/session-scoped server memory only · not persisted · expires after 30 minutes/iu),
  ).toBeVisible();
  await expect(page.getByTestId("world-pack-picker")).toHaveValue(
    "__session_private_pack__",
  );

  await page.getByTestId("world-candidate-1").click();
  await page.getByTestId("world-resolve").click();
  await expect(page.getByText(/Checkpoint 2 · Turn 1 of 2/u)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /The Lantern Ledger/u }),
  ).toBeVisible();
  await expect(page.getByTestId("world-scene")).not.toContainText(
    /Odysseus|Ithaca|Eurycleia|Melantho|Dorothy|Wizard|Toto|Lion/u,
  );
});

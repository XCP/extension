import { test, expect } from "../fixtures";

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'onboarding', 'This test runs only in a clean state (onboarding project).');
});

test.describe("Import Wallet Flow", () => {
  const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const TEST_MNEMONIC_ARRAY = TEST_MNEMONIC.split(" ");

  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/import-wallet`);
    await page.waitForLoadState("networkidle");
  });

  test("validates mnemonic input and creates wallet", async ({ page }) => {
    await expect(page.getByPlaceholder(/Create a password/)).not.toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.getByPlaceholder("Enter word").nth(i).fill(TEST_MNEMONIC_ARRAY[i]);
    }
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await expect(page.getByPlaceholder(/Create a password/)).toBeVisible();

    await page.getByPlaceholder(/Create a password/).fill("short");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Password must be at least 8 characters long")).toBeVisible();

    await page.getByPlaceholder(/Create a password/).fill("TestPassword123!");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/#\/index$/);
    await page.waitForSelector('text=bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
  });

  test("handles invalid mnemonic", async ({ page }) => {
    const invalidMnemonic = TEST_MNEMONIC_ARRAY.slice();
    invalidMnemonic[0] = "invalid";
    for (let i = 0; i < 12; i++) {
      await page.getByPlaceholder("Enter word").nth(i).fill(invalidMnemonic[i]);
    }
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.getByPlaceholder(/Create a password/).fill("TestPassword123!");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Invalid recovery phrase")).toBeVisible();
  });

  test("can toggle mnemonic visibility", async ({ page }) => {
    const firstWordInput = page.getByPlaceholder("Enter word").first();
    await firstWordInput.fill(TEST_MNEMONIC_ARRAY[0]);
    await expect(firstWordInput).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show recovery phrase" }).click();
    await expect(firstWordInput).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide recovery phrase" }).click();
    await expect(firstWordInput).toHaveAttribute("type", "password");
  });

  test("can navigate back to onboarding", async ({ page }) => {
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);
  });
});
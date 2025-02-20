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
    // Initially password input should be hidden
    await expect(page.getByPlaceholder(/Create a password/)).not.toBeVisible();

    // Enter mnemonic words
    for (let i = 0; i < 12; i++) {
      await page.getByPlaceholder("Enter word").nth(i).fill(TEST_MNEMONIC_ARRAY[i]);
    }

    // Check acknowledgment
    await page.getByLabel(/I have saved my secret recovery phrase/).check();

    // Password input should now be visible
    await expect(page.getByPlaceholder(/Create a password/)).toBeVisible();

    // Try short password
    await page.getByPlaceholder(/Create a password/).fill("short");
    await page.getByRole("button", { name: "Continue" }).click();

    // Error message should be visible
    await expect(page.getByText("Password must be at least 8 characters long")).toBeVisible();

    // Use valid password
    await page.getByPlaceholder(/Create a password/).fill("validpassword123");
    await page.getByRole("button", { name: "Continue" }).click();

    // Should redirect to index after wallet creation
    await expect(page).toHaveURL(/#\/index$/);
  });

  test("handles invalid mnemonic", async ({ page }) => {
    // Enter invalid mnemonic
    const invalidMnemonic = TEST_MNEMONIC_ARRAY.slice();
    invalidMnemonic[0] = "invalid";

    for (let i = 0; i < 12; i++) {
      await page.getByPlaceholder("Enter word").nth(i).fill(invalidMnemonic[i]);
    }

    // Check acknowledgment
    await page.getByLabel(/I have saved my secret recovery phrase/).check();

    // Enter password
    await page.getByPlaceholder(/Create a password/).fill("validpassword123");
    await page.getByRole("button", { name: "Continue" }).click();

    // Should show error message
    await expect(page.getByText("Invalid recovery phrase. Please check each word carefully.")).toBeVisible();
  });

  test("can toggle mnemonic visibility", async ({ page }) => {
    // Enter first word
    const firstWordInput = page.getByPlaceholder("Enter word").first();
    await firstWordInput.fill(TEST_MNEMONIC_ARRAY[0]);

    // Initially input should be password type
    await expect(firstWordInput).toHaveAttribute("type", "password");

    // Click show button
    await page.getByRole("button", { name: "Show recovery phrase" }).click();

    // Input should now be text type
    await expect(firstWordInput).toHaveAttribute("type", "text");

    // Click hide button
    await page.getByRole("button", { name: "Hide recovery phrase" }).click();

    // Input should be password type again
    await expect(firstWordInput).toHaveAttribute("type", "password");
  });

  test("can navigate back to onboarding", async ({ page }) => {
    // Click back button
    await page.getByRole("button", { name: /back/i }).click();

    // Should return to onboarding
    await expect(page).toHaveURL(/#\/onboarding$/);
  });
});

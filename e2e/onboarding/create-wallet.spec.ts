import { test, expect } from "../fixtures";

// Run these tests only on the onboarding (clean state) project.
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'onboarding', 'This test runs only in a clean state (onboarding project).');
});

test.describe("Create Wallet Flow", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/create-wallet`);
    await page.waitForLoadState("networkidle");
  });

  test("can refresh mnemonic and reveals password input", async ({ page }) => {
    // Store initial mnemonic by getting all words
    const initialWords = await page.locator('.font-mono').allTextContents();

    // Click refresh button in header
    await page.getByRole("button", { name: "Generate new recovery phrase" }).click();

    // Verify mnemonic changed
    const newWords = await page.locator('.font-mono').allTextContents();
    expect(newWords).not.toEqual(initialWords);

    // Initially password input should be hidden
    await expect(page.getByPlaceholder(/Create a password/)).not.toBeVisible();

    // Click to reveal passphrase
    await page.getByText(/View 12-word Secret Phrase/).click();

    // Verify phrase is now visible
    await expect(page.locator('.blur-sm')).not.toBeVisible();

    // Check the acknowledgment checkbox
    await page.getByLabel(/I have saved my secret recovery phrase/).check();

    // Password input should now be visible
    await expect(page.getByPlaceholder(/Create a password/)).toBeVisible();

    // Refresh should uncheck the checkbox
    await page.getByRole("button", { name: "Generate new recovery phrase" }).click();
    await expect(page.getByLabel(/I have saved my secret recovery phrase/)).not.toBeChecked();
    await expect(page.getByPlaceholder(/Create a password/)).not.toBeVisible();
  });

  test("validates password and creates wallet", async ({ page }) => {
    // Click to reveal passphrase
    await page.getByText(/View 12-word Secret Phrase/).click();

    // Check acknowledgment
    await page.getByLabel(/I have saved my secret recovery phrase/).check();

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
});

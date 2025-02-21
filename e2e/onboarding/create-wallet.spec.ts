import { test, expect } from "../fixtures";

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'onboarding', 'This test runs only in a clean state (onboarding project).');
});

test.describe("Create Wallet Flow", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/create-wallet`);
    await page.waitForLoadState("networkidle");
  });

  test("can refresh mnemonic and reveals password input", async ({ page }) => {
    const initialWords = await page.locator('.font-mono').allTextContents();
    await page.getByRole("button", { name: "Generate new recovery phrase" }).click();
    const newWords = await page.locator('.font-mono').allTextContents();
    expect(newWords).not.toEqual(initialWords);

    await expect(page.getByPlaceholder(/Create a password/)).not.toBeVisible();
    await page.getByText(/View 12-word Secret Phrase/).click();
    await expect(page.locator('.blur-sm')).not.toBeVisible();
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await expect(page.getByPlaceholder(/Create a password/)).toBeVisible();

    await page.getByRole("button", { name: "Generate new recovery phrase" }).click();
    await expect(page.getByLabel(/I have saved my secret recovery phrase/)).not.toBeChecked();
    await expect(page.getByPlaceholder(/Create a password/)).not.toBeVisible();
  });

  test("validates password and creates wallet", async ({ page }) => {
    await page.getByText(/View 12-word Secret Phrase/).click();
    await page.getByLabel(/I have saved my secret recovery phrase/).check();

    await page.getByPlaceholder(/Create a password/).fill("short");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Password must be at least 8 characters long")).toBeVisible();

    await page.getByPlaceholder(/Create a password/).fill("TestPassword123!");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/#\/index$/);
    await page.waitForSelector('text=bc1q');
  });
});
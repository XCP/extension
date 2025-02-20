import { test, expect } from "../fixtures";

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'onboarding', 'This test runs only in a clean state (onboarding project).');
});

test.describe("Onboarding Flow", () => {
  test("redirects to /onboarding when no wallet exists", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/`);
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveURL(new RegExp(`${extensionId}/popup.html#/onboarding$`));

    // Verify onboarding screen elements
    await expect(page.getByRole("button", { name: /Create Wallet/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Import Wallet/i })).toBeVisible();
  });

  test("can navigate between create and import wallet screens", async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/onboarding`);
    await page.waitForLoadState("networkidle");

    // Click create wallet
    await page.getByRole("button", { name: /Create Wallet/i }).click();
    await expect(page).toHaveURL(new RegExp(`${extensionId}/popup.html#/create-wallet$`));

    // Go back using header button
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page).toHaveURL(new RegExp(`${extensionId}/popup.html#/onboarding$`));

    // Click import wallet
    await page.getByRole("button", { name: /Import Wallet/i }).click();
    await expect(page).toHaveURL(new RegExp(`${extensionId}/popup.html#/import-wallet$`));
  });
});

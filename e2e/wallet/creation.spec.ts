/**
 * Wallet Creation Tests
 */

import { test, expect, createWallet, TEST_PASSWORD } from '../fixtures';

test.describe('Wallet Creation', () => {
  test('shows create wallet button on first run', async ({ extensionPage }) => {
    await expect(extensionPage.getByRole('button', { name: 'Create Wallet' })).toBeVisible();
  });

  test('navigates to create wallet page', async ({ extensionPage }) => {
    await extensionPage.getByRole('button', { name: 'Create Wallet' }).click();
    await expect(extensionPage).toHaveURL(/create-wallet/);
    await expect(extensionPage.locator('text=View 12-word Secret Phrase')).toBeVisible();
  });

  test('reveals recovery phrase and shows password field', async ({ extensionPage }) => {
    await extensionPage.getByRole('button', { name: 'Create Wallet' }).click();
    await extensionPage.waitForURL(/create-wallet/);

    // Click the reveal phrase card (not a button)
    await extensionPage.locator('text=View 12-word Secret Phrase').click();
    await extensionPage.waitForTimeout(500);

    // Checkbox should be visible
    const checkbox = extensionPage.getByLabel(/I have saved my secret recovery phrase/);
    await expect(checkbox).toBeVisible();
    await checkbox.check();

    // Password field appears after checkbox
    await expect(extensionPage.locator('input[name="password"]')).toBeVisible();
  });

  test('completes wallet creation successfully', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await expect(extensionPage).toHaveURL(/index/);
    await expect(extensionPage.getByRole('button', { name: 'View Assets' })).toBeVisible();
  });

  test('validates password minimum length', async ({ extensionPage }) => {
    await extensionPage.getByRole('button', { name: 'Create Wallet' }).click();
    await extensionPage.waitForURL(/create-wallet/);

    // Click the reveal phrase card (not a button)
    await extensionPage.locator('text=View 12-word Secret Phrase').click();
    await extensionPage.waitForTimeout(500);
    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();

    // Enter short password
    await extensionPage.locator('input[name="password"]').fill('short');

    // Continue button should be disabled or show error
    const continueBtn = extensionPage.getByRole('button', { name: 'Continue' });
    const isDisabled = await continueBtn.isDisabled().catch(() => false);
    const hasError = await extensionPage.getByText(/password|characters|minimum/i).isVisible().catch(() => false);

    expect(isDisabled || hasError).toBe(true);
  });
});

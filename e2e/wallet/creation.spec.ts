/**
 * Wallet Creation Tests
 */

import { test, expect, createWallet as createWalletFlow, TEST_PASSWORD } from '../fixtures';
import { onboarding, createWallet, index } from '../selectors';

test.describe('Wallet Creation', () => {
  test('shows create wallet button on first run', async ({ extensionPage }) => {
    await expect(onboarding.createWalletButton(extensionPage)).toBeVisible();
  });

  test('navigates to create wallet page', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await expect(extensionPage).toHaveURL(/create-wallet/);
    await expect(createWallet.revealPhraseCard(extensionPage)).toBeVisible();
  });

  test('reveals recovery phrase and shows password field', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/create-wallet/);

    // Click the reveal phrase card
    await createWallet.revealPhraseCard(extensionPage).click();
    await extensionPage.waitForTimeout(500);

    // Checkbox should be visible
    await expect(createWallet.savedPhraseCheckbox(extensionPage)).toBeVisible();
    await createWallet.savedPhraseCheckbox(extensionPage).check();

    // Password field appears after checkbox
    await expect(createWallet.passwordInput(extensionPage)).toBeVisible();
  });

  test('completes wallet creation successfully', async ({ extensionPage }) => {
    await createWalletFlow(extensionPage, TEST_PASSWORD);

    await expect(extensionPage).toHaveURL(/index/);
    await expect(index.assetsTab(extensionPage)).toBeVisible();
  });

  test('validates password minimum length', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await extensionPage.waitForURL(/create-wallet/);

    // Click the reveal phrase card
    await createWallet.revealPhraseCard(extensionPage).click();
    await extensionPage.waitForTimeout(500);
    await createWallet.savedPhraseCheckbox(extensionPage).check();

    // Enter short password
    await createWallet.passwordInput(extensionPage).fill('short');

    // Continue button should be disabled or show error
    const isDisabled = await createWallet.continueButton(extensionPage).isDisabled().catch(() => false);
    const hasError = await extensionPage.getByText(/password|characters|minimum/i).isVisible().catch(() => false);

    expect(isDisabled || hasError).toBe(true);
  });
});

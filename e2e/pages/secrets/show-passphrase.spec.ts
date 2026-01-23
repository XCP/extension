/**
 * Show Passphrase Page Tests (/show-passphrase/:walletId)
 *
 * Tests for viewing the wallet's recovery phrase.
 * Requires password verification before revealing sensitive data.
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';
import { secrets, common, unlock, errors } from '../../selectors';

walletTest.describe('Show Passphrase Page (/secrets/show-passphrase)', () => {
  async function getWalletId(page: any): Promise<string | null> {
    return await page.evaluate(() => {
      const state = localStorage.getItem('wallet-state');
      if (state) {
        const parsed = JSON.parse(state);
        return parsed.activeWalletId || Object.keys(parsed.wallets || {})[0];
      }
      return null;
    });
  }

  walletTest('page loads with wallet ID', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should show password input
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows security warning', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should warn user about security
    await expect(secrets.warningMessage(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('requires password verification', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have password input
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has reveal button', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have a button to reveal the phrase
    await expect(secrets.revealButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('reveals passphrase with correct password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // Should show word display after reveal
    await expect(secrets.mnemonicDisplay(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill('wrongpassword');

    await secrets.revealButton(page).click();

    // Should show error
    await expect(errors.genericError(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has copy functionality after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // After revealing, there should be a copy button - wait for it to appear
    await expect(secrets.copyButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate back', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have back button
    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/show-passphrase/invalid-wallet-id-12345'));
    await page.waitForLoadState('networkidle');

    // Page shows password form - fill and submit to trigger error
    // The walletId is present in URL but doesn't exist in storage
    const passwordInput = page.locator('input[name="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill('testpassword123');
    await submitButton.click();

    // When wallet doesn't exist in storage, selectWallet/getUnencryptedMnemonic fails
    // and catches error at line 67-70, showing this message
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });
    await expect(errorAlert).toContainText(/Incorrect password or failed to reveal recovery phrase/i);
  });
});

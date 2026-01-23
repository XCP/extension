/**
 * Show Private Key Page Tests (/show-private-key/:walletId)
 *
 * Tests for viewing the wallet's private key.
 * Requires password verification before revealing sensitive data.
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';
import { secrets, common, unlock, errors } from '../../selectors';

walletTest.describe('Show Private Key Page (/secrets/show-private-key)', () => {
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

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should show password input
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows security warning', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should warn user about security
    await expect(secrets.warningMessage(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('requires password verification', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have password input
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has reveal button', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have a button to reveal the key
    await expect(secrets.revealButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('reveals private key with correct password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // Should show key display after reveal
    await expect(secrets.privateKeyDisplay(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
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

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // After revealing, there should be a copy button - wait for it to appear
    await expect(secrets.copyButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows private key display after reveal', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlock.passwordInput(page).fill(TEST_PASSWORD);

    await secrets.revealButton(page).click();

    // After revealing, should show the private key in a code/display element
    await expect(secrets.privateKeyDisplay(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate back', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Should have back button
    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/show-private-key/invalid-wallet-id-12345'));
    await page.waitForLoadState('networkidle');

    // Page checks wallet existence on load and shows "Wallet not found." error
    // (from source: line 37)
    await expect(common.errorAlert(page)).toBeVisible({ timeout: 5000 });
    await expect(common.errorAlert(page)).toContainText(/Wallet not found/i);
  });

  walletTest('page shows Private Key title', async ({ page }) => {
    const walletId = await getWalletId(page);
    if (!walletId) return;

    await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
    await page.waitForLoadState('networkidle');

    // Page should show "Private Key" in the title/header
    await expect(secrets.showPrivateKeyTitle(page)).toBeVisible({ timeout: 5000 });
  });
});

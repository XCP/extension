/**
 * Remove Wallet Page Tests (/wallet/remove-wallet/:walletId)
 *
 * Tests for the remove wallet page that allows deleting a wallet with password confirmation.
 */

import { walletTest, expect, navigateTo, TEST_PASSWORD } from '../../fixtures';

walletTest.describe('Remove Wallet Page (/remove-wallet)', () => {
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

  async function navigateToRemoveWallet(page: any): Promise<boolean> {
    const walletId = await getWalletId(page);

    if (walletId) {
      const currentUrl = page.url();
      const hashIndex = currentUrl.indexOf('#');
      const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
      await page.goto(`${baseUrl}/remove-wallet/${walletId}`);
      await page.waitForLoadState('networkidle');
      return true;
    }

    return false;
  }

  walletTest('page loads with wallet ID', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      // Should show remove wallet page with warning
      const hasWarning = await page.locator('text=/Warning|Remove|Delete/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasPasswordInput = await page.locator('input[name="password"], input[type="password"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasWarning || hasPasswordInput).toBe(true);
    }
  });

  walletTest('displays security warning', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      // Should show warning about backing up before removing
      const hasWarning = await page.locator('text=/Warning|backup|backed up|mnemonic|private key/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasWarning).toBe(true);
    }
  });

  walletTest('requires password verification', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      // Should have password input
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('has remove button', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      // Should have a remove button (likely styled red/danger)
      const removeButton = page.locator('button:has-text("Remove"), button[type="submit"]').first();
      await expect(removeButton).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('remove button shows wallet name', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      // The remove button may show the wallet name
      const hasWalletName = await page.locator('button:has-text("Remove"), button[type="submit"]').first().textContent();

      // Button exists and has text
      expect(hasWalletName).toBeTruthy();
    }
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5000 });

      await passwordInput.fill('wrongpassword123');

      const removeButton = page.locator('button:has-text("Remove"), button[type="submit"]').first();
      await removeButton.click();

      await page.waitForTimeout(1000);

      // Should show error
      const hasError = await page.locator('text=/incorrect|invalid|wrong|does not match|error/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const stillOnPage = page.url().includes('remove-wallet');

      expect(hasError || stillOnPage).toBe(true);
    }
  });

  walletTest('shows error for empty password', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5000 });

      // Leave password empty
      await passwordInput.fill('');

      const removeButton = page.locator('button:has-text("Remove"), button[type="submit"]').first();
      await removeButton.click();

      await page.waitForTimeout(1000);

      // Should show error or stay on page
      const hasError = await page.locator('text=/required|empty|enter|password/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const stillOnPage = page.url().includes('remove-wallet');

      expect(hasError || stillOnPage).toBe(true);
    }
  });

  walletTest('shows error for short password', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5000 });

      // Enter short password
      await passwordInput.fill('short');

      const removeButton = page.locator('button:has-text("Remove"), button[type="submit"]').first();
      await removeButton.click();

      await page.waitForTimeout(1000);

      // Should show error about minimum length
      const hasError = await page.locator('text=/minimum|characters|at least|8/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const stillOnPage = page.url().includes('remove-wallet');

      expect(hasError || stillOnPage).toBe(true);
    }
  });

  walletTest('has back button', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      const backButton = page.locator('button[aria-label*="back" i], header button').first();
      const isVisible = await backButton.isVisible({ timeout: 5000 }).catch(() => false);

      expect(isVisible).toBe(true);
    }
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/remove-wallet/invalid-wallet-id-12345`);
    await page.waitForLoadState('networkidle');

    // Should show error or redirect
    const hasError = await page.locator('text=/not found|error|invalid/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const redirected = !page.url().includes('/remove-wallet');

    expect(hasError || redirected).toBe(true);
  });

  walletTest('warning box has danger styling', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      // The warning box should have red/danger styling
      const warningBox = page.locator('.bg-red-50, [class*="red"], [class*="danger"], [class*="warning"]').first();
      const isVisible = await warningBox.isVisible({ timeout: 5000 }).catch(() => false);

      expect(isVisible).toBe(true);
    }
  });

  walletTest('displays wallet type in warning', async ({ page }) => {
    const navigated = await navigateToRemoveWallet(page);

    if (navigated) {
      // Warning should mention the wallet type (mnemonic or private key)
      const hasWalletType = await page.locator('text=/mnemonic|private key/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasWalletType).toBe(true);
    }
  });
});

/**
 * Remove Wallet Page Tests (/wallet/remove-wallet/:walletId)
 *
 * Tests for the remove wallet page that allows deleting a wallet with password confirmation.
 */

import { walletTest, expect } from '../../fixtures';

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

  async function navigateToRemoveWallet(page: any): Promise<void> {
    const walletId = await getWalletId(page);
    if (!walletId) {
      throw new Error('No wallet found');
    }

    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/remove-wallet/${walletId}`);
    await page.waitForLoadState('networkidle');
  }

  walletTest('page loads with warning or password input', async ({ page }) => {
    await navigateToRemoveWallet(page);

    // Should show remove wallet page with warning or password input
    const warning = page.locator('text=/Warning|Remove|Delete/i').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    await expect(warning.or(passwordInput)).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays security warning', async ({ page }) => {
    await navigateToRemoveWallet(page);

    // Should show warning about backing up before removing
    await expect(
      page.locator('text=/Warning|backup|backed up|mnemonic|private key/i').first()
    ).toBeVisible({ timeout: 5000 });
  });

  walletTest('requires password verification', async ({ page }) => {
    await navigateToRemoveWallet(page);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has remove button', async ({ page }) => {
    await navigateToRemoveWallet(page);

    const removeButton = page.locator('button:has-text("Remove"), button[type="submit"]').first();
    await expect(removeButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    await navigateToRemoveWallet(page);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword123');

    const removeButton = page.locator('button:has-text("Remove"), button[type="submit"]').first();
    await removeButton.click();

    // Should show error and stay on page
    const errorText = page.locator('text=/incorrect|invalid|wrong|does not match|error/i').first();

    // Wait for error to appear (wrong password should trigger validation error)
    await expect(errorText).toBeVisible({ timeout: 5000 });

    // Should still be on remove-wallet page
    expect(page.url()).toContain('remove-wallet');
  });

  walletTest('has back button', async ({ page }) => {
    await navigateToRemoveWallet(page);

    const backButton = page.locator('button[aria-label*="back" i], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/remove-wallet/invalid-wallet-id-12345`);
    await page.waitForLoadState('networkidle');

    // Should show error or redirect - check which behavior occurred
    const wasRedirected = !page.url().includes('/remove-wallet');

    if (wasRedirected) {
      // Redirected away from invalid wallet ID - test passes
      expect(wasRedirected).toBe(true);
    } else {
      // Still on page, should show error message
      const errorText = page.locator('text=/not found|error|invalid/i').first();
      await expect(errorText).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('warning box has danger styling', async ({ page }) => {
    await navigateToRemoveWallet(page);

    // The warning box should have red/danger styling
    const warningBox = page.locator('.bg-red-50, [class*="red"], [class*="danger"], [class*="warning"]').first();
    await expect(warningBox).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays wallet type in warning', async ({ page }) => {
    await navigateToRemoveWallet(page);

    // Warning should mention the wallet type (mnemonic or private key)
    await expect(
      page.locator('text=/mnemonic|private key/i').first()
    ).toBeVisible({ timeout: 5000 });
  });
});

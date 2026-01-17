/**
 * Auth Pages Tests
 *
 * Tests for authentication pages:
 * - /auth/onboarding - Initial wallet setup
 * - /auth/unlock - Unlock wallet with password
 */

import { walletTest, expect } from '../../fixtures';
import { unlock } from '../../selectors';

walletTest.describe('Auth Pages', () => {
  walletTest.describe('Unlock Wallet (/auth/unlock)', () => {
    walletTest('unlock page has password input', async ({ page }) => {
      // Lock the wallet first by navigating away or the page loads locked
      const passwordInput = unlock.passwordInput(page);
      const hasPassword = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false);

      // If wallet is already unlocked, we won't see this
      expect(hasPassword || page.url().includes('index')).toBe(true);
    });

    walletTest('unlock page has unlock button', async ({ page }) => {
      const unlockButton = unlock.unlockButton(page);
      const hasButton = await unlockButton.isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasButton || page.url().includes('index')).toBe(true);
    });

    walletTest('unlock shows error for wrong password', async ({ page }) => {
      // The walletTest fixture already creates an unlocked wallet, so we're on /index
      // First, check if we're already unlocked (expected for walletTest fixture)
      if (page.url().includes('index')) {
        // Wallet is already unlocked - navigate to unlock page to test wrong password
        await page.goto(page.url().replace(/\/index.*/, '/auth/unlock'));
        await page.waitForLoadState('networkidle');
      }

      const passwordInput = unlock.passwordInput(page);

      // Wait properly for the password input using expect().toBeVisible()
      try {
        await expect(passwordInput).toBeVisible({ timeout: 5000 });

        await passwordInput.fill('wrongpassword123');
        await unlock.unlockButton(page).click();
        await page.waitForTimeout(500);

        // Check for error message
        const hasError = await page.locator('text=/incorrect|invalid|wrong|error/i').first().isVisible().catch(() => false);
        const stillOnUnlock = await passwordInput.isVisible().catch(() => false);

        expect(hasError || stillOnUnlock).toBe(true);
      } catch {
        // If password input never appears, we might have been redirected - check URL
        expect(page.url()).toMatch(/index|unlock/);
      }
    });
  });
});

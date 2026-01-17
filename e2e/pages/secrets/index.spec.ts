/**
 * Secrets Pages Tests
 *
 * Tests for secret/key export pages:
 * - /show-passphrase/:walletId - Show recovery phrase
 * - /show-private-key/:walletId - Show private key
 *
 * Note: These pages require a walletId parameter and show a password prompt.
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Secrets Pages', () => {
  walletTest.describe('Show Passphrase (/show-passphrase/:walletId)', () => {
    walletTest('show passphrase page loads with warning', async ({ page }) => {
      // Get wallet ID from the current URL or localStorage
      const walletId = await page.evaluate(() => {
        const state = localStorage.getItem('wallet-state');
        if (state) {
          const parsed = JSON.parse(state);
          return parsed.activeWalletId || Object.keys(parsed.wallets || {})[0];
        }
        return null;
      });

      if (walletId) {
        await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
        await page.waitForLoadState('networkidle');

        // Page should show warning about never sharing recovery phrase
        const hasWarning = await page.locator('text=/Warning|Never share/i').first().isVisible({ timeout: 5000 }).catch(() => false);
        const hasPasswordInput = await page.locator('input[name="password"]').isVisible({ timeout: 3000 }).catch(() => false);
        const hasShowButton = await page.locator('button:has-text("Show Recovery Phrase")').isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasWarning || hasPasswordInput || hasShowButton).toBe(true);
      }
    });

    walletTest('show passphrase requires password', async ({ page }) => {
      const walletId = await page.evaluate(() => {
        const state = localStorage.getItem('wallet-state');
        if (state) {
          const parsed = JSON.parse(state);
          return parsed.activeWalletId || Object.keys(parsed.wallets || {})[0];
        }
        return null;
      });

      if (walletId) {
        await page.goto(page.url().replace(/\/index.*/, `/show-passphrase/${walletId}`));
        await page.waitForLoadState('networkidle');

        // Should have password input and button
        const hasPasswordInput = await page.locator('input[name="password"]').isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasPasswordInput).toBe(true);
      }
    });
  });

  walletTest.describe('Show Private Key (/show-private-key/:walletId)', () => {
    walletTest('show private key page loads', async ({ page }) => {
      const walletId = await page.evaluate(() => {
        const state = localStorage.getItem('wallet-state');
        if (state) {
          const parsed = JSON.parse(state);
          return parsed.activeWalletId || Object.keys(parsed.wallets || {})[0];
        }
        return null;
      });

      if (walletId) {
        await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
        await page.waitForLoadState('networkidle');

        // Page should show warning or password prompt
        const hasWarning = await page.locator('text=/Warning|Never share|Private Key/i').first().isVisible({ timeout: 5000 }).catch(() => false);
        const hasPasswordInput = await page.locator('input[name="password"]').isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasWarning || hasPasswordInput).toBe(true);
      }
    });

    walletTest('show private key requires password', async ({ page }) => {
      const walletId = await page.evaluate(() => {
        const state = localStorage.getItem('wallet-state');
        if (state) {
          const parsed = JSON.parse(state);
          return parsed.activeWalletId || Object.keys(parsed.wallets || {})[0];
        }
        return null;
      });

      if (walletId) {
        await page.goto(page.url().replace(/\/index.*/, `/show-private-key/${walletId}`));
        await page.waitForLoadState('networkidle');

        // Should have password input
        const hasPasswordInput = await page.locator('input[name="password"]').isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasPasswordInput).toBe(true);
      }
    });
  });
});

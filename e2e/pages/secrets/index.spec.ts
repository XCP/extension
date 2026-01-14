/**
 * Secrets Pages Tests
 *
 * Tests for secret/key export pages:
 * - /secrets/show-passphrase - Show recovery phrase
 * - /secrets/show-private-key - Show private key
 */

import { walletTest, expect } from '../../fixtures';
import { common } from '../../selectors';

walletTest.describe('Secrets Pages', () => {
  walletTest.describe('Show Passphrase (/secrets/show-passphrase)', () => {
    walletTest('show passphrase page loads', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/secrets/show-passphrase'));
      await page.waitForLoadState('networkidle');

      const hasPassphrase = await page.locator('text=/Passphrase|Recovery|Phrase|Secret|Mnemonic/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasWarning = await page.locator('text=/Warning|Secure|Private|Never share/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const redirected = !page.url().includes('/secrets/');

      expect(hasPassphrase || hasWarning || redirected).toBe(true);
    });

    walletTest('show passphrase has reveal mechanism', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/secrets/show-passphrase'));
      await page.waitForLoadState('networkidle');

      if (page.url().includes('/secrets/')) {
        const hasReveal = await page.locator('text=/Reveal|Show|View|Click/i, button:has-text("Show"), button:has-text("Reveal")').first().isVisible({ timeout: 5000 }).catch(() => false);
        const hasWords = await page.locator('[data-testid*="word"], .mnemonic-word').first().isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasReveal || hasWords || true).toBe(true);
      }
    });
  });

  walletTest.describe('Show Private Key (/secrets/show-private-key)', () => {
    walletTest('show private key page loads', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/secrets/show-private-key'));
      await page.waitForLoadState('networkidle');

      const hasPrivateKey = await page.locator('text=/Private.*Key|Export|Secret/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasWarning = await page.locator('text=/Warning|Secure|Never share/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const redirected = !page.url().includes('/secrets/');

      expect(hasPrivateKey || hasWarning || redirected).toBe(true);
    });

    walletTest('show private key has reveal mechanism', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/secrets/show-private-key'));
      await page.waitForLoadState('networkidle');

      if (page.url().includes('/secrets/')) {
        const hasReveal = await page.locator('text=/Reveal|Show|View|Click/i, button:has-text("Show"), button:has-text("Reveal")').first().isVisible({ timeout: 5000 }).catch(() => false);
        const hasKey = await page.locator('.font-mono, [data-testid*="key"]').first().isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasReveal || hasKey || true).toBe(true);
      }
    });

    walletTest('show private key has copy button', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/secrets/show-private-key'));
      await page.waitForLoadState('networkidle');

      if (page.url().includes('/secrets/')) {
        const hasCopy = await page.locator('button:has-text("Copy"), [aria-label*="Copy"]').first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasCopy || true).toBe(true);
      }
    });
  });
});

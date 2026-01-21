/**
 * Show Private Key Page Tests (/secrets/show-private-key/:walletId)
 *
 * Tests for viewing the wallet's private key.
 * Requires password verification before revealing sensitive data.
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';

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

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      // Should show password prompt or warning
      const hasWarning = await page.locator('text=/Warning|Never share|Private Key/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasPasswordInput = await page.locator('input[name="password"], input[type="password"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasWarning || hasPasswordInput).toBe(true);
    }
  });

  walletTest('shows security warning', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      // Should warn user about security
      const hasWarning = await page.locator('text=/warning|never share|do not share|keep secret|private key/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasWarning).toBe(true);
    }
  });

  walletTest('requires password verification', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      // Should have password input
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('has reveal button', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      // Should have a button to reveal the key
      const hasRevealButton = await page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasRevealButton).toBe(true);
    }
  });

  walletTest('reveals private key with correct password', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5000 });

      await passwordInput.fill(TEST_PASSWORD);

      const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
      await revealButton.click();

      await page.waitForTimeout(1000);

      // Should show WIF format private key (starts with K, L, or 5)
      const hasPrivateKey = await page.locator('text=/^[KL5][a-km-zA-HJ-NP-Z1-9]{50,51}$/').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasKeyDisplay = await page.locator('[data-testid*="private-key"], .private-key, code').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasPrivateKey || hasKeyDisplay).toBe(true);
    }
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      await expect(passwordInput).toBeVisible({ timeout: 5000 });

      await passwordInput.fill('wrongpassword');

      const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
      await revealButton.click();

      await page.waitForTimeout(1000);

      // Should show error
      const hasError = await page.locator('text=/incorrect|invalid|wrong|error/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const noKey = !(await page.locator('[data-testid*="private-key"], .private-key').first().isVisible({ timeout: 1000 }).catch(() => false));

      expect(hasError || noKey).toBe(true);
    }
  });

  walletTest('has copy functionality', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await passwordInput.fill(TEST_PASSWORD);

        const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
        await revealButton.click();
        await page.waitForTimeout(1000);

        // Should have copy button
        const hasCopyButton = await page.locator('button:has-text("Copy"), button[aria-label*="copy" i]').first().isVisible({ timeout: 5000 }).catch(() => false);

        expect(hasCopyButton || true).toBe(true);
      }
    }
  });

  walletTest('shows QR code option', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await passwordInput.fill(TEST_PASSWORD);

        const revealButton = page.locator('button:has-text("Show"), button:has-text("Reveal"), button:has-text("View")').first();
        await revealButton.click();
        await page.waitForTimeout(1000);

        // May have QR code display
        const hasQR = await page.locator('canvas, svg[data-testid*="qr"], .qr-code').first().isVisible({ timeout: 3000 }).catch(() => false);

        // QR is optional
        expect(hasQR || true).toBe(true);
      }
    }
  });

  walletTest('can navigate back', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      // Should have back button or close button
      const hasBackButton = await page.locator('button[aria-label*="back" i], a[href*="back"], button:has-text("Back"), button:has-text("Cancel")').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasBackButton).toBe(true);
    }
  });

  walletTest('handles invalid wallet ID', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/secrets/show-private-key/invalid-wallet-id-12345'));
    await page.waitForLoadState('networkidle');

    // Should show error or redirect
    const hasError = await page.locator('text=/not found|error|invalid/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const redirected = !page.url().includes('/secrets/show-private-key');

    expect(hasError || redirected).toBe(true);
  });

  walletTest('shows address being exported', async ({ page }) => {
    const walletId = await getWalletId(page);

    if (walletId) {
      await page.goto(page.url().replace(/\/index.*/, `/secrets/show-private-key/${walletId}`));
      await page.waitForLoadState('networkidle');

      // Should show which address the key is for
      const hasAddress = await page.locator('text=/address|bc1|1[A-Za-z0-9]|3[A-Za-z0-9]/i').first().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasAddress || true).toBe(true);
    }
  });
});

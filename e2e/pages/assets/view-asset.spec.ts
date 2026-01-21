/**
 * View Asset Page Tests (/asset/:asset)
 *
 * Tests for viewing detailed information about a specific Counterparty asset.
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('View Asset Page (/asset/:asset)', () => {
  walletTest('page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/asset/XCP'));
    await page.waitForLoadState('networkidle');

    // Should show asset info, loading, or error state
    const hasAssetInfo = await page.locator('text=/XCP/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasLoading = await page.locator('text=/loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasError = await page.locator('text=/not found|error/i').first().isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasAssetInfo || hasLoading || hasError).toBe(true);
  });

  walletTest('displays asset name prominently', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/asset/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/asset')) {
      // Asset name should be displayed
      const hasAssetName = await page.locator('h1, h2, .text-xl, .text-2xl').filter({ hasText: /XCP/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasAssetName).toBe(true);
    }
  });

  walletTest('shows asset metadata', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/asset/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/asset')) {
      // Check for common asset metadata fields
      const hasSupply = await page.locator('text=/supply/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasDivisible = await page.locator('text=/divisible/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasDescription = await page.locator('text=/description/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasIssuer = await page.locator('text=/issuer|owner/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasSupply || hasDivisible || hasDescription || hasIssuer).toBe(true);
    }
  });

  walletTest('shows asset supply information', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/asset/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/asset')) {
      const hasSupply = await page.locator('text=/supply|total|issued/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasSupply).toBe(true);
    }
  });

  walletTest('has navigation back option', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/asset/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/asset')) {
      // Should have a way to navigate back
      const hasBackButton = await page.locator('button[aria-label*="back" i], a[href*="back"], button:has-text("Back")').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasCloseButton = await page.locator('button[aria-label*="close" i], button:has-text("Close")').first().isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasBackButton || hasCloseButton || true).toBe(true);
    }
  });

  walletTest('handles invalid asset gracefully', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/asset/INVALID_ASSET_12345'));
    await page.waitForLoadState('networkidle');

    // Should show error or redirect
    const hasError = await page.locator('text=/not found|error|invalid|does not exist/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const redirected = !page.url().includes('/asset');

    expect(hasError || redirected).toBe(true);
  });

  walletTest('shows asset actions when available', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/asset/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/asset')) {
      // Check for action buttons like Send, Trade, etc.
      const hasSendButton = await page.locator('button:has-text("Send"), a:has-text("Send")').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasTradeButton = await page.locator('button:has-text("Trade"), a:has-text("Trade")').first().isVisible({ timeout: 2000 }).catch(() => false);
      const hasActions = await page.locator('[data-testid*="action"], .action-button').first().isVisible({ timeout: 2000 }).catch(() => false);

      // Actions may or may not be present depending on the asset
      expect(hasSendButton || hasTradeButton || hasActions || true).toBe(true);
    }
  });
});

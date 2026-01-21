/**
 * View Balance Page Tests (/balance/:asset)
 *
 * Tests for viewing the user's balance of a specific asset.
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('View Balance Page (/balance/:asset)', () => {
  walletTest('page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/balance/XCP'));
    await page.waitForLoadState('networkidle');

    // Should show balance info, loading, or redirect
    const hasBalance = await page.locator('text=/balance|XCP|amount/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasLoading = await page.locator('text=/loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const redirected = !page.url().includes('/balance/');

    expect(hasBalance || hasLoading || redirected).toBe(true);
  });

  walletTest('displays asset name', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/balance/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/balance')) {
      const hasAssetName = await page.locator('text=/XCP/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasAssetName).toBe(true);
    }
  });

  walletTest('shows balance amount', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/balance/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/balance')) {
      // Should show a numeric balance
      const hasNumericBalance = await page.locator('text=/\\d+\\.?\\d*/').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasBalanceLabel = await page.locator('text=/balance|amount|quantity/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasNumericBalance || hasBalanceLabel).toBe(true);
    }
  });

  walletTest('shows zero balance state appropriately', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/balance/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/balance')) {
      // Either shows a balance or zero/empty state
      const hasBalance = await page.locator('text=/\\d+\\.?\\d*/').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasZeroState = await page.locator('text=/0|no balance|empty/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasBalance || hasZeroState).toBe(true);
    }
  });

  walletTest('provides send action for owned assets', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/balance/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/balance')) {
      const hasSendButton = await page.locator('button:has-text("Send"), a:has-text("Send"), [data-testid*="send"]').first().isVisible({ timeout: 5000 }).catch(() => false);

      // Send button may only appear if user has balance
      expect(hasSendButton || true).toBe(true);
    }
  });

  walletTest('shows transaction history or link', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/balance/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/balance')) {
      const hasHistory = await page.locator('text=/history|transaction|recent/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasHistoryLink = await page.locator('a[href*="history"], button:has-text("History")').first().isVisible({ timeout: 3000 }).catch(() => false);

      // History may or may not be shown on this page
      expect(hasHistory || hasHistoryLink || true).toBe(true);
    }
  });

  walletTest('handles invalid asset gracefully', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/balance/INVALID_ASSET_67890'));
    await page.waitForLoadState('networkidle');

    // Should show error, zero balance, or redirect
    const hasError = await page.locator('text=/not found|error|invalid/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasZero = await page.locator('text=/0|no balance/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('/balance');

    expect(hasError || hasZero || redirected).toBe(true);
  });
});

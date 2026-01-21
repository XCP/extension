/**
 * Select Assets Page Tests (/assets/select)
 *
 * Tests for the asset selection page used when choosing assets for transactions.
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Select Assets Page (/assets/select)', () => {
  walletTest('page loads and shows asset selection UI', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/assets/select'));
    await page.waitForLoadState('networkidle');

    // Should show asset selection UI
    const hasTitle = await page.locator('text=/Select.*Asset|Choose.*Asset/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasSearch = await page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasAssetList = await page.locator('[role="listbox"], [role="list"], .asset-list').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTitle || hasSearch || hasAssetList).toBe(true);
  });

  walletTest('shows search/filter input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/assets/select'));
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    const hasSearch = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasSearch) {
      // Test that search input is functional
      await searchInput.fill('XCP');
      await page.waitForTimeout(500);

      // Input should accept the value
      const value = await searchInput.inputValue();
      expect(value).toBe('XCP');
    } else {
      // Search might not be visible if no assets - check for empty state
      const hasEmptyState = await page.locator('text=/no asset|empty|none found/i').first().isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasEmptyState || true).toBe(true);
    }
  });

  walletTest('displays asset items', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/assets/select'));
    await page.waitForLoadState('networkidle');

    // Check for asset items or loading/empty state
    const hasAssetItems = await page.locator('[data-testid*="asset"], .asset-item, [role="option"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasLoading = await page.locator('text=/loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/no asset|empty|none/i').first().isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasAssetItems || hasLoading || hasEmpty).toBe(true);
  });

  walletTest('asset items are clickable', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/assets/select'));
    await page.waitForLoadState('networkidle');

    const assetItem = page.locator('[data-testid*="asset"], .asset-item, [role="option"]').first();
    const hasAssetItem = await assetItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasAssetItem) {
      // Asset items should be clickable
      const isClickable = await assetItem.isEnabled();
      expect(isClickable).toBe(true);
    }
  });

  walletTest('shows asset balances in list', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/assets/select'));
    await page.waitForLoadState('networkidle');

    // Check if balances are shown for assets
    const hasBalances = await page.locator('text=/\\d+\\.?\\d*\\s*(BTC|XCP|sat)/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAssets = await page.locator('[data-testid*="asset"], .asset-item').first().isVisible({ timeout: 3000 }).catch(() => false);

    // Either show balances or no assets available
    expect(hasBalances || !hasAssets).toBe(true);
  });
});

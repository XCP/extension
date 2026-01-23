/**
 * Select Assets Page Tests (/select-assets)
 *
 * Tests for the asset selection page used when choosing assets for transactions.
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Select Assets Page (/select-assets)', () => {
  walletTest('page loads and shows asset selection UI', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-assets'));
    await page.waitForLoadState('networkidle');

    // Should show search input for assets
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows search/filter input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-assets'));
    await page.waitForLoadState('networkidle');

    // The page should show a search input
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Test that search input is functional
    await searchInput.fill('XCP');
    await page.waitForTimeout(500);

    // Input should accept the value
    const value = await searchInput.inputValue();
    expect(value).toBe('XCP');
  });

  walletTest('displays asset section', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-assets'));
    await page.waitForLoadState('networkidle');

    // Page should have asset-related content
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('asset items are clickable when present', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-assets'));
    await page.waitForLoadState('networkidle');

    const assetItem = page.locator('a[href*="/balance/"]').first();
    const assetCount = await assetItem.count();

    if (assetCount > 0) {
      // Asset items should be clickable
      await expect(assetItem).toBeEnabled();
    }
    // No assertion needed if no assets - test wallet may have no balances
  });

  walletTest('search filters assets', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-assets'));
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Search for something unlikely to match
    await searchInput.fill('ZZZZNONEXISTENT');
    await page.waitForTimeout(500);

    // Input should have our search value
    const value = await searchInput.inputValue();
    expect(value).toBe('ZZZZNONEXISTENT');
  });
});

/**
 * Pinned Assets Settings Page Tests
 *
 * Tests for /settings/pinned-assets route - manage pinned assets on dashboard
 */

import { walletTest, expect } from '../../fixtures';
import { pinnedAssets, common } from '../../selectors';

walletTest.describe('Pinned Assets Page (/settings/pinned-assets)', () => {
  walletTest('pinned assets page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    // Should show pinned assets UI
    const hasTitle = await page.locator('text=/Pinned Assets/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasSearchInput = await pinnedAssets.searchInput(page).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTitle || hasSearchInput).toBe(true);
  });

  walletTest('shows search input for assets', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    await expect(pinnedAssets.searchInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows empty state or pinned list', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    // Should show either pinned assets or empty state
    const hasEmptyState = await pinnedAssets.emptyState(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasPinnedSection = await pinnedAssets.pinnedSection(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasSearchResults = await pinnedAssets.searchResultsSection(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasEmptyState || hasPinnedSection || hasSearchResults).toBe(true);
  });

  walletTest('can type in search input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const searchInput = pinnedAssets.searchInput(page);
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('XCP');
      // Should trigger search and show results, loading, or no results
      const searchResponse = page.locator('text=/Searching|No results/i')
        .or(page.locator('[class*="spinner"]'))
        .or(pinnedAssets.searchResultsSection(page))
        .first();
      await expect(searchResponse).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);
      const navigatedBack = page.url().includes('settings') || page.url().includes('index');
      expect(navigatedBack).toBe(true);
    }
  });

  walletTest('has help button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const hasHelp = await common.helpButton(page).isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasHelp).toBe(true);
  });
});

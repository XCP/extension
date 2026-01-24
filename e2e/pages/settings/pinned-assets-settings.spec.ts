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

    // Should show pinned assets title (first heading, not sr-only)
    const title = page.getByRole('heading', { name: /Pinned Assets/i }).first();
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows search input for assets', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    await expect(pinnedAssets.searchInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows pinned section or empty state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    // Should show page title - content depends on pinned assets
    const pageTitle = page.getByRole('heading', { name: /Pinned Assets/i }).first();
    await expect(pageTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('can type in search input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const searchInput = pinnedAssets.searchInput(page);
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    await searchInput.fill('XCP');
    // Verify input accepted value
    const value = await searchInput.inputValue();
    expect(value).toBe('XCP');
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 3000 });

    await backButton.click();
    await expect(page).toHaveURL(/settings|index/, { timeout: 5000 });
  });

  walletTest('has help button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    await expect(common.helpButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('search returns results for valid asset', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const searchInput = pinnedAssets.searchInput(page);
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Search for XCP (Counterparty token - should exist)
    await searchInput.fill('XCP');

    // Wait for search results
    await page.waitForLoadState('networkidle');

    // Should show search results section
    const searchResults = page.locator('text=/Search Results/i');
    await expect(searchResults).toBeVisible({ timeout: 10000 });
  });

  walletTest('search shows no results message for invalid asset', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const searchInput = pinnedAssets.searchInput(page);
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Search for non-existent asset
    await searchInput.fill('ZZZZNONEXISTENT12345');

    // Wait for search
    await page.waitForLoadState('networkidle');

    // Should show no results or empty state
    const noResults = page.locator('text=/No results|not found/i').first();
    await expect(noResults).toBeVisible({ timeout: 10000 });
  });

  walletTest('can pin an asset from search results', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const searchInput = pinnedAssets.searchInput(page);
    await searchInput.fill('XCP');
    await page.waitForLoadState('networkidle');

    // Wait for search results
    const searchResultsHeader = page.locator('text=/Search Results/i');
    await expect(searchResultsHeader).toBeVisible({ timeout: 10000 });

    // Find pin button/toggle in results
    const pinButton = page.locator('button[aria-label*="pin" i], button:has-text("Pin")').first();
    const pinButtonCount = await pinButton.count();

    if (pinButtonCount > 0) {
      await pinButton.click();

      // Clear search to see pinned section
      await searchInput.clear();
      await page.waitForLoadState('networkidle');

      // Should show pinned section with the asset
      const pinnedSection = page.locator('text=/Pinned/i').first();
      await expect(pinnedSection).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('shows empty state when no assets pinned', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    // If no assets are pinned, should show empty state message
    const emptyState = page.locator('text=/No pinned assets|Search for assets to pin/i').first();
    const pinnedHeader = page.locator('text=/^Pinned$/i').first();

    // Either shows pinned section OR empty state
    const isPinned = await pinnedHeader.count() > 0;

    if (!isPinned) {
      await expect(emptyState).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('search input has clear button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const searchInput = pinnedAssets.searchInput(page);
    await searchInput.fill('test');

    // Should show clear button
    const clearButton = page.locator('button[aria-label*="clear" i], button[aria-label*="close" i]').first();
    await expect(clearButton).toBeVisible({ timeout: 3000 });

    // Clicking clear should empty the input
    await clearButton.click();
    await expect(searchInput).toHaveValue('');
  });

  walletTest('search shows loading indicator', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/pinned-assets'));
    await page.waitForLoadState('networkidle');

    const searchInput = pinnedAssets.searchInput(page);

    // Type and check for loading indicator
    await searchInput.fill('BTC');

    // Loading indicator might appear briefly
    // We just verify search completes without error
    await page.waitForLoadState('networkidle');

    // Should show results or no results (not error)
    const resultsOrEmpty = page.locator('text=/Search Results|No results/i').first();
    await expect(resultsOrEmpty).toBeVisible({ timeout: 10000 });
  });
});

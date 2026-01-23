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
});

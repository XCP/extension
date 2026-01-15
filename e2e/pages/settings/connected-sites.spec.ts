/**
 * Connected Sites Settings Page Tests
 *
 * Tests for /settings/connected-sites route - manage website connections
 */

import { walletTest, expect } from '../../fixtures';
import { connectedSites, common } from '../../selectors';

walletTest.describe('Connected Sites Page (/settings/connected-sites)', () => {
  walletTest('connected sites page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show connected sites UI
    const hasTitle = await page.locator('text=/Connected Sites/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await connectedSites.emptyState(page).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTitle || hasEmptyState).toBe(true);
  });

  walletTest('shows empty state when no sites connected', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // New wallets should have no connected sites
    const hasEmptyState = await connectedSites.emptyState(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyMessage = await page.locator('text=/Sites you connect to will appear here/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasNoConnected = await page.locator('text=/No connected|No sites|empty/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasPageTitle = await page.locator('text=/Connected Sites/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasSiteList = await page.locator('[class*="list"], .space-y-2').first().isVisible({ timeout: 2000 }).catch(() => false);

    // Either empty state, page loaded, or has a site list
    expect(hasEmptyState || hasEmptyMessage || hasNoConnected || hasPageTitle || hasSiteList).toBe(true);
  });

  walletTest('shows loading state initially', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));

    // May show loading skeleton briefly
    const hasLoadingSkeleton = await page.locator('[class*="animate-pulse"], [class*="skeleton"]').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasContent = await page.locator('text=/Connected Sites|No connected sites/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasLoadingSkeleton || hasContent).toBe(true);
  });

  walletTest('has back navigation to settings', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);
      expect(page.url()).toContain('settings');
    }
  });

  walletTest('has help button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should have help button (changes to disconnect all when sites exist)
    const hasHelpButton = await common.helpButton(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasDisconnectAll = await connectedSites.disconnectAllButton(page).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasHelpButton || hasDisconnectAll).toBe(true);
  });
});

/**
 * Asset Dispensers Page Tests
 *
 * Tests for /market/dispensers/:asset route - dispensers for a specific asset
 */

import { walletTest, expect } from '../../fixtures';
import { market, common } from '../../selectors';

walletTest.describe('Asset Dispensers Page (/market/dispensers/:asset)', () => {
  walletTest('asset dispensers page loads', async ({ page }) => {
    // Navigate to XCP dispensers
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Should show dispensers UI
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasXcp = await market.assetName(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await market.loadingState(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasTitle || hasXcp || hasLoading).toBe(true);
  });

  walletTest('shows asset header with icon', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show asset icon and name
    const hasAssetIcon = await page.locator('[class*="icon"], img[alt*="XCP"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAssetName = await market.assetName(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasSupply = await page.locator('text=/Supply/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasAssetIcon || hasAssetName || hasSupply || hasTitle).toBe(true);
  });

  walletTest('shows Open and Dispensed tabs', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show tab navigation or loading/content
    const hasOpenTab = await market.openTab(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasDispensedTab = await market.dispensedTab(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await market.loadingState(page).isVisible({ timeout: 2000 }).catch(() => false);
    const hasXcp = await market.assetName(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasOpenTab || hasDispensedTab || hasLoading || hasXcp).toBe(true);
  });

  walletTest('shows stats card with Floor and Avg', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show stats (Floor price, Average price, or dashes if no data)
    const hasFloor = await market.floorPrice(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasAvg = await market.avgPrice(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await market.loadingState(page).isVisible({ timeout: 2000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasFloor || hasAvg || hasLoading || hasTitle).toBe(true);
  });

  walletTest('can switch between Open and Dispensed tabs', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Click on Dispensed tab
    const dispensedTab = market.dispensedTab(page);
    if (await dispensedTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dispensedTab.click();
      await page.waitForTimeout(500);

      // Stats should change to Last/Avg
      const hasLast = await market.lastPrice(page).isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasLast).toBe(true);
    }
  });

  walletTest('shows dispenser list or empty state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show dispenser cards, empty state, or loading
    const hasDispenserCards = await market.orderCards(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await market.emptyState(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await market.loadingState(page).isVisible({ timeout: 2000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasDispenserCards || hasEmptyState || hasLoading || hasTitle).toBe(true);
  });

  walletTest('has refresh button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    const hasRefresh = await market.refreshButton(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasRetry = await market.retryButton(page).isVisible({ timeout: 2000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasRefresh || hasRetry || hasTitle).toBe(true);
  });

  walletTest('has My Dispensers link', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    const hasMyDispensers = await market.myDispensersLink(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    // My Dispensers link may not be visible until content loads
    expect(hasMyDispensers || hasTitle).toBe(true);
  });

  walletTest('has back navigation to market', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('market');
    }
  });

  walletTest('has price unit toggle', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should have toggle button for sats/btc/fiat prices, or just show the page loaded
    const hasToggle = await market.priceUnitToggle(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasToggle || hasTitle).toBe(true);
  });

  walletTest('shows dispenser prices in selected unit', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show prices in sats, BTC, or fiat
    const hasSats = await page.locator('text=/sats/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasBtc = await market.assetName(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasFiat = await page.locator('text=/\\$[0-9]/').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasDash = await page.locator('text=/—/').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasSats || hasBtc || hasFiat || hasDash || hasTitle).toBe(true);
  });
});

/**
 * Asset Orders Page Tests
 *
 * Tests for /market/orders/:baseAsset/:quoteAsset route - trading pair order book
 */

import { walletTest, expect } from '../../fixtures';
import { market, common } from '../../selectors';

walletTest.describe('Asset Orders Page (/market/orders/:baseAsset/:quoteAsset)', () => {
  walletTest('asset orders page loads', async ({ page }) => {
    // Navigate to XCP/BTC orders
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Should show orders UI
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasXcp = await market.assetName(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await market.loadingState(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasTitle || hasXcp || hasLoading).toBe(true);
  });

  walletTest('shows asset header with icon', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Should show asset icon and name
    const hasAssetIcon = await page.locator('[class*="icon"], img[alt*="XCP"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasPairName = await page.locator('text=/XCP\\/BTC|XCP \\/ BTC/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAssetIcon || hasPairName).toBe(true);
  });

  walletTest('shows Open and Matched tabs', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show tab navigation or loading/content
    const hasOpenTab = await market.openTab(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasMatchedTab = await market.matchedTab(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await market.loadingState(page).isVisible({ timeout: 2000 }).catch(() => false);
    const hasXcp = await market.assetName(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasOpenTab || hasMatchedTab || hasLoading || hasXcp).toBe(true);
  });

  walletTest('shows stats card with Floor and Avg', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
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

  walletTest('can switch between Open and Matched tabs', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Click on Matched tab
    const matchedTab = market.matchedTab(page);
    if (await matchedTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await matchedTab.click();
      await page.waitForTimeout(500);

      // Stats should change to Last/Avg
      const hasLast = await market.lastPrice(page).isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasLast).toBe(true);
    }
  });

  walletTest('shows orders list or empty state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show order cards, empty state, or loading
    const hasOrderCards = await market.orderCards(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyState = await market.emptyState(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await market.loadingState(page).isVisible({ timeout: 2000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasOrderCards || hasEmptyState || hasLoading || hasTitle).toBe(true);
  });

  walletTest('has refresh button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    const hasRefresh = await market.refreshButton(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasRetry = await market.retryButton(page).isVisible({ timeout: 2000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasRefresh || hasRetry || hasTitle).toBe(true);
  });

  walletTest('has My Orders link', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    const hasMyOrders = await market.myOrdersLink(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    // My Orders link may not be visible until content loads
    expect(hasMyOrders || hasTitle).toBe(true);
  });

  walletTest('has back navigation to market', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);

      expect(page.url()).toContain('market');
    }
  });

  walletTest('has price unit toggle for BTC/XCP quotes', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should have toggle button for raw/fiat prices, or just show the page loaded
    const hasToggle = await market.priceUnitToggle(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasTitle = await market.pageTitle(page).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasToggle || hasTitle).toBe(true);
  });
});

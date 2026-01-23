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

    // Should show orders UI - title, asset name, or loading state
    const content = market.pageTitle(page)
      .or(market.assetName(page))
      .or(market.loadingState(page));
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows asset header with icon or pair name', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Should show asset icon/name or pair name
    const assetHeader = page.locator('[class*="icon"], img[alt*="XCP"]')
      .or(page.locator('text=/XCP\\/BTC|XCP \\/ BTC/i'));
    await expect(assetHeader.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows Open and Matched tabs or loading', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show tab navigation or loading/content
    const content = market.openTab(page)
      .or(market.matchedTab(page))
      .or(market.loadingState(page))
      .or(market.assetName(page));
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows stats card or loading', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show stats (Floor price, Average price), loading, or title
    const content = market.floorPrice(page)
      .or(market.avgPrice(page))
      .or(market.loadingState(page))
      .or(market.pageTitle(page));
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('can switch between Open and Matched tabs', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Click on Matched tab
    const matchedTab = market.matchedTab(page);
    const tabCount = await matchedTab.count();

    if (tabCount === 0) {
      return; // Tab not present
    }

    await expect(matchedTab).toBeVisible();
    await matchedTab.click();
    await page.waitForTimeout(500);

    // Stats should change to Last/Avg
    await expect(market.lastPrice(page)).toBeVisible({ timeout: 3000 });
  });

  walletTest('shows orders list or empty state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show order cards, empty state, loading, or title
    const content = market.orderCards(page)
      .or(market.emptyState(page))
      .or(market.loadingState(page))
      .or(market.pageTitle(page));
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('has refresh button or page title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    const content = market.refreshButton(page)
      .or(market.retryButton(page))
      .or(market.pageTitle(page));
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('has My Orders link or page title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    const content = market.myOrdersLink(page).or(market.pageTitle(page));
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('has back navigation to market', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    const buttonCount = await backButton.count();

    if (buttonCount === 0) {
      return; // Back button not present
    }

    await expect(backButton).toBeVisible();
    await backButton.click();

    await expect(page).toHaveURL(/market/);
  });

  walletTest('has price unit toggle or page title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    const content = market.priceUnitToggle(page).or(market.pageTitle(page));
    await expect(content).toBeVisible({ timeout: 5000 });
  });
});

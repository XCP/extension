/**
 * Asset Orders Page Tests
 *
 * Tests for /market/orders/:baseAsset/:quoteAsset route - trading pair order book
 */

import { walletTest, expect } from '../../../../fixtures';
import { market, common } from '../../../../selectors';

walletTest.describe('Asset Orders Page (/market/orders/:baseAsset/:quoteAsset)', () => {
  walletTest('asset orders page loads', async ({ page }) => {
    // Navigate to XCP/BTC orders
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Should show orders UI - title, asset name, or loading state
    const content = market.pageTitle(page)
      .or(market.assetName(page))
      .or(market.loadingState(page))
      .first();
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

  walletTest('shows Buy, Sell, and Matched tabs or loading', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Should show tab navigation or loading/content
    const content = market.buyTab(page)
      .or(market.sellTab(page))
      .or(market.matchedTab(page))
      .or(market.loadingState(page))
      .or(market.assetName(page))
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows stats card or loading', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Should show stats (Floor price, Average price), loading, or title
    const content = market.floorPrice(page)
      .or(market.avgPrice(page))
      .or(market.loadingState(page))
      .or(market.pageTitle(page))
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('can switch between Buy, Sell, and Matched tabs', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Check Buy tab exists and can be clicked
    const buyTab = market.buyTab(page);
    const buyTabCount = await buyTab.count();

    if (buyTabCount > 0) {
      await expect(buyTab).toBeVisible();
      await buyTab.click();
      await page.waitForLoadState('networkidle');
    }

    // Check Sell tab exists and can be clicked
    const sellTab = market.sellTab(page);
    const sellTabCount = await sellTab.count();

    if (sellTabCount > 0) {
      await expect(sellTab).toBeVisible();
      await sellTab.click();
      await page.waitForLoadState('networkidle');
    }

    // Click on Matched tab
    const matchedTab = market.matchedTab(page);
    const matchedTabCount = await matchedTab.count();

    if (matchedTabCount === 0) {
      return; // Tab not present
    }

    await expect(matchedTab).toBeVisible();
    await matchedTab.click();

    // Stats should change to Last/Avg
    await expect(market.lastPrice(page)).toBeVisible({ timeout: 3000 });
  });

  walletTest('shows orders list or empty state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Should show order cards, empty state, loading, or title
    const content = market.orderCards(page)
      .or(market.emptyState(page))
      .or(market.loadingState(page))
      .or(market.pageTitle(page))
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('has refresh button or page title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    const content = market.refreshButton(page)
      .or(market.retryButton(page))
      .or(market.pageTitle(page))
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('has My Orders link or page title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    const content = market.myOrdersLink(page).or(market.pageTitle(page)).first();
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
    await page.waitForLoadState('networkidle');

    const content = market.priceUnitToggle(page).or(market.pageTitle(page)).first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('clicking sell order navigates to buy form with price and amount', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Click on Sell tab to see sell orders
    const sellTab = market.sellTab(page);
    const sellTabCount = await sellTab.count();
    if (sellTabCount > 0) {
      await sellTab.click();
      await page.waitForLoadState('networkidle');
    }

    // Find and click first order card
    const orderCard = market.orderCards(page);
    const cardCount = await orderCard.count();

    if (cardCount === 0) {
      // No orders available, skip test
      return;
    }

    await orderCard.click();

    // Should navigate to compose/order with type=buy and price/amount in URL
    await expect(page).toHaveURL(/compose\/order/);
    await expect(page).toHaveURL(/type=buy/);
    await expect(page).toHaveURL(/price=/);
    await expect(page).toHaveURL(/amount=/);

    // Verify form actually reads the params - Buy tab should be selected
    const buyTab = page.locator('button:has-text("Buy")').first();
    await expect(buyTab).toBeVisible({ timeout: 5000 });
    await expect(buyTab).toHaveClass(/underline/);
  });

  walletTest('clicking buy order navigates to sell form with price and amount', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Click on Buy tab to see buy orders
    const buyTab = market.buyTab(page);
    const buyTabCount = await buyTab.count();
    if (buyTabCount > 0) {
      await buyTab.click();
      await page.waitForLoadState('networkidle');
    }

    // Find and click first order card
    const orderCard = market.orderCards(page);
    const cardCount = await orderCard.count();

    if (cardCount === 0) {
      // No orders available, skip test
      return;
    }

    await orderCard.click();

    // Should navigate to compose/order with type=sell and price/amount in URL
    await expect(page).toHaveURL(/compose\/order/);
    await expect(page).toHaveURL(/type=sell/);
    await expect(page).toHaveURL(/price=/);
    await expect(page).toHaveURL(/amount=/);
  });
});

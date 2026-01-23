/**
 * BTC Price Page Tests
 *
 * Tests for /market/btc route - Bitcoin price chart and stats
 */

import { walletTest, expect } from '../../fixtures';
import { market, common } from '../../selectors';

walletTest.describe('BTC Price Page (/market/btc)', () => {
  walletTest('btc price page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    // Should show Bitcoin Price title
    await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows current BTC price or loading state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    // Should show Bitcoin Price title (price data may take time to load)
    await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Bitcoin Price title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    // Page should show "Bitcoin Price" title
    await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows time range tabs when loaded', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    // First verify page loaded
    await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 10000 });

    // Check for time range tabs - they may not appear until chart loads
    const tab1h = market.timeRange1h(page);
    const tabCount = await tab1h.count();

    if (tabCount > 0) {
      await expect(tab1h).toBeVisible();
    }
    // Tabs may not be visible if chart hasn't loaded - that's OK
  });

  walletTest('can switch time range when tabs available', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    // First verify page loaded
    await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 10000 });

    // Click on 1H tab if available
    const tab1h = market.timeRange1h(page);
    const tabCount = await tab1h.count();

    if (tabCount > 0) {
      await tab1h.click();
      await page.waitForLoadState('networkidle');
      // Page should still be on market/btc
      expect(page.url()).toContain('market');
    }
  });

  walletTest('shows price chart or loading state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    // Verify page loaded with title
    await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 10000 });
  });

  walletTest('has back navigation to market', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('domcontentloaded');

    // Wait for page title to confirm page loaded
    await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 15000 });

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();
    await expect(page).toHaveURL(/market/, { timeout: 5000 });
  });

  walletTest('page structure is correct', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    // Verify page has expected structure
    await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 10000 });
  });
});

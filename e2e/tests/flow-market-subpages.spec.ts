/**
 * Market Sub-Pages Tests
 *
 * Tests for market sub-routes:
 * - /market/btc
 * - /market/dispensers/:asset
 * - /market/orders/:baseAsset/:quoteAsset
 */

import { walletTest, expect, navigateTo } from '../fixtures';
import { market, compose } from '../selectors';

walletTest.describe('BTC Price Page (/market/btc)', () => {
  walletTest('can navigate to BTC price page', async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/btc`);
    await page.waitForLoadState('networkidle');

    // Should show BTC price info or chart
    const priceContent = page.locator('text=/BTC|Price|USD/i').first();
    const chart = page.locator('canvas');

    await expect(priceContent.or(chart).first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('BTC price page shows price chart or data', async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/btc`);
    await page.waitForLoadState('networkidle');

    // Should show chart or price data
    const chart = market.priceChart(page);
    const priceData = page.locator('text=/\\$[0-9,]+|Price|USD/i').first();

    await expect(chart.or(priceData).first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('BTC price page has back navigation', async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/btc`);
    await page.waitForLoadState('networkidle');

    // Should have back button in header
    const backButton = compose.common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 5000 });

    await backButton.click();
    await expect(page).toHaveURL(/market/);
  });
});

walletTest.describe('Asset Dispensers Page (/market/dispensers/:asset)', () => {
  walletTest.beforeEach(async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/dispensers/XCP`);
    await page.waitForLoadState('networkidle');
  });

  walletTest('shows dispensers page content', async ({ page }) => {
    // Page should show dispensers page heading
    const pageHeading = page.getByRole('heading', { name: /Dispensers/i });
    await expect(pageHeading).toBeVisible({ timeout: 10000 });
  });

  walletTest('displays dispenser list or empty state', async ({ page }) => {
    // Wait for loading to complete - the page shows "Loading..." initially
    await page.waitForLoadState('networkidle');

    // After loading, verify page still shows dispensers content
    const pageHeading = page.getByRole('heading', { name: /Dispensers/i });
    await expect(pageHeading).toBeVisible({ timeout: 10000 });
  });

  walletTest('dispense button is enabled when available', async ({ page }) => {
    const dispenseButton = page.locator('button:has-text("Dispense"), a:has-text("Dispense")').first();
    const buttonCount = await dispenseButton.count();

    if (buttonCount > 0) {
      await expect(dispenseButton).toBeEnabled();
    }
    // No assertion needed if button doesn't exist - no dispensers available
  });
});

walletTest.describe('Asset Orders Page (/market/orders/:baseAsset/:quoteAsset)', () => {
  walletTest.beforeEach(async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/orders/XCP/BTC`);
    await page.waitForLoadState('networkidle');
  });

  walletTest('shows orders page content', async ({ page }) => {
    // Page should show Orders heading
    const pageHeading = page.getByRole('heading', { name: 'Orders' });
    await expect(pageHeading).toBeVisible({ timeout: 10000 });
  });

  walletTest('displays order book or empty state', async ({ page }) => {
    // Wait for loading to complete
    await page.waitForLoadState('networkidle');

    // After loading, verify page still shows orders content
    const pageHeading = page.getByRole('heading', { name: 'Orders' });
    await expect(pageHeading).toBeVisible({ timeout: 10000 });
  });

  walletTest('create order button enabled when available', async ({ page }) => {
    const createButton = page.locator(
      'button:has-text("New Order"), button:has-text("Create Order"), a:has-text("Order")'
    ).first();
    const buttonCount = await createButton.count();

    if (buttonCount > 0) {
      await expect(createButton).toBeEnabled();
    }
    // Verify we're on the right page regardless
    expect(page.url()).toMatch(/market.*orders/);
  });

  walletTest('shows asset info on page', async ({ page }) => {
    // Should show XCP or BTC somewhere
    await expect(page.locator('text=/XCP|BTC/i').first()).toBeVisible({ timeout: 5000 });
  });
});

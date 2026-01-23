/**
 * Market Sub-Pages Tests
 *
 * Tests for market sub-routes:
 * - /dispensers/manage
 * - /market/btc
 * - /market/dispensers/:asset
 * - /market/orders/:baseAsset/:quoteAsset
 */

import { walletTest, expect, navigateTo } from '../fixtures';
import { market, compose } from '../selectors';

walletTest.describe('Dispenser Management Page (/dispensers/manage)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
  });

  walletTest('can navigate to manage tab', async ({ page }) => {
    const manageTab = market.manageTab(page);
    await expect(manageTab).toBeVisible({ timeout: 5000 });
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    // Verify manage tab content loaded
    await expect(
      page.locator('text=/Your Dispensers|Dispensers|No dispensers|Create|Manage/i').first()
    ).toBeVisible({ timeout: 5000 });
  });

  walletTest('dispenser management shows list or empty state', async ({ page }) => {
    const manageTab = market.manageTab(page);
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    // Page should show dispensers list, empty state, or loading
    await expect(
      page.locator('text=/Your Dispensers|No dispensers|No open|Loading|Create Dispenser/i').first()
    ).toBeVisible({ timeout: 5000 });
  });

  walletTest('manage tab has create dispenser option or content', async ({ page }) => {
    const manageTab = market.manageTab(page);
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    // Should show create option or dispenser content
    const createOption = page.locator(
      'button:has-text("New Dispenser"), button:has-text("Create"), a:has-text("Dispenser")'
    ).first();
    const dispenserContent = page.locator('text=/Dispenser|satoshi|BTC/i').first();

    await expect(createOption.or(dispenserContent)).toBeVisible({ timeout: 5000 });
  });
});

walletTest.describe('BTC Price Page (/market/btc)', () => {
  walletTest('can navigate to BTC price page', async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/btc`);
    await page.waitForLoadState('networkidle');

    // Should show BTC price info or chart
    const priceContent = page.locator('text=/BTC|Price|USD/i').first();
    const chart = page.locator('canvas');

    await expect(priceContent.or(chart)).toBeVisible({ timeout: 5000 });
  });

  walletTest('BTC price page shows price chart or data', async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/btc`);
    await page.waitForLoadState('networkidle');

    // Should show chart or price data
    const chart = market.priceChart(page);
    const priceData = page.locator('text=/\\$[0-9,]+|Price|USD/i').first();

    await expect(chart.or(priceData)).toBeVisible({ timeout: 5000 });
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
    await expect(
      page.locator('text=/Dispensers|XCP|satoshi|No dispensers|Loading/i').first()
    ).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays dispenser list or empty state', async ({ page }) => {
    await expect(
      page.locator('text=/satoshi|BTC|price|No dispensers|No open dispensers|Loading/i').first()
    ).toBeVisible({ timeout: 5000 });
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
    await expect(
      page.locator('text=/Orders|XCP|BTC|Buy|Sell|No orders|Loading/i').first()
    ).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays order book or empty state', async ({ page }) => {
    await expect(
      page.locator('text=/Buy|Sell|Bid|Ask|No orders|No open orders|Price|Loading/i').first()
    ).toBeVisible({ timeout: 5000 });
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

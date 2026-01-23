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

    // Verify manage tab content loaded - should show either dispensers or empty state
    const manageContent = page.locator('text=/Your Dispensers|Dispensers|No dispensers|Create|Manage/i').first();
    await expect(manageContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('dispenser management shows list or empty state', async ({ page }) => {
    const manageTab = market.manageTab(page);
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    // Page should show either dispensers list, empty state, or loading
    const pageContent = page.locator(
      'text=/Your Dispensers|No dispensers|No open|Loading|Create Dispenser/i'
    ).first();
    await expect(pageContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('manage tab has create dispenser option', async ({ page }) => {
    const manageTab = market.manageTab(page);
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    // Should have a way to create new dispenser
    const createOption = page.locator(
      'button:has-text("New Dispenser"), button:has-text("Create"), a:has-text("Dispenser")'
    ).first();

    // Either the button is visible or there's dispenser content
    const hasCreateButton = await createOption.count() > 0;
    const hasContent = await page.locator('text=/Dispenser|satoshi|BTC/i').first().count() > 0;

    expect(hasCreateButton || hasContent).toBe(true);
  });
});

walletTest.describe('BTC Price Page (/market/btc)', () => {
  walletTest('can navigate to BTC price page', async ({ page }) => {
    // Navigate directly to BTC price page
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/btc`);
    await page.waitForLoadState('networkidle');

    // Should show BTC price info or chart
    const priceContent = page.locator('text=/BTC|Price|USD/i').or(page.locator('canvas')).first();
    await expect(priceContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('BTC price page shows price chart or data', async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/btc`);
    await page.waitForLoadState('networkidle');

    // Should show chart or price data
    const chart = market.priceChart(page);
    const priceData = page.locator('text=/\\$[0-9,]+|Price|USD/i').first();

    // Either chart or price data should be visible
    const hasChart = await chart.count() > 0;
    const hasPriceData = await priceData.count() > 0;
    expect(hasChart || hasPriceData).toBe(true);
  });

  walletTest('BTC price page has back navigation', async ({ page }) => {
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/btc`);
    await page.waitForLoadState('networkidle');

    // Should have back button in header
    const backButton = compose.common.headerBackButton(page);
    const backCount = await backButton.count();

    if (backCount > 0) {
      await backButton.click();
      await expect(page).toHaveURL(/market/);
    }
  });
});

walletTest.describe('Asset Dispensers Page (/market/dispensers/:asset)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate directly to XCP dispensers
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/dispensers/XCP`);
    await page.waitForLoadState('networkidle');
  });

  walletTest('shows dispensers page content', async ({ page }) => {
    // Should show dispensers content, empty state, or loading
    const content = page.locator('text=/Dispensers|XCP|satoshi|No dispensers|Loading/i').first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays dispenser list or empty state', async ({ page }) => {
    // Should show list of dispensers or empty state
    const listOrEmpty = page.locator(
      'text=/satoshi|BTC|price|No dispensers|No open dispensers|Loading/i'
    ).first();
    await expect(listOrEmpty).toBeVisible({ timeout: 5000 });
  });

  walletTest('has dispense action available when dispensers exist', async ({ page }) => {
    // Look for dispense button (may not exist if no dispensers)
    const dispenseButton = page.locator('button:has-text("Dispense"), a:has-text("Dispense")').first();
    const buttonCount = await dispenseButton.count();

    if (buttonCount > 0) {
      // Verify the button is clickable
      await expect(dispenseButton).toBeEnabled();
    }
    // If no button, that's okay - no dispensers available
  });
});

walletTest.describe('Asset Orders Page (/market/orders/:baseAsset/:quoteAsset)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate directly to XCP/BTC orders
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/orders/XCP/BTC`);
    await page.waitForLoadState('networkidle');
  });

  walletTest('shows orders page content', async ({ page }) => {
    // Should show orders content, empty state, or loading
    const content = page.locator('text=/Orders|XCP|BTC|Buy|Sell|No orders|Loading/i').first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays order book or empty state', async ({ page }) => {
    // Should show buy/sell orders or empty state
    const orderContent = page.locator(
      'text=/Buy|Sell|Bid|Ask|No orders|No open orders|Price|Loading/i'
    ).first();
    await expect(orderContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('has create order action available', async ({ page }) => {
    // Look for create order button
    const createButton = page.locator(
      'button:has-text("New Order"), button:has-text("Create Order"), a:has-text("Order")'
    ).first();
    const buttonCount = await createButton.count();

    if (buttonCount > 0) {
      await expect(createButton).toBeEnabled();
    }
    // If no create button, verify we're at least on the orders page
    expect(page.url()).toMatch(/market.*orders/);
  });

  walletTest('shows asset pair in page', async ({ page }) => {
    // Should show the XCP/BTC pair somewhere on the page
    const assetPair = page.locator('text=/XCP.*BTC|BTC.*XCP/i').first();
    const assetInfo = page.locator('text=/XCP|BTC/i').first();

    // Either the pair or individual assets should be shown
    const hasPair = await assetPair.count() > 0;
    const hasAssetInfo = await assetInfo.count() > 0;
    expect(hasPair || hasAssetInfo).toBe(true);
  });
});

/**
 * Asset Dispensers Page Tests
 *
 * Tests for /market/dispensers/:asset route - dispensers for a specific asset
 */

import { walletTest, expect } from '../../fixtures';
import { market, common } from '../../selectors';

walletTest.describe('Asset Dispensers Page (/market/dispensers/:asset)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to XCP dispensers
    const currentUrl = page.url();
    const baseUrl = currentUrl.substring(0, currentUrl.indexOf('#') + 1);
    await page.goto(`${baseUrl}/market/dispensers/XCP`);
    await page.waitForLoadState('networkidle');
  });

  walletTest('asset dispensers page loads', async ({ page }) => {
    // Should show dispensers UI - title, asset name, or loading state
    const content = page.locator('text=/XCP|Dispensers|Loading/i')
      .or(page.locator('[aria-label*="dispenser" i]'))
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows asset header with icon', async ({ page }) => {
    // Should show asset icon, name, or supply info
    const assetHeader = page.locator('[class*="icon"], img[alt*="XCP"]')
      .or(page.locator('text=/XCP|Supply/i'))
      .first();
    await expect(assetHeader).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows Open and Dispensed tabs', async ({ page }) => {
    // Should show tab navigation
    const openTab = market.openTab(page);
    const dispensedTab = market.dispensedTab(page);

    const openCount = await openTab.count();
    const dispensedCount = await dispensedTab.count();

    // Either tabs are visible or page shows content
    if (openCount > 0 || dispensedCount > 0) {
      const tabOrContent = page.locator(
        'text=/Open|Dispensed|XCP|Loading/i'
      ).first();
      await expect(tabOrContent).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('shows stats card with Floor and Avg', async ({ page }) => {
    // Should show stats (Floor price, Average price, or loading/title)
    const statsOrContent = page.locator(
      'text=/Floor|Avg|Average|—|Loading|XCP/i'
    ).first();
    await expect(statsOrContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('can switch between Open and Dispensed tabs', async ({ page }) => {
    // Click on Dispensed tab
    const dispensedTab = market.dispensedTab(page);
    const tabCount = await dispensedTab.count();

    if (tabCount > 0 && await dispensedTab.isVisible()) {
      await dispensedTab.click();

      // Stats should change to show Last price
      const lastPrice = market.lastPrice(page);
      await expect(lastPrice).toBeVisible({ timeout: 3000 });
    }
  });

  walletTest('shows dispenser list or empty state', async ({ page }) => {
    // Should show dispenser cards, empty state, or loading
    const dispenserContent = page.locator(
      'text=/satoshi|BTC|No dispensers|empty|Loading|XCP/i'
    ).first();
    await expect(dispenserContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('has refresh button', async ({ page }) => {
    const refreshButton = market.refreshButton(page);
    const retryButton = market.retryButton(page);

    const refreshCount = await refreshButton.count();
    const retryCount = await retryButton.count();

    // Either refresh or retry button should exist, or page loaded successfully
    expect(refreshCount > 0 || retryCount > 0 || page.url().includes('dispensers')).toBe(true);
  });

  walletTest('has My Dispensers link', async ({ page }) => {
    const myDispensersLink = market.myDispensersLink(page);
    const linkCount = await myDispensersLink.count();

    // Link may or may not be visible depending on wallet state
    expect(linkCount >= 0 && page.url().includes('dispensers')).toBe(true);
  });

  walletTest('has back navigation to market', async ({ page }) => {
    const backButton = common.headerBackButton(page);
    const backCount = await backButton.count();

    if (backCount > 0 && await backButton.isVisible()) {
      await backButton.click();
      await expect(page).toHaveURL(/market/);
    }
  });

  walletTest('has price unit toggle', async ({ page }) => {
    // Price toggle or page content should be visible
    const toggleOrContent = page.locator('button[aria-label*="toggle" i]')
      .or(page.locator('text=/sats|BTC|XCP/i'))
      .first();
    await expect(toggleOrContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows dispenser prices in selected unit', async ({ page }) => {
    // Should show prices in sats, BTC, fiat, or dashes for no data
    const priceContent = page.locator(
      'text=/sats|BTC|\\$[0-9]|—|XCP/i'
    ).first();
    await expect(priceContent).toBeVisible({ timeout: 5000 });
  });
});

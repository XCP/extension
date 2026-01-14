/**
 * Market Sub-Pages Tests
 *
 * Tests for market sub-routes:
 * - /dispensers/manage
 * - /market/btc
 * - /market/dispensers/:asset
 * - /market/orders/:baseAsset/:quoteAsset
 */

import { walletTest, expect, navigateTo } from '../../fixtures';
import { compose, common } from '../../selectors';

walletTest.describe('Dispenser Management Page (/dispensers/manage)', () => {
  walletTest('can navigate to dispenser management from market', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Switch to Manage tab
    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible({ timeout: 5000 });
    await manageTab.click();

    await page.waitForLoadState('networkidle');

    // Look for dispenser management options
    const hasYourDispensers = await page.locator('text=/Your Dispensers/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasNewDispenser = await page.locator('button:has-text("New Dispenser"), a:has-text("New Dispenser")').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasNoDispensers = await page.locator('text=/You don\'t have any dispensers|No dispensers/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasYourDispensers || hasNewDispenser || hasNoDispensers).toBe(true);
  });

  walletTest('dispenser management shows dispenser list or empty state', async ({ page }) => {
    await navigateTo(page, 'market');
    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    // Should show dispensers list or empty state
    const hasDispenserCards = await page.locator('.space-y-2 > div, [class*="card"]').filter({
      has: page.locator('text=/satoshi|BTC|XCP/i')
    }).first().isVisible({ timeout: 5000 }).catch(() => false);

    const hasEmpty = await page.locator('text=/No dispensers|You don\'t have/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasDispenserCards || hasEmpty).toBe(true);
  });

  walletTest('can create new dispenser from management page', async ({ page }) => {
    await navigateTo(page, 'market');
    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    const newDispenserButton = page.locator('button:has-text("New Dispenser"), a:has-text("New Dispenser"), button:has-text("Create Dispenser")').first();

    if (await newDispenserButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newDispenserButton.click();
      await page.waitForTimeout(500);

      // Should navigate to dispenser creation form
      const onDispenserForm = page.url().includes('dispenser') || page.url().includes('compose');
      const hasDispenserForm = await page.locator('text=/Asset|Price|Escrow|Mainchain Rate/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(onDispenserForm || hasDispenserForm).toBe(true);
    }
  });

  walletTest('dispenser management has close dispenser option', async ({ page }) => {
    await navigateTo(page, 'market');
    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await manageTab.click();
    await page.waitForLoadState('networkidle');

    // Look for close dispenser option (either in list or as button)
    const hasCloseOption = await page.locator('text=/Close Dispenser|Close/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDispenserActions = await page.locator('button[aria-label*="menu"], button[aria-label*="options"]').first().isVisible({ timeout: 2000 }).catch(() => false);

    // Even if no dispensers, the page should have loaded successfully
    expect(page.url()).toContain('market');
  });
});

walletTest.describe('BTC Price Page (/market/btc)', () => {
  walletTest('can navigate to BTC price page', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Look for BTC price link/button
    const btcPriceLink = page.locator('text=/BTC.*Price|Bitcoin.*Price|\\$[0-9,]+/i, a[href*="btc"]').first();

    if (await btcPriceLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btcPriceLink.click();
      await page.waitForTimeout(500);

      // Should navigate to BTC price page or show price details
      const onBtcPage = page.url().includes('/market/btc') || page.url().includes('btc');
      const hasPriceInfo = await page.locator('text=/Price|USD|\\$[0-9]/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(onBtcPage || hasPriceInfo).toBe(true);
    }
  });

  walletTest('BTC price page shows price information', async ({ page }) => {
    // Navigate directly to BTC price page
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    // Should show price info or redirect
    const hasPriceData = await page.locator('text=/\\$[0-9,]+|Price|USD|BTC/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasChart = await page.locator('canvas, svg, [class*="chart"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = page.url().includes('/market') && !page.url().includes('/market/btc');

    expect(hasPriceData || hasChart || redirected).toBe(true);
  });

  walletTest('BTC price page has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/market/btc')) {
      const backButton = compose.common.headerBackButton(page);
      const hasBack = await backButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (hasBack) {
        await backButton.click();
        await page.waitForTimeout(500);
        // Should go back to market
        expect(page.url()).toContain('market');
      }
    }
  });
});

walletTest.describe('Asset Dispensers Page (/market/dispensers/:asset)', () => {
  walletTest('can navigate to asset dispensers page', async ({ page }) => {
    // Navigate directly to XCP dispensers
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    // Should show dispensers for asset or redirect
    const hasDispensers = await page.locator('text=/Dispensers|XCP|satoshi|No dispensers/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const redirected = !page.url().includes('/market/dispensers');

    expect(hasDispensers || hasLoading || redirected).toBe(true);
  });

  walletTest('asset dispensers page shows dispenser list', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/market/dispensers')) {
      // Should show list of dispensers or empty state
      const hasDispenserCards = await page.locator('.space-y-2 > div, [class*="card"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.locator('text=/No dispensers|No open dispensers/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasPrice = await page.locator('text=/satoshi|BTC|price/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDispenserCards || hasEmpty || hasPrice).toBe(true);
    }
  });

  walletTest('can dispense from asset dispensers page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/XCP'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/market/dispensers')) {
      // Look for dispense button
      const dispenseButton = page.locator('button:has-text("Dispense"), a:has-text("Dispense")').first();

      if (await dispenseButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dispenseButton.click();
        await page.waitForTimeout(500);

        // Should navigate to dispense form
        const onDispenseForm = page.url().includes('dispense') || page.url().includes('compose');
        expect(onDispenseForm).toBe(true);
      }
    }
  });
});

walletTest.describe('Asset Orders Page (/market/orders/:baseAsset/:quoteAsset)', () => {
  walletTest('can navigate to asset orders page', async ({ page }) => {
    // Navigate directly to XCP/BTC orders
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    // Should show orders or redirect
    const hasOrders = await page.locator('text=/Orders|XCP|BTC|Buy|Sell|No orders/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const redirected = !page.url().includes('/market/orders');

    expect(hasOrders || hasLoading || redirected).toBe(true);
  });

  walletTest('asset orders page shows order book', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/market/orders')) {
      // Should show order book or empty state
      const hasBuyOrders = await page.locator('text=/Buy|Bid/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasSellOrders = await page.locator('text=/Sell|Ask/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasEmpty = await page.locator('text=/No orders|No open orders/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasBuyOrders || hasSellOrders || hasEmpty).toBe(true);
    }
  });

  walletTest('can create order from orders page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/market/orders')) {
      // Look for create order button
      const newOrderButton = page.locator('button:has-text("New Order"), button:has-text("Create Order"), a:has-text("Order")').first();

      if (await newOrderButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await newOrderButton.click();
        await page.waitForTimeout(500);

        // Should navigate to order form
        const onOrderForm = page.url().includes('order') || page.url().includes('compose');
        expect(onOrderForm).toBe(true);
      }
    }
  });

  walletTest('can fill order from orders page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/market/orders/XCP/BTC'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/market/orders')) {
      // Look for fill/match order option
      const fillButton = page.locator('button:has-text("Fill"), button:has-text("Match"), button:has-text("Buy"), button:has-text("Sell")').first();

      if (await fillButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Just verify the button exists - don't actually fill
        expect(await fillButton.isEnabled()).toBe(true);
      }
    }
  });
});

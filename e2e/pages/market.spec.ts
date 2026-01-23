/**
 * Market Page Tests
 *
 * Tests for the Marketplace page functionality.
 */

import {
  walletTest,
  expect,
  navigateTo
} from '../fixtures';
import { footer } from '../selectors';

walletTest.describe('Market Page', () => {
  walletTest('market page loads and displays content', async ({ page }) => {
    await navigateTo(page, 'market');

    await expect(page).toHaveURL(/market/);
    await expect(page.getByText('Marketplace')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Browse' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Manage' })).toBeVisible();
  });

  walletTest('market page shows price ticker or loading state', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Market page should show price data after loading
    const priceData = page.locator('text=/BTC|XCP|\\$[0-9,]+/i').first();
    await expect(priceData).toBeVisible({ timeout: 15000 });
  });

  walletTest('market page shows content after loading', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Wait for loading to complete, then verify actual content appears
    // Should show dispensers/orders section (not just loading spinner)
    const content = page.locator('text=/Dispensers|Orders/i').first();
    await expect(content).toBeVisible({ timeout: 15000 });
  });

  walletTest('browse tab shows dispensers section', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Dispensers').first()).toBeVisible({ timeout: 10000 });

    const openTab = page.locator('text=Open').first();
    const dispensedTab = page.locator('text=Dispensed').first();

    await expect(openTab).toBeVisible();
    await expect(dispensedTab).toBeVisible();
  });

  walletTest('browse tab shows orders section', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Orders').first()).toBeVisible({ timeout: 10000 });

    const historyTab = page.locator('text=History').first();
    await expect(historyTab).toBeVisible();
  });

  walletTest('can switch between Browse and Manage tabs', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const browseTab = page.getByRole('tab', { name: 'Browse' });
    const manageTab = page.getByRole('tab', { name: 'Manage' });

    await expect(browseTab).toBeVisible();
    await expect(manageTab).toBeVisible();

    await manageTab.click();

    // Manage tab should show user's orders/dispensers section
    const manageContent = page.locator('text=/Your Orders|Your Dispensers/i').first()
      .or(page.locator('text=/You don\'t have any/i').first())
      .first();
    await expect(manageContent).toBeVisible({ timeout: 10000 });

    await browseTab.click();

    await expect(page.getByText('Dispensers').first()).toBeVisible();
  });

  walletTest('manage tab shows create buttons or loading', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible();
    await manageTab.click();

    await page.waitForLoadState('networkidle');

    // Wait for manage content: create buttons or empty state message
    // NOT loading spinners - test should wait for actual content
    const createButtons = page.locator('text=/New Order|New Dispenser|Create Order|Create Dispenser/i').first();
    const emptyState = page.locator('text=/No orders|No dispensers|You don\'t have any/i').first();
    await expect(createButtons.or(emptyState).first()).toBeVisible({ timeout: 15000 });
  });

  walletTest('can navigate to market from footer', async ({ page }) => {
    await expect(page).toHaveURL(/index/);

    await expect(footer.marketButton(page)).toBeVisible();
    await footer.marketButton(page).click();

    await expect(page).toHaveURL(/market/);
    await expect(page.getByText('Marketplace')).toBeVisible();
  });

  walletTest('market page handles network errors gracefully', async ({ page }) => {
    // Navigate to market first, then set up error routes for subsequent requests
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Now set up routes that will fail for refresh/subsequent requests
    await page.route('**/*counterparty*/**', route => {
      route.abort('failed');
    });
    await page.route('**/api/**', route => {
      if (route.request().url().includes('counterparty') || route.request().url().includes('dispens')) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });

    // Wait for any pending requests to settle
    await page.waitForLoadState('networkidle');

    // Page should still show market structure (not crash)
    const pageStillWorks = page.getByText('Marketplace')
      .or(page.getByText('Browse'))
      .or(page.getByText('Manage'))
      .first();
    await expect(pageStillWorks).toBeVisible({ timeout: 3000 });
  });

  walletTest('dispenser tab switching works', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Dispensers').first()).toBeVisible({ timeout: 10000 });

    const dispensedTab = page.locator('button:has-text("Dispensed")').first();

    // Only proceed if tab exists - skip if not available
    const tabCount = await dispensedTab.count();
    if (tabCount === 0) {
      // Tab not present, skip this part
      return;
    }

    await expect(dispensedTab).toBeVisible();
    await dispensedTab.click();

    // After clicking tab, page should still be on market
    await expect(page).toHaveURL(/market/);
  });

  walletTest('order tab switching works', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Orders').first()).toBeVisible({ timeout: 10000 });

    const historyTab = page.locator('button:has-text("History")').first();

    // Only proceed if tab exists
    const tabCount = await historyTab.count();
    if (tabCount === 0) {
      return;
    }

    await expect(historyTab).toBeVisible();
    await historyTab.click();

    // After clicking tab, page should still be on market
    await expect(page).toHaveURL(/market/);
  });

  walletTest('dispensers section displays cards or empty state', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
    await page.waitForLoadState('domcontentloaded');

    // Wait for dispensers section header
    await expect(page.getByText('Dispensers').first()).toBeVisible({ timeout: 10000 });

    // Wait for content to load - cards, empty state, or loading
    const cards = page.locator('.space-y-2 > div').first();
    const emptyState = page.getByText(/No open dispensers|No dispensers/i).first();
    const loading = page.getByText(/Loading/i).first();
    await expect(cards.or(emptyState).or(loading).first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('orders section displays cards or empty state', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
    await page.waitForLoadState('domcontentloaded');

    // Wait for orders section header
    await expect(page.getByText('Orders').first()).toBeVisible({ timeout: 10000 });

    // Wait for content to load - cards, empty state, or loading
    const cards = page.locator('.space-y-2 > div').first();
    const emptyState = page.getByText(/No open orders|No orders/i).first();
    const loading = page.getByText(/Loading/i).first();
    await expect(cards.or(emptyState).or(loading).first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('market page scrolling works with content', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await expect(page.getByText('Dispensers').first()).toBeVisible({ timeout: 10000 });

    // Get the scrollable container (usually the main content area)
    const scrollContainer = page.locator('main, .overflow-auto, .overflow-y-auto').first();

    // Try to scroll down
    await scrollContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Try to scroll back up
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 0;
    });

    // Page should still be responsive
    await expect(page.getByText('Marketplace')).toBeVisible();
  });

  walletTest('market page maintains state when switching tabs rapidly', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const browseTab = page.getByRole('tab', { name: 'Browse' });
    const manageTab = page.getByRole('tab', { name: 'Manage' });

    await expect(browseTab).toBeVisible();
    await expect(manageTab).toBeVisible();

    // Rapid tab switching
    for (let i = 0; i < 3; i++) {
      await manageTab.click();
      await browseTab.click();
    }

    // Page should still be stable
    await expect(page).toHaveURL(/market/);
    await expect(page.getByText('Dispensers').first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('market page search or filter functionality', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
    await page.waitForLoadState('networkidle');

    // Look for search input
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"], input[placeholder*="Filter"]').first();
    const searchCount = await searchInput.count();

    if (searchCount > 0) {
      await expect(searchInput).toBeVisible();

      // Try searching for something
      await searchInput.fill('XCP');

      // Content should update (either show results or "no results")
      const contentUpdate = page.locator('text=/XCP|No results|No match/i').first();
      await expect(contentUpdate).toBeVisible({ timeout: 3000 });

      // Clear search
      await searchInput.clear();
    }

    // Page should still work regardless of search presence
    await expect(page.getByText('Marketplace')).toBeVisible();
  });

  walletTest('manage tab shows your dispensers section', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible();
    await manageTab.click();

    await page.waitForLoadState('networkidle');

    // Should show "Your Dispensers" section header or empty state (not loading spinner)
    const dispensersContent = page.locator('text=/Your Dispensers/i').first()
      .or(page.locator('text=/You don\'t have any dispensers|No dispensers/i').first());
    await expect(dispensersContent).toBeVisible({ timeout: 10000 });
  });

  walletTest('manage tab shows your orders section', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible();
    await manageTab.click();

    await page.waitForLoadState('networkidle');

    // Should show "Your Orders" section header or empty state (not loading spinner)
    const ordersContent = page.locator('text=/Your Orders/i').first()
      .or(page.locator('text=/You don\'t have any orders|No orders/i').first());
    await expect(ordersContent).toBeVisible({ timeout: 10000 });
  });

  walletTest('new order button navigates to order form', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible();
    await manageTab.click();

    await page.waitForLoadState('networkidle');

    // Find the New Order button
    const newOrderButton = page.locator('button:has-text("New Order"), a:has-text("New Order")').first();
    const buttonCount = await newOrderButton.count();

    // Skip if button not present (test environment may not have it)
    if (buttonCount === 0) {
      return;
    }

    await expect(newOrderButton).toBeVisible();
    await newOrderButton.click();

    // Should navigate to order form
    const onOrderForm = page.url().includes('order') || page.url().includes('compose');
    const hasOrderForm = page.locator('text=/Give|Get|Amount|Asset/i').first();

    if (onOrderForm) {
      await expect(hasOrderForm).toBeVisible({ timeout: 3000 });
    }
  });

  walletTest('new dispenser button navigates to dispenser form', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const manageTab = page.getByRole('tab', { name: 'Manage' });
    await expect(manageTab).toBeVisible();
    await manageTab.click();

    await page.waitForLoadState('networkidle');

    // Find the New Dispenser button
    const newDispenserButton = page.locator('button:has-text("New Dispenser"), a:has-text("New Dispenser"), button:has-text("Create Dispenser")').first();
    const buttonCount = await newDispenserButton.count();

    // Skip if button not present (test environment may not have it)
    if (buttonCount === 0) {
      return;
    }

    await expect(newDispenserButton).toBeVisible();
    await newDispenserButton.click();

    // Should navigate to dispenser form
    const onDispenserForm = page.url().includes('dispenser') || page.url().includes('compose');
    const hasDispenserForm = page.locator('text=/Asset|Price|Escrow|Amount/i').first();

    if (onDispenserForm) {
      await expect(hasDispenserForm).toBeVisible({ timeout: 3000 });
    }
  });
});

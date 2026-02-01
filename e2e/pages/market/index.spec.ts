/**
 * Market Page Tests
 *
 * Tests for the Marketplace page functionality.
 */

import {
  walletTest,
  expect,
  navigateTo
} from '../../fixtures';
import { footer } from '../../selectors';

walletTest.describe('Market Page', () => {
  walletTest('market page loads and displays content', async ({ page }) => {
    await navigateTo(page, 'market');

    await expect(page).toHaveURL(/market/);
    // Main tabs: Orders and Dispensers
    await expect(page.getByRole('tab', { name: 'Orders' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Dispensers' })).toBeVisible();
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
    // Should show dispensers/orders tabs (not just loading spinner)
    const content = page.getByRole('tab', { name: 'Dispensers' })
      .or(page.getByRole('tab', { name: 'Orders' }));
    await expect(content.first()).toBeVisible({ timeout: 15000 });
  });

  walletTest('dispensers tab shows sub-tabs', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');

    // Click dispensers tab
    await page.getByRole('tab', { name: 'Dispensers' }).click();

    // Sub-tabs should be visible
    const openTab = page.getByRole('tab', { name: 'Open' });
    const historyTab = page.getByRole('tab', { name: 'History' });

    await expect(openTab).toBeVisible();
    await expect(historyTab).toBeVisible();
  });

  walletTest('orders tab shows sub-tabs', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');

    // Click orders tab
    await page.getByRole('tab', { name: 'Orders' }).click();

    // Sub-tabs should be visible
    const openTab = page.getByRole('tab', { name: 'Open' });
    const historyTab = page.getByRole('tab', { name: 'History' });

    await expect(openTab).toBeVisible();
    await expect(historyTab).toBeVisible();
  });

  walletTest('can switch between Orders and Dispensers tabs', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const ordersTab = page.getByRole('tab', { name: 'Orders' });
    const dispensersTab = page.getByRole('tab', { name: 'Dispensers' });

    await expect(ordersTab).toBeVisible();
    await expect(dispensersTab).toBeVisible();

    // Click Orders tab
    await ordersTab.click();

    // Should show order search or empty state
    const orderContent = page.getByPlaceholder(/order/i)
      .or(page.getByText(/No open orders/i).first());
    await expect(orderContent.first()).toBeVisible({ timeout: 10000 });

    // Click Dispensers tab
    await dispensersTab.click();

    // Should show dispenser search
    await expect(page.getByPlaceholder(/dispenser/i).first()).toBeVisible();
  });

  walletTest('sub-tabs switch between Open and History', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');

    // Sub-tabs: Open and History
    const openTab = page.getByRole('tab', { name: 'Open' });
    const historyTab = page.getByRole('tab', { name: 'History' });

    await expect(openTab).toBeVisible();
    await expect(historyTab).toBeVisible();

    // Click History tab
    await historyTab.click();

    // Should show history content or empty state
    const historyContent = page.getByText(/[A-Z]{3,}/).first() // Asset names in history cards
      .or(page.getByText(/No recent/i).first());
    await expect(historyContent.first()).toBeVisible({ timeout: 10000 });

    // Click back to Open
    await openTab.click();
    await expect(page).toHaveURL(/market/);
  });

  walletTest('can navigate to market from footer', async ({ page }) => {
    await expect(page).toHaveURL(/index/);

    await expect(footer.marketButton(page)).toBeVisible();
    await footer.marketButton(page).click();

    await expect(page).toHaveURL(/market/);
    // Market page should show tabs
    await expect(page.getByRole('tab', { name: 'Orders' })).toBeVisible();
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
    const pageStillWorks = page.getByRole('tab', { name: 'Orders' })
      .or(page.getByRole('tab', { name: 'Dispensers' }))
      .first();
    await expect(pageStillWorks).toBeVisible({ timeout: 3000 });
  });

  walletTest('dispenser sub-tab switching works', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');

    // Go to dispensers tab
    await page.getByRole('tab', { name: 'Dispensers' }).click();

    const historyTab = page.getByRole('tab', { name: 'History' });

    await expect(historyTab).toBeVisible();
    await historyTab.click();

    // After clicking tab, page should still be on market
    await expect(page).toHaveURL(/market/);
  });

  walletTest('order sub-tab switching works', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.waitForLoadState('networkidle');

    // Go to orders tab
    await page.getByRole('tab', { name: 'Orders' }).click();

    const historyTab = page.getByRole('tab', { name: 'History' });

    await expect(historyTab).toBeVisible();
    await historyTab.click();

    // After clicking tab, page should still be on market
    await expect(page).toHaveURL(/market/);
  });

  walletTest('dispensers section displays cards or empty state', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
    await page.waitForLoadState('domcontentloaded');

    // Click dispensers tab
    await page.getByRole('tab', { name: 'Dispensers' }).click();

    // Wait for content to load - should show cards (with asset names) OR empty state
    const contentWithAsset = page.getByText(/[A-Z]{3,}/).first(); // Asset names are uppercase
    const emptyState = page.getByText(/No open dispensers|No dispensers|Failed to load/i).first();
    await expect(contentWithAsset.or(emptyState).first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('orders section displays cards or empty state', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
    await page.waitForLoadState('domcontentloaded');

    // Click orders tab
    await page.getByRole('tab', { name: 'Orders' }).click();

    // Wait for content to load - should show cards (with asset names) OR empty state
    const contentWithAsset = page.getByText(/[A-Z]{3,}/).first(); // Asset names are uppercase
    const emptyState = page.getByText(/No open orders|No orders|Failed to load/i).first();
    await expect(contentWithAsset.or(emptyState).first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('market page scrolling works with content', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
    await page.waitForLoadState('networkidle');

    // Wait for tabs to be visible
    await expect(page.getByRole('tab', { name: 'Dispensers' })).toBeVisible({ timeout: 10000 });

    // Get the scrollable container
    const scrollContainer = page.locator('[role="main"]').first();

    // Try to scroll down
    await scrollContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Try to scroll back up
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 0;
    });

    // Page should still be responsive
    await expect(page.getByRole('tab', { name: 'Orders' })).toBeVisible();
  });

  walletTest('market page maintains state when switching tabs rapidly', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const ordersTab = page.getByRole('tab', { name: 'Orders' });
    const dispensersTab = page.getByRole('tab', { name: 'Dispensers' });

    await expect(ordersTab).toBeVisible();
    await expect(dispensersTab).toBeVisible();

    // Rapid tab switching between main tabs
    for (let i = 0; i < 3; i++) {
      await ordersTab.click();
      await dispensersTab.click();
    }

    // Page should still be stable
    await expect(page).toHaveURL(/market/);

    // Content should be visible (search input or content)
    const content = page.getByPlaceholder(/dispenser/i)
      .or(page.getByText(/No open dispensers|[A-Z]{3,}/i).first());
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('market page search or filter functionality', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);
    await page.waitForLoadState('networkidle');

    // Look for search input (dispensers tab should be active by default)
    const searchInput = page.getByPlaceholder(/search|dispenser/i).first();
    const searchCount = await searchInput.count();

    if (searchCount > 0) {
      await expect(searchInput).toBeVisible();

      // Try searching for something
      await searchInput.fill('XCP');

      // Content should update (either show results or "no results")
      const contentUpdate = page.getByText(/XCP|No results|No open dispensers/i).first();
      await expect(contentUpdate).toBeVisible({ timeout: 10000 });

      // Clear search
      await searchInput.clear();
    }

    // Page should still work regardless of search presence
    await expect(page.getByRole('tab', { name: 'Orders' })).toBeVisible();
  });

  walletTest('dispensers tab shows dispenser content', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const dispensersTab = page.getByRole('tab', { name: 'Dispensers' });
    await expect(dispensersTab).toBeVisible();
    await dispensersTab.click();

    await page.waitForLoadState('networkidle');

    // Should show dispenser content or empty state (not loading spinner)
    const dispensersContent = page.getByText(/[A-Z]{3,}/).first() // Asset names
      .or(page.getByText(/No open dispensers|Failed to load/i).first());
    await expect(dispensersContent.first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('orders tab shows order content', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    const ordersTab = page.getByRole('tab', { name: 'Orders' });
    await expect(ordersTab).toBeVisible();
    await ordersTab.click();

    await page.waitForLoadState('networkidle');

    // Should show order content or empty state (not loading spinner)
    const ordersContent = page.getByText(/[A-Z]{3,}/).first() // Asset names
      .or(page.getByText(/No open orders|Failed to load/i).first());
    await expect(ordersContent.first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('order search returns results or empty state', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Go to orders tab
    const ordersTab = page.getByRole('tab', { name: 'Orders' });
    await ordersTab.click();

    await page.waitForLoadState('networkidle');

    // Find the search input
    const searchInput = page.getByPlaceholder(/order/i).first();
    const inputCount = await searchInput.count();

    // Skip if search not present
    if (inputCount === 0) {
      return;
    }

    await expect(searchInput).toBeVisible();

    // Try searching
    await searchInput.fill('XCP');

    // Wait for search results or empty state
    const results = page.getByText(/XCP|No open orders/i).first();
    await expect(results).toBeVisible({ timeout: 10000 });
  });

  walletTest('dispenser search returns results or empty state', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Go to dispensers tab (should be default)
    const dispensersTab = page.getByRole('tab', { name: 'Dispensers' });
    await dispensersTab.click();

    await page.waitForLoadState('networkidle');

    // Find the search input
    const searchInput = page.getByPlaceholder(/dispenser/i).first();
    const inputCount = await searchInput.count();

    // Skip if search not present
    if (inputCount === 0) {
      return;
    }

    await expect(searchInput).toBeVisible();

    // Try searching
    await searchInput.fill('PEPECASH');

    // Wait for search results or empty state
    const results = page.getByText(/PEPECASH|No open dispensers/i).first();
    await expect(results).toBeVisible({ timeout: 10000 });
  });
});

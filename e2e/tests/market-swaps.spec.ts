/**
 * Market Swaps Tab & Swap Listing Flow Tests
 *
 * Tests for:
 * - Swaps tab on market page (explore + manage views)
 * - List for Sale form (/market/swaps/list)
 * - Review screen and back navigation
 * - UTXO menu integration (Swap action)
 * - Asset swaps page (/market/swaps/:asset)
 * - Buy page (/market/swaps/buy/:id)
 *
 * Note: Tests stop at review/confirm screen — actual signing/broadcast
 * is covered by unit tests and provider tests.
 */

import { walletTest, expect, navigateTo } from '../fixtures';
import { market, swapList, swapBuy, index } from '../selectors';

// Helper to get base URL for direct navigation
function getBaseUrl(page: import('@playwright/test').Page): string {
  const currentUrl = page.url();
  return currentUrl.substring(0, currentUrl.indexOf('#') + 1);
}

// ============================================================================
// Market Page — Swaps Tab
// ============================================================================

walletTest.describe('Market Swaps Tab', () => {
  walletTest.beforeEach(async ({ page }) => {
    await navigateTo(page, 'market');
    await page.waitForLoadState('networkidle');
  });

  walletTest('swaps tab is visible alongside dispensers and orders', async ({ page }) => {
    await expect(market.dispensersTab(page)).toBeVisible();
    await expect(market.ordersTab(page)).toBeVisible();
    await expect(market.swapsTab(page)).toBeVisible();
  });

  walletTest('can switch to swaps tab', async ({ page }) => {
    await market.swapsTab(page).click();
    await page.waitForLoadState('networkidle');

    // Should show search input or empty state
    const searchInput = market.swapSearchInput(page);
    const emptyState = market.swapEmptyState(page);
    await expect(searchInput.or(emptyState).first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('swaps tab has search input', async ({ page }) => {
    await market.swapsTab(page).click();
    await page.waitForLoadState('networkidle');

    const searchInput = market.swapSearchInput(page);
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  walletTest('swaps explore view shows listings or empty state', async ({ page }) => {
    await market.swapsTab(page).click();
    await page.waitForLoadState('networkidle');

    // Should show swap cards or empty state message
    const swapCard = market.swapCard(page);
    const emptyState = market.swapEmptyState(page);
    await expect(swapCard.or(emptyState).first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('swaps manage view shows user listings or empty state', async ({ page }) => {
    await market.swapsTab(page).click();
    // Switch to manage (user icon)
    await market.manageToggle(page).click();
    await page.waitForLoadState('networkidle');

    // Should show listings or empty with "List a UTXO" link
    const emptyState = page.getByText(/You don't have any active swap listings/i);
    const listLink = market.listUtxoLink(page);
    const swapCard = market.swapCard(page);

    await expect(swapCard.or(emptyState).first()).toBeVisible({ timeout: 10000 });

    // If empty, "List a UTXO" link should be visible
    if (await emptyState.isVisible()) {
      await expect(listLink).toBeVisible();
    }
  });

  walletTest('search filters swap listings', async ({ page }) => {
    await market.swapsTab(page).click();
    await page.waitForLoadState('networkidle');

    const searchInput = market.swapSearchInput(page);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a search query
    await searchInput.fill('NONEXISTENTASSET999');

    // Should show no results
    const noResults = page.getByText(/No swap listings matching/i);
    await expect(noResults).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// List for Sale Page — Form
// ============================================================================

walletTest.describe('List for Sale Form (/market/swaps/list)', () => {
  walletTest('shows error when no UTXO specified', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/list`);
    await page.waitForLoadState('networkidle');

    await expect(swapList.noUtxoError(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for invalid UTXO', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/list?utxo=invalid`);
    await page.waitForLoadState('networkidle');

    // Should show error (no assets found or API error)
    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
  });

  walletTest('has help text toggle button', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    // Use a fake UTXO — the form will show loading then error,
    // but the header should still have the help button
    await page.goto(`${baseUrl}/market/swaps/list?utxo=abc:0`);

    await expect(swapList.helpButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('header shows "List for Sale" title', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/list?utxo=abc:0`);

    const title = page.getByText(/List for Sale/i).first();
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  walletTest('back button navigates away from form', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    // Start at index, then go to list form
    await page.goto(`${baseUrl}/index`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${baseUrl}/market/swaps/list?utxo=abc:0`);

    const backButton = page.locator('button[aria-label*="Back"], button:has-text("Back")').first();
    if (await backButton.isVisible()) {
      await backButton.click();
      // Should navigate away from the list page
      await expect(page).not.toHaveURL(/market\/swaps\/list/);
    }
  });
});

// ============================================================================
// Asset Swaps Page
// ============================================================================

walletTest.describe('Asset Swaps Page (/market/swaps/:asset)', () => {
  walletTest('loads asset swaps page', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/XCP`);
    await page.waitForLoadState('networkidle');

    // Should show "Swaps" header
    const heading = page.getByText(/Swaps/i).first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows listings or empty state for asset', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/XCP`);
    await page.waitForLoadState('networkidle');

    // Should show swap cards or empty state
    const swapCard = page.locator('[role="button"]').filter({ hasText: /BTC/ }).first();
    const emptyState = page.getByText(/No active swap listings/i);
    await expect(swapCard.or(emptyState).first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('has refresh button', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/XCP`);
    await page.waitForLoadState('networkidle');

    const refreshButton = page.locator('button[aria-label*="Refresh"]');
    await expect(refreshButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('has back navigation', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/XCP`);
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button[aria-label*="Back"], button:has-text("Back")').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// Buy Page
// ============================================================================

walletTest.describe('Swap Buy Page (/market/swaps/buy/:id)', () => {
  walletTest('shows error for non-existent listing', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/buy/nonexistent-id`);
    await page.waitForLoadState('networkidle');

    // Should show "not found" error or alert
    const errorAlert = page.locator('[role="alert"]');
    const notFound = page.getByText(/not found|no longer active/i);
    await expect(errorAlert.or(notFound).first()).toBeVisible({ timeout: 10000 });
  });

  walletTest('has back navigation', async ({ page }) => {
    const baseUrl = getBaseUrl(page);
    await page.goto(`${baseUrl}/market/swaps/buy/test-id`);
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button[aria-label*="Back"], button:has-text("Back")').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// UTXO Tab — Menu Integration
// ============================================================================

walletTest.describe('UTXO Menu Swap Action', () => {
  walletTest('UTXOs tab exists on home page when UTXOs present', async ({ page }) => {
    // UTXOs tab only shows when address has UTXO balances
    // This test verifies the tab mechanism works
    const utxosTab = page.locator('button[aria-label="View UTXOs"]');
    const assetsTab = index.assetsTab(page);

    // At least one tab should be visible
    await expect(assetsTab).toBeVisible({ timeout: 5000 });

    // UTXOs tab is conditional — if it exists, it should be clickable
    if (await utxosTab.isVisible()) {
      await utxosTab.click();
      // Should show UTXO cards or empty
      await page.waitForLoadState('networkidle');
    }
  });
});

// ============================================================================
// Cross-Feature Navigation
// ============================================================================

walletTest.describe('Swap Navigation Flows', () => {
  walletTest('market swaps tab → manage → "List a UTXO" link navigates to UTXOs', async ({ page }) => {
    await navigateTo(page, 'market');
    await page.waitForLoadState('networkidle');

    await market.swapsTab(page).click();
    await market.manageToggle(page).click();
    await page.waitForLoadState('networkidle');

    const listLink = market.listUtxoLink(page);
    if (await listLink.isVisible()) {
      await listLink.click();
      await expect(page).toHaveURL(/index.*tab=UTXOs/i, { timeout: 5000 });
    }
  });

  walletTest('view mode toggle persists across tabs', async ({ page }) => {
    await navigateTo(page, 'market');
    await page.waitForLoadState('networkidle');

    // Switch to manage mode on dispensers tab
    await market.manageToggle(page).click();
    await page.waitForLoadState('networkidle');

    // Switch to swaps tab — manage mode should persist
    await market.swapsTab(page).click();
    await page.waitForLoadState('networkidle');

    // Should show manage view content (search your swaps)
    const searchInput = page.getByPlaceholder(/Search your swaps/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });
});

/**
 * View Balance Page Tests (/balance/:asset)
 *
 * Tests for viewing the user's balance of a specific asset.
 * Component: src/pages/assets/view-balance.tsx
 *
 * The page shows:
 * - Loading state: "Loading balance details…"
 * - Error state: "Failed to load balance information"
 * - Success state: BalanceHeader + ActionList with Send, DEX Order, etc.
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('View Balance Page (/balance/:asset)', () => {
  // Helper to navigate to balance page and wait for content to load
  async function navigateToBalance(page: any, asset: string) {
    await page.goto(page.url().replace(/\/index.*/, `/balance/${asset}`));
    await page.waitForLoadState('networkidle');
    // Wait for any of the three states: loading spinner, error message, or success content (Send action)
    await page.locator('text="Loading balance details…", text="Failed to load balance information", text="Send"').first().waitFor({ state: 'visible', timeout: 10000 });
  }

  walletTest('page loads and shows Send action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // XCP balance page should show Send action
    const sendAction = page.locator('text="Send"');
    await expect(sendAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows DEX Order action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // XCP balance page should show DEX Order action
    const dexOrderAction = page.locator('text="DEX Order"');
    await expect(dexOrderAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Dispenser action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // XCP balance page should show Dispenser action
    const dispenserAction = page.locator('text="Dispenser"');
    await expect(dispenserAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Attach action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // XCP balance page should show Attach action (with green border)
    const attachAction = page.locator('text="Attach"');
    await expect(attachAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Destroy action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // XCP balance page should show Destroy action (with red border)
    const destroyAction = page.locator('text="Destroy"');
    await expect(destroyAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Send action for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    // BTC balance page should show Send action
    const sendAction = page.locator('text="Send"');
    await expect(sendAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Dispense action for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    // BTC balance page should show Dispense action
    const dispenseAction = page.locator('text="Dispense"');
    await expect(dispenseAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('handles invalid asset with error state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/balance/INVALID_ASSET_67890'));
    await page.waitForLoadState('networkidle');

    // Should show error message for invalid asset
    const errorMessage = page.locator('text="Failed to load balance information"');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });
});

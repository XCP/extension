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
    await page.waitForLoadState('domcontentloaded');
    // Wait for success state (Send action visible means content loaded)
    // If loading or error, the test will fail with a meaningful message
    const sendAction = page.getByText('Send');
    await expect(sendAction).toBeVisible({ timeout: 15000 });
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

  // ============================================================================
  // BTC-Specific Actions
  // ============================================================================

  walletTest('shows Fairmint action for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    const fairmintAction = page.locator('text="Fairmint"');
    await expect(fairmintAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows BTCPay action for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    const btcpayAction = page.locator('text="BTCPay"');
    await expect(btcpayAction).toBeVisible({ timeout: 10000 });
  });

  // ============================================================================
  // XCP-Specific Actions
  // ============================================================================

  walletTest('shows Fairmint action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const fairmintAction = page.locator('text="Fairmint"');
    await expect(fairmintAction).toBeVisible({ timeout: 10000 });
  });

  // ============================================================================
  // Action Navigation Tests
  // ============================================================================

  walletTest('Send action navigates to compose/send for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const sendAction = page.locator('button:has-text("Send"), div[role="button"]:has-text("Send")').first();
    await expect(sendAction).toBeVisible({ timeout: 10000 });
    await sendAction.click();

    await expect(page).toHaveURL(/compose\/send\/XCP/, { timeout: 5000 });
  });

  walletTest('DEX Order action navigates to compose/order for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const dexAction = page.locator('button:has-text("DEX Order"), div[role="button"]:has-text("DEX Order")').first();
    await expect(dexAction).toBeVisible({ timeout: 10000 });
    await dexAction.click();

    await expect(page).toHaveURL(/compose\/order\/XCP/, { timeout: 5000 });
  });

  walletTest('Dispenser action navigates to compose/dispenser for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const dispenserAction = page.locator('button:has-text("Dispenser"), div[role="button"]:has-text("Dispenser")').first();
    await expect(dispenserAction).toBeVisible({ timeout: 10000 });
    await dispenserAction.click();

    await expect(page).toHaveURL(/compose\/dispenser\/XCP/, { timeout: 5000 });
  });

  walletTest('Attach action navigates to compose/utxo/attach for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const attachAction = page.locator('button:has-text("Attach"), div[role="button"]:has-text("Attach")').first();
    await expect(attachAction).toBeVisible({ timeout: 10000 });
    await attachAction.click();

    await expect(page).toHaveURL(/compose\/utxo\/attach\/XCP/, { timeout: 5000 });
  });

  walletTest('Destroy action navigates to compose/destroy for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const destroyAction = page.locator('button:has-text("Destroy"), div[role="button"]:has-text("Destroy")').first();
    await expect(destroyAction).toBeVisible({ timeout: 10000 });
    await destroyAction.click();

    await expect(page).toHaveURL(/compose\/destroy\/XCP/, { timeout: 5000 });
  });

  walletTest('Send action navigates to compose/send for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    const sendAction = page.locator('button:has-text("Send"), div[role="button"]:has-text("Send")').first();
    await expect(sendAction).toBeVisible({ timeout: 10000 });
    await sendAction.click();

    await expect(page).toHaveURL(/compose\/send\/BTC/, { timeout: 5000 });
  });

  walletTest('Dispense action navigates to compose/dispenser/dispense for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    const dispenseAction = page.locator('button:has-text("Dispense"), div[role="button"]:has-text("Dispense")').first();
    await expect(dispenseAction).toBeVisible({ timeout: 10000 });
    await dispenseAction.click();

    await expect(page).toHaveURL(/compose\/dispenser\/dispense/, { timeout: 5000 });
  });

  // ============================================================================
  // UI Elements
  // ============================================================================

  walletTest('shows action descriptions', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // Each action should have a description
    await expect(page.locator('text="Send this asset to another address"')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text="Create a new order on the DEX"')).toBeVisible({ timeout: 10000 });
  });

  walletTest('Attach action has green border styling', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // Attach action should have green border class
    const attachAction = page.locator('button:has-text("Attach"), div[role="button"]:has-text("Attach")').first();
    await expect(attachAction).toBeVisible({ timeout: 10000 });

    // Check if parent or self has the green border class
    const hasGreenBorder = await attachAction.evaluate((el) => {
      return el.className.includes('border-green') || el.closest('.border-green-500') !== null;
    });
    expect(hasGreenBorder).toBe(true);
  });

  walletTest('Destroy action has red border styling', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // Destroy action should have red border class
    const destroyAction = page.locator('button:has-text("Destroy"), div[role="button"]:has-text("Destroy")').first();
    await expect(destroyAction).toBeVisible({ timeout: 10000 });

    // Check if parent or self has the red border class
    const hasRedBorder = await destroyAction.evaluate((el) => {
      return el.className.includes('border-red') || el.closest('.border-red-500') !== null;
    });
    expect(hasRedBorder).toBe(true);
  });

  walletTest('back button navigates to index', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // Find and click back button
    const backButton = page.locator('header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('shows Balance header title', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // Header should show "Balance"
    const headerTitle = page.locator('text="Balance"').first();
    await expect(headerTitle).toBeVisible({ timeout: 10000 });
  });
});

/**
 * View Balance Page Tests (/assets/:asset/balance)
 *
 * Tests for viewing the user's balance of a specific asset.
 * Component: src/pages/assets/view-balance.tsx
 *
 * The page shows:
 * - Loading state: "Loading balance details…"
 * - Error state: "Failed to load balance information"
 * - Success state: BalanceHeader + ActionList with Send, Swap, etc.
 */

import { walletTest, expect } from '@e2e/fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('View Balance Page (/assets/:asset/balance)', () => {
  // Helper to navigate to balance page and wait for content to load
  async function navigateToBalance(page: any, asset: string) {
    await page.goto(page.url().replace(/\/index.*/, `/assets/${asset}/balance`));
    await page.waitForLoadState('domcontentloaded');
    // Wait for success state (Send action visible means content loaded)
    // Use .first() to avoid strict mode violation - there's both a title "Send" and description
    const sendAction = page.getByText('Send').first();
    await expect(sendAction).toBeVisible({ timeout: 15000 });
  }

  walletTest('page loads and shows Send action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    // XCP balance page should show Send action (use .first() to target the action title, not description)
    const sendAction = page.locator('text="Send"').first();
    await expect(sendAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Swap action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const swapAction = page.locator('text="Swap"').first();
    await expect(swapAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('does not show Sell action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    await expect(page.locator('text="Sell"').first()).not.toBeVisible();
  });

  walletTest('does not show Attach action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    await expect(page.locator('text="Attach"').first()).not.toBeVisible();
  });

  walletTest('does not show Destroy action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    await expect(page.locator('text="Destroy"').first()).not.toBeVisible();
  });

  walletTest('shows Send action for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    // BTC balance page should show Send action (use .first() to target the action title)
    const sendAction = page.locator('text="Send"').first();
    await expect(sendAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Dispense action for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    // BTC balance page should show Dispense action
    const dispenseAction = page.locator('text="Dispense"').first();
    await expect(dispenseAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('handles invalid asset with error state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/assets/INVALID_ASSET_67890/balance'));
    await page.waitForLoadState('networkidle');

    // Should show error message for invalid asset
    const errorMessage = page.locator('text="Failed to load balance information"');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  // ============================================================================
  // BTC-Specific Actions
  // ============================================================================

  walletTest('shows Mint action for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    const mintAction = page.locator('text="Mint"').first();
    await expect(mintAction).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows BTC Pay action for BTC', async ({ page }) => {
    await navigateToBalance(page, 'BTC');

    const btcpayAction = page.locator('text="BTC Pay"').first();
    await expect(btcpayAction).toBeVisible({ timeout: 10000 });
  });

  // ============================================================================
  // XCP-Specific Actions
  // ============================================================================

  walletTest('shows Mint action for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const mintAction = page.locator('text="Mint"').first();
    await expect(mintAction).toBeVisible({ timeout: 10000 });
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

  walletTest('Swap action navigates to compose/order for XCP', async ({ page }) => {
    await navigateToBalance(page, 'XCP');

    const swapAction = page.locator('button:has-text("Swap"), div[role="button"]:has-text("Swap")').first();
    await expect(swapAction).toBeVisible({ timeout: 10000 });
    await swapAction.click();

    await expect(page).toHaveURL(/compose\/order\/XCP/, { timeout: 5000 });
  });

  walletTest('Sell action navigates to compose/dispenser for other assets', async ({ page }) => {
    await navigateToBalance(page, 'PEPECASH');

    const sellAction = page.locator('button:has-text("Sell"), div[role="button"]:has-text("Sell")').first();
    await expect(sellAction).toBeVisible({ timeout: 10000 });
    await sellAction.click();

    await expect(page).toHaveURL(/compose\/dispenser\/PEPECASH/, { timeout: 5000 });
  });

  walletTest('LP asset shows Manage Pool action and navigates to pool page', async ({ page }) => {
    await enableValidationBypass(page);
    await navigateToBalance(page, 'A95428956661682177');

    const managePoolAction = page.locator('button:has-text("Manage Pool"), div[role="button"]:has-text("Manage Pool")').first();
    await expect(managePoolAction).toBeVisible({ timeout: 10000 });
    await managePoolAction.click();

    await expect(page).toHaveURL(/\/pools\/A95428956661682177/, { timeout: 5000 });
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

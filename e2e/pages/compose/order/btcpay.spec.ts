/**
 * Compose Order BTC Pay Page Tests (/compose/order/btcpay)
 *
 * Tests for paying BTC to fill an order.
 * Component: src/pages/compose/order/btcpay/index.tsx
 *
 * The page shows:
 * - Title "BTCPay"
 * - Order Match ID input
 * - Fee Rate selector
 */

import { walletTest, expect } from '@e2e/fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose BTC Pay Page (/compose/order/btcpay)', () => {
  // Route is /compose/order/btcpay (not /compose/order/btcpay)
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/order/btcpay'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with BTCPay title', async ({ page }) => {
    // The header should show "BTCPay"
    const titleText = page.locator('text="BTCPay"');
    await expect(titleText).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Fee Rate selector', async ({ page }) => {
    // Fee Rate label should be visible
    const feeRateLabel = page.locator('label:has-text("Fee Rate")');
    await expect(feeRateLabel).toBeVisible({ timeout: 10000 });
  });

  walletTest('has Continue button', async ({ page }) => {
    // Submit button should exist
    const submitButton = page.locator('button[type="submit"]:has-text("Continue")');
    await expect(submitButton).toBeVisible({ timeout: 10000 });
  });
});

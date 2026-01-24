/**
 * Compose Order Cancel Page Tests (/compose/order/cancel)
 *
 * Tests for cancelling an open DEX order.
 * Component: src/pages/compose/order/cancel/index.tsx
 *
 * The page shows:
 * - Title "Cancel"
 * - Order Hash input
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Cancel Order Page (/compose/order/cancel)', () => {
  // Route is /compose/order/cancel/:hash? (not /compose/order/cancel)
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/order/cancel'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Cancel title', async ({ page }) => {
    // The header should show "Cancel"
    const titleText = page.locator('text="Cancel"');
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

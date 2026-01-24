/**
 * Compose Dispenser Close Page Tests (/compose/dispenser/close)
 *
 * Tests for closing a dispenser.
 * Component: src/pages/compose/dispenser/close/index.tsx
 *
 * The page shows:
 * - Title "Close"
 * - Dispenser selection (dropdown of user's open dispensers)
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Dispenser Close Page (/compose/dispenser/close)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    // Route requires asset parameter: /compose/dispenser/close/:asset?
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close/XCP'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Close title', async ({ page }) => {
    // The header should show "Close"
    const titleText = page.locator('text="Close"');
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

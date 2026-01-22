/**
 * Compose Dispenser Close By Hash Page Tests (/compose/dispenser/close-by-hash)
 *
 * Tests for closing a dispenser by transaction hash.
 * Component: src/pages/compose/dispenser/close-by-hash/index.tsx
 *
 * The page shows:
 * - Title "Close"
 * - Transaction hash input
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';

walletTest.describe('Compose Dispenser Close By Hash Page (/compose/dispenser/close-by-hash)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/close-by-hash'));
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

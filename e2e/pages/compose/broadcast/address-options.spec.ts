/**
 * Compose Broadcast Address Options Page Tests (/compose/broadcast/address-options)
 *
 * Tests for broadcast address options configuration.
 * Component: src/pages/compose/broadcast/address-options/index.tsx
 *
 * The page shows:
 * - Title "Broadcast"
 * - Toggle switches for options
 * - Fee Rate selector
 */

import { walletTest, expect } from '@e2e/fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Broadcast Address Options Page (/compose/broadcast/address-options)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/broadcast/address-options'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Broadcast title', async ({ page }) => {
    // The header should show "Broadcast"
    const titleText = page.locator('text="Broadcast"');
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

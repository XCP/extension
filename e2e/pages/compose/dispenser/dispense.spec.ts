/**
 * Compose Dispenser Dispense Page Tests (/compose/dispenser/dispense)
 *
 * Tests for buying from a dispenser.
 * Component: src/pages/compose/dispenser/dispense/index.tsx
 *
 * The page shows:
 * - Title "Dispense"
 * - Dispenser address input
 * - Fee Rate selector
 */

import { walletTest, expect } from '@e2e/fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Dispense Page (/compose/dispenser/dispense)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/dispenser/dispense'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Dispense title', async ({ page }) => {
    // The header should show "Dispense"
    const titleText = page.locator('text="Dispense"');
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

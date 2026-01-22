/**
 * Compose Issuance Lock Supply Page Tests (/compose/issuance/lock-supply)
 *
 * Tests for permanently locking asset supply.
 * Component: src/pages/compose/issuance/lock-supply/index.tsx
 *
 * The page shows:
 * - Title "Lock Supply"
 * - Confirmation checkbox
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Lock Supply Page (/compose/issuance/lock-supply)', () => {
  // Use TESTUNLOCKED asset which has locked: false in the mock
  // XCP and other built-in assets are already locked and would show an error message
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-supply/TESTUNLOCKED'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Lock Supply title', async ({ page }) => {
    // The header should show "Lock Supply"
    const titleText = page.locator('text="Lock Supply"');
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

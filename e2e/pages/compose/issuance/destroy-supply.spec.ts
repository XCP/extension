/**
 * Compose Issuance Destroy Supply Page Tests (/compose/issuance/destroy-supply)
 *
 * Tests for destroying/burning asset supply.
 * Component: src/pages/compose/issuance/destroy-supply/index.tsx
 *
 * The page shows:
 * - Title "Destroy"
 * - Quantity input for amount to destroy
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Destroy Supply Page (/compose/destroy)', () => {
  // Use TESTUNLOCKED asset with mock enabled
  // Route is /compose/destroy/:asset (not /compose/issuance/destroy-supply)
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/destroy/TESTUNLOCKED'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Destroy title', async ({ page }) => {
    // The header should show "Destroy"
    const titleText = page.locator('text="Destroy"');
    await expect(titleText).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Fee Rate selector', async ({ page }) => {
    // Fee Rate label should be visible
    const feeRateLabel = page.locator('label:has-text("Fee Rate")');
    await expect(feeRateLabel).toBeVisible({ timeout: 10000 });
  });

  walletTest('has Destroy Supply button', async ({ page }) => {
    // Submit button should exist with "Destroy Supply" text
    const submitButton = page.locator('button[type="submit"]:has-text("Destroy Supply")');
    await expect(submitButton).toBeVisible({ timeout: 10000 });
  });
});

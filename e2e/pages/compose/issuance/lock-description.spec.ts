/**
 * Compose Issuance Lock Description Page Tests (/compose/issuance/lock-description)
 *
 * Tests for permanently locking asset description.
 * Component: src/pages/compose/issuance/lock-description/index.tsx
 *
 * The page shows:
 * - Title "Lock Description"
 * - Confirmation checkbox
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Lock Description Page (/compose/issuance/lock-description)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-description/XCP'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Lock Description title', async ({ page }) => {
    // The header should show "Lock Description"
    const titleText = page.locator('text="Lock Description"');
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

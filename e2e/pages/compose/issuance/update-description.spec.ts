/**
 * Compose Issuance Update Description Page Tests (/compose/issuance/update-description)
 *
 * Tests for updating asset description.
 * Component: src/pages/compose/issuance/update-description/index.tsx
 *
 * The page shows:
 * - Title "Update Asset"
 * - Description textarea
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Update Description Page (/compose/issuance/update-description)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/update-description/XCP'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Update Asset title', async ({ page }) => {
    // The header should show "Update Asset"
    const titleText = page.locator('text="Update Asset"');
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

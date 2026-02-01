/**
 * Compose Issuance Issue Supply Page Tests (/compose/issuance/issue-supply)
 *
 * Tests for issuing additional supply of an existing asset.
 * Component: src/pages/compose/issuance/issue-supply/index.tsx
 *
 * The page shows:
 * - Title "Issue Supply"
 * - Quantity input for amount to issue
 * - Fee Rate selector
 */

import { walletTest, expect } from '@e2e/fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Issue Supply Page (/compose/issuance/issue-supply)', () => {
  // Use TESTUNLOCKED asset which has locked: false in the mock
  // XCP and other built-in assets are locked and would show an error message
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/issue-supply/TESTUNLOCKED'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Issue Supply title', async ({ page }) => {
    // The header should show "Issue Supply"
    const titleText = page.locator('text="Issue Supply"');
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

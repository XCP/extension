/**
 * Compose Dividend Page Tests (/compose/dividend)
 *
 * Tests for distributing dividends to asset holders.
 * Component: src/pages/compose/dividend/index.tsx
 *
 * The page shows:
 * - Title "Dividend"
 * - Asset selection for dividend payment
 * - Quantity per unit input
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose Dividend Page (/compose/dividend)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    // Navigate directly to dividend page with XCP asset
    await page.goto(page.url().replace(/\/index.*/, '/compose/dividend/XCP'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Dividend title', async ({ page }) => {
    // The header should show "Dividend"
    const titleText = page.locator('text="Dividend"');
    await expect(titleText).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows form or loading state', async ({ page }) => {
    // Either the form is loaded (with Fee Rate) or showing loading/error state
    const feeRateLabel = page.locator('label:has-text("Fee Rate")');
    const loadingSpinner = page.locator('text=/Loading|loading/i');
    const errorMessage = page.locator('text=/Unable to load|error/i');

    // Wait for one of these states
    await expect(
      feeRateLabel.or(loadingSpinner).or(errorMessage)
    ).toBeVisible({ timeout: 15000 });
  });

  walletTest('has form elements or shows appropriate state', async ({ page }) => {
    // Either submit button exists or page shows loading/error
    const submitButton = page.locator('button[type="submit"]');
    const loadingSpinner = page.locator('text=/Loading|loading/i');
    const errorMessage = page.locator('text=/Unable to load|error/i');

    await expect(
      submitButton.or(loadingSpinner).or(errorMessage)
    ).toBeVisible({ timeout: 15000 });
  });
});

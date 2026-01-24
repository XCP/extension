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

  walletTest('shows form with Fee Rate label', async ({ page }) => {
    // Form should load and show Fee Rate label
    const feeRateLabel = page.locator('label:has-text("Fee Rate")');
    await expect(feeRateLabel).toBeVisible({ timeout: 15000 });
  });

  walletTest('has submit button', async ({ page }) => {
    // Form should have a submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible({ timeout: 15000 });
  });
});

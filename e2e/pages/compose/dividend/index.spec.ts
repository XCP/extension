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

walletTest.describe('Compose Dividend Page (/compose/dividend)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate directly to dividend page with XCP asset
    await page.goto(page.url().replace(/\/index.*/, '/compose/dividend/XCP'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Dividend title', async ({ page }) => {
    // The header should show "Dividend"
    const titleText = page.locator('text="Dividend"');
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

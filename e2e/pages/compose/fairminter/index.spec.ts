/**
 * Compose Fairminter Page Tests (/compose/fairminter)
 *
 * Tests for creating a fairminter (fair launch token distribution).
 * Component: src/pages/compose/fairminter/index.tsx
 *
 * The page shows:
 * - Title "Fairminter"
 * - Asset name input
 * - Price configuration
 * - Max mint configuration
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';

walletTest.describe('Compose Fairminter Page (/compose/fairminter)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate directly to fairminter page
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairminter'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Fairminter title', async ({ page }) => {
    // The header should show "Fairminter"
    const titleText = page.locator('text="Fairminter"');
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

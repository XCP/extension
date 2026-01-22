/**
 * Compose Fairmint Page Tests (/compose/fairmint)
 *
 * Tests for participating in a fairminter (minting from a fair launch).
 * Component: src/pages/compose/fairminter/fairmint/index.tsx
 *
 * Note: This page requires an active fairminter to exist, which depends on
 * API data. Tests check basic page structure.
 */

import { walletTest, expect } from '../../../fixtures';

walletTest.describe('Compose Fairmint Page (/compose/fairmint)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate directly to fairmint page
    await page.goto(page.url().replace(/\/index.*/, '/compose/fairminter/fairmint'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Fairmint title', async ({ page }) => {
    // The header should show "Fairmint"
    const titleText = page.locator('text="Fairmint"');
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

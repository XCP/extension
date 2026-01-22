/**
 * Compose Issuance Transfer Ownership Page Tests (/compose/issuance/transfer-ownership)
 *
 * Tests for transferring asset ownership to another address.
 * Component: src/pages/compose/issuance/transfer-ownership/index.tsx
 *
 * The page shows:
 * - Title "Transfer Asset"
 * - New owner address input
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';

walletTest.describe('Compose Transfer Ownership Page (/compose/issuance/transfer-ownership)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/transfer-ownership/XCP'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Transfer Asset title', async ({ page }) => {
    // The header should show "Transfer Asset"
    const titleText = page.locator('text="Transfer Asset"');
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

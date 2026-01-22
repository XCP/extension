/**
 * Compose UTXO Attach Page Tests (/compose/utxo/attach)
 *
 * Tests for attaching assets to a UTXO.
 * Component: src/pages/compose/utxo/attach/index.tsx
 *
 * The page shows:
 * - Title "Attach UTXO"
 * - Asset quantity input
 * - UTXO selection
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose UTXO Attach Page (/compose/utxo/attach)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    // Route requires asset parameter: /compose/utxo/attach/:asset
    await page.goto(page.url().replace(/\/index.*/, '/compose/utxo/attach/XCP'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Attach UTXO title', async ({ page }) => {
    // The header should show "Attach UTXO"
    const titleText = page.locator('text="Attach UTXO"');
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

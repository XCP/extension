/**
 * Compose UTXO Move Page Tests (/compose/utxo/move)
 *
 * Tests for moving assets between UTXOs.
 * Component: src/pages/compose/utxo/move/index.tsx
 *
 * The page shows:
 * - Title "Move UTXO"
 * - Destination input
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';
import { enableValidationBypass } from '../../../compose-test-helpers';

walletTest.describe('Compose UTXO Move Page (/compose/utxo/move)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await enableValidationBypass(page);
    // Route requires utxo parameter: /compose/utxo/move/:utxo
    const testUtxo = '0000000000000000000000000000000000000000000000000000000000000000:0';
    await page.goto(page.url().replace(/\/index.*/, `/compose/utxo/move/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Move UTXO title', async ({ page }) => {
    // The header should show "Move UTXO"
    const titleText = page.locator('text="Move UTXO"');
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

/**
 * Compose UTXO Detach Page Tests (/compose/utxo/detach)
 *
 * Tests for detaching assets from a UTXO.
 * Component: src/pages/compose/utxo/detach/index.tsx
 *
 * The page shows:
 * - Title "Detach UTXO"
 * - Asset selection from UTXO
 * - Fee Rate selector
 */

import { walletTest, expect } from '../../../fixtures';

walletTest.describe('Compose UTXO Detach Page (/compose/utxo/detach)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Route requires utxo parameter: /compose/utxo/detach/:utxo
    const testUtxo = '0000000000000000000000000000000000000000000000000000000000000000:0';
    await page.goto(page.url().replace(/\/index.*/, `/compose/utxo/detach/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');
  });

  walletTest('page loads with Detach UTXO title', async ({ page }) => {
    // The header should show "Detach UTXO"
    const titleText = page.locator('text="Detach UTXO"');
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

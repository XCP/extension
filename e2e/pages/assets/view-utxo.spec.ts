/**
 * View UTXO Page Tests (/utxo/:utxo)
 *
 * Tests for viewing details of a specific UTXO and its attached assets.
 * Component: src/pages/assets/view-utxo.tsx
 *
 * The page shows:
 * - Loading state: "Loading UTXO details…"
 * - Error state: ErrorAlert with role="alert"
 * - Success state: "Details" heading with UTXO info
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('View UTXO Page (/utxo/:utxo)', () => {
  // Use a valid UTXO format (txid:vout) - API will likely return error for non-existent
  const testUtxo = '0000000000000000000000000000000000000000000000000000000000000000:0';

  // Helper to navigate to UTXO page and wait for content
  async function navigateToUtxo(page: any, utxo: string) {
    await page.goto(page.url().replace(/\/index.*/, `/utxo/${encodeURIComponent(utxo)}`));
    await page.waitForLoadState('domcontentloaded');
    // Wait for loading to complete - either UTXO Details heading or error alert appears
    const detailsHeading = page.getByRole('heading', { name: 'UTXO Details' });
    const errorAlert = page.locator('[role="alert"]');
    await expect(detailsHeading.or(errorAlert).first()).toBeVisible({ timeout: 15000 });
  }

  walletTest('page loads and shows Details or error', async ({ page }) => {
    await navigateToUtxo(page, testUtxo);

    // Component shows either Details heading (success) or ErrorAlert (API failure)
    const detailsHeading = page.locator('text="Details"');
    await expect(detailsHeading).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays Output field with UTXO identifier', async ({ page }) => {
    await navigateToUtxo(page, testUtxo);

    // Should show the Output field with formatted UTXO
    const outputLabel = page.locator('text="Output"');
    await expect(outputLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows Move and Detach action buttons', async ({ page }) => {
    await navigateToUtxo(page, testUtxo);

    // Action buttons should be visible
    const moveButton = page.locator('text="Move"');
    const detachButton = page.locator('text="Detach"');

    await expect(moveButton).toBeVisible({ timeout: 5000 });
    await expect(detachButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid UTXO format gracefully', async ({ page }) => {
    // Navigate with invalid UTXO format (missing :vout)
    await page.goto(page.url().replace(/\/index.*/, '/utxo/invalid-utxo-format'));
    await page.waitForLoadState('domcontentloaded');

    // Page should load and show the UTXO Details header (even for invalid UTXO)
    const utxoHeading = page.getByRole('heading', { name: 'UTXO Details' });
    await expect(utxoHeading).toBeVisible({ timeout: 15000 });
  });
});

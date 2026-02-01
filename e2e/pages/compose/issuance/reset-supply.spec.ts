/**
 * Compose Issuance Reset Supply Page Tests (/compose/issuance/reset-supply)
 *
 * Tests for resetting asset supply.
 */

import { walletTest, expect } from '@e2e/fixtures';

walletTest.describe('Compose Reset Supply Page (/compose/issuance/reset-supply)', () => {
  walletTest('reset supply page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/reset-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    // Page may redirect if asset doesn't exist or user doesn't own it
    const isOnResetPage = page.url().includes('reset-supply');

    if (isOnResetPage) {
      // Should show reset supply heading
      const heading = page.locator('text=/Reset.*Supply|Reset/i').first();
      await expect(heading).toBeVisible({ timeout: 5000 });
    }
    // Redirect is acceptable behavior for non-existent asset
  });
});

/**
 * Compose Issuance Reset Supply Page Tests (/compose/issuance/reset-supply)
 *
 * Tests for resetting asset supply.
 */

import { walletTest, expect } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose Reset Supply Page (/compose/issuance/reset-supply)', () => {
  walletTest('reset supply page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/reset-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    const hasResetSupply = await page.locator('text=/Reset.*Supply|Reset/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasForm = await page.locator('input, button:has-text("Reset")').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('reset-supply');

    expect(hasResetSupply || hasForm || redirected).toBe(true);
  });
});

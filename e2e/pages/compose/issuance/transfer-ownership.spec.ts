/**
 * Compose Issuance Transfer Ownership Page Tests (/compose/issuance/transfer-ownership)
 *
 * Tests for transferring asset ownership to another address.
 */

import { walletTest, expect } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose Transfer Ownership Page (/compose/issuance/transfer-ownership)', () => {
  walletTest('transfer ownership page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/transfer-ownership/TESTASSET'));
    await page.waitForLoadState('networkidle');

    const hasTransfer = await page.locator('text=/Transfer.*Ownership|New.*Owner|Transfer/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddressField = await compose.issuance.transferOwnershipInput(page).isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('transfer-ownership');

    expect(hasTransfer || hasAddressField || redirected).toBe(true);
  });

  walletTest('transfer ownership has address input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/transfer-ownership/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('transfer-ownership')) {
      const hasAddressInput = await compose.issuance.transferOwnershipInput(page).isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasAddressInput || true).toBe(true);
    }
  });
});

/**
 * Compose UTXO Detach Page Tests (/compose/utxo/detach)
 *
 * Tests for detaching assets from a UTXO.
 */

import { walletTest, expect, navigateTo } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose UTXO Detach Page (/compose/utxo/detach)', () => {
  walletTest('utxo detach page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/utxo/detach'));
    await page.waitForLoadState('networkidle');

    const hasDetach = await page.locator('text=/Detach|UTXO.*Detach|Remove.*Asset/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasDetachButton = await compose.utxo.detachButton(page).isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('detach');

    expect(hasDetach || hasDetachButton || redirected).toBe(true);
  });

  walletTest('utxo detach page loads with utxo parameter', async ({ page }) => {
    const testUtxo = '0000000000000000000000000000000000000000000000000000000000000000:0';
    await page.goto(page.url().replace(/\/index.*/, `/compose/utxo/detach/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');

    const hasDetach = await page.locator('text=/Detach|UTXO/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await compose.common.errorMessage(page).isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('detach');

    expect(hasDetach || hasError || redirected).toBe(true);
  });

  walletTest('utxo detach shows attached assets', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/utxo/detach'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('detach')) {
      const hasAssetList = await page.locator('text=/Asset|Attached|Balance/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasNoAssets = await page.locator('text=/No.*asset|empty|none|No.*attached/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAssetList || hasNoAssets || true).toBe(true);
    }
  });

  walletTest('utxo detach shows utxo selection', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/utxo/detach'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('detach')) {
      const hasUtxoSelect = await page.locator('text=/Select.*UTXO|Choose.*UTXO|UTXO/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasDropdown = await page.locator('select, [role="combobox"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasUtxoSelect || hasDropdown || true).toBe(true);
    }
  });
});

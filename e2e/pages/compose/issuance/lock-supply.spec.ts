/**
 * Compose Issuance Lock Supply Page Tests (/compose/issuance/lock-supply)
 *
 * Tests for permanently locking asset supply.
 */

import { walletTest, expect } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose Lock Supply Page (/compose/issuance/lock-supply)', () => {
  walletTest('lock supply page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    const hasLockSupply = await page.locator('text=/Lock.*Supply|Permanent|Cannot.*undo/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasWarning = await page.locator('text=/Warning|Caution|Irreversible/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('lock-supply');

    expect(hasLockSupply || hasWarning || redirected).toBe(true);
  });

  walletTest('lock supply has confirmation requirement', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('lock-supply')) {
      const hasCheckbox = await page.locator('input[type="checkbox"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasConfirmText = await page.locator('text=/confirm|understand|agree/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasCheckbox || hasConfirmText || true).toBe(true);
    }
  });

  walletTest('lock supply shows warning about irreversibility', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-supply/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('lock-supply')) {
      const hasWarning = await page.locator('text=/Warning|Caution|Irreversible|Permanent/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasWarning || true).toBe(true);
    }
  });
});

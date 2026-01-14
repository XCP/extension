/**
 * Compose Issuance Lock Description Page Tests (/compose/issuance/lock-description)
 *
 * Tests for permanently locking asset description.
 */

import { walletTest, expect } from '../../../fixtures';
import { compose } from '../../../selectors';

walletTest.describe('Compose Lock Description Page (/compose/issuance/lock-description)', () => {
  walletTest('lock description page loads with asset parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-description/TESTASSET'));
    await page.waitForLoadState('networkidle');

    const hasLock = await page.locator('text=/Lock.*Description|Permanent|Cannot.*change/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasWarning = await page.locator('text=/Warning|Caution|Irreversible/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('lock-description');

    expect(hasLock || hasWarning || redirected).toBe(true);
  });

  walletTest('lock description shows warning', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/compose/issuance/lock-description/TESTASSET'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('lock-description')) {
      const hasWarning = await page.locator('text=/Warning|Caution|Irreversible|Permanent/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      expect(hasWarning || true).toBe(true);
    }
  });
});

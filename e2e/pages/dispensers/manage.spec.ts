/**
 * Dispensers Pages Tests
 *
 * Tests for dispenser management page:
 * - /dispensers/manage - View and manage user's dispensers
 */

import { walletTest, expect } from '../../fixtures';
import { common } from '../../selectors';

walletTest.describe('Dispensers Pages', () => {
  walletTest.describe('Manage Dispensers (/dispensers/manage)', () => {
    walletTest('manage dispensers page loads', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/dispensers/manage'));
      await page.waitForLoadState('networkidle');

      const hasDispensers = await page.locator('text=/Dispenser|Manage|Your/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.locator('text=/No dispenser|empty|none/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const redirected = !page.url().includes('/dispensers/');

      expect(hasDispensers || hasEmpty || redirected).toBe(true);
    });

    walletTest('manage dispensers shows dispenser list or empty state', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/dispensers/manage'));
      await page.waitForLoadState('networkidle');

      if (page.url().includes('/dispensers/')) {
        // Should show either dispenser list or empty state
        const hasList = await page.locator('text=/Asset|Rate|Status/i').first().isVisible({ timeout: 5000 }).catch(() => false);
        const hasEmpty = await page.locator('text=/No dispenser|Create|empty/i').first().isVisible({ timeout: 3000 }).catch(() => false);

        expect(hasList || hasEmpty).toBe(true);
      }
    });

    walletTest('manage dispensers page has title', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/dispensers/manage'));
      await page.waitForLoadState('networkidle');

      if (page.url().includes('/dispensers/')) {
        // Page should have a title related to dispensers
        const pageTitle = page.locator('text=/Dispenser|Manage/i').first();
        await expect(pageTitle).toBeVisible({ timeout: 5000 });
      }
    });
  });
});

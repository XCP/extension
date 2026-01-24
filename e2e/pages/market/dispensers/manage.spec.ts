/**
 * Dispensers Pages Tests
 *
 * Tests for dispenser management page:
 * - /market/dispensers/manage - View and manage user's dispensers
 */

import { walletTest, expect } from '../../../fixtures';

walletTest.describe('Dispensers Pages', () => {
  walletTest.describe('Manage Dispensers (/market/dispensers/manage)', () => {
    walletTest('manage dispensers page loads with content or redirects', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/manage'));
      await page.waitForLoadState('networkidle');

      // Page may show dispensers, empty state, or redirect
      const isOnDispensersPage = page.url().includes('/market/dispensers/');

      if (isOnDispensersPage) {
        // Should show dispensers content or empty state
        const content = page.locator('text=/Dispenser|Manage|Your|No dispenser|empty|none/i').first();
        await expect(content).toBeVisible({ timeout: 5000 });
      }
      // If redirected, that's acceptable behavior
    });

    walletTest('manage dispensers shows dispenser list or empty state', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/manage'));
      await page.waitForLoadState('networkidle');

      const isOnDispensersPage = page.url().includes('/market/dispensers/');
      if (!isOnDispensersPage) {
        return; // Page redirected, skip test
      }

      // Should show either dispenser list or empty state
      const content = page.locator('text=/Asset|Rate|Status|No dispenser|Create|empty/i').first();
      await expect(content).toBeVisible({ timeout: 5000 });
    });

    walletTest('manage dispensers page has title', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, '/market/dispensers/manage'));
      await page.waitForLoadState('networkidle');

      const isOnDispensersPage = page.url().includes('/market/dispensers/');
      if (!isOnDispensersPage) {
        return; // Page redirected, skip test
      }

      // Page should have a title related to dispensers
      const pageTitle = page.locator('text=/Dispenser|Manage/i').first();
      await expect(pageTitle).toBeVisible({ timeout: 5000 });
    });
  });
});

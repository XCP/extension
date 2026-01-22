/**
 * Transaction Pages Tests
 *
 * Tests for transaction viewing pages:
 * - /transaction/view/:txid - View transaction details
 */

import { walletTest, expect } from '../../fixtures';
import { common } from '../../selectors';

walletTest.describe('Transaction Pages', () => {
  walletTest.describe('View Transaction (/transaction/view)', () => {
    walletTest('view transaction page loads with txid', async ({ page }) => {
      const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
      await page.goto(page.url().replace(/\/index.*/, `/transaction/view/${testTxid}`));
      await page.waitForLoadState('networkidle');

      const hasTransaction = await page.locator('text=/Transaction|Details|Hash/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasError = await page.locator('text=/not found|error|invalid/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const redirected = !page.url().includes('/transaction/');

      expect(hasTransaction || hasError || redirected).toBe(true);
    });

    walletTest('view transaction shows error for invalid txid', async ({ page }) => {
      const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
      await page.goto(page.url().replace(/\/index.*/, `/transaction/view/${testTxid}`));
      await page.waitForLoadState('networkidle');

      // With an all-zeros txid, we expect an error message
      const errorMessage = page.locator('text=/not found|error|invalid/i').first();
      await expect(errorMessage).toBeVisible({ timeout: 5000 });
    });

    walletTest('view transaction page has back button', async ({ page }) => {
      const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
      await page.goto(page.url().replace(/\/index.*/, `/transaction/view/${testTxid}`));
      await page.waitForLoadState('networkidle');

      // The page should have navigation controls
      const backButton = page.locator('button[aria-label*="back" i], header button').first();
      await expect(backButton).toBeVisible({ timeout: 5000 });
    });
  });
});

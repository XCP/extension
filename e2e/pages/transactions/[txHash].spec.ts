/**
 * Transaction Pages Tests
 *
 * Tests for transaction viewing pages:
 * - /transaction/:txHash - View transaction details
 *
 * Note: These tests use a dummy txid. The API may return data or an error,
 * but the page structure (header, back button) is consistent regardless.
 */

import { walletTest, expect } from '../../fixtures';
import { common } from '../../selectors';

walletTest.describe('Transaction Pages', () => {
  walletTest.describe('View Transaction (/transaction/:txHash)', () => {
    const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';

    walletTest('view transaction page loads and shows header title', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, `/transaction/${testTxid}`));
      await page.waitForLoadState('domcontentloaded');

      // Header title "Transaction" is set immediately via setHeaderProps
      const headerTitle = page.locator('header h1');
      await expect(headerTitle).toHaveText('Transaction', { timeout: 10000 });
    });

    walletTest('view transaction page has back button in header', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, `/transaction/${testTxid}`));
      await page.waitForLoadState('domcontentloaded');

      // Header back button is set immediately via setHeaderProps
      const backButton = common.headerBackButton(page);
      await expect(backButton).toBeVisible({ timeout: 10000 });
    });

    walletTest('view transaction page has view on xchain button', async ({ page }) => {
      await page.goto(page.url().replace(/\/index.*/, `/transaction/${testTxid}`));
      await page.waitForLoadState('domcontentloaded');

      // Right button "View on XChain" is set immediately via setHeaderProps
      const xchainButton = page.locator('header button[aria-label="View on XChain"]');
      await expect(xchainButton).toBeVisible({ timeout: 10000 });
    });
  });
});

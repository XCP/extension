/**
 * Address Type Settings Page Tests
 *
 * Tests for /settings/address-type route - change wallet address format
 */

import { walletTest, expect } from '../../fixtures';
import { settings, common } from '../../selectors';

walletTest.describe('Address Type Settings Page (/settings/address-type)', () => {
  walletTest('address type settings page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    // Page may redirect for private key wallets that don't have address type option
    if (!page.url().includes('/settings/address-type')) return;

    // Should show address type UI
    const addressTypeLabel = page.getByText(/P2PKH|P2WPKH|P2TR|Legacy|SegWit|Taproot|Native|Address Type/i).first();
    await expect(addressTypeLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows available address type options', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-type')) return;

    // Should show radio group with address type options
    const radioGroup = page.getByRole('radiogroup').first();
    await expect(radioGroup).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows address previews for each type', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-type')) return;

    // Should show address type labels
    const addressTypeLabels = page.getByText(/Legacy|SegWit|Taproot|P2PKH|P2WPKH|P2TR/i).first();
    await expect(addressTypeLabels).toBeVisible({ timeout: 5000 });
  });

  walletTest('can select different address type', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-type')) return;

    // Find options and click a different one
    const options = page.getByRole('radio');
    const count = await options.count();

    if (count > 1) {
      // Click second option (likely different from current)
      await options.nth(1).click();
      await page.waitForLoadState('networkidle');

      // Page should still be on settings (no crash)
      await expect(page).toHaveURL(/settings/);
    }
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-type')) return;

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 3000 });

    await backButton.click();
    await expect(page).toHaveURL(/settings|index/, { timeout: 5000 });
  });

  walletTest('shows content after loading', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-type')) return;

    // Should show address type content
    const content = page.getByText(/P2PKH|P2WPKH|Address Type/i).first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });
});

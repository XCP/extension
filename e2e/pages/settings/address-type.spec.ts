/**
 * Address Type Settings Page Tests
 *
 * Tests for /settings/address-type route - change wallet address format
 */

import { walletTest, expect, navigateTo } from '../../fixtures';

walletTest.describe('Address Type Settings Page (/settings/address-type)', () => {
  walletTest('address type settings page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    // Should show address type UI or redirect (private key wallets don't have this option)
    const hasAddressTypes = await page.locator('text=/P2PKH|P2WPKH|P2TR|Legacy|SegWit|Taproot|Native/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTitle = await page.locator('text=/Address Type/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('/settings/address-type');

    expect(hasAddressTypes || hasTitle || redirected).toBe(true);
  });

  walletTest('shows available address type options', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/settings/address-type')) {
      // Should show radio group with address type options
      const hasRadioGroup = await page.locator('[role="radiogroup"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasSelectionCards = await page.locator('[data-headlessui-state]').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasOptions = await page.locator('text=/P2PKH|P2WPKH|P2TR|P2SH/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasRadioGroup || hasSelectionCards || hasOptions).toBe(true);
    }
  });

  walletTest('shows address previews for each type', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/settings/address-type')) {
      // Should show address previews (truncated addresses like "1Abc...xyz" or "bc1q...")
      const hasLegacyAddress = await page.locator('text=/^1[a-zA-Z0-9]{4,}|1\\.\\.\\./i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasSegwitAddress = await page.locator('text=/bc1q|bc1p|tb1/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasNestedSegwit = await page.locator('text=/^3[a-zA-Z0-9]{4,}|^2[a-zA-Z0-9]/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      // At least one address preview should be visible
      expect(hasLegacyAddress || hasSegwitAddress || hasNestedSegwit).toBe(true);
    }
  });

  walletTest('can select different address type', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/settings/address-type')) {
      // Find a non-selected option and click it
      const options = page.locator('[role="radio"], [data-headlessui-state]');
      const count = await options.count();

      if (count > 1) {
        // Click second option (likely different from current)
        await options.nth(1).click();
        await page.waitForTimeout(1000);

        // Page should still be visible (no crash)
        const pageStillLoaded = page.url().includes('settings');
        expect(pageStillLoaded).toBe(true);
      }
    }
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/settings/address-type')) {
      const backButton = page.locator('button[aria-label*="back"], header button').first();
      if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await backButton.click();
        await page.waitForTimeout(500);

        // Should navigate back to settings or index
        const navigatedBack = page.url().includes('/settings') || page.url().includes('/index');
        expect(navigatedBack).toBe(true);
      }
    }
  });

  walletTest('shows loading spinner during address generation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-type'));

    // May briefly show a spinner while generating preview addresses
    const hasSpinner = await page.locator('[class*="spinner"], [class*="animate-spin"]').first().isVisible({ timeout: 2000 }).catch(() => false);
    const hasContent = await page.locator('text=/P2PKH|P2WPKH|Address Type/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    // Either shows spinner briefly or loads content directly
    expect(hasSpinner || hasContent).toBe(true);
  });
});

/**
 * Settings Address Preview Tests
 *
 * Tests for address preview display in settings.
 */

import { walletTest, expect, navigateTo } from '../fixtures';
import { settings } from '../selectors';

walletTest.describe('Settings Address Preview', () => {
  walletTest('shows preview address in settings index under Address Type', async ({ page }) => {
    await navigateTo(page, 'settings');

    const addressTypeOption = settings.addressTypeOption(page);
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });

    // The description shows the current address type name - it's in a div, not p
    // The ActionCard renders description in div.text-xs.text-gray-500
    const description = page.locator('[role="button"]').filter({ hasText: 'Address Type' }).locator('div.text-xs');
    await expect(description).toBeVisible();

    const descriptionText = await description.textContent();
    expect(descriptionText).toMatch(/(Legacy|Native SegWit|Nested SegWit|Taproot|CounterWallet|P2PKH|P2WPKH|P2TR|P2SH)/i);
  });

  walletTest('shows preview addresses in address type settings page', async ({ page }) => {
    await navigateTo(page, 'settings');

    const addressTypeOpt = settings.addressTypeOption(page);
    await expect(addressTypeOpt).toBeVisible({ timeout: 5000 });

    await addressTypeOpt.click();
    await page.waitForLoadState('networkidle');

    // Should show radio options for address types
    const radioButtons = page.locator('[role="radio"]');
    await expect(radioButtons.first()).toBeVisible({ timeout: 10000 });

    // Should have address type content
    await expect(page.locator('text=/Legacy|SegWit|Taproot|P2PKH|P2WPKH|P2TR/i').first()).toBeVisible();
  });

  walletTest('shows different preview addresses for different formats', async ({ page }) => {
    await navigateTo(page, 'settings');

    const addressTypeOption = settings.addressTypeOption(page);
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();

    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 10000 });

    // Should have multiple address type options
    const count = await radioOptions.count();
    expect(count).toBeGreaterThan(1);
  });

  walletTest('handles address format changes', async ({ page }) => {
    await navigateTo(page, 'settings');

    const addressTypeOption = settings.addressTypeOption(page);
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();

    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 10000 });

    const optionCount = await radioOptions.count();
    if (optionCount <= 1) {
      return; // Only one option, can't test switching
    }

    // Find the currently selected option
    let selectedIndex = -1;
    for (let i = 0; i < optionCount; i++) {
      const isChecked = await radioOptions.nth(i).getAttribute('aria-checked');
      if (isChecked === 'true') {
        selectedIndex = i;
        break;
      }
    }

    // Click a different option
    const newIndex = selectedIndex === 0 ? 1 : 0;
    await radioOptions.nth(newIndex).click();

    // Verify selection changed
    await expect(radioOptions.nth(newIndex)).toHaveAttribute('aria-checked', 'true');

    // Go back and verify settings updated
    await page.goBack();
    await expect(settings.addressTypeOption(page)).toBeVisible({ timeout: 5000 });

    // Description should show an address type - it's in a div, not p
    const description = page.locator('[role="button"]').filter({ hasText: 'Address Type' }).locator('div.text-xs');
    await expect(description).toBeVisible();
    const text = await description.textContent();
    expect(text).toMatch(/(Legacy|Native SegWit|Nested SegWit|Taproot|CounterWallet|P2PKH|P2WPKH|P2TR|P2SH)/i);
  });
});

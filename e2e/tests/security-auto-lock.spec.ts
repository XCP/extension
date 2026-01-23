/**
 * Auto-Lock Timer Tests
 *
 * Tests for the auto-lock timer settings and functionality.
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  navigateTo,
  lockWallet,
  unlockWallet,
  TEST_PASSWORD
} from '../fixtures';
import { settings } from '../selectors';

walletTest.describe('Auto-Lock Timer', () => {
  walletTest('auto-lock timer options are available in settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    await expect(page.getByText('Auto-Lock Timer')).toBeVisible();

    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible();

    // Should have at least one timer option visible
    await expect(
      page.locator('[role="radio"]').filter({ hasText: /Minute/ }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  walletTest('can select 1 minute auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const oneMinOption = page.locator('[role="radio"]').filter({ hasText: '1 Minute' });
    await expect(oneMinOption).toBeVisible({ timeout: 5000 });
    await oneMinOption.click();

    // Verify selection - check either aria-checked or data-headlessui-state
    await expect(async () => {
      const ariaChecked = await oneMinOption.getAttribute('aria-checked');
      const headlessState = await oneMinOption.getAttribute('data-headlessui-state');
      expect(ariaChecked === 'true' || headlessState?.includes('checked')).toBe(true);
    }).toPass({ timeout: 3000 });
  });

  walletTest('can select 5 minutes auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const fiveMinOption = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
    await expect(fiveMinOption).toBeVisible({ timeout: 5000 });
    await fiveMinOption.click();

    await expect(async () => {
      const ariaChecked = await fiveMinOption.getAttribute('aria-checked');
      const headlessState = await fiveMinOption.getAttribute('data-headlessui-state');
      expect(ariaChecked === 'true' || headlessState?.includes('checked')).toBe(true);
    }).toPass({ timeout: 3000 });
  });

  walletTest('can select 15 minutes auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const fifteenMinOption = page.locator('[role="radio"]').filter({ hasText: '15 Minutes' });
    await expect(fifteenMinOption).toBeVisible({ timeout: 5000 });
    await fifteenMinOption.click();

    await expect(async () => {
      const ariaChecked = await fifteenMinOption.getAttribute('aria-checked');
      const headlessState = await fifteenMinOption.getAttribute('data-headlessui-state');
      expect(ariaChecked === 'true' || headlessState?.includes('checked')).toBe(true);
    }).toPass({ timeout: 3000 });
  });

  walletTest('auto-lock timer selection persists after navigation', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const fiveMinOption = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
    await expect(fiveMinOption).toBeVisible({ timeout: 5000 });
    await fiveMinOption.click();

    // Navigate away and back
    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/);

    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    // Verify 5 minutes is still selected
    const fiveMinOptionAfter = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
    await expect(fiveMinOptionAfter).toBeVisible();

    await expect(async () => {
      const ariaChecked = await fiveMinOptionAfter.getAttribute('aria-checked');
      const headlessState = await fiveMinOptionAfter.getAttribute('data-headlessui-state');
      expect(ariaChecked === 'true' || headlessState?.includes('checked')).toBe(true);
    }).toPass({ timeout: 3000 });
  });

  walletTest('one timer option is always selected', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible();

    // Count selected options
    const allOptions = await radioOptions.all();
    let selectedCount = 0;
    for (const option of allOptions) {
      const ariaChecked = await option.getAttribute('aria-checked');
      const headlessState = await option.getAttribute('data-headlessui-state');
      if (ariaChecked === 'true' || headlessState?.includes('checked')) {
        selectedCount++;
      }
    }

    expect(selectedCount).toBe(1);
  });
});

test.describe('Auto-Lock Timer - Persistence', () => {
  test('auto-lock timer selection persists after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    await settings.advancedOption(extensionPage).click();
    await expect(extensionPage).toHaveURL(/advanced/);

    const fifteenMinOption = extensionPage.locator('[role="radio"]').filter({ hasText: '15 Minutes' });
    await expect(fifteenMinOption).toBeVisible({ timeout: 5000 });
    await fifteenMinOption.click();

    await navigateTo(extensionPage, 'wallet');

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    await settings.advancedOption(extensionPage).click();
    await expect(extensionPage).toHaveURL(/advanced/);

    const fifteenMinOptionAfter = extensionPage.locator('[role="radio"]').filter({ hasText: '15 Minutes' });
    await expect(fifteenMinOptionAfter).toBeVisible();

    await expect(async () => {
      const ariaChecked = await fifteenMinOptionAfter.getAttribute('aria-checked');
      const headlessState = await fifteenMinOptionAfter.getAttribute('data-headlessui-state');
      expect(ariaChecked === 'true' || headlessState?.includes('checked')).toBe(true);
    }).toPass({ timeout: 3000 });
  });
});

walletTest.describe('Auto-Lock Timer - Keyboard Navigation', () => {
  walletTest('can navigate timer options with keyboard', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible();
    await radioOptions.first().focus();

    await page.keyboard.press('ArrowDown');

    // Should have a selected option after keyboard navigation
    const selectedOption = page.locator('[role="radio"][aria-checked="true"], [role="radio"][data-headlessui-state*="checked"]').first();
    await expect(selectedOption).toBeVisible();
  });
});

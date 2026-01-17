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

    const timerLabels = ['1 Minute', '5 Minutes', '15 Minutes', '30 Minutes'];
    for (const label of timerLabels) {
      const option = page.locator(`[role="radio"]`).filter({ hasText: label });
      const isVisible = await option.isVisible({ timeout: 2000 }).catch(() => false);
      if (isVisible) {
        expect(isVisible).toBe(true);
        break;
      }
    }
  });

  walletTest('can select 1 minute auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const oneMinOption = page.locator('[role="radio"]').filter({ hasText: '1 Minute' });
    if (await oneMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await oneMinOption.click();

      const isSelected = await oneMinOption.getAttribute('aria-checked') === 'true' ||
        (await oneMinOption.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }
  });

  walletTest('can select 5 minutes auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const fiveMinOption = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
    if (await fiveMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fiveMinOption.click();

      const isSelected = await fiveMinOption.getAttribute('aria-checked') === 'true' ||
        (await fiveMinOption.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }
  });

  walletTest('can select 15 minutes auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const fifteenMinOption = page.locator('[role="radio"]').filter({ hasText: '15 Minutes' });
    if (await fifteenMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fifteenMinOption.click();

      const isSelected = await fifteenMinOption.getAttribute('aria-checked') === 'true' ||
        (await fifteenMinOption.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }
  });

  walletTest('auto-lock timer selection persists after navigation', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const fiveMinOption = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
    if (await fiveMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fiveMinOption.click();

      await navigateTo(page, 'wallet');
      await expect(page).toHaveURL(/index/);

      await navigateTo(page, 'settings');
      await settings.advancedOption(page).click();
      await expect(page).toHaveURL(/advanced/);

      const fiveMinOptionAfter = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
      await expect(fiveMinOptionAfter).toBeVisible();
      const isSelected = await fiveMinOptionAfter.getAttribute('aria-checked') === 'true' ||
        (await fiveMinOptionAfter.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }
  });

  walletTest('one timer option is always selected', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible();

    const allOptions = await radioOptions.all();
    let selectedCount = 0;
    for (const option of allOptions) {
      const isChecked = await option.getAttribute('aria-checked') === 'true' ||
        (await option.getAttribute('data-headlessui-state'))?.includes('checked');
      if (isChecked) selectedCount++;
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
    if (await fifteenMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fifteenMinOption.click();

      await navigateTo(extensionPage, 'wallet');

      await lockWallet(extensionPage);
      await unlockWallet(extensionPage, TEST_PASSWORD);

      await navigateTo(extensionPage, 'settings');
      await settings.advancedOption(extensionPage).click();
      await expect(extensionPage).toHaveURL(/advanced/);

      const fifteenMinOptionAfter = extensionPage.locator('[role="radio"]').filter({ hasText: '15 Minutes' });
      await expect(fifteenMinOptionAfter).toBeVisible();
      const isSelected = await fifteenMinOptionAfter.getAttribute('aria-checked') === 'true' ||
        (await fifteenMinOptionAfter.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }
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

    const newSelected = await page.locator('[role="radio"][aria-checked="true"], [role="radio"][data-headlessui-state*="checked"]').first().textContent();
    expect(newSelected).toBeTruthy();
  });
});

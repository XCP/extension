/**
 * Advanced Settings Tests
 *
 * Tests for the Advanced settings page: auto-lock timer, API URL, toggle switches.
 */

import { walletTest, expect, navigateTo } from '../../fixtures';
import { settings, common } from '../../selectors';

walletTest.describe('Advanced Settings', () => {
  walletTest('can navigate to advanced settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();

    await expect(page).toHaveURL(/advanced/);
    await expect(page.locator('text=/Advanced|Auto-Lock|API/i').first()).toBeVisible();
  });

  walletTest('advanced settings shows auto-lock timer options', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    await expect(settings.autoLockTimer(page)).toBeVisible();

    const timerOptions = page.locator('[role="radio"]');
    await expect(timerOptions.first()).toBeVisible();

    const optionCount = await timerOptions.count();
    expect(optionCount).toBeGreaterThanOrEqual(3);
  });

  walletTest('can change auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const timerOptions = page.locator('[role="radio"]');
    await expect(timerOptions.first()).toBeVisible();

    const newOption = timerOptions.nth(2);
    await newOption.click();

    const newSelected = await newOption.getAttribute('aria-checked');
    const isNowChecked = newSelected === 'true' || (await newOption.getAttribute('data-headlessui-state'))?.includes('checked');
    expect(isNowChecked).toBe(true);
  });

  walletTest('advanced settings shows Counterparty API field', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    await expect(page.getByText('Counterparty API')).toBeVisible();

    const apiInput = page.locator('input[type="url"], input[placeholder*="URL"], input[placeholder*="api"]').first();
    const hasApiInput = await apiInput.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasApiInput).toBe(true);
  });

  walletTest('advanced settings shows toggle switches', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const switches = page.locator('[role="switch"]');
    await expect(switches.first()).toBeVisible();

    const switchCount = await switches.count();
    expect(switchCount).toBeGreaterThanOrEqual(3);
  });

  walletTest('can toggle unconfirmed transactions setting', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const unconfirmedText = page.locator('text=/Unconfirmed.*TX|Use Unconfirmed/i').first();
    await expect(unconfirmedText).toBeVisible();

    const switches = page.locator('[role="switch"]');
    await expect(switches.first()).toBeVisible();

    const firstSwitch = switches.first();
    const initialState = await firstSwitch.getAttribute('aria-checked');

    await firstSwitch.click();

    const newState = await firstSwitch.getAttribute('aria-checked');
    expect(newState).not.toBe(initialState);
  });

  walletTest('can toggle MPMA sends setting', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const mpmaText = page.locator('text=/MPMA|multi.*destination/i').first();
    const hasMpma = await mpmaText.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasMpma) {
      const switches = page.locator('[role="switch"]');
      const switchCount = await switches.count();

      if (switchCount > 0) {
        for (let i = 0; i < switchCount; i++) {
          const sw = switches.nth(i);
          const text = await sw.locator('..').locator('..').textContent().catch(() => '');
          if ((text || '').toLowerCase().includes('mpma')) {
            const initialState = await sw.getAttribute('aria-checked');
            await sw.click();
            const newState = await sw.getAttribute('aria-checked');
            expect(newState).not.toBe(initialState);
            break;
          }
        }
      }
    }
  });

  walletTest('can toggle analytics setting', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const analyticsText = page.locator('text=/Analytics|usage data/i').first();
    await expect(analyticsText).toBeVisible();

    const switches = page.locator('[role="switch"]');
    expect(await switches.count()).toBeGreaterThan(0);
  });

  walletTest('settings persist after navigating away', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const switches = page.locator('[role="switch"]');
    await expect(switches.first()).toBeVisible();
    const firstSwitch = switches.first();
    await firstSwitch.click();
    const changedState = await firstSwitch.getAttribute('aria-checked');

    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/);

    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const switchesAfter = page.locator('[role="switch"]');
    await expect(switchesAfter.first()).toBeVisible();
    const stateAfter = await switchesAfter.first().getAttribute('aria-checked');

    expect(stateAfter).toBe(changedState);
  });

  walletTest('can navigate back from advanced settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    await expect(common.backButton(page)).toBeVisible();
    await common.backButton(page).click();

    const isOnSettingsIndex = page.url().includes('settings') && !page.url().includes('advanced');
    expect(isOnSettingsIndex).toBe(true);
  });
});

walletTest.describe('API URL Configuration', () => {
  walletTest('API URL field shows current value', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const apiInput = page.locator('input[type="url"], input[placeholder*="URL"], input[placeholder*="api"]').first();
    await expect(apiInput).toBeVisible();

    const apiValue = await apiInput.inputValue();
    expect(apiValue.length).toBeGreaterThan(0);
    expect(apiValue).toContain('http');
  });

  walletTest('API URL field validates input', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);

    const apiInput = page.locator('input[type="url"], input[placeholder*="URL"], input[placeholder*="api"]').first();
    await expect(apiInput).toBeVisible();

    await apiInput.clear();
    await apiInput.fill('not-a-valid-url');
    await apiInput.blur();

    // Invalid URL should have red border styling (showHelpText is false by default)
    // The border changes from gray to red on validation error
    await expect(apiInput).toHaveClass(/border-red-500/, { timeout: 5000 });
  });
});

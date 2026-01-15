/**
 * Headless UI Component Tests
 *
 * Tests for proper HeadlessUI component behavior in settings.
 */

import { walletTest, expect, navigateTo, getCurrentAddress } from '../fixtures';
import { settings, selectAddress } from '../selectors';

walletTest.describe('Settings with Headless UI Components', () => {
  walletTest('change address type using Headless UI RadioGroup', async ({ page }) => {
    const originalAddress = await getCurrentAddress(page);
    expect(originalAddress).toBeTruthy();

    await navigateTo(page, 'settings');

    if (await settings.addressTypeOption(page).isVisible()) {
      await settings.addressTypeOption(page).click();

      const radioOptions = await page.locator('[role="radio"]').all();

      if (radioOptions.length > 1) {
        let selectedIndex = -1;
        for (let i = 0; i < radioOptions.length; i++) {
          const checkedAttr = await radioOptions[i].getAttribute('aria-checked');
          const isChecked = checkedAttr === 'true';
          if (isChecked) {
            selectedIndex = i;
            break;
          }
        }

        const nextIndex = selectedIndex === 0 ? 1 : 0;
        await radioOptions[nextIndex].click();

        const newChecked = await radioOptions[nextIndex].getAttribute('aria-checked');
        expect(newChecked).toBe('true');

        await navigateTo(page, 'wallet');

        const newAddress = await getCurrentAddress(page);
        expect(newAddress).toBeTruthy();
      }
    }
  });

  walletTest('auto-lock timer settings with Headless UI', async ({ page }) => {
    await navigateTo(page, 'settings');

    if (await settings.securityOption(page).isVisible()) {
      await settings.securityOption(page).click();
    } else if (await settings.advancedOption(page).isVisible()) {
      await settings.advancedOption(page).click();
    }

    const autoLockLabel = page.locator('text=/Auto.*Lock.*Timer/i').first();
    if (await autoLockLabel.isVisible({ timeout: 5000 }).catch(() => false)) {
      const timeoutOptions = await page.locator('[role="radio"]').all();
      if (timeoutOptions.length > 0) {
        const firstOption = timeoutOptions[0];
        await firstOption.click();

        const isSelected = await firstOption.getAttribute('aria-checked');
        expect(isSelected).toBe('true');
      }
    }
  });

  walletTest('currency selection using Headless UI components', async ({ page }) => {
    await navigateTo(page, 'settings');

    const generalOption = page.getByText('General');
    if (await generalOption.isVisible()) {
      await generalOption.click();
    }

    const currencyOption = page.locator('text=/Currency|Fiat/i');
    if (await currencyOption.isVisible()) {
      await currencyOption.click();

      const currencyRadios = await page.locator('[role="radio"]').all();
      if (currencyRadios.length > 1) {
        await currencyRadios[1].click();

        const isSelected = await currencyRadios[1].getAttribute('aria-checked');
        expect(isSelected).toBe('true');
      }
    }
  });

  walletTest('headless UI dropdown menus in settings', async ({ page }) => {
    await navigateTo(page, 'settings');

    const dropdownButtons = await page.locator('[role="button"][aria-haspopup="listbox"]').all();

    if (dropdownButtons.length > 0) {
      const firstDropdown = dropdownButtons[0];
      await firstDropdown.click();

      const options = await page.locator('[role="option"]').all();
      if (options.length > 1) {
        await options[1].click();

        const isVisible = await page.locator('[role="listbox"]').isVisible();
        expect(isVisible).toBe(false);
      }
    }
  });

  walletTest('headless UI switch components for toggles', async ({ page }) => {
    await navigateTo(page, 'settings');

    const switches = await page.locator('[role="switch"]').all();

    if (switches.length > 0) {
      const firstSwitch = switches[0];
      const initialState = await firstSwitch.getAttribute('aria-checked');

      await firstSwitch.click();

      const newState = await firstSwitch.getAttribute('aria-checked');
      expect(newState).not.toBe(initialState);
    }
  });

  walletTest('headless UI modal dialogs in settings', async ({ page }) => {
    await navigateTo(page, 'settings');

    const actionButtons = [
      'Reset Wallet',
      'Clear Data',
      'Export',
      'Backup',
      'Delete'
    ];

    for (const buttonText of actionButtons) {
      const button = page.locator(`button:has-text("${buttonText}")`).first();
      if (await button.isVisible()) {
        await button.click();

        const modal = page.locator('[role="dialog"], .modal');
        if (await modal.isVisible()) {
          let cancelButton;
          const cancelBtn = modal.locator('button:has-text("Cancel")').first();
          const closeBtn = modal.locator('button:has-text("Close")').first();
          const ariaCloseBtn = modal.locator('[aria-label*="Close"]').first();

          if (await cancelBtn.isVisible()) {
            cancelButton = cancelBtn;
          } else if (await closeBtn.isVisible()) {
            cancelButton = closeBtn;
          } else if (await ariaCloseBtn.isVisible()) {
            cancelButton = ariaCloseBtn;
          }
          if (cancelButton && await cancelButton.isVisible()) {
            await cancelButton.click();

            const stillVisible = await modal.isVisible();
            expect(stillVisible).toBe(false);
          }
          break;
        }
      }
    }
  });

  walletTest('keyboard navigation in headless UI components', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await page.waitForURL(/advanced/);

    await page.waitForLoadState('networkidle');

    const switchElement = page.locator('[role="switch"]').first();
    await expect(switchElement).toBeVisible();

    const initialState = await switchElement.getAttribute('aria-checked');

    await switchElement.focus();
    await page.keyboard.press('Space');

    const newState = await switchElement.getAttribute('aria-checked');
    expect(newState).not.toBe(initialState);
  });

  walletTest('headless UI accessibility attributes', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(settings.advancedOption(page)).toBeVisible();
    await settings.advancedOption(page).click();
    await page.waitForURL(/advanced/);

    await page.waitForLoadState('networkidle');
    const switchLocator = page.locator('[role="switch"]');
    await expect(switchLocator.first()).toBeVisible({ timeout: 10000 });

    const switches = await switchLocator.all();
    expect(switches.length).toBeGreaterThan(0);

    for (const switchEl of switches) {
      const hasAriaChecked = await switchEl.getAttribute('aria-checked');
      expect(hasAriaChecked).not.toBeNull();
      expect(['true', 'false']).toContain(hasAriaChecked);
    }

    const visibleButtons = page.locator('button:visible');
    const buttonCount = await visibleButtons.count();
    expect(buttonCount).toBeGreaterThan(0);

    const buttonsToCheck = Math.min(buttonCount, 5);
    for (let i = 0; i < buttonsToCheck; i++) {
      const button = visibleButtons.nth(i);
      const hasLabel = await button.getAttribute('aria-label') ||
                       await button.textContent() ||
                       await button.getAttribute('aria-labelledby');
      expect(hasLabel).toBeTruthy();
    }
  });
});

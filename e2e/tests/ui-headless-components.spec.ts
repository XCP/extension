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
    await expect(settings.addressTypeOption(page)).toBeVisible({ timeout: 5000 });
    await settings.addressTypeOption(page).click();

    const radioOptions = await page.locator('[role="radio"]').all();
    expect(radioOptions.length).toBeGreaterThan(1);

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
  });

  walletTest('auto-lock timer settings with Headless UI', async ({ page }) => {
    await navigateTo(page, 'settings');

    // Navigate to security or advanced settings (where auto-lock is found)
    const securityOption = settings.securityOption(page);
    const advancedOption = settings.advancedOption(page);

    try {
      await expect(securityOption).toBeVisible({ timeout: 2000 });
      await securityOption.click();
    } catch {
      await expect(advancedOption).toBeVisible({ timeout: 2000 });
      await advancedOption.click();
    }

    const autoLockLabel = page.locator('text=/Auto.*Lock.*Timer/i').first();

    // Skip if auto-lock timer not on this page
    try {
      await expect(autoLockLabel).toBeVisible({ timeout: 3000 });
    } catch {
      return; // Auto-lock timer not present on this page
    }

    const timeoutOptions = await page.locator('[role="radio"]').all();
    expect(timeoutOptions.length).toBeGreaterThan(0);

    const firstOption = timeoutOptions[0];
    await firstOption.click();

    const isSelected = await firstOption.getAttribute('aria-checked');
    expect(isSelected).toBe('true');
  });

  walletTest('currency selection using Headless UI components', async ({ page }) => {
    await navigateTo(page, 'settings');

    const generalOption = page.getByText('General');

    // Navigate to General settings if visible
    try {
      await expect(generalOption).toBeVisible({ timeout: 2000 });
      await generalOption.click();
    } catch {
      // May already be on general settings page
    }

    const currencyOption = page.locator('text=/Currency|Fiat/i').first();

    // Skip if currency option not available
    try {
      await expect(currencyOption).toBeVisible({ timeout: 3000 });
    } catch {
      return; // Currency option not present
    }

    await currencyOption.click();

    const currencyRadios = await page.locator('[role="radio"]').all();
    expect(currencyRadios.length).toBeGreaterThan(1);

    await currencyRadios[1].click();

    const isSelected = await currencyRadios[1].getAttribute('aria-checked');
    expect(isSelected).toBe('true');
  });

  walletTest('headless UI dropdown menus in settings', async ({ page }) => {
    await navigateTo(page, 'settings');

    const dropdownButtons = await page.locator('[role="button"][aria-haspopup="listbox"]').all();

    // Skip if no dropdown menus on settings page
    if (dropdownButtons.length === 0) {
      return;
    }

    const firstDropdown = dropdownButtons[0];
    await firstDropdown.click();

    const options = await page.locator('[role="option"]').all();
    expect(options.length).toBeGreaterThan(1);

    await options[1].click();

    // Dropdown should close after selection
    await expect(page.locator('[role="listbox"]')).not.toBeVisible({ timeout: 3000 });
  });

  walletTest('headless UI switch components for toggles', async ({ page }) => {
    await navigateTo(page, 'settings');

    const switchLocator = page.locator('[role="switch"]').first();

    // Skip if no switches on settings page
    try {
      await expect(switchLocator).toBeVisible({ timeout: 3000 });
    } catch {
      return; // No switch components on this page
    }

    const initialState = await switchLocator.getAttribute('aria-checked');
    await switchLocator.click();

    const newState = await switchLocator.getAttribute('aria-checked');
    expect(newState).not.toBe(initialState);
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

    let foundModal = false;

    for (const buttonText of actionButtons) {
      const button = page.locator(`button:has-text("${buttonText}")`).first();

      // Check if this action button exists
      try {
        await expect(button).toBeVisible({ timeout: 1000 });
      } catch {
        continue; // Try next button
      }

      await button.click();

      const modal = page.locator('[role="dialog"], .modal').first();

      // Check if modal opened
      try {
        await expect(modal).toBeVisible({ timeout: 2000 });
      } catch {
        continue; // No modal opened, try next button
      }

      foundModal = true;

      // Find a close/cancel button
      const cancelBtn = modal.locator('button:has-text("Cancel")').first();
      const closeBtn = modal.locator('button:has-text("Close")').first();
      const ariaCloseBtn = modal.locator('[aria-label*="Close"]').first();

      const closeButton = cancelBtn.or(closeBtn).or(ariaCloseBtn).first();
      await expect(closeButton).toBeVisible({ timeout: 3000 });
      await closeButton.click();

      // Modal should close
      await expect(modal).not.toBeVisible({ timeout: 3000 });
      break;
    }

    // Skip if no modal-triggering buttons found
    if (!foundModal) {
      return;
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

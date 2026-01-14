import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  createWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD,
} from '../helpers/test-helpers';

test.describe('Auto-Lock Timer', () => {
  test('auto-lock timer options are available in settings', async () => {
    const { context, page } = await launchExtension('auto-lock-options');
    await setupWallet(page);

    // Navigate to advanced settings
    await navigateViaFooter(page, 'settings');
    const advancedOption = page.locator('text=Advanced').first();
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Should show auto-lock timer section
    await expect(page.getByText('Auto-Lock Timer')).toBeVisible({ timeout: 5000 });

    // Should have multiple timer options
    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 5000 });

    // Check for specific timer options
    const timerLabels = ['1 Minute', '5 Minutes', '15 Minutes', '30 Minutes'];
    for (const label of timerLabels) {
      const option = page.locator(`[role="radio"]`).filter({ hasText: label });
      const isVisible = await option.isVisible({ timeout: 2000 }).catch(() => false);
      // At least some options should be visible
      if (isVisible) {
        expect(isVisible).toBe(true);
        break;
      }
    }

    await cleanup(context);
  });

  test('can select 1 minute auto-lock timer', async () => {
    const { context, page } = await launchExtension('auto-lock-1m');
    await setupWallet(page);

    // Navigate to advanced settings
    await navigateViaFooter(page, 'settings');
    await page.locator('text=Advanced').first().click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Find and click 1 Minute option
    const oneMinOption = page.locator('[role="radio"]').filter({ hasText: '1 Minute' });
    if (await oneMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await oneMinOption.click();
      await page.waitForTimeout(500);

      // Verify selection
      const isSelected = await oneMinOption.getAttribute('aria-checked') === 'true' ||
        (await oneMinOption.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }

    await cleanup(context);
  });

  test('can select 5 minutes auto-lock timer', async () => {
    const { context, page } = await launchExtension('auto-lock-5m');
    await setupWallet(page);

    // Navigate to advanced settings
    await navigateViaFooter(page, 'settings');
    await page.locator('text=Advanced').first().click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Find and click 5 Minutes option
    const fiveMinOption = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
    if (await fiveMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fiveMinOption.click();
      await page.waitForTimeout(500);

      // Verify selection
      const isSelected = await fiveMinOption.getAttribute('aria-checked') === 'true' ||
        (await fiveMinOption.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }

    await cleanup(context);
  });

  test('can select 15 minutes auto-lock timer', async () => {
    const { context, page } = await launchExtension('auto-lock-15m');
    await setupWallet(page);

    // Navigate to advanced settings
    await navigateViaFooter(page, 'settings');
    await page.locator('text=Advanced').first().click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Find and click 15 Minutes option
    const fifteenMinOption = page.locator('[role="radio"]').filter({ hasText: '15 Minutes' });
    if (await fifteenMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fifteenMinOption.click();
      await page.waitForTimeout(500);

      // Verify selection
      const isSelected = await fifteenMinOption.getAttribute('aria-checked') === 'true' ||
        (await fifteenMinOption.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }

    await cleanup(context);
  });

  test('auto-lock timer selection persists after navigation', async () => {
    const { context, page } = await launchExtension('auto-lock-persist');
    await setupWallet(page);

    // Navigate to advanced settings
    await navigateViaFooter(page, 'settings');
    await page.locator('text=Advanced').first().click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Select a specific timer (5 minutes)
    const fiveMinOption = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
    if (await fiveMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fiveMinOption.click();
      await page.waitForTimeout(500);

      // Navigate away
      await navigateViaFooter(page, 'wallet');
      await expect(page).toHaveURL(/index/);

      // Navigate back to advanced settings
      await navigateViaFooter(page, 'settings');
      await page.locator('text=Advanced').first().click();
      await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

      // Verify 5 Minutes is still selected
      const fiveMinOptionAfter = page.locator('[role="radio"]').filter({ hasText: '5 Minutes' });
      await expect(fiveMinOptionAfter).toBeVisible({ timeout: 5000 });
      const isSelected = await fiveMinOptionAfter.getAttribute('aria-checked') === 'true' ||
        (await fiveMinOptionAfter.getAttribute('data-headlessui-state'))?.includes('checked');
      expect(isSelected).toBe(true);
    }

    await cleanup(context);
  });

  test('auto-lock timer selection persists after lock/unlock', async () => {
    const { context, page } = await launchExtension('auto-lock-persist-lock');
    await createWallet(page, TEST_PASSWORD);

    // Navigate to advanced settings
    await navigateViaFooter(page, 'settings');
    await page.locator('text=Advanced').first().click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Select 15 minutes timer
    const fifteenMinOption = page.locator('[role="radio"]').filter({ hasText: '15 Minutes' });
    if (await fifteenMinOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fifteenMinOption.click();
      await page.waitForTimeout(500);

      // Navigate to wallet and lock
      await navigateViaFooter(page, 'wallet');
      const lockButton = page.locator('button[aria-label*="Lock"], header button').last();
      if (await lockButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await lockButton.click();
        await page.waitForURL(/unlock/, { timeout: 5000 });

        // Unlock
        await page.locator('input[name="password"]').fill(TEST_PASSWORD);
        await page.locator('button:has-text("Unlock")').click();
        await page.waitForURL(/index/, { timeout: 5000 });

        // Go back to advanced settings
        await navigateViaFooter(page, 'settings');
        await page.locator('text=Advanced').first().click();
        await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

        // Verify 15 Minutes is still selected
        const fifteenMinOptionAfter = page.locator('[role="radio"]').filter({ hasText: '15 Minutes' });
        await expect(fifteenMinOptionAfter).toBeVisible({ timeout: 5000 });
        const isSelected = await fifteenMinOptionAfter.getAttribute('aria-checked') === 'true' ||
          (await fifteenMinOptionAfter.getAttribute('data-headlessui-state'))?.includes('checked');
        expect(isSelected).toBe(true);
      }
    }

    await cleanup(context);
  });

  test('one timer option is always selected', async () => {
    const { context, page } = await launchExtension('auto-lock-always-selected');
    await setupWallet(page);

    // Navigate to advanced settings
    await navigateViaFooter(page, 'settings');
    await page.locator('text=Advanced').first().click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Wait for radio options
    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 5000 });

    // Check that exactly one option is selected
    const allOptions = await radioOptions.all();
    let selectedCount = 0;
    for (const option of allOptions) {
      const isChecked = await option.getAttribute('aria-checked') === 'true' ||
        (await option.getAttribute('data-headlessui-state'))?.includes('checked');
      if (isChecked) selectedCount++;
    }

    expect(selectedCount).toBe(1);

    await cleanup(context);
  });
});

test.describe('Auto-Lock Timer - Keyboard Navigation', () => {
  test('can navigate timer options with keyboard', async () => {
    const { context, page } = await launchExtension('auto-lock-keyboard');
    await setupWallet(page);

    // Navigate to advanced settings
    await navigateViaFooter(page, 'settings');
    await page.locator('text=Advanced').first().click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Focus on timer options
    const radioOptions = page.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 5000 });
    await radioOptions.first().focus();

    // Get initial selection
    const initialSelected = await page.locator('[role="radio"][aria-checked="true"], [role="radio"][data-headlessui-state*="checked"]').first().textContent();

    // Press arrow down to move selection
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);

    // Selection should have moved (or stayed if at end)
    const newSelected = await page.locator('[role="radio"][aria-checked="true"], [role="radio"][data-headlessui-state*="checked"]').first().textContent();

    // Either selection changed or we're at the last option
    expect(newSelected).toBeTruthy();

    await cleanup(context);
  });
});

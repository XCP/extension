/**
 * Address Preview Cache Tests
 *
 * Tests verifying address preview display and cache behavior.
 */

import { walletTest, expect, navigateTo, lockWallet, unlockWallet, TEST_PASSWORD } from '../fixtures';
import { settings, unlock } from '../selectors';

walletTest.describe('Address Preview Display', () => {
  walletTest('displays address previews for each format when wallet unlocked', async ({ page }) => {
    await navigateTo(page, 'settings');

    const addressTypeOption = settings.addressTypeOption(page);
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });

    await addressTypeOption.click();
    await page.waitForLoadState('networkidle');

    // Wait for radio buttons to appear
    const radioButtons = page.locator('[role="radio"]');
    await expect(radioButtons.first()).toBeVisible({ timeout: 10000 });

    // Verify we have multiple address type options
    await expect(radioButtons).toHaveCount(4, { timeout: 5000 });

    // Check that each card has a title
    const cards = await radioButtons.all();
    for (const card of cards) {
      const title = card.locator('span').first();
      await expect(title).toBeVisible();
    }
  });

  walletTest('shows address type description on settings index', async ({ page }) => {
    await navigateTo(page, 'settings');

    const addressTypeOption = settings.addressTypeOption(page);
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });

    // The description shows the current address type
    const description = addressTypeOption.locator('..').locator('p');
    await expect(description).toHaveText('Taproot (P2TR)');
  });

  walletTest('address previews regenerate correctly after lock/unlock cycle', async ({ page }) => {
    await navigateTo(page, 'settings');

    const addressTypeOption = settings.addressTypeOption(page);
    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });

    await addressTypeOption.click();
    await page.waitForURL(/address-type/, { timeout: 10000 });

    // Wait for radio buttons to appear
    const radioButtons = page.locator('[role="radio"]');
    await expect(radioButtons.first()).toBeVisible({ timeout: 10000 });

    await page.waitForLoadState('networkidle');

    // Count initial options
    const initialCount = await radioButtons.count();
    expect(initialCount).toBeGreaterThan(0);

    // Lock and unlock
    await navigateTo(page, 'wallet');
    await lockWallet(page);

    await page.waitForURL(/unlock/, { timeout: 10000 });
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });

    await unlockWallet(page, TEST_PASSWORD);

    // Navigate back to address type settings
    await navigateTo(page, 'settings');
    const addressTypeAfterUnlock = settings.addressTypeOption(page);
    await expect(addressTypeAfterUnlock).toBeVisible({ timeout: 5000 });

    await addressTypeAfterUnlock.click();
    await page.waitForURL(/address-type/, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Verify same number of options after unlock
    await expect(radioButtons).toHaveCount(initialCount, { timeout: 10000 });
  });
});

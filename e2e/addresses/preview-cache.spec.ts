/**
 * Address Preview Cache Tests
 *
 * Tests verifying address preview display and cache behavior.
 */

import {
  walletTest,
  expect,
  navigateTo,
  lockWallet,
  unlockWallet,
  TEST_PASSWORD
} from '../fixtures';

walletTest.describe('Address Preview Display', () => {
  walletTest('displays address previews for each format when wallet unlocked', async ({ page }) => {
    await navigateTo(page, 'settings');

    await page.click('text=Address Type');

    const cards = await page.locator('[role="radio"]').all();

    const descriptions = [];
    for (const card of cards) {
      const titleText = await card.locator('.text-sm.font-medium').textContent();
      const descText = await card.locator('.text-xs').textContent();
      descriptions.push({ title: titleText, description: descText });
    }

    const legacyCard = descriptions.find(d => d.title?.includes('Legacy'));
    const nativeCard = descriptions.find(d => d.title?.includes('Native SegWit'));
    const nestedCard = descriptions.find(d => d.title?.includes('Nested SegWit'));
    const taprootCard = descriptions.find(d => d.title?.includes('Taproot'));

    expect(legacyCard?.description).toBeTruthy();
    expect(legacyCard?.description).toContain('1');

    expect(nativeCard?.description).toBeTruthy();
    expect(nativeCard?.description).toContain('bc1q');

    expect(nestedCard?.description).toBeTruthy();
    expect(nestedCard?.description).toContain('3');

    expect(taprootCard?.description).toBeTruthy();
    expect(taprootCard?.description).toContain('bc1p');
  });

  walletTest('shows address type description on settings index', async ({ page }) => {
    await navigateTo(page, 'settings');

    const addressTypeCard = page.locator('text=Address Type').locator('..');
    const description = await addressTypeCard.locator('.text-xs').textContent();

    expect(description).toBeTruthy();
    expect(description).toBe('Taproot (P2TR)');
  });

  walletTest('address previews regenerate correctly after lock/unlock cycle', async ({ page }) => {
    await navigateTo(page, 'settings');
    const addressTypeOption = page.getByText('Address Type');
    await expect(addressTypeOption).toBeVisible();
    await addressTypeOption.click();
    await page.waitForURL(/address-type/);

    await expect(page.locator('[role="radio"]').first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[role="radio"] .text-xs').first()).toBeVisible({ timeout: 10000 });

    const cards = await page.locator('[role="radio"]').all();
    const initialAddresses = [];
    for (const card of cards) {
      const titleText = await card.locator('.text-sm.font-medium').textContent();
      const descElement = card.locator('.text-xs');
      const descText = await descElement.count() > 0 ? await descElement.textContent() : '';
      initialAddresses.push({ title: titleText, description: descText });
    }

    await navigateTo(page, 'wallet');
    await lockWallet(page);

    await expect(page).toHaveURL(/unlock/);
    await expect(page.locator('input[name="password"]')).toBeVisible();

    await unlockWallet(page, TEST_PASSWORD);

    await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 10000 });

    await navigateTo(page, 'settings');
    await expect(page.getByText('Address Type')).toBeVisible();
    await page.getByText('Address Type').click();
    await page.waitForURL(/address-type/);

    await expect(page.locator('[role="radio"]').first()).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');

    const addressPreviewSelector = page.locator('[role="radio"] .text-xs').filter({ hasText: /^(bc1|1|3)/ }).first();
    await addressPreviewSelector.isVisible({ timeout: 15000 }).catch(() => false);

    const cardsAfter = await page.locator('[role="radio"]').all();
    const addressesAfterUnlock = [];

    for (const card of cardsAfter) {
      const titleText = await card.locator('.text-sm.font-medium').textContent();
      const descElement = card.locator('.text-xs');
      const descText = await descElement.count() > 0 ? await descElement.textContent() : '';
      addressesAfterUnlock.push({ title: titleText, description: descText });
    }

    expect(initialAddresses.length).toBeGreaterThan(0);
    expect(addressesAfterUnlock.length).toBe(initialAddresses.length);

    for (const initial of initialAddresses) {
      const after = addressesAfterUnlock.find(a => a.title === initial.title);
      expect(after).toBeDefined();
      expect(after?.description).toBe(initial.description);
    }
  });
});

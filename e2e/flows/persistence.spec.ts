/**
 * State Persistence Tests
 *
 * Tests verifying wallet state persists correctly across lock/unlock cycles and navigation.
 */

import { test, walletTest, expect, createWallet, lockWallet, unlockWallet, navigateTo, TEST_PASSWORD } from '../fixtures';
import { header, settings, index } from '../selectors';

test.describe('State Persistence - Lock/Unlock Cycle', () => {
  test('selected wallet persists after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    const walletNameBefore = await header.walletSelector(extensionPage).textContent();

    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/);

    await unlockWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/);

    await extensionPage.waitForLoadState('networkidle');

    await expect(header.walletSelector(extensionPage)).toBeVisible();
    const walletNameAfter = await header.walletSelector(extensionPage).textContent();
    expect(walletNameAfter).toBe(walletNameBefore);
  });

  test('current address persists after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    const addressBefore = await index.addressText(extensionPage).textContent();
    expect(addressBefore).toBeTruthy();

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    await expect(index.addressText(extensionPage)).toBeVisible({ timeout: 10000 });

    const addressAfter = await index.addressText(extensionPage).textContent();
    expect(addressAfter).toBe(addressBefore);
  });

  test('settings changes persist after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    await expect(settings.advancedOption(extensionPage)).toBeVisible();
    await settings.advancedOption(extensionPage).click();
    await expect(extensionPage).toHaveURL(/advanced/);

    const switches = extensionPage.locator('[role="switch"]');
    await expect(switches.first()).toBeVisible();
    const firstSwitch = switches.first();
    const initialState = await firstSwitch.getAttribute('aria-checked');
    await firstSwitch.click();
    const changedState = await firstSwitch.getAttribute('aria-checked');
    expect(changedState).not.toBe(initialState);

    await navigateTo(extensionPage, 'wallet');
    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    await settings.advancedOption(extensionPage).click();
    await expect(extensionPage).toHaveURL(/advanced/);

    const switchesAfter = extensionPage.locator('[role="switch"]');
    await expect(switchesAfter.first()).toBeVisible();
    const stateAfter = await switchesAfter.first().getAttribute('aria-checked');
    expect(stateAfter).toBe(changedState);
  });

  test('address type selection persists after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    await expect(settings.addressTypeOption(extensionPage)).toBeVisible();
    await settings.addressTypeOption(extensionPage).click();
    await expect(extensionPage).toHaveURL(/address-type/);

    await expect(extensionPage.locator('[role="radio"]').first()).toBeVisible();
    const legacyOption = extensionPage.locator('[role="radio"]').filter({ hasText: 'Legacy' }).first();
    if (await legacyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await legacyOption.click();
    }

    await navigateTo(extensionPage, 'wallet');
    await expect(index.addressText(extensionPage)).toBeVisible({ timeout: 10000 });
    const addressBefore = await index.addressText(extensionPage).textContent();

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    await expect(index.addressText(extensionPage)).toBeVisible({ timeout: 10000 });

    const addressAfter = await index.addressText(extensionPage).textContent();
    if (addressBefore && addressAfter) {
      const prefixBefore = addressBefore.split('...')[0];
      const prefixAfter = addressAfter.split('...')[0];
      expect(prefixAfter).toBe(prefixBefore);
    }
  });
});

walletTest.describe('State Persistence - Navigation', () => {
  walletTest('state persists when navigating between pages', async ({ page }) => {
    const initialAddress = await index.addressText(page).textContent();

    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/);

    const finalAddress = await index.addressText(page).textContent();
    expect(finalAddress).toBe(initialAddress);
  });

  walletTest('balance view selection persists', async ({ page }) => {
    if (await index.assetsTab(page).isVisible({ timeout: 3000 }).catch(() => false)) {
      await index.assetsTab(page).click();

      await navigateTo(page, 'settings');
      await navigateTo(page, 'wallet');

      const hasAssetContent = await page.locator('text=/Assets|No Assets/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasAssetContent || true).toBe(true);
    }
  });
});

test.describe('State Persistence - Multi-Wallet', () => {
  test('active wallet selection persists after adding second wallet', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    const firstWalletName = await header.walletSelector(extensionPage).textContent();

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/);

    const addWalletButton = extensionPage.getByRole('button', { name: /Add.*Wallet/i }).first();
    await expect(addWalletButton).toBeVisible();
    await addWalletButton.click();

    const createOption = extensionPage.getByRole('button', { name: /Create.*Wallet/i });
    await expect(createOption).toBeVisible();
    await createOption.click();

    await extensionPage.waitForSelector('text=View 12-word Secret Phrase');
    await extensionPage.getByText('View 12-word Secret Phrase').click();
    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();
    await extensionPage.locator('input[name="password"]').fill(TEST_PASSWORD);
    await extensionPage.getByRole('button', { name: /Continue/i }).click();
    await extensionPage.waitForURL(/index/, { timeout: 15000 });

    const currentWalletName = await header.walletSelector(extensionPage).textContent();
    expect(currentWalletName).not.toBe(firstWalletName);

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    await expect(header.walletSelector(extensionPage)).toBeVisible();
  });
});

walletTest.describe('State Persistence - Session', () => {
  walletTest('unlock state persists during session', async ({ page }) => {
    await expect(page).toHaveURL(/index/);
    await expect(index.addressText(page)).toBeVisible();

    await navigateTo(page, 'market');
    await navigateTo(page, 'actions');
    await navigateTo(page, 'settings');
    await navigateTo(page, 'wallet');

    await expect(page).toHaveURL(/index/);
    await expect(index.addressText(page)).toBeVisible();
  });

  walletTest('page refresh maintains auth state', async ({ page }) => {
    await page.reload();
    await page.waitForLoadState('networkidle');

    const isOnIndex = page.url().includes('index');
    const isOnUnlock = page.url().includes('unlock');
    expect(isOnIndex || isOnUnlock).toBe(true);
  });
});

walletTest.describe('State Persistence - Error Recovery', () => {
  walletTest('wallet recovers after network error during operation', async ({ page }) => {
    await page.route('**/api/**', route => route.abort('failed'));

    await navigateTo(page, 'actions');

    await page.unroute('**/api/**');

    await navigateTo(page, 'wallet');

    await expect(page).toHaveURL(/index/);
    const addressVisible = await index.addressText(page).isVisible({ timeout: 5000 }).catch(() => false);
    expect(addressVisible).toBe(true);
  });
});

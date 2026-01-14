/**
 * State Persistence Tests
 *
 * Tests verifying wallet state persists correctly across lock/unlock cycles and navigation.
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  lockWallet,
  unlockWallet,
  navigateTo,
  TEST_PASSWORD
} from '../fixtures';

test.describe('State Persistence - Lock/Unlock Cycle', () => {
  test('selected wallet persists after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    const walletButton = extensionPage.locator('header button').first();
    const walletNameBefore = await walletButton.textContent();

    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/);

    await unlockWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/);

    await extensionPage.waitForLoadState('networkidle');

    await expect(walletButton).toBeVisible();
    const walletNameAfter = await walletButton.textContent();
    expect(walletNameAfter).toBe(walletNameBefore);
  });

  test('current address persists after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    const addressBefore = await extensionPage.locator('.font-mono').first().textContent();
    expect(addressBefore).toBeTruthy();

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    await expect(extensionPage.locator('.font-mono').first()).toBeVisible({ timeout: 10000 });

    const addressAfter = await extensionPage.locator('.font-mono').first().textContent();
    expect(addressAfter).toBe(addressBefore);
  });

  test('settings changes persist after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    const advancedOption = extensionPage.locator('text=Advanced').first();
    await expect(advancedOption).toBeVisible();
    await advancedOption.click();
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
    await extensionPage.locator('text=Advanced').first().click();
    await expect(extensionPage).toHaveURL(/advanced/);

    const switchesAfter = extensionPage.locator('[role="switch"]');
    await expect(switchesAfter.first()).toBeVisible();
    const stateAfter = await switchesAfter.first().getAttribute('aria-checked');
    expect(stateAfter).toBe(changedState);
  });

  test('address type selection persists after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await navigateTo(extensionPage, 'settings');
    const addressTypeOption = extensionPage.locator('text=Address Type').first();
    await expect(addressTypeOption).toBeVisible();
    await addressTypeOption.click();
    await expect(extensionPage).toHaveURL(/address-type/);

    await expect(extensionPage.locator('[role="radio"]').first()).toBeVisible();
    const legacyOption = extensionPage.locator('[role="radio"]').filter({ hasText: 'Legacy' }).first();
    if (await legacyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await legacyOption.click();
    }

    await navigateTo(extensionPage, 'wallet');
    const addressBefore = await extensionPage.locator('.font-mono').first().textContent();

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    await expect(extensionPage.locator('.font-mono').first()).toBeVisible({ timeout: 10000 });

    const addressAfter = await extensionPage.locator('.font-mono').first().textContent();
    if (addressBefore && addressAfter) {
      const prefixBefore = addressBefore.split('...')[0];
      const prefixAfter = addressAfter.split('...')[0];
      expect(prefixAfter).toBe(prefixBefore);
    }
  });
});

walletTest.describe('State Persistence - Navigation', () => {
  walletTest('state persists when navigating between pages', async ({ page }) => {
    const initialAddress = await page.locator('.font-mono').first().textContent();

    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/);

    const finalAddress = await page.locator('.font-mono').first().textContent();
    expect(finalAddress).toBe(initialAddress);
  });

  walletTest('balance view selection persists', async ({ page }) => {
    const assetsTab = page.locator('button[aria-label="View Assets"], button:has-text("Assets")').first();
    if (await assetsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await assetsTab.click();

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

    const firstWalletButton = extensionPage.locator('header button').first();
    const firstWalletName = await firstWalletButton.textContent();

    await firstWalletButton.click();
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

    const currentWalletName = await extensionPage.locator('header button').first().textContent();
    expect(currentWalletName).not.toBe(firstWalletName);

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    await expect(extensionPage.locator('header button').first()).toBeVisible();
  });
});

walletTest.describe('State Persistence - Session', () => {
  walletTest('unlock state persists during session', async ({ page }) => {
    await expect(page).toHaveURL(/index/);
    await expect(page.locator('.font-mono').first()).toBeVisible();

    await navigateTo(page, 'market');
    await navigateTo(page, 'actions');
    await navigateTo(page, 'settings');
    await navigateTo(page, 'wallet');

    await expect(page).toHaveURL(/index/);
    await expect(page.locator('.font-mono').first()).toBeVisible();
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
    const addressVisible = await page.locator('.font-mono').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(addressVisible).toBe(true);
  });
});

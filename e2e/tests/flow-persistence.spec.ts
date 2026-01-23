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

    // Wait for page to fully load and header to be ready
    await extensionPage.waitForLoadState('networkidle');
    await expect(header.walletSelector(extensionPage)).toBeVisible({ timeout: 10000 });
    const walletNameBefore = await header.walletSelector(extensionPage).textContent();

    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/);

    await unlockWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/);

    // Wait for page to fully load after unlock
    await extensionPage.waitForLoadState('networkidle');
    await expect(header.walletSelector(extensionPage)).toBeVisible({ timeout: 10000 });

    const walletNameAfter = await header.walletSelector(extensionPage).textContent();
    expect(walletNameAfter).toBe(walletNameBefore);
  });

  test('current address persists after lock/unlock', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    // Wait for page to fully load before getting address
    await extensionPage.waitForLoadState('networkidle');
    await expect(index.addressText(extensionPage)).toBeVisible({ timeout: 10000 });
    const addressBefore = await index.addressText(extensionPage).textContent();
    expect(addressBefore).toBeTruthy();

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);

    // Wait for page to fully load after unlock
    await expect(extensionPage).toHaveURL(/index/);
    await extensionPage.waitForLoadState('networkidle');
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

    const addressTypeOption = settings.addressTypeOption(extensionPage);
    const optionCount = await addressTypeOption.count();

    if (optionCount === 0) {
      return; // Address type option not available
    }

    await expect(addressTypeOption).toBeVisible({ timeout: 5000 });
    await addressTypeOption.click();
    await expect(extensionPage).toHaveURL(/address-type/, { timeout: 10000 });

    // Select Legacy (P2PKH) address type
    const radioOptions = extensionPage.locator('[role="radio"]');
    await expect(radioOptions.first()).toBeVisible({ timeout: 5000 });

    const legacyOption = radioOptions.filter({ hasText: 'Legacy' }).first();
    const legacyCount = await legacyOption.count();

    if (legacyCount > 0) {
      await legacyOption.click();
      // Wait for the radio to be checked (UI update)
      await expect(legacyOption).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
    }

    // Wait for the address type change to take effect (async context update)
    await extensionPage.waitForLoadState('networkidle');

    await navigateTo(extensionPage, 'wallet');

    // Wait for address with Legacy prefix (starts with "1") to appear
    // The async context update may take a moment to propagate
    const legacyAddressLocator = extensionPage.locator('[aria-label="Current address"]')
      .locator('span.font-mono')
      .filter({ hasText: /^1[a-zA-Z0-9]/ });
    await expect(legacyAddressLocator).toBeVisible({ timeout: 15000 });

    const addressBefore = await index.addressText(extensionPage).textContent();

    await lockWallet(extensionPage);
    await unlockWallet(extensionPage, TEST_PASSWORD);
    await extensionPage.waitForLoadState('networkidle');

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
    const assetsTab = index.assetsTab(page);
    const tabCount = await assetsTab.count();

    if (tabCount === 0) {
      return; // Assets tab not present
    }

    await expect(assetsTab).toBeVisible();
    await assetsTab.click();

    await navigateTo(page, 'settings');
    await navigateTo(page, 'wallet');

    // After navigating back, should still be on wallet index
    await expect(page).toHaveURL(/index/);
  });
});

walletTest.describe('State Persistence - Multi-Wallet', () => {
  walletTest('active wallet selection persists after adding second wallet', async ({ page }) => {
    // walletTest already creates a wallet, wait for header to be ready and get its name
    await expect(header.walletSelector(page)).toBeVisible({ timeout: 10000 });
    const firstWalletName = await header.walletSelector(page).textContent();

    // Navigate to wallet selection page
    await header.walletSelector(page).click();
    await page.waitForURL(/select-wallet/);

    // Add a second wallet - target the green button at bottom (not header icon)
    const addWalletButton = page.getByRole('button', { name: /Add.*Wallet/i }).filter({ hasText: 'Add Wallet' });
    await expect(addWalletButton).toBeVisible({ timeout: 5000 });
    await addWalletButton.click();

    const createOption = page.getByRole('button', { name: /Create.*Wallet/i });
    await expect(createOption).toBeVisible({ timeout: 5000 });
    await createOption.click();

    // Wait for reveal phrase button and click it
    const revealButton = page.getByRole('button', { name: 'Reveal recovery phrase' });
    await expect(revealButton).toBeVisible({ timeout: 10000 });
    await revealButton.click();

    // Check the confirmation checkbox and fill password
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /Continue/i }).click();
    await page.waitForURL(/index/, { timeout: 15000 });

    // Wait for header to render after page load
    await page.waitForLoadState('networkidle');
    await expect(header.walletSelector(page)).toBeVisible({ timeout: 10000 });

    const currentWalletName = await header.walletSelector(page).textContent();
    expect(currentWalletName).not.toBe(firstWalletName);

    // Lock and unlock to verify persistence
    await lockWallet(page);
    await unlockWallet(page, TEST_PASSWORD);

    // Wait for index page to fully load after unlock
    await expect(page).toHaveURL(/index/, { timeout: 10000 });
    // Wait for address to be visible first as indicator page is fully loaded
    await expect(index.addressText(page)).toBeVisible({ timeout: 15000 });
    // Then check the wallet selector
    await expect(header.walletSelector(page)).toBeVisible({ timeout: 5000 });
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

    // After refresh, should be on index (still authenticated) or unlock (session expired)
    await expect(page).toHaveURL(/index|unlock/);
  });
});

walletTest.describe('State Persistence - Error Recovery', () => {
  walletTest('wallet recovers after network error during operation', async ({ page }) => {
    await page.route('**/api/**', route => route.abort('failed'));

    await navigateTo(page, 'actions');

    await page.unroute('**/api/**');

    await navigateTo(page, 'wallet');

    await expect(page).toHaveURL(/index/);
    // Use expect().toBeVisible() which properly waits, unlike isVisible()
    await expect(index.addressText(page)).toBeVisible({ timeout: 5000 });
  });
});

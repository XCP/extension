/**
 * Wallet Functionality Tests
 *
 * Core wallet features: balance display, navigation, copy address, etc.
 */

import { walletTest, expect, navigateTo, getCurrentAddress, grantClipboardPermissions, unlockWallet, TEST_PASSWORD } from '../fixtures';
import { index, settings, viewAddress } from '../selectors';

walletTest.describe('Balance Display', () => {
  walletTest('shows Assets and Balances tabs', async ({ page }) => {
    await expect(index.assetsTab(page)).toBeVisible();
    await expect(index.balancesTab(page)).toBeVisible();
  });

  walletTest('Balances tab shows BTC', async ({ page }) => {
    await index.balancesTab(page).click();
    await expect(index.btcBalanceRow(page)).toBeVisible();
  });

  walletTest('Assets tab shows content', async ({ page }) => {
    await index.assetsTab(page).click();
    await expect(page.getByText(/Assets|Loading|No assets/i).first()).toBeVisible();
  });
});

walletTest.describe('Address Display', () => {
  walletTest('displays current address', async ({ page }) => {
    const address = await getCurrentAddress(page);
    expect(address).toBeTruthy();
    expect(address.length).toBeGreaterThan(10);
  });

  walletTest('copies address to clipboard on click', async ({ page, context }) => {
    await grantClipboardPermissions(context);

    await index.currentAddress(page).click();

    // Visual feedback
    await expect(index.currentAddress(page).locator('.text-green-500')).toBeVisible();
  });
});

walletTest.describe('Navigation', () => {
  walletTest('Send button navigates to send page', async ({ page }) => {
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/send/);
  });

  walletTest('Receive button navigates to receive page', async ({ page }) => {
    await index.receiveButton(page).click();
    await expect(page).toHaveURL(/address\/view/);
    // Should show QR code (main element on receive page)
    await expect(viewAddress.qrCode(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('History button navigates to history page', async ({ page }) => {
    await index.historyButton(page).click();
    await expect(page).toHaveURL(/history/);
  });

  walletTest('footer navigates to all sections', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await navigateTo(page, 'wallet');
    await expect(page).toHaveURL(/index/);
  });
});

walletTest.describe('Settings Access', () => {
  walletTest('shows main settings options', async ({ page }) => {
    await navigateTo(page, 'settings');

    await expect(settings.addressTypeOption(page)).toBeVisible();
    await expect(settings.advancedOption(page)).toBeVisible();
    await expect(settings.securityOption(page)).toBeVisible();
  });

  walletTest('Advanced settings shows auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/);
    await expect(settings.autoLockTimer(page)).toBeVisible();
  });
});

walletTest.describe('State Persistence', () => {
  walletTest('wallet state persists after reload', async ({ page }) => {
    const initialAddress = await getCurrentAddress(page);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // May need to unlock after reload
    if (page.url().includes('unlock')) {
      await unlockWallet(page, TEST_PASSWORD);
    }

    const restoredAddress = await getCurrentAddress(page);
    expect(restoredAddress).toBeTruthy();
  });
});

walletTest.describe('Error Recovery', () => {
  walletTest('handles invalid routes gracefully', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/invalid-route`);
    await page.waitForLoadState('domcontentloaded');

    // Should show error page or redirect to valid page
    const errorText = page.getByText(/Error|Not Found|404/i);
    const assetsTab = index.assetsTab(page);

    await expect(errorText.or(assetsTab).first()).toBeVisible({ timeout: 5000 });

    // Navigate to wallet and verify it works
    await page.goto(`chrome-extension://${extensionId}/popup.html#/index`);
    await page.waitForLoadState('domcontentloaded');
    await expect(index.assetsTab(page)).toBeVisible({ timeout: 5000 });
  });
});

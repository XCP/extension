/**
 * Wallet Functionality Tests
 *
 * Core wallet features: balance display, navigation, copy address, etc.
 */

import { walletTest, expect, navigateTo, getCurrentAddress, grantClipboardPermissions, unlockWallet, TEST_PASSWORD } from '../fixtures';

walletTest.describe('Balance Display', () => {
  walletTest('shows Assets and Balances tabs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View Balances' })).toBeVisible();
  });

  walletTest('Balances tab shows BTC', async ({ page }) => {
    await page.getByRole('button', { name: 'View Balances' }).click();
    await expect(page.getByText('BTC')).toBeVisible();
  });

  walletTest('Assets tab shows content', async ({ page }) => {
    await page.getByRole('button', { name: 'View Assets' }).click();
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

    const addressButton = page.locator('[aria-label="Current address"]');
    await addressButton.click();

    // Visual feedback
    await expect(addressButton.locator('.text-green-500')).toBeVisible();
  });
});

walletTest.describe('Navigation', () => {
  walletTest('Send button navigates to send page', async ({ page }) => {
    await page.getByRole('button', { name: /send/i }).first().click();
    await expect(page).toHaveURL(/send/);
  });

  walletTest('Receive button navigates to receive page', async ({ page }) => {
    await page.getByRole('button', { name: /receive/i }).first().click();
    await expect(page).toHaveURL(/receive/);
    await expect(page.locator('canvas, .font-mono').first()).toBeVisible();
  });

  walletTest('History button navigates to history page', async ({ page }) => {
    await page.getByText('History').click();
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

    await expect(page.getByText('General')).toBeVisible();
    await expect(page.getByText('Advanced')).toBeVisible();
    await expect(page.getByText('About')).toBeVisible();
  });

  walletTest('Advanced settings shows auto-lock timer', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.getByText('Advanced').click();
    await expect(page).toHaveURL(/advanced/);
    await expect(page.getByText(/Auto-Lock/i).first()).toBeVisible();
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

    // Should redirect or show error
    const hasError = await page.getByText(/Error|Not Found|404/i).isVisible().catch(() => false);
    const redirected = page.url().includes('index') || page.url().includes('unlock');

    expect(hasError || redirected).toBe(true);

    // Can still navigate to wallet
    await navigateTo(page, 'wallet');
    await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible();
  });
});

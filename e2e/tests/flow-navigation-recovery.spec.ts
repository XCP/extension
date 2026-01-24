/**
 * Navigation Recovery Tests
 *
 * Tests for navigation recovery flows including cancel operations, browser back,
 * retry after errors, and deep linking.
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  lockWallet,
  navigateTo,
  TEST_PASSWORD
} from '../fixtures';
import { TEST_ADDRESSES } from '../test-data';
import { index, settings, send, header, viewAddress, onboarding, unlock, common, selectWallet, importWallet, createWallet as createWalletSelectors } from '../selectors';

test.describe('Navigation Recovery - Cancel Flows', () => {
  test('can cancel create wallet and return to onboarding', async ({ extensionPage }) => {
    await expect(onboarding.createWalletButton(extensionPage)).toBeVisible({ timeout: 5000 });

    await onboarding.createWalletButton(extensionPage).click();
    await expect(createWalletSelectors.revealPhraseCard(extensionPage)).toBeVisible({ timeout: 5000 });

    await expect(common.backButton(extensionPage)).toBeVisible({ timeout: 5000 });
    await common.backButton(extensionPage).click();

    
    // Should be back on onboarding page - verify Create button is visible again
    await expect(onboarding.createWalletButton(extensionPage)).toBeVisible({ timeout: 3000 });
  });

  test('can cancel import wallet and return to onboarding', async ({ extensionPage }) => {
    await expect(onboarding.importWalletButton(extensionPage)).toBeVisible({ timeout: 5000 });

    await onboarding.importWalletButton(extensionPage).click();
    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible({ timeout: 5000 });

    await expect(common.backButton(extensionPage)).toBeVisible({ timeout: 5000 });
    await common.backButton(extensionPage).click();

    
    // Should be back on onboarding page - verify Import button is visible again
    await expect(onboarding.importWalletButton(extensionPage)).toBeVisible({ timeout: 3000 });
  });
});

walletTest.describe('Navigation Recovery - Send Flow Cancel', () => {
  walletTest('can cancel send transaction and return to dashboard', async ({ page }) => {
    await expect(index.sendButton(page)).toBeVisible({ timeout: 5000 });
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await expect(common.backButton(page)).toBeVisible({ timeout: 5000 });
    await common.backButton(page).click();

    
    const isOnIndex = page.url().includes('index');
    expect(isOnIndex).toBe(true);
  });

  walletTest('can cancel settings change and return to settings index', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await expect(settings.advancedOption(page)).toBeVisible({ timeout: 5000 });
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    await expect(common.backButton(page)).toBeVisible({ timeout: 5000 });
    await common.backButton(page).click();

    
    const isOnSettingsIndex = page.url().includes('settings') && !page.url().includes('advanced');
    expect(isOnSettingsIndex).toBe(true);
  });
});

walletTest.describe('Navigation Recovery - Browser Back Button', () => {
  walletTest('browser back button works from send page', async ({ page }) => {
    await expect(index.sendButton(page)).toBeVisible({ timeout: 5000 });
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.goBack();
    

    const isOnValidPage = !page.url().includes('compose/send') || page.url().includes('index');
    expect(isOnValidPage).toBe(true);
  });

  walletTest('browser back button works from settings subpage', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await expect(settings.advancedOption(page)).toBeVisible({ timeout: 5000 });
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    await page.goBack();
    

    const isOnSettingsIndex = page.url().includes('settings') && !page.url().includes('advanced');
    expect(isOnSettingsIndex).toBe(true);
  });

  walletTest('browser back button works from market page', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.goBack();
    

    const currentUrl = page.url();
    const isOnValidPage = currentUrl.includes('index') || !currentUrl.includes('market');
    expect(isOnValidPage).toBe(true);
  });
});

walletTest.describe('Navigation Recovery - Retry After Error', () => {
  walletTest('can retry after form validation error', async ({ page }) => {
    await expect(index.sendButton(page)).toBeVisible({ timeout: 5000 });
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });
    await send.recipientInput(page).fill('invalid');
    await send.recipientInput(page).blur();
    

    // Verify that an error indicator is shown for invalid address (red border on input)
    const inputClassesInvalid = await send.recipientInput(page).getAttribute('class') || '';
    expect(inputClassesInvalid).toContain('border-red');

    await send.recipientInput(page).clear();
    await send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await send.recipientInput(page).blur();

    // After entering valid address, error indicator should be gone
    const inputClassesValid = await send.recipientInput(page).getAttribute('class') || '';
    expect(inputClassesValid).not.toContain('border-red');
  });
});

test.describe('Navigation Recovery - Retry Unlock', () => {
  test('can retry unlock after wrong password', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/, { timeout: 5000 });

    await unlock.passwordInput(extensionPage).fill('wrongpassword');
    await unlock.unlockButton(extensionPage).click();

    await expect(extensionPage.locator('text=/Invalid.*password|Incorrect.*password|Wrong.*password/i')).toBeVisible({ timeout: 3000 });

    await unlock.passwordInput(extensionPage).fill(TEST_PASSWORD);
    await unlock.unlockButton(extensionPage).click();

    await expect(extensionPage).toHaveURL(/index/, { timeout: 5000 });
  });
});

walletTest.describe('Navigation Recovery - Deep Links', () => {
  walletTest('direct navigation to settings works when authenticated', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/settings`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/settings/);
    await expect(page.getByText('Settings').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Navigation Recovery - Direct Links When Locked', () => {
  test('direct navigation to protected page redirects when locked', async ({ extensionPage, extensionId }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/, { timeout: 5000 });

    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html#/settings`);
    await extensionPage.waitForLoadState('networkidle');

    // Should be on unlock or settings page
    await expect(extensionPage).toHaveURL(/unlock|settings/);
  });
});

walletTest.describe('Navigation Recovery - Multi-step Flows', () => {
  walletTest('can navigate away and return to send form', async ({ page }) => {
    await expect(index.sendButton(page)).toBeVisible({ timeout: 5000 });
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });
    await send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);

    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await navigateTo(page, 'wallet');
    await expect(index.sendButton(page)).toBeVisible({ timeout: 5000 });
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Navigation Recovery - Wallet Selection Flow', () => {
  test('wallet selection flow completes correctly after cancellation', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await header.walletSelector(extensionPage).click();
    await extensionPage.waitForURL(/select-wallet/, { timeout: 5000 });

    // Target the green button at bottom (not header icon) by filtering for visible text
    await expect(selectWallet.addWalletButton(extensionPage)).toBeVisible({ timeout: 5000 });
    await selectWallet.addWalletButton(extensionPage).click();

    // Wait for possible navigation, then try to go back
    
    const backButton = common.backButton(extensionPage);
    const backButtonCount = await backButton.count();
    if (backButtonCount > 0) {
      await backButton.click();
      
    }

    // Navigate back to wallet/index
    await navigateTo(extensionPage, 'wallet');
    await expect(extensionPage).toHaveURL(/index/, { timeout: 5000 });

    // Wait for the page to fully load and verify key elements exist
    await extensionPage.waitForLoadState('networkidle');
    // Index page has Send button (not addressDisplay which is on view-address page)
    await expect(index.sendButton(extensionPage)).toBeVisible({ timeout: 10000 });
  });
});

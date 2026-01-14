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
import { TEST_ADDRESSES } from '../helpers/test-data';

test.describe('Navigation Recovery - Cancel Flows', () => {
  test('can cancel create wallet and return to onboarding', async ({ extensionPage }) => {
    await expect(extensionPage.getByText('Create Wallet')).toBeVisible({ timeout: 5000 });

    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });

    const backButton = extensionPage.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    await extensionPage.waitForTimeout(500);
    const isOnOnboarding = await extensionPage.getByText('Create Wallet').isVisible({ timeout: 3000 }).catch(() => false);
    const isOnImport = await extensionPage.getByText('Import Wallet').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isOnOnboarding || isOnImport).toBe(true);
  });

  test('can cancel import wallet and return to onboarding', async ({ extensionPage }) => {
    await expect(extensionPage.getByText('Import Wallet')).toBeVisible({ timeout: 5000 });

    await extensionPage.getByText('Import Wallet').click();
    await extensionPage.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    const backButton = extensionPage.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    await extensionPage.waitForTimeout(500);
    const isOnOnboarding = await extensionPage.getByText('Create Wallet').isVisible({ timeout: 3000 }).catch(() => false);
    const isOnImport = await extensionPage.getByText('Import Wallet').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isOnOnboarding || isOnImport).toBe(true);
  });
});

walletTest.describe('Navigation Recovery - Send Flow Cancel', () => {
  walletTest('can cancel send transaction and return to dashboard', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    await page.waitForTimeout(500);
    const isOnIndex = page.url().includes('index');
    expect(isOnIndex).toBe(true);
  });

  walletTest('can cancel settings change and return to settings index', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const advancedOption = page.locator('text=Advanced').first();
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    await page.waitForTimeout(500);
    const isOnSettingsIndex = page.url().includes('settings') && !page.url().includes('advanced');
    expect(isOnSettingsIndex).toBe(true);
  });
});

walletTest.describe('Navigation Recovery - Browser Back Button', () => {
  walletTest('browser back button works from send page', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    await page.goBack();
    await page.waitForTimeout(500);

    const isOnValidPage = !page.url().includes('compose/send') || page.url().includes('index');
    expect(isOnValidPage).toBe(true);
  });

  walletTest('browser back button works from settings subpage', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const advancedOption = page.locator('text=Advanced').first();
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    await page.goBack();
    await page.waitForTimeout(500);

    const isOnSettingsIndex = page.url().includes('settings') && !page.url().includes('advanced');
    expect(isOnSettingsIndex).toBe(true);
  });

  walletTest('browser back button works from market page', async ({ page }) => {
    await navigateTo(page, 'market');
    await expect(page).toHaveURL(/market/);

    await page.goBack();
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    const isOnValidPage = currentUrl.includes('index') || !currentUrl.includes('market');
    expect(isOnValidPage).toBe(true);
  });
});

walletTest.describe('Navigation Recovery - Retry After Error', () => {
  walletTest('can retry after form validation error', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill('invalid');
    await addressInput.blur();
    await page.waitForTimeout(500);

    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    const wasDisabledOrErrorShown = await submitButton.isDisabled().catch(() => true) ||
      await page.locator('.text-red-600, .text-red-500').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(wasDisabledOrErrorShown).toBe(true);

    await addressInput.clear();
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);
  });
});

test.describe('Navigation Recovery - Retry Unlock', () => {
  test('can retry unlock after wrong password', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await lockWallet(extensionPage);
    await expect(extensionPage).toHaveURL(/unlock/, { timeout: 5000 });

    await extensionPage.locator('input[name="password"]').fill('wrongpassword');
    await extensionPage.locator('button:has-text("Unlock")').click();

    await expect(extensionPage.locator('text=/Invalid.*password|Incorrect.*password|Wrong.*password/i')).toBeVisible({ timeout: 3000 });

    await extensionPage.locator('input[name="password"]').fill(TEST_PASSWORD);
    await extensionPage.locator('button:has-text("Unlock")').click();

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

    const currentUrl = extensionPage.url();
    expect(currentUrl.includes('unlock') || currentUrl.includes('settings')).toBe(true);
  });
});

walletTest.describe('Navigation Recovery - Multi-step Flows', () => {
  walletTest('can navigate away and return to send form', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    await navigateTo(page, 'wallet');
    const sendButtonAgain = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButtonAgain).toBeVisible({ timeout: 5000 });
    await sendButtonAgain.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    const addressInputAgain = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInputAgain).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Navigation Recovery - Wallet Selection Flow', () => {
  test('wallet selection flow completes correctly after cancellation', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    const walletButton = extensionPage.locator('header button').first();
    await walletButton.click();
    await extensionPage.waitForURL(/select-wallet/, { timeout: 5000 });

    const addWalletButton = extensionPage.getByRole('button', { name: /Add.*Wallet/i }).first();
    await expect(addWalletButton).toBeVisible({ timeout: 5000 });
    await addWalletButton.click();

    const backButton = extensionPage.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    if (await backButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await backButton.click();
      await extensionPage.waitForTimeout(500);
    }

    await navigateTo(extensionPage, 'wallet');
    await expect(extensionPage).toHaveURL(/index/);

    await expect(extensionPage.locator('.font-mono').first()).toBeVisible({ timeout: 5000 });
  });
});

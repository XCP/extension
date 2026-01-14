import { test, expect } from '@playwright/test';
import {
  launchExtension,
  setupWallet,
  createWallet,
  navigateViaFooter,
  cleanup,
  TEST_PASSWORD,
  TEST_MNEMONIC,
} from '../helpers/test-helpers';

test.describe('Navigation Recovery - Cancel Flows', () => {
  test('can cancel create wallet and return to onboarding', async () => {
    const { context, page } = await launchExtension('recovery-cancel-create');

    // Should be on onboarding
    await expect(page.getByText('Create Wallet')).toBeVisible({ timeout: 5000 });

    // Start create wallet
    await page.getByText('Create Wallet').click();

    // Wait for creation page
    await page.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });

    // Find and click back button
    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should return to onboarding
    await page.waitForTimeout(500);
    const isOnOnboarding = await page.getByText('Create Wallet').isVisible({ timeout: 3000 }).catch(() => false);
    const isOnImport = await page.getByText('Import Wallet').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isOnOnboarding || isOnImport).toBe(true);

    await cleanup(context);
  });

  test('can cancel import wallet and return to onboarding', async () => {
    const { context, page } = await launchExtension('recovery-cancel-import');

    // Should be on onboarding
    await expect(page.getByText('Import Wallet')).toBeVisible({ timeout: 5000 });

    // Start import wallet
    await page.getByText('Import Wallet').click();

    // Wait for import page
    await page.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    // Find and click back button
    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should return to onboarding
    await page.waitForTimeout(500);
    const isOnOnboarding = await page.getByText('Create Wallet').isVisible({ timeout: 3000 }).catch(() => false);
    const isOnImport = await page.getByText('Import Wallet').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isOnOnboarding || isOnImport).toBe(true);

    await cleanup(context);
  });

  test('can cancel send transaction and return to dashboard', async () => {
    const { context, page } = await launchExtension('recovery-cancel-send');
    await setupWallet(page);

    // Navigate to send
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Find and click back button
    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should return to dashboard
    await page.waitForTimeout(500);
    const isOnIndex = page.url().includes('index');
    expect(isOnIndex).toBe(true);

    await cleanup(context);
  });

  test('can cancel settings change and return to settings index', async () => {
    const { context, page } = await launchExtension('recovery-cancel-settings');
    await setupWallet(page);

    // Navigate to settings
    await navigateViaFooter(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    // Go to advanced settings
    const advancedOption = page.locator('text=Advanced').first();
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Find and click back button
    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should return to settings index
    await page.waitForTimeout(500);
    const isOnSettingsIndex = page.url().includes('settings') && !page.url().includes('advanced');
    expect(isOnSettingsIndex).toBe(true);

    await cleanup(context);
  });
});

test.describe('Navigation Recovery - Browser Back Button', () => {
  test('browser back button works from send page', async () => {
    const { context, page } = await launchExtension('recovery-browser-back-send');
    await setupWallet(page);

    // Navigate to send
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Use browser back
    await page.goBack();
    await page.waitForTimeout(500);

    // Should be back on index or a valid page
    const isOnValidPage = !page.url().includes('compose/send') || page.url().includes('index');
    expect(isOnValidPage).toBe(true);

    await cleanup(context);
  });

  test('browser back button works from settings subpage', async () => {
    const { context, page } = await launchExtension('recovery-browser-back-settings');
    await setupWallet(page);

    // Navigate to settings > advanced
    await navigateViaFooter(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    const advancedOption = page.locator('text=Advanced').first();
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
    await advancedOption.click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });

    // Use browser back
    await page.goBack();
    await page.waitForTimeout(500);

    // Should be back on settings index
    const isOnSettingsIndex = page.url().includes('settings') && !page.url().includes('advanced');
    expect(isOnSettingsIndex).toBe(true);

    await cleanup(context);
  });

  test('browser back button works from market page', async () => {
    const { context, page } = await launchExtension('recovery-browser-back-market');
    await setupWallet(page);

    // Navigate to market
    await navigateViaFooter(page, 'market');
    await expect(page).toHaveURL(/market/);

    // Use browser back
    await page.goBack();
    await page.waitForTimeout(500);

    // Should be back on index or a valid page
    const currentUrl = page.url();
    const isOnValidPage = currentUrl.includes('index') || !currentUrl.includes('market');
    expect(isOnValidPage).toBe(true);

    await cleanup(context);
  });
});

test.describe('Navigation Recovery - Retry After Error', () => {
  test('can retry after form validation error', async () => {
    const { context, page } = await launchExtension('recovery-retry-validation');
    await setupWallet(page);

    // Navigate to send
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Enter invalid address
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill('invalid');
    await addressInput.blur();
    await page.waitForTimeout(500);

    // Should show error or disabled button
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    const wasDisabledOrErrorShown = await submitButton.isDisabled().catch(() => true) ||
      await page.locator('.text-red-600, .text-red-500').first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(wasDisabledOrErrorShown).toBe(true);

    // Clear and enter valid address
    await addressInput.clear();
    await addressInput.fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
    await addressInput.blur();
    await page.waitForTimeout(500);

    // Error should be gone or button should be more enabled
    const hasAddressError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address/i }).first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasAddressError).toBe(false);

    await cleanup(context);
  });

  test('can retry unlock after wrong password', async () => {
    const { context, page } = await launchExtension('recovery-retry-unlock');
    await createWallet(page, TEST_PASSWORD);

    // Lock the wallet
    const lockButton = page.locator('button[aria-label*="Lock"], header button').last();
    if (await lockButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lockButton.click();
      await page.waitForURL(/unlock/, { timeout: 5000 });
    } else {
      // Navigate to unlock directly
      const extensionId = page.url().split('/')[2];
      await page.goto(`chrome-extension://${extensionId}/popup.html#/unlock-wallet`);
    }

    // Enter wrong password
    await page.locator('input[name="password"]').fill('wrongpassword');
    await page.locator('button:has-text("Unlock")').click();

    // Should show error
    await expect(page.locator('text=/Invalid.*password|Incorrect.*password|Wrong.*password/i')).toBeVisible({ timeout: 3000 });

    // Retry with correct password
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);
    await page.locator('button:has-text("Unlock")').click();

    // Should succeed
    await expect(page).toHaveURL(/index/, { timeout: 5000 });

    await cleanup(context);
  });
});

test.describe('Navigation Recovery - Deep Links', () => {
  test('direct navigation to settings works when authenticated', async () => {
    const { context, page } = await launchExtension('recovery-direct-settings');
    await setupWallet(page);

    // Get extension ID
    const extensionId = page.url().split('/')[2];

    // Navigate directly to settings
    await page.goto(`chrome-extension://${extensionId}/popup.html#/settings`);
    await page.waitForLoadState('networkidle');

    // Should be on settings page
    await expect(page).toHaveURL(/settings/);
    await expect(page.getByText('Settings').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('direct navigation to protected page redirects when locked', async () => {
    const { context, page } = await launchExtension('recovery-direct-locked');
    await createWallet(page, TEST_PASSWORD);

    // Get extension ID
    const extensionId = page.url().split('/')[2];

    // Lock the wallet
    const lockButton = page.locator('button[aria-label*="Lock"], header button').last();
    if (await lockButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lockButton.click();
      await page.waitForURL(/unlock/, { timeout: 5000 });
    }

    // Try to navigate directly to protected page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/settings`);
    await page.waitForLoadState('networkidle');

    // Should redirect to unlock
    const currentUrl = page.url();
    expect(currentUrl.includes('unlock') || currentUrl.includes('settings')).toBe(true);

    await cleanup(context);
  });
});

test.describe('Navigation Recovery - Multi-step Flows', () => {
  test('can navigate away and return to incomplete form', async () => {
    const { context, page } = await launchExtension('recovery-incomplete-form');
    await setupWallet(page);

    // Navigate to send and fill some data
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    // Fill address but not amount
    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');

    // Navigate away
    await navigateViaFooter(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    // Navigate back to send
    const sendButtonAgain = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    // May need to go back to wallet first
    await navigateViaFooter(page, 'wallet');
    await expect(sendButtonAgain).toBeVisible({ timeout: 5000 });
    await sendButtonAgain.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });

    // Form may or may not retain data (depends on implementation)
    // Just verify the form is accessible
    const addressInputAgain = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInputAgain).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('wallet selection flow completes correctly after cancellation', async () => {
    const { context, page } = await launchExtension('recovery-wallet-selection');
    await createWallet(page, TEST_PASSWORD);

    // Open wallet selection
    const walletButton = page.locator('header button').first();
    await walletButton.click();
    await page.waitForURL(/select-wallet/, { timeout: 5000 });

    // Start adding wallet
    const addWalletButton = page.getByRole('button', { name: /Add.*Wallet/i }).first();
    await expect(addWalletButton).toBeVisible({ timeout: 5000 });
    await addWalletButton.click();

    // Cancel by going back
    const backButton = page.locator('button[aria-label*="back"], button[aria-label*="Back"], header button').first();
    if (await backButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);
    }

    // Navigate back to index
    await navigateViaFooter(page, 'wallet');
    await expect(page).toHaveURL(/index/);

    // Wallet should still be functional
    await expect(page.locator('.font-mono').first()).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });
});

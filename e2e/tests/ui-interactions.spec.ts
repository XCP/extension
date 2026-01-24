/**
 * Wallet UI Interactions Tests
 *
 * Tests for UI interactions including mnemonic refresh,
 * password show/hide toggles, and input visibility.
 */

import { test, expect, TEST_PASSWORD, TEST_MNEMONIC } from '../fixtures';
import {
  onboarding,
  createWallet,
  importWallet,
  selectWallet
} from '../selectors';

test.describe('Wallet UI Interactions', () => {
  test('refresh mnemonic button on create wallet', async ({ extensionPage }) => {
    // The test fixture starts fresh without a wallet, so wait for Create Wallet to appear
    await expect(onboarding.createWalletButton(extensionPage)).toBeVisible({ timeout: 10000 });
    await onboarding.createWalletButton(extensionPage).click();

    await extensionPage.waitForURL(/wallet\/create/, { timeout: 5000 });

    // Reveal the mnemonic phrase
    await expect(createWallet.revealPhraseCard(extensionPage)).toBeVisible({ timeout: 5000 });
    await createWallet.revealPhraseCard(extensionPage).click();
    

    // Check if refresh button exists
    const refreshButton = extensionPage.locator('button[aria-label="Generate new recovery phrase"]');
    const refreshButtonCount = await refreshButton.count();

    if (refreshButtonCount > 0) {
      // Get the first word before refresh - target the font-mono span inside the ol list
      const wordSpans = extensionPage.locator('ol span.font-mono');
      await expect(wordSpans.first()).toBeVisible({ timeout: 3000 });
      const firstWordBefore = await wordSpans.first().textContent();

      await refreshButton.click();
      

      // Get the first word after refresh
      const firstWordAfter = await wordSpans.first().textContent();

      // Words should be different after refresh
      expect(firstWordBefore).not.toBe(firstWordAfter);
    }
  });

  test('password show/hide on create wallet', async ({ extensionPage }) => {
    // The test fixture starts fresh without a wallet
    await expect(onboarding.createWalletButton(extensionPage)).toBeVisible({ timeout: 10000 });
    await onboarding.createWalletButton(extensionPage).click();

    await extensionPage.waitForURL(/wallet\/create/, { timeout: 5000 });

    await expect(createWallet.revealPhraseCard(extensionPage)).toBeVisible({ timeout: 5000 });
    await createWallet.revealPhraseCard(extensionPage).click();
    

    await expect(createWallet.savedPhraseCheckbox(extensionPage)).toBeVisible({ timeout: 5000 });
    await createWallet.savedPhraseCheckbox(extensionPage).check();

    const passwordInput = createWallet.passwordInput(extensionPage);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    const showHideButton = extensionPage.locator('button[aria-label*="password"]').filter({ has: extensionPage.locator('svg') });

    const initialType = await passwordInput.getAttribute('type');
    expect(initialType).toBe('password');

    await passwordInput.fill(TEST_PASSWORD);

    await showHideButton.click();
    

    const typeAfterShow = await passwordInput.getAttribute('type');
    expect(typeAfterShow).toBe('text');

    const visiblePassword = await passwordInput.inputValue();
    expect(visiblePassword).toBe(TEST_PASSWORD);

    await showHideButton.click();
    

    const typeAfterHide = await passwordInput.getAttribute('type');
    expect(typeAfterHide).toBe('password');
  });

  test('mnemonic show/hide on import wallet', async ({ extensionPage }) => {
    // The test fixture starts fresh without a wallet
    await expect(onboarding.importWalletButton(extensionPage)).toBeVisible({ timeout: 10000 });
    await onboarding.importWalletButton(extensionPage).click();

    await extensionPage.waitForURL(/wallet\/import/, { timeout: 5000 });

    // Wait for the first word input to appear
    const firstInput = importWallet.wordInput(extensionPage, 0);
    await expect(firstInput).toBeVisible({ timeout: 5000 });

    // Check if there's an eye button to toggle visibility
    const eyeButton = extensionPage.locator('button[aria-label*="recovery phrase"]').filter({ has: extensionPage.locator('svg') });
    const eyeButtonCount = await eyeButton.count();

    if (eyeButtonCount > 0) {
      // Fill in the mnemonic words
      const mnemonicWords = TEST_MNEMONIC.split(' ');
      for (let i = 0; i < mnemonicWords.length; i++) {
        const input = importWallet.wordInput(extensionPage, i);
        await input.fill(mnemonicWords[i]);
      }

      const initialType = await firstInput.getAttribute('type');
      expect(initialType).toBe('password');

      await eyeButton.click();
      

      const typeAfterShow = await firstInput.getAttribute('type');
      expect(typeAfterShow).toBe('text');

      const visibleWord = await firstInput.inputValue();
      expect(visibleWord).toBe('abandon');

      await eyeButton.click();
      

      const typeAfterHide = await firstInput.getAttribute('type');
      expect(typeAfterHide).toBe('password');
    }
  });

  test('password show/hide on import wallet', async ({ extensionPage }) => {
    // The test fixture starts fresh without a wallet
    await expect(onboarding.importWalletButton(extensionPage)).toBeVisible({ timeout: 10000 });
    await onboarding.importWalletButton(extensionPage).click();

    await extensionPage.waitForURL(/wallet\/import/, { timeout: 5000 });

    // Wait for and fill in mnemonic words
    const firstInput = importWallet.wordInput(extensionPage, 0);
    await expect(firstInput).toBeVisible({ timeout: 5000 });

    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < mnemonicWords.length; i++) {
      const input = importWallet.wordInput(extensionPage, i);
      await input.fill(mnemonicWords[i]);
    }

    // Check the confirmation checkbox
    await expect(importWallet.savedPhraseCheckbox(extensionPage)).toBeVisible({ timeout: 5000 });
    await importWallet.savedPhraseCheckbox(extensionPage).check();

    // Wait for password input to appear
    const passwordInput = importWallet.passwordInput(extensionPage);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    const showHideButton = passwordInput.locator('..').locator('button[aria-label*="password"]');

    const initialType = await passwordInput.getAttribute('type');
    expect(initialType).toBe('password');

    await passwordInput.fill(TEST_PASSWORD);

    await showHideButton.click();
    

    const typeAfterShow = await passwordInput.getAttribute('type');
    expect(typeAfterShow).toBe('text');

    await showHideButton.click();
    

    const typeAfterHide = await passwordInput.getAttribute('type');
    expect(typeAfterHide).toBe('password');
  });
});

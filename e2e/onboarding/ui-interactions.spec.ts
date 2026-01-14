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
    const needsOnboarding = await onboarding.createWalletButton(extensionPage).isVisible().catch(() => false);
    if (needsOnboarding) {
      await onboarding.createWalletButton(extensionPage).click();
    } else {
      const walletButton = extensionPage.locator('button').filter({ hasText: /Wallet/i }).first();
      await walletButton.click();
      await extensionPage.waitForTimeout(1000);
      await selectWallet.addWalletButton(extensionPage).click();
      await extensionPage.waitForTimeout(1000);
      await onboarding.createWalletButton(extensionPage).click();
    }

    await extensionPage.waitForTimeout(1000);

    const refreshButton = extensionPage.locator('button[aria-label="Generate new recovery phrase"]');
    const hasRefreshButton = await refreshButton.isVisible().catch(() => false);

    if (hasRefreshButton) {
      await createWallet.revealPhraseCard(extensionPage).click();
      await extensionPage.waitForTimeout(1000);

      const initialWords: string[] = [];
      for (let i = 1; i <= 12; i++) {
        const wordElement = extensionPage.locator(`text=/^${i}\\./`).locator('..').locator('text=/\\w+/').last();
        const word = await wordElement.textContent();
        initialWords.push(word || '');
      }

      await refreshButton.click();
      await extensionPage.waitForTimeout(1000);

      const newWords: string[] = [];
      for (let i = 1; i <= 12; i++) {
        const wordElement = extensionPage.locator(`text=/^${i}\\./`).locator('..').locator('text=/\\w+/').last();
        const word = await wordElement.textContent();
        newWords.push(word || '');
      }

      expect(initialWords[0]).not.toBe(newWords[0]);
    }
  });

  test('password show/hide on create wallet', async ({ extensionPage }) => {
    const needsOnboarding = await onboarding.createWalletButton(extensionPage).isVisible().catch(() => false);
    if (needsOnboarding) {
      await onboarding.createWalletButton(extensionPage).click();
    } else {
      const walletButton = extensionPage.locator('button').filter({ hasText: /Wallet/i }).first();
      await walletButton.click();
      await extensionPage.waitForTimeout(1000);
      await selectWallet.addWalletButton(extensionPage).click();
      await extensionPage.waitForTimeout(1000);
      await onboarding.createWalletButton(extensionPage).click();
    }

    await extensionPage.waitForTimeout(1000);

    await createWallet.revealPhraseCard(extensionPage).click();
    await extensionPage.waitForTimeout(1000);
    await createWallet.savedPhraseCheckbox(extensionPage).check();
    await extensionPage.waitForTimeout(500);

    const passwordInput = createWallet.passwordInput(extensionPage);
    const showHideButton = extensionPage.locator('button[aria-label*="password"]').filter({ has: extensionPage.locator('svg') });

    const initialType = await passwordInput.getAttribute('type');
    expect(initialType).toBe('password');

    await passwordInput.fill(TEST_PASSWORD);

    await showHideButton.click();
    await extensionPage.waitForTimeout(500);

    const typeAfterShow = await passwordInput.getAttribute('type');
    expect(typeAfterShow).toBe('text');

    const visiblePassword = await passwordInput.inputValue();
    expect(visiblePassword).toBe(TEST_PASSWORD);

    await showHideButton.click();
    await extensionPage.waitForTimeout(500);

    const typeAfterHide = await passwordInput.getAttribute('type');
    expect(typeAfterHide).toBe('password');
  });

  test('mnemonic show/hide on import wallet', async ({ extensionPage }) => {
    const hasImportWallet = await onboarding.importWalletButton(extensionPage).isVisible().catch(() => false);

    if (hasImportWallet) {
      await onboarding.importWalletButton(extensionPage).click();
    } else {
      await extensionPage.reload();
      await extensionPage.waitForTimeout(1000);
      const importButton = await onboarding.importWalletButton(extensionPage).isVisible().catch(() => false);
      if (importButton) {
        await onboarding.importWalletButton(extensionPage).click();
      }
    }

    await extensionPage.waitForTimeout(1000);

    const eyeButton = extensionPage.locator('button[aria-label*="recovery phrase"]').filter({ has: extensionPage.locator('svg') });
    const hasEyeButton = await eyeButton.isVisible().catch(() => false);

    if (hasEyeButton) {
      const mnemonicWords = TEST_MNEMONIC.split(' ');
      for (let i = 0; i < mnemonicWords.length; i++) {
        const input = importWallet.wordInput(extensionPage, i);
        await input.fill(mnemonicWords[i]);
        await extensionPage.waitForTimeout(50);
      }

      const firstInput = importWallet.wordInput(extensionPage, 0);
      const initialType = await firstInput.getAttribute('type');
      expect(initialType).toBe('password');

      await eyeButton.click();
      await extensionPage.waitForTimeout(500);

      const typeAfterShow = await firstInput.getAttribute('type');
      expect(typeAfterShow).toBe('text');

      const visibleWord = await firstInput.inputValue();
      expect(visibleWord).toBe('abandon');

      await eyeButton.click();
      await extensionPage.waitForTimeout(500);

      const typeAfterHide = await firstInput.getAttribute('type');
      expect(typeAfterHide).toBe('password');
    }
  });

  test('password show/hide on import wallet', async ({ extensionPage }) => {
    const hasImportWallet = await onboarding.importWalletButton(extensionPage).isVisible().catch(() => false);

    if (hasImportWallet) {
      await onboarding.importWalletButton(extensionPage).click();
    } else {
      await extensionPage.reload();
      await extensionPage.waitForTimeout(1000);
      const importButton = await onboarding.importWalletButton(extensionPage).isVisible().catch(() => false);
      if (importButton) {
        await onboarding.importWalletButton(extensionPage).click();
      }
    }

    await extensionPage.waitForTimeout(1000);

    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < mnemonicWords.length; i++) {
      const input = importWallet.wordInput(extensionPage, i);
      await input.fill(mnemonicWords[i]);
      await extensionPage.waitForTimeout(50);
    }

    await importWallet.savedPhraseCheckbox(extensionPage).check();
    await extensionPage.waitForTimeout(500);

    const passwordInput = importWallet.passwordInput(extensionPage);
    const showHideButton = passwordInput.locator('..').locator('button[aria-label*="password"]');

    const initialType = await passwordInput.getAttribute('type');
    expect(initialType).toBe('password');

    await passwordInput.fill(TEST_PASSWORD);

    await showHideButton.click();
    await extensionPage.waitForTimeout(500);

    const typeAfterShow = await passwordInput.getAttribute('type');
    expect(typeAfterShow).toBe('text');

    await showHideButton.click();
    await extensionPage.waitForTimeout(500);

    const typeAfterHide = await passwordInput.getAttribute('type');
    expect(typeAfterHide).toBe('password');
  });
});

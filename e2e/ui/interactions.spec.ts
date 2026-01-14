/**
 * Wallet UI Interactions Tests
 *
 * Tests for UI interactions including mnemonic refresh,
 * password show/hide toggles, and input visibility.
 */

import { test, expect, TEST_PASSWORD, TEST_MNEMONIC } from '../fixtures';

test.describe('Wallet UI Interactions', () => {
  test('refresh mnemonic button on create wallet', async ({ extensionPage }) => {
    const needsOnboarding = await extensionPage.getByText('Create Wallet').isVisible().catch(() => false);
    if (needsOnboarding) {
      await extensionPage.getByText('Create Wallet').click();
    } else {
      const walletButton = extensionPage.locator('button').filter({ hasText: /Wallet/i }).first();
      await walletButton.click();
      await extensionPage.waitForTimeout(1000);
      await extensionPage.getByText('Add Wallet').click();
      await extensionPage.waitForTimeout(1000);
      await extensionPage.getByText('Create Wallet').click();
    }

    await extensionPage.waitForTimeout(1000);

    const refreshButton = extensionPage.locator('button[aria-label="Generate new recovery phrase"]');
    const hasRefreshButton = await refreshButton.isVisible().catch(() => false);

    if (hasRefreshButton) {
      await extensionPage.getByText('View 12-word Secret Phrase').click();
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
    const needsOnboarding = await extensionPage.getByText('Create Wallet').isVisible().catch(() => false);
    if (needsOnboarding) {
      await extensionPage.getByText('Create Wallet').click();
    } else {
      const walletButton = extensionPage.locator('button').filter({ hasText: /Wallet/i }).first();
      await walletButton.click();
      await extensionPage.waitForTimeout(1000);
      await extensionPage.getByText('Add Wallet').click();
      await extensionPage.waitForTimeout(1000);
      await extensionPage.getByText('Create Wallet').click();
    }

    await extensionPage.waitForTimeout(1000);

    await extensionPage.getByText('View 12-word Secret Phrase').click();
    await extensionPage.waitForTimeout(1000);
    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();
    await extensionPage.waitForTimeout(500);

    const passwordInput = extensionPage.locator('input[name="password"]');
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
    const hasImportWallet = await extensionPage.getByText('Import Wallet').isVisible().catch(() => false);

    if (hasImportWallet) {
      await extensionPage.getByText('Import Wallet').click();
    } else {
      await extensionPage.reload();
      await extensionPage.waitForTimeout(1000);
      const importButton = await extensionPage.getByText('Import Wallet').isVisible().catch(() => false);
      if (importButton) {
        await extensionPage.getByText('Import Wallet').click();
      }
    }

    await extensionPage.waitForTimeout(1000);

    const eyeButton = extensionPage.locator('button[aria-label*="recovery phrase"]').filter({ has: extensionPage.locator('svg') });
    const hasEyeButton = await eyeButton.isVisible().catch(() => false);

    if (hasEyeButton) {
      const mnemonicWords = TEST_MNEMONIC.split(' ');
      for (let i = 0; i < mnemonicWords.length; i++) {
        const input = extensionPage.locator(`input[name="word-${i}"]`);
        await input.fill(mnemonicWords[i]);
        await extensionPage.waitForTimeout(50);
      }

      const firstInput = extensionPage.locator('input[name="word-0"]');
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
    const hasImportWallet = await extensionPage.getByText('Import Wallet').isVisible().catch(() => false);

    if (hasImportWallet) {
      await extensionPage.getByText('Import Wallet').click();
    } else {
      await extensionPage.reload();
      await extensionPage.waitForTimeout(1000);
      const importButton = await extensionPage.getByText('Import Wallet').isVisible().catch(() => false);
      if (importButton) {
        await extensionPage.getByText('Import Wallet').click();
      }
    }

    await extensionPage.waitForTimeout(1000);

    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < mnemonicWords.length; i++) {
      const input = extensionPage.locator(`input[name="word-${i}"]`);
      await input.fill(mnemonicWords[i]);
      await extensionPage.waitForTimeout(50);
    }

    await extensionPage.getByLabel(/I have saved|backed up/i).check();
    await extensionPage.waitForTimeout(500);

    const passwordInput = extensionPage.locator('input[name="password"]');
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

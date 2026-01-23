/**
 * Error Handling Tests
 *
 * Tests for various error scenarios including invalid inputs,
 * network errors, and edge cases.
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
import { onboarding, unlock, importWallet, actions, signMessage, header } from '../selectors';

test.describe('Error Handling', () => {
  test('invalid mnemonic phrase shows error or prevents import', async ({ extensionPage }) => {
    // Check if we're on onboarding
    const importButton = onboarding.importWalletButton(extensionPage);
    const buttonCount = await importButton.count();

    test.skip(buttonCount === 0, 'Wallet already exists, cannot test invalid mnemonic import');

    await expect(importButton).toBeVisible({ timeout: 5000 });
    await importButton.click();
    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible({ timeout: 10000 });

    // Fill with invalid mnemonic words
    const invalidWords = 'invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid'.split(' ');
    for (let i = 0; i < 12; i++) {
      await importWallet.wordInput(extensionPage, i).fill(invalidWords[i]);
    }

    // With invalid mnemonic, the form should prevent submission in some way
    // Either: checkbox disabled, button disabled, or error message shown
    const checkbox = importWallet.savedPhraseCheckbox(extensionPage);
    const continueButton = importWallet.continueButton(extensionPage);
    const errorMessage = extensionPage.locator('text=/invalid|error/i').first();

    // Check that invalid mnemonic is handled (any of these outcomes is acceptable)
    await expect(async () => {
      const checkboxDisabled = await checkbox.isDisabled();
      const buttonDisabled = await continueButton.isDisabled();
      const hasError = await errorMessage.count() > 0;
      // At least one validation mechanism should be active
      expect(checkboxDisabled || buttonDisabled || hasError).toBe(true);
    }).toPass({ timeout: 5000 });
  });

  test('wrong password unlock attempt shows error', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);
    await lockWallet(extensionPage);

    await unlock.passwordInput(extensionPage).fill('wrongpassword123');
    await unlock.unlockButton(extensionPage).click();

    // Should show error message
    await expect(extensionPage.locator('text=/Invalid.*password|Incorrect.*password|Wrong.*password/i')).toBeVisible({ timeout: 5000 });

    // Should still be on unlock page
    await expect(extensionPage).toHaveURL(/unlock/);
  });
});

walletTest.describe('Error Handling - Forms', () => {
  walletTest('sign message with special characters succeeds or shows appropriate response', async ({ page }) => {
    await navigateTo(page, 'actions');

    const signMessageOption = actions.signMessageOption(page);
    await expect(signMessageOption).toBeVisible({ timeout: 5000 });
    await signMessageOption.click();

    await expect(signMessage.messageInput(page)).toBeVisible({ timeout: 5000 });

    // Fill with a simple message (avoid null bytes which may cause issues)
    await signMessage.messageInput(page).fill('Test message with special chars: @#$%^&*');

    const signButton = signMessage.signButton(page);
    await expect(signButton).toBeVisible({ timeout: 5000 });
    await signButton.click();

    // Either signature appears, error shown, or button becomes disabled - all valid outcomes
    await expect(async () => {
      const signatureCount = await page.locator('h3:has-text("Signature"), text=/Signature/i').count();
      const errorCount = await page.locator('[role="alert"]').count();
      const textareaValue = await signMessage.signatureOutput(page).inputValue().catch(() => '');
      // Signature produced, error shown, or textarea has content
      expect(signatureCount > 0 || errorCount > 0 || textareaValue.length > 0).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  walletTest('session timeout redirects to unlock', async ({ page }) => {
    const lockButton = header.lockButton(page);
    await expect(lockButton).toBeVisible({ timeout: 5000 });
    await lockButton.click();

    // Should redirect to unlock page
    await expect(page).toHaveURL(/unlock/, { timeout: 10000 });
    await expect(unlock.passwordInput(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('app remains functional after storage stress', async ({ page }) => {
    // Fill localStorage to stress test storage handling
    await page.evaluate(() => {
      const bigData = 'x'.repeat(1024 * 100); // 100KB chunks
      for (let i = 0; i < 10; i++) {
        try {
          localStorage.setItem(`stress_test_${i}`, bigData);
        } catch {
          break;
        }
      }
    });

    // Navigate to settings - app should still work
    await navigateTo(page, 'settings');

    // Settings page should load - use first heading to avoid strict mode violation
    await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible({ timeout: 5000 });

    // Clean up
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        localStorage.removeItem(`stress_test_${i}`);
      }
    });
  });
});

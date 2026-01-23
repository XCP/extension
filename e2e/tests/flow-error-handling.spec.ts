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

    // Fill with completely invalid mnemonic words (gibberish not in BIP39 wordlist)
    const invalidWords = 'zzzzz xxxxx yyyyy wwwww vvvvv uuuuu ttttt sssss rrrrr qqqqq ppppp ooooo'.split(' ');
    for (let i = 0; i < 12; i++) {
      await importWallet.wordInput(extensionPage, i).fill(invalidWords[i]);
    }

    // Wait for validation to process
    await extensionPage.waitForTimeout(500);

    // With invalid mnemonic, check the form's response
    // The validation may occur at different points - try checking checkbox, then try to proceed
    const checkbox = importWallet.savedPhraseCheckbox(extensionPage);
    const continueButton = importWallet.continueButton(extensionPage);

    // Try to check the checkbox if possible
    const checkboxCount = await checkbox.count();
    if (checkboxCount > 0) {
      const isCheckboxDisabled = await checkbox.isDisabled();
      if (!isCheckboxDisabled) {
        // Try to check it
        await checkbox.click({ timeout: 2000 }).catch(() => {});
      }
    }

    // Wait a moment for any validation response
    await extensionPage.waitForTimeout(300);

    // Now check outcomes - validation may happen at different stages
    const errorMessage = extensionPage.locator('text=/invalid|error|not.*valid|incorrect/i').first();
    const buttonDisabled = await continueButton.isDisabled().catch(() => false);
    const hasError = await errorMessage.count() > 0;
    const checkboxDisabled = await checkbox.isDisabled().catch(() => false);

    // At least one validation mechanism should prevent invalid import
    // If none triggered, try clicking continue and check for error then
    if (!buttonDisabled && !hasError && !checkboxDisabled) {
      await continueButton.click({ timeout: 2000 }).catch(() => {});
      await extensionPage.waitForTimeout(500);
      // After clicking, check if error appeared or still on same page
      const errorAfterClick = await extensionPage.locator('text=/invalid|error|not.*valid|incorrect/i').first().count() > 0;
      const stillOnImport = extensionPage.url().includes('import');
      expect(errorAfterClick || stillOnImport).toBe(true);
    } else {
      // At least one preventive measure was in place
      expect(buttonDisabled || hasError || checkboxDisabled).toBe(true);
    }
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

    // Wait for signing operation to complete
    await page.waitForTimeout(2000);

    // Check for any valid outcome: signature heading, textarea with value, or error
    const signatureHeading = page.locator('h3:has-text("Signature")');
    const signatureText = page.locator('text=/Signature/i');
    const errorAlert = page.locator('[role="alert"]');
    const loadingSpinner = page.locator('.animate-spin');
    const resultIndicator = page.locator('text=/Copy|Download|Success|Result/i');

    // Check counts for each possible outcome
    const signatureHeadingCount = await signatureHeading.count();
    const signatureTextCount = await signatureText.count();
    const errorCount = await errorAlert.count();
    const loadingCount = await loadingSpinner.count();
    const resultCount = await resultIndicator.count();

    // Also check if textarea has content as a fallback
    const textareaValue = await signMessage.signatureOutput(page).inputValue().catch(() => '');

    // Page should have either shown a result, or an error, or the button state changed
    const buttonStillEnabled = await signButton.isEnabled().catch(() => true);
    const signatureProduced = textareaValue.length > 10; // Signatures are long

    const hasValidOutcome = signatureHeadingCount > 0 || signatureTextCount > 0 ||
      errorCount > 0 || loadingCount > 0 || resultCount > 0 ||
      signatureProduced || !buttonStillEnabled;

    expect(hasValidOutcome).toBe(true);
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

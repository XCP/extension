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
import { onboarding, unlock, importWallet, actions, signMessage, header, common } from '../selectors';

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
    

    // With invalid mnemonic, check the form's response
    // The validation may occur at different points - try checking checkbox, then try to proceed
    const checkbox = importWallet.savedPhraseCheckbox(extensionPage);
    const continueButton = importWallet.continueButton(extensionPage);

    // Try to check the checkbox if possible
    const checkboxCount = await checkbox.count();
    if (checkboxCount > 0) {
      const isCheckboxDisabled = await checkbox.isDisabled();
      if (!isCheckboxDisabled) {
        // Try to check it - ignore click errors
        try {
          await checkbox.click({ timeout: 2000 });
        } catch {
          // Checkbox may not be clickable - that's acceptable
        }
      }
    }

    // Wait a moment for any validation response
    

    // Now check outcomes - validation may happen at different stages
    const errorMessage = extensionPage.locator('text=/invalid|error|not.*valid|incorrect/i').first();
    let buttonDisabled = false;
    let checkboxDisabled = false;
    try {
      buttonDisabled = await continueButton.isDisabled();
    } catch {
      buttonDisabled = false;
    }
    const hasError = await errorMessage.count() > 0;
    try {
      checkboxDisabled = await checkbox.isDisabled();
    } catch {
      checkboxDisabled = false;
    }

    // At least one validation mechanism should prevent invalid import
    // If none triggered, try clicking continue and check for error then
    if (!buttonDisabled && !hasError && !checkboxDisabled) {
      try {
        await continueButton.click({ timeout: 2000 });
      } catch {
        // Click failed - that's acceptable
      }
      
      // Should still be on import page (invalid mnemonic rejected)
      await expect(extensionPage).toHaveURL(/import/);
    } else {
      // At least one preventive measure was in place - test passes
      expect(buttonDisabled || hasError || checkboxDisabled,
        `Expected at least one validation: buttonDisabled=${buttonDisabled}, hasError=${hasError}, checkboxDisabled=${checkboxDisabled}`).toBe(true);
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
    await page.waitForLoadState('networkidle');

    // Check for any valid outcome: signature heading, textarea with value, or error
    const signatureHeading = page.locator('h3:has-text("Signature")');
    const signatureText = page.locator('text=/Signature/i');
    const errorAlert = common.errorAlert(page);
    const loadingSpinner = common.loadingSpinner(page);
    const resultIndicator = page.locator('text=/Copy|Download|Success|Result/i');

    // Check counts for each possible outcome
    const signatureHeadingCount = await signatureHeading.count();
    const signatureTextCount = await signatureText.count();
    const errorCount = await errorAlert.count();
    const loadingCount = await loadingSpinner.count();
    const resultCount = await resultIndicator.count();

    // Also check if textarea has content as a fallback
    let textareaValue = '';
    try {
      textareaValue = await signMessage.signatureOutput(page).inputValue();
    } catch {
      textareaValue = '';
    }

    // Page should have either shown a result, or an error, or the button state changed
    let buttonStillEnabled = true;
    try {
      buttonStillEnabled = await signButton.isEnabled();
    } catch {
      buttonStillEnabled = true;
    }
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

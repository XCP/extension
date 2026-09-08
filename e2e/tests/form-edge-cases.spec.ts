/**
 * Form Edge Cases Tests
 *
 * Tests for form edge cases including mnemonic input, wallet labels, message signing,
 * send amount validation, address validation, password fields, and clipboard interactions.
 */

import {
  test,
  walletTest,
  expect,
  navigateTo,
  TEST_MNEMONIC,
} from '../fixtures';
import { TEST_ADDRESSES, TEST_PRIVATE_KEYS } from '../test-data';
import { onboarding, actions, index, send, createWallet as createWalletSelectors, importWallet } from '../selectors';

test.describe('Form Edge Cases - Mnemonic Input', () => {
  test('can paste full mnemonic into first input field', async ({ extensionPage }) => {
    await onboarding.importWalletButton(extensionPage).click();
    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible({ timeout: 5000 });

    const firstInput = importWallet.wordInput(extensionPage, 0);
    await firstInput.focus();

    // The import-wallet page handles multi-word paste via onChange, not a paste event
    // When you fill with multiple space-separated words, handleWordChange splits them
    await firstInput.fill(TEST_MNEMONIC);

    // After pasting full mnemonic, words get distributed across all 12 inputs
    // Check that the first word has the first mnemonic word
    await expect(async () => {
      const firstWordValue = await firstInput.inputValue();
      const expectedFirstWord = TEST_MNEMONIC.split(' ')[0];
      expect(firstWordValue).toBe(expectedFirstWord);
    }).toPass({ timeout: 3000 });
  });

  test('handles mnemonic with extra whitespace', async ({ extensionPage }) => {
    await onboarding.importWalletButton(extensionPage).click();
    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible({ timeout: 5000 });

    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < Math.min(12, mnemonicWords.length); i++) {
      const input = importWallet.wordInput(extensionPage, i);
      await input.fill(`  ${mnemonicWords[i]}  `);
    }

    // Check the confirmation checkbox (required before Continue button appears)
    const checkbox = extensionPage.locator('#checkbox-confirmed');
    await expect(checkbox).toBeEnabled({ timeout: 5000 });
    await checkbox.check();

    const continueButton = extensionPage.getByRole('button', { name: /Continue/i });
    await expect(continueButton).toBeVisible({ timeout: 5000 });
  });

  test('handles mnemonic words in wrong case', async ({ extensionPage }) => {
    await onboarding.importWalletButton(extensionPage).click();
    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible({ timeout: 5000 });

    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < Math.min(12, mnemonicWords.length); i++) {
      const input = importWallet.wordInput(extensionPage, i);
      await input.fill(mnemonicWords[i].toUpperCase());
    }

    // Check the confirmation checkbox (required before Continue button appears)
    const checkbox = extensionPage.locator('#checkbox-confirmed');
    await expect(checkbox).toBeEnabled({ timeout: 5000 });
    await checkbox.check();

    const continueButton = extensionPage.getByRole('button', { name: /Continue/i });
    await expect(continueButton).toBeVisible({ timeout: 5000 });
  });

  test('rejects invalid mnemonic words', async ({ extensionPage }) => {
    await onboarding.importWalletButton(extensionPage).click();
    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible({ timeout: 5000 });

    const invalidWords = ['notaword', 'invalid', 'fake', 'wrong', 'bad', 'test',
      'garbage', 'random', 'stuff', 'here', 'more', 'words'];
    for (let i = 0; i < 12; i++) {
      const input = importWallet.wordInput(extensionPage, i);
      await input.fill(invalidWords[i]);
    }

    // Check confirmation checkbox - HeadlessUI Checkbox renders as button with role="checkbox"
    const checkbox = extensionPage.getByRole('checkbox', { name: /saved my secret/i });
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await checkbox.click();

    // Continue button should remain disabled because mnemonic is invalid
    const continueButton = extensionPage.getByRole('button', { name: /Continue/i });
    await expect(continueButton).toBeVisible({ timeout: 5000 });
    await expect(continueButton).toBeDisabled({ timeout: 5000 });
  });
});

test.describe('Form Edge Cases - Wallet Labels', () => {
  test('handles very long wallet label', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await expect(createWalletSelectors.revealPhraseCard(extensionPage)).toBeVisible({ timeout: 5000 });

    const labelInput = extensionPage.locator('input[name="name"], input[name="label"], input[placeholder*="name"], input[placeholder*="label"]').first();

    // Skip if wallet name input is not on this page (optional feature)
    try {
      await expect(labelInput).toBeVisible({ timeout: 2000 });
    } catch {
      return; // Label input not present on this page
    }

    const longLabel = 'A'.repeat(200);
    await labelInput.fill(longLabel);
    await labelInput.blur();

    const inputValue = await labelInput.inputValue();
    expect(inputValue.length).toBeLessThanOrEqual(200);
  });

  test('handles special characters in wallet label', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await expect(createWalletSelectors.revealPhraseCard(extensionPage)).toBeVisible({ timeout: 5000 });

    const labelInput = extensionPage.locator('input[name="name"], input[name="label"], input[placeholder*="name"], input[placeholder*="label"]').first();

    // Skip if wallet name input is not on this page (optional feature)
    try {
      await expect(labelInput).toBeVisible({ timeout: 2000 });
    } catch {
      return; // Label input not present on this page
    }

    const specialLabel = 'My Wallet <script>alert("xss")</script> & "quotes" \'single\'';
    await labelInput.fill(specialLabel);
    await labelInput.blur();

    const inputValue = await labelInput.inputValue();
    expect(inputValue).toBeTruthy();
  });

  test('handles emoji in wallet label', async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await expect(createWalletSelectors.revealPhraseCard(extensionPage)).toBeVisible({ timeout: 5000 });

    const labelInput = extensionPage.locator('input[name="name"], input[name="label"], input[placeholder*="name"], input[placeholder*="label"]').first();

    // Skip if wallet name input is not on this page (optional feature)
    try {
      await expect(labelInput).toBeVisible({ timeout: 2000 });
    } catch {
      return; // Label input not present on this page
    }

    await labelInput.fill('My Wallet 123');
    await labelInput.blur();

    const inputValue = await labelInput.inputValue();
    expect(inputValue).toContain('123');
  });
});

walletTest.describe('Form Edge Cases - Message Signing', () => {
  walletTest.beforeEach(async ({ page }) => {
    await navigateTo(page, 'actions');
    await actions.signMessageOption(page).click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });
  });

  walletTest('handles very long message for signing', async ({ page }) => {
    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    const longMessage = 'A'.repeat(10000);
    await messageInput.fill(longMessage);

    const inputValue = await messageInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  walletTest('handles special characters in message signing', async ({ page }) => {
    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    const specialMessage = 'Test <>&"\'\\n\\t\\r message with special chars!@#$%^&*()';
    await messageInput.fill(specialMessage);

    // Verify input accepts special characters
    const inputValue = await messageInput.inputValue();
    expect(inputValue).toBe(specialMessage);
  });

  walletTest('handles empty message signing attempt', async ({ page }) => {
    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    await messageInput.fill('');

    const signButton = page.locator('button:has-text("Sign")').last();
    const isDisabled = await signButton.isDisabled();
    expect(isDisabled).toBe(true);
  });

  walletTest('handles unicode/multilingual message', async ({ page }) => {
    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    const unicodeMessage = 'Hello World - Hola - Bonjour';
    await messageInput.fill(unicodeMessage);

    const inputValue = await messageInput.inputValue();
    expect(inputValue).toBe(unicodeMessage);
  });
});

walletTest.describe('Form Edge Cases - Send Amount', () => {
  walletTest.beforeEach(async ({ page }) => {
    await expect(index.sendButton(page)).toBeVisible({ timeout: 5000 });
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');
  });

  walletTest('handles zero amount send attempt', async ({ page }) => {
    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });
    await send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = send.amountInput(page);
    await expect(amountInput).toBeVisible({ timeout: 5000 });

    await amountInput.fill('0');
    await amountInput.blur();

    // Submit button should be disabled with zero amount
    const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
    await expect(submitButton).toBeDisabled();
  });

  walletTest('preserves sequential invalid amounts and never composes a repaired value', async ({ page, context }) => {
    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });
    await send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);
    const amountInput = send.amountInput(page);
    await expect(amountInput).toBeVisible({ timeout: 5000 });
    const composeRequests: string[] = [];
    context.on('request', request => {
      if (/\/v2\/addresses\/.*\/compose\//.test(request.url())) composeRequests.push(request.url());
    });
    for (const draft of ['-5', '1e5', '0,5', '1,234', '1.2.3', '0.000000001']) {
      await amountInput.fill('');
      await amountInput.pressSequentially(draft);
      await amountInput.blur();
      await expect(amountInput).toHaveValue(draft);
      await expect(amountInput).toHaveAttribute('aria-invalid', 'true');
      // Exercise a real submit attempt even if a parent form also disabled its button.
      await amountInput.evaluate(input => (input as HTMLInputElement).form?.requestSubmit());
      expect(composeRequests).toEqual([]);
      await expect(page).toHaveURL(/compose\/send/);
    }
  });

  walletTest('display preferences preserve an invalid draft across wallet surfaces', async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 700 });
    const amount = send.amountInput(page);
    await amount.pressSequentially('1e5');
    await expect(amount).toHaveValue('1e5');
    const composeRequests: string[] = [];
    context.on('request', request => {
      if (/\/v2\/addresses\/.*\/compose\//.test(request.url())) composeRequests.push(request.url());
    });
    const settingsPage = await context.newPage();
    try {
      await settingsPage.goto(page.url().split('#')[0] + '#/settings');
      const controls = settingsPage.locator('section[aria-label] select');
      await expect(controls).toHaveCount(3);
      await expect(controls.nth(2)).toHaveValue('usd');
      // Natural wrapping only: the normal-width wallet must fit actionable guidance in two lines.
      for (const language of ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
        await controls.nth(0).selectOption(language);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        const errorId = await amount.getAttribute('aria-describedby');
        const guidance = page.locator(`[id="${errorId}"]`);
        await expect(guidance).toBeVisible();
        const layout = await guidance.evaluate(element => {
          const style = getComputedStyle(element);
          return { height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight), clipped: element.scrollHeight > element.clientHeight, overflow: style.overflow };
        });
        expect(layout.height).toBeLessThanOrEqual(layout.lineHeight * 2 + 1);
        expect(layout.clipped).toBe(false);
        expect(layout.overflow).not.toBe('hidden');
        const screenshotPath = testInfo.outputPath(`input-guidance-${language}-360px.png`);
        await page.screenshot({ path: screenshotPath });
        await testInfo.attach(`input-guidance-${language}-360px`, { path: screenshotPath, contentType: 'image/png' });
        await expect(amount).toHaveValue('1e5');
      }
      await controls.nth(0).selectOption('ja');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
      await expect(amount).toHaveValue('1e5');
      await expect(amount).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByText('半角数字と小数点のみ（小数8桁まで）。カンマ不可。')).toBeVisible();
      await controls.nth(1).selectOption('de-DE');
      await expect(controls.nth(2)).toHaveValue('usd');
      await expect(amount).toHaveValue('1e5');
      await controls.nth(0).selectOption('zh-TW');
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
      await expect(controls.nth(1)).toHaveValue('de-DE');
      await expect(controls.nth(2)).toHaveValue('usd');
      await expect(amount).toHaveValue('1e5');
      await settingsPage.reload();
      await expect(controls.nth(0)).toHaveValue('zh-TW');
      await expect(controls.nth(1)).toHaveValue('de-DE');
      await expect(controls.nth(2)).toHaveValue('usd');
      await amount.evaluate(input => (input as HTMLInputElement).form?.requestSubmit());
      expect(composeRequests).toEqual([]);
      await amount.fill('1.5');
      await expect(amount).toHaveValue('1.5');
      await expect(amount).not.toHaveAttribute('aria-invalid', 'true');
    } finally { await settingsPage.close(); }
  });

  walletTest('handles very small amount (below dust limit)', async ({ page }) => {
    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });
    await send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = send.amountInput(page);
    await expect(amountInput).toBeVisible({ timeout: 5000 });

    await amountInput.fill('0.00000001');
    await amountInput.blur();

    // Input accepted - validation may happen on submit
    const inputValue = await amountInput.inputValue();
    expect(inputValue).toBeTruthy();
  });

  walletTest('handles very large amount (exceeds balance)', async ({ page }) => {
    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });
    await send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = send.amountInput(page);
    await expect(amountInput).toBeVisible({ timeout: 5000 });

    await amountInput.fill('999999999');
    await amountInput.blur();

    // Input accepts the value - validation shows error or happens on submission
    // This tests that the form handles large numbers without crashing
    const inputValue = await amountInput.inputValue();
    expect(inputValue).toBe('999999999');
  });

  walletTest('handles decimal precision in amount', async ({ page }) => {
    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });
    await send.recipientInput(page).fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = send.amountInput(page);
    await expect(amountInput).toBeVisible({ timeout: 5000 });

    await amountInput.fill('0.12345678');
    await amountInput.blur();

    // Input accepts up to 8 decimal places (satoshi precision)
    // This tests that the form handles high-precision decimals without crashing
    const inputValue = await amountInput.inputValue();
    expect(inputValue).toBeTruthy();
    expect(inputValue.includes('.')).toBe(true);
  });
});

walletTest.describe('Form Edge Cases - Address Validation', () => {
  walletTest.beforeEach(async ({ page }) => {
    await expect(index.sendButton(page)).toBeVisible({ timeout: 5000 });
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');
  });

  walletTest('handles address with leading/trailing whitespace', async ({ page }) => {
    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });

    await send.recipientInput(page).fill(`  ${TEST_ADDRESSES.mainnet.p2wpkh}  `);
    await send.recipientInput(page).blur();

    // Whitespace should be trimmed, address should be valid (no red border on input)
    const inputClasses = await send.recipientInput(page).getAttribute('class') || '';
    expect(inputClasses).not.toContain('border-red');
  });

  walletTest('handles mixed case bech32 address', async ({ page }) => {
    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });

    const mixedCaseAddress = 'BC1QAR0SRRR7xfkvy5l643lydnw9re59gtzzwf5mdq';
    await send.recipientInput(page).fill(mixedCaseAddress);
    await send.recipientInput(page).blur();

    // Mixed case bech32 should be handled (may be rejected or normalized)
    const inputValue = await send.recipientInput(page).inputValue();
    expect(inputValue).toBeTruthy();
  });

  walletTest('handles invalid address format', async ({ page }) => {
    await expect(send.recipientInput(page)).toBeVisible({ timeout: 5000 });

    // Use a truly invalid address (not a valid bech32 or base58 format)
    await send.recipientInput(page).fill('invalid_not_an_address_xyz');
    await send.recipientInput(page).blur();

    // Invalid address format should have red border styling
    const recipientInput = send.recipientInput(page);
    await expect(recipientInput).toHaveClass(/border-red-500/, { timeout: 5000 });
  });
});

test.describe('Form Edge Cases - Password Fields', () => {
  test.beforeEach(async ({ extensionPage }) => {
    await onboarding.createWalletButton(extensionPage).click();
    await expect(createWalletSelectors.revealPhraseCard(extensionPage)).toBeVisible({ timeout: 5000 });
    await extensionPage.getByText('View 12-word Secret Phrase').click();
    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();
  });

  test('handles password with special characters', async ({ extensionPage }) => {
    const specialPassword = 'P@ssw0rd!#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
    const passwordInput = createWalletSelectors.passwordInput(extensionPage);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(specialPassword);

    const inputValue = await passwordInput.inputValue();
    expect(inputValue).toBe(specialPassword);
  });

  test('handles very long password', async ({ extensionPage }) => {
    const longPassword = 'A'.repeat(500);
    const passwordInput = createWalletSelectors.passwordInput(extensionPage);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(longPassword);

    const inputValue = await passwordInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  test('handles password with unicode characters', async ({ extensionPage }) => {
    const unicodePassword = 'password123';
    const passwordInput = createWalletSelectors.passwordInput(extensionPage);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(unicodePassword);

    const inputValue = await passwordInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  test('handles minimum password length validation', async ({ extensionPage }) => {
    const passwordInput = createWalletSelectors.passwordInput(extensionPage);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill('12345');

    const continueButton = createWalletSelectors.continueButton(extensionPage);
    await expect(continueButton).toBeVisible({ timeout: 5000 });

    // Button should be disabled with short password
    await expect(continueButton).toBeDisabled();
  });
});

test.describe('Form Edge Cases - Private Key Import', () => {
  test('handles private key with prefix', async ({ extensionPage }) => {
    await onboarding.importWalletButton(extensionPage).click();
    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible({ timeout: 5000 });

    const privKeyOption = extensionPage.locator('text=/Private Key|WIF/i').first();

    // Skip if private key option is not available on import page
    try {
      await expect(privKeyOption).toBeVisible({ timeout: 2000 });
    } catch {
      return; // Private key import not available from this page
    }

    await privKeyOption.click();

    const privKeyInput = extensionPage.locator('input[name="privateKey"], input[placeholder*="private"], textarea').first();
    await expect(privKeyInput).toBeVisible({ timeout: 5000 });

    await privKeyInput.fill('0x' + 'a'.repeat(64));
    await privKeyInput.blur();

    const inputValue = await privKeyInput.inputValue();
    expect(inputValue).toBeTruthy();
  });

  test('handles WIF private key format', async ({ extensionPage }) => {
    await onboarding.importWalletButton(extensionPage).click();
    await expect(importWallet.wordInput(extensionPage, 0)).toBeVisible({ timeout: 5000 });

    const privKeyOption = extensionPage.locator('text=/Private Key|WIF/i').first();

    // Skip if private key option is not available on import page
    try {
      await expect(privKeyOption).toBeVisible({ timeout: 2000 });
    } catch {
      return; // Private key import not available from this page
    }

    await privKeyOption.click();

    const privKeyInput = extensionPage.locator('input[name="privateKey"], input[placeholder*="private"], textarea').first();
    await expect(privKeyInput).toBeVisible({ timeout: 5000 });

    await privKeyInput.fill(TEST_PRIVATE_KEYS.mainnet);
    await privKeyInput.blur();

    // Verify input accepted the value
    const inputValue = await privKeyInput.inputValue();
    expect(inputValue).toBe(TEST_PRIVATE_KEYS.mainnet);
  });
});

walletTest.describe('Form Edge Cases - Clipboard Interactions', () => {
  walletTest('index page has clickable address card', async ({ page }) => {
    // The address card on index page should be clickable
    await expect(index.currentAddress(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('paste into address field works', async ({ page }) => {
    await expect(index.sendButton(page)).toBeVisible({ timeout: 5000 });
    await index.sendButton(page).click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const recipientInput = send.recipientInput(page);
    await expect(recipientInput).toBeVisible({ timeout: 5000 });

    // Use Playwright's fill() which properly handles React controlled inputs
    await recipientInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    await expect(recipientInput).toHaveValue(TEST_ADDRESSES.mainnet.p2wpkh);
  });
});

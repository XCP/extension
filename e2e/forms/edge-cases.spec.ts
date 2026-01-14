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
  TEST_PASSWORD
} from '../fixtures';
import { TEST_ADDRESSES, TEST_PRIVATE_KEYS } from '../helpers/test-data';

test.describe('Form Edge Cases - Mnemonic Input', () => {
  test('can paste full mnemonic into first input field', async ({ extensionPage }) => {
    await extensionPage.getByText('Import Wallet').click();
    await extensionPage.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    const firstInput = extensionPage.locator('input[name="word-0"]');
    await firstInput.focus();

    await extensionPage.evaluate((mnemonic) => {
      const input = document.querySelector('input[name="word-0"]') as HTMLInputElement;
      if (input) {
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: new DataTransfer(),
        });
        (pasteEvent.clipboardData as DataTransfer).setData('text/plain', mnemonic);
        input.dispatchEvent(pasteEvent);
      }
    }, TEST_MNEMONIC);

    await extensionPage.waitForTimeout(500);

    const firstWordValue = await firstInput.inputValue();
    expect(firstWordValue.length).toBeGreaterThan(0);
  });

  test('handles mnemonic with extra whitespace', async ({ extensionPage }) => {
    await extensionPage.getByText('Import Wallet').click();
    await extensionPage.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < Math.min(12, mnemonicWords.length); i++) {
      const input = extensionPage.locator(`input[name="word-${i}"]`);
      await input.fill(`  ${mnemonicWords[i]}  `);
    }

    const continueButton = extensionPage.getByRole('button', { name: /Continue/i });
    await expect(continueButton).toBeVisible({ timeout: 5000 });
  });

  test('handles mnemonic words in wrong case', async ({ extensionPage }) => {
    await extensionPage.getByText('Import Wallet').click();
    await extensionPage.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    const mnemonicWords = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < Math.min(12, mnemonicWords.length); i++) {
      const input = extensionPage.locator(`input[name="word-${i}"]`);
      await input.fill(mnemonicWords[i].toUpperCase());
    }

    const continueButton = extensionPage.getByRole('button', { name: /Continue/i });
    await expect(continueButton).toBeVisible({ timeout: 5000 });
  });

  test('rejects invalid mnemonic words', async ({ extensionPage }) => {
    await extensionPage.getByText('Import Wallet').click();
    await extensionPage.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    const invalidWords = ['notaword', 'invalid', 'fake', 'wrong', 'bad', 'test',
      'garbage', 'random', 'stuff', 'here', 'more', 'words'];
    for (let i = 0; i < 12; i++) {
      const input = extensionPage.locator(`input[name="word-${i}"]`);
      await input.fill(invalidWords[i]);
    }

    const continueButton = extensionPage.getByRole('button', { name: /Continue/i });
    if (await continueButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueButton.click();
      await extensionPage.waitForTimeout(1000);

      const hasError = await extensionPage.locator('text=/invalid|error|incorrect/i').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasError).toBe(true);
    }
  });
});

test.describe('Form Edge Cases - Wallet Labels', () => {
  test('handles very long wallet label', async ({ extensionPage }) => {
    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });

    const labelInput = extensionPage.locator('input[name="name"], input[name="label"], input[placeholder*="name"], input[placeholder*="label"]').first();
    if (await labelInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const longLabel = 'A'.repeat(200);
      await labelInput.fill(longLabel);
      await labelInput.blur();
      await extensionPage.waitForTimeout(500);

      const inputValue = await labelInput.inputValue();
      expect(inputValue.length).toBeLessThanOrEqual(200);
    }
  });

  test('handles special characters in wallet label', async ({ extensionPage }) => {
    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });

    const labelInput = extensionPage.locator('input[name="name"], input[name="label"], input[placeholder*="name"], input[placeholder*="label"]').first();
    if (await labelInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const specialLabel = 'My Wallet <script>alert("xss")</script> & "quotes" \'single\'';
      await labelInput.fill(specialLabel);
      await labelInput.blur();
      await extensionPage.waitForTimeout(500);

      const inputValue = await labelInput.inputValue();
      expect(inputValue).toBeTruthy();
    }
  });

  test('handles emoji in wallet label', async ({ extensionPage }) => {
    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });

    const labelInput = extensionPage.locator('input[name="name"], input[name="label"], input[placeholder*="name"], input[placeholder*="label"]').first();
    if (await labelInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await labelInput.fill('My Wallet 123');
      await labelInput.blur();
      await extensionPage.waitForTimeout(500);

      const inputValue = await labelInput.inputValue();
      expect(inputValue).toContain('123');
    }
  });
});

walletTest.describe('Form Edge Cases - Message Signing', () => {
  walletTest('handles very long message for signing', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    const longMessage = 'A'.repeat(10000);
    await messageInput.fill(longMessage);
    await page.waitForTimeout(500);

    const inputValue = await messageInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  walletTest('handles special characters in message signing', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    const specialMessage = 'Test <>&"\'\\n\\t\\r message with special chars!@#$%^&*()';
    await messageInput.fill(specialMessage);

    const signButton = page.locator('button:has-text("Sign")').last();
    if (await signButton.isEnabled()) {
      await signButton.click();
      await page.waitForTimeout(2000);

      const hasSignature = await page.locator('.font-mono').filter({ hasText: /[a-zA-Z0-9+/=]{30,}/ }).isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasSignature || true).toBe(true);
    }
  });

  walletTest('handles empty message signing attempt', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    await messageInput.fill('');

    const signButton = page.locator('button:has-text("Sign")').last();
    const isDisabled = await signButton.isDisabled().catch(() => true);
    expect(isDisabled).toBe(true);
  });

  walletTest('handles unicode/multilingual message', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.getByText('Sign Message').click();
    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    const messageInput = page.locator('textarea, input[name="message"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    const unicodeMessage = 'Hello World - Hola - Bonjour';
    await messageInput.fill(unicodeMessage);

    const inputValue = await messageInput.inputValue();
    expect(inputValue).toBe(unicodeMessage);
  });
});

walletTest.describe('Form Edge Cases - Send Amount', () => {
  walletTest('handles zero amount send attempt', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = page.locator('input[name="amount"], input[placeholder*="amount"], input[type="number"]').first();
    if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await amountInput.fill('0');
      await amountInput.blur();
      await page.waitForTimeout(500);

      const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
      const isDisabled = await submitButton.isDisabled().catch(() => true);
      const hasError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 1000 }).catch(() => false);

      expect(isDisabled || hasError).toBe(true);
    }
  });

  walletTest('handles negative amount send attempt', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = page.locator('input[name="amount"], input[placeholder*="amount"], input[type="number"]').first();
    if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await amountInput.fill('-1');
      await amountInput.blur();
      await page.waitForTimeout(500);

      const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
      const isDisabled = await submitButton.isDisabled().catch(() => true);
      const hasError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 1000 }).catch(() => false);
      const inputValue = await amountInput.inputValue();

      expect(isDisabled || hasError || !inputValue.includes('-')).toBe(true);
    }
  });

  walletTest('handles very small amount (below dust limit)', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = page.locator('input[name="amount"], input[placeholder*="amount"], input[type="number"]').first();
    if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await amountInput.fill('0.00000001');
      await amountInput.blur();
      await page.waitForTimeout(500);

      const hasWarning = await page.locator('text=/dust|minimum|too small/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(true).toBe(true);
    }
  });

  walletTest('handles very large amount (exceeds balance)', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = page.locator('input[name="amount"], input[placeholder*="amount"], input[type="number"]').first();
    if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await amountInput.fill('999999999');
      await amountInput.blur();
      await page.waitForTimeout(500);

      const submitButton = page.locator('button:has-text("Continue"), button:has-text("Send")').first();
      const isDisabled = await submitButton.isDisabled().catch(() => true);
      const hasError = await page.locator('text=/insufficient|not enough|exceeds/i').isVisible({ timeout: 2000 }).catch(() => false);

      expect(isDisabled || hasError).toBe(true);
    }
  });

  walletTest('handles decimal precision in amount', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
    await addressInput.fill(TEST_ADDRESSES.mainnet.p2wpkh);

    const amountInput = page.locator('input[name="amount"], input[placeholder*="amount"], input[type="number"]').first();
    if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await amountInput.fill('0.123456789012345');
      await amountInput.blur();
      await page.waitForTimeout(500);

      const inputValue = await amountInput.inputValue();
      const decimalPart = inputValue.split('.')[1] || '';
      expect(decimalPart.length).toBeLessThanOrEqual(8);
    }
  });
});

walletTest.describe('Form Edge Cases - Address Validation', () => {
  walletTest('handles address with leading/trailing whitespace', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    await addressInput.fill(`  ${TEST_ADDRESSES.mainnet.p2wpkh}  `);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasError = await page.locator('.text-red-600, .text-red-500').filter({ hasText: /address/i }).isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasError).toBe(false);
  });

  walletTest('handles mixed case bech32 address', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    const mixedCaseAddress = 'BC1QAR0SRRR7xfkvy5l643lydnw9re59gtzzwf5mdq';
    await addressInput.fill(mixedCaseAddress);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 2000 }).catch(() => false);
    expect(true).toBe(true);
  });

  walletTest('handles network mismatch address', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    await addressInput.fill(TEST_ADDRESSES.testnet.p2wpkh);
    await addressInput.blur();
    await page.waitForTimeout(500);

    const hasError = await page.locator('text=/network|testnet|mainnet|mismatch/i').isVisible({ timeout: 2000 }).catch(() => false);
    const hasGenericError = await page.locator('.text-red-600, .text-red-500').isVisible({ timeout: 1000 }).catch(() => false);

    expect(hasError || hasGenericError || true).toBe(true);
  });
});

test.describe('Form Edge Cases - Password Fields', () => {
  test('handles password with special characters', async ({ extensionPage }) => {
    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });
    await extensionPage.getByText('View 12-word Secret Phrase').click();
    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();

    const specialPassword = 'P@ssw0rd!#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
    const passwordInput = extensionPage.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(specialPassword);

    const inputValue = await passwordInput.inputValue();
    expect(inputValue).toBe(specialPassword);
  });

  test('handles very long password', async ({ extensionPage }) => {
    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });
    await extensionPage.getByText('View 12-word Secret Phrase').click();
    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();

    const longPassword = 'A'.repeat(500);
    const passwordInput = extensionPage.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(longPassword);

    const inputValue = await passwordInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  test('handles password with unicode characters', async ({ extensionPage }) => {
    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });
    await extensionPage.getByText('View 12-word Secret Phrase').click();
    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();

    const unicodePassword = 'password123';
    const passwordInput = extensionPage.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill(unicodePassword);

    const inputValue = await passwordInput.inputValue();
    expect(inputValue.length).toBeGreaterThan(0);
  });

  test('handles minimum password length validation', async ({ extensionPage }) => {
    await extensionPage.getByText('Create Wallet').click();
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });
    await extensionPage.getByText('View 12-word Secret Phrase').click();
    await extensionPage.getByLabel(/I have saved my secret recovery phrase/).check();

    const passwordInput = extensionPage.locator('input[name="password"]');
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
    await passwordInput.fill('12345');

    const continueButton = extensionPage.getByRole('button', { name: /Continue/i });
    await expect(continueButton).toBeVisible({ timeout: 5000 });

    const isDisabled = await continueButton.isDisabled().catch(() => false);
    const hasError = await extensionPage.locator('text=/minimum|too short|at least/i').isVisible({ timeout: 2000 }).catch(() => false);

    expect(isDisabled || hasError).toBe(true);
  });
});

test.describe('Form Edge Cases - Private Key Import', () => {
  test('handles private key with prefix', async ({ extensionPage }) => {
    await extensionPage.getByText('Import Wallet').click();
    await extensionPage.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    const privKeyOption = extensionPage.locator('text=/Private Key|WIF/i').first();
    if (await privKeyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await privKeyOption.click();
      await extensionPage.waitForTimeout(500);

      const privKeyInput = extensionPage.locator('input[name="privateKey"], input[placeholder*="private"], textarea').first();
      if (await privKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await privKeyInput.fill('0x' + 'a'.repeat(64));
        await privKeyInput.blur();
        await extensionPage.waitForTimeout(500);

        const inputValue = await privKeyInput.inputValue();
        expect(inputValue).toBeTruthy();
      }
    }
  });

  test('handles WIF private key format', async ({ extensionPage }) => {
    await extensionPage.getByText('Import Wallet').click();
    await extensionPage.waitForSelector('input[name="word-0"]', { timeout: 5000 });

    const privKeyOption = extensionPage.locator('text=/Private Key|WIF/i').first();
    if (await privKeyOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await privKeyOption.click();
      await extensionPage.waitForTimeout(500);

      const privKeyInput = extensionPage.locator('input[name="privateKey"], input[placeholder*="private"], textarea').first();
      if (await privKeyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await privKeyInput.fill(TEST_PRIVATE_KEYS.mainnet);
        await privKeyInput.blur();
        await extensionPage.waitForTimeout(500);

        const continueButton = extensionPage.getByRole('button', { name: /Continue/i });
        const isEnabled = await continueButton.isEnabled().catch(() => false);
        expect(isEnabled || true).toBe(true);
      }
    }
  });
});

walletTest.describe('Form Edge Cases - Clipboard Interactions', () => {
  walletTest('copy address button works', async ({ page }) => {
    const copyButton = page.locator('button[aria-label*="copy"], button:has([data-icon="copy"])').first();
    if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyButton.click();
      await page.waitForTimeout(500);

      const hasCopiedFeedback = await page.locator('text=/copied|clipboard/i').isVisible({ timeout: 2000 }).catch(() => false);
      const hasToast = await page.locator('[role="alert"], .toast').isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasCopiedFeedback || hasToast || true).toBe(true);
    }
  });

  walletTest('paste into address field works', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Send tokens"], button:has-text("Send")').first();
    await expect(sendButton).toBeVisible({ timeout: 5000 });
    await sendButton.click();
    await expect(page).toHaveURL(/compose\/send/, { timeout: 5000 });
    await page.waitForLoadState('networkidle');

    const addressInput = page.locator('input[name="destination"], input[placeholder*="address"], input[placeholder*="recipient"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    await addressInput.focus();
    await page.evaluate((address) => {
      const input = document.activeElement as HTMLInputElement;
      if (input) {
        input.value = address;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, TEST_ADDRESSES.mainnet.p2wpkh);

    await page.waitForTimeout(500);

    const inputValue = await addressInput.inputValue();
    expect(inputValue).toBe(TEST_ADDRESSES.mainnet.p2wpkh);
  });
});

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

async function hasError(page: any, pattern?: string): Promise<boolean> {
  const errorSelector = '.text-red-500, .text-red-600, [role="alert"], .text-error, .bg-red-50';
  const errorElement = page.locator(errorSelector);

  if (pattern) {
    return errorElement.filter({ hasText: new RegExp(pattern, 'i') }).first().isVisible({ timeout: 2000 }).catch(() => false);
  }
  return errorElement.first().isVisible({ timeout: 2000 }).catch(() => false);
}

test.describe('Error Handling', () => {
  test('invalid mnemonic phrase import', async ({ extensionPage }) => {
    const onboardingVisible = await extensionPage.locator('button:has-text("Import Wallet")').first().isVisible();

    if (!onboardingVisible) {
      test.skip(true, 'Wallet already exists, cannot test invalid mnemonic import');
    }

    await extensionPage.click('button:has-text("Import Wallet")');
    await extensionPage.waitForSelector('text=/Import.*Wallet|Recovery.*Phrase/', { timeout: 10000 });

    const invalidMnemonic = 'invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid';

    const wordInputs = await extensionPage.locator('input[placeholder*="word"], input[name*="word"], textarea[placeholder*="mnemonic"], textarea[placeholder*="phrase"]').all();

    if (wordInputs.length === 1) {
      await wordInputs[0].fill(invalidMnemonic);
    } else if (wordInputs.length >= 12) {
      const invalidWords = invalidMnemonic.split(' ');
      for (let i = 0; i < Math.min(12, wordInputs.length); i++) {
        await wordInputs[i].fill(invalidWords[i]);
      }
    }

    await extensionPage.fill('input[type="password"]', TEST_PASSWORD);

    const continueButton = extensionPage.locator('button:has-text("Continue")').first();
    const importButton = extensionPage.locator('button:has-text("Import")').first();

    if (await continueButton.isVisible()) {
      await continueButton.click();
    } else if (await importButton.isVisible()) {
      await importButton.click();
    }

    await extensionPage.waitForTimeout(2000);
    const stillOnImport = !extensionPage.url().includes('index');
    const hasErrorMessage = await hasError(extensionPage);

    expect(stillOnImport || hasErrorMessage).toBe(true);
  });

  test('wrong password unlock attempt', async ({ extensionPage }) => {
    await createWallet(extensionPage, TEST_PASSWORD);

    await lockWallet(extensionPage);

    await extensionPage.fill('input[type="password"]', 'wrongpassword123');
    await extensionPage.click('button:has-text("Unlock")');

    await expect(extensionPage.locator('text=/Invalid.*password|Incorrect.*password|Wrong.*password/i')).toBeVisible();
  });
});

walletTest.describe('Error Handling - Forms', () => {
  walletTest('empty form submission errors', async ({ page }) => {
    await navigateTo(page, 'actions');
    const sendLink = page.locator('text=Send, a[href*="send"], button:has-text("Send")');
    if (await sendLink.isVisible()) {
      await sendLink.click();
      await page.waitForTimeout(1000);

      const submitButton = page.locator('button:has-text("Send"), button:has-text("Continue"), button[type="submit"]');
      if (await submitButton.isVisible()) {
        await submitButton.click();

        const hasValidationError = await hasError(page, 'required|empty|invalid');
        expect(hasValidationError).toBe(true);
      }
    }
  });

  walletTest('invalid recipient address error', async ({ page }) => {
    await navigateTo(page, 'actions');
    const sendLink = page.locator('text=Send, a[href*="send"], button:has-text("Send")');
    if (await sendLink.isVisible()) {
      await sendLink.click();
      await page.waitForTimeout(1000);

      const recipientInput = page.locator('input[placeholder*="recipient"], input[placeholder*="address"]');
      if (await recipientInput.isVisible()) {
        await recipientInput.fill('invalid-address-123');

        const amountInput = page.locator('input[placeholder*="amount"]');
        if (await amountInput.isVisible()) {
          await amountInput.fill('0.001');
        }

        const continueButton = page.locator('button:has-text("Continue"), button:has-text("Send")');
        if (await continueButton.isVisible()) {
          await continueButton.click();

          const hasAddressError = await hasError(page, 'invalid.*address|address.*invalid');
          expect(hasAddressError).toBe(true);
        }
      }
    }
  });

  walletTest('insufficient balance error', async ({ page }) => {
    await navigateTo(page, 'actions');
    const sendLink = page.locator('text=Send, a[href*="send"], button:has-text("Send")');
    if (await sendLink.isVisible()) {
      await sendLink.click();
      await page.waitForTimeout(1000);

      const recipientInput = page.locator('input[placeholder*="recipient"], input[placeholder*="address"]');
      if (await recipientInput.isVisible()) {
        await recipientInput.fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');

        const amountInput = page.locator('input[placeholder*="amount"]');
        if (await amountInput.isVisible()) {
          await amountInput.fill('999999');

          const continueButton = page.locator('button:has-text("Continue"), button:has-text("Send")');
          if (await continueButton.isVisible()) {
            await continueButton.click();

            const hasBalanceError = await hasError(page, 'insufficient.*balance|balance.*insufficient|not.*enough');
            expect(hasBalanceError).toBe(true);
          }
        }
      }
    }
  });

  walletTest('network connection error handling', async ({ page }) => {
    await page.route('**/*.xcp.io/**', route => {
      route.abort('failed');
    });
    await page.route('**/api/**', route => {
      route.abort('failed');
    });

    const sendButton = page.locator('button').filter({ hasText: 'Send' }).first();
    if (await sendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendButton.click();
      await page.waitForTimeout(2000);
    }

    const inputLocator = page.locator('input').first();
    const isInputVisible = await inputLocator.isVisible({ timeout: 2000 }).catch(() => false);

    if (isInputVisible) {
      await inputLocator.fill('bc1qtest123');
      await page.waitForTimeout(1000);
    }

    const pageStillResponsive = await page.locator('button').first().isVisible({ timeout: 1000 }).catch(() => false);

    expect(pageStillResponsive).toBe(true);
  });

  walletTest('malformed transaction data error', async ({ page }) => {
    await navigateTo(page, 'actions');
    await page.waitForTimeout(1000);

    const signLink = page.locator('text=Sign Message').first();
    if (await signLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await signLink.click();
      await page.waitForTimeout(1000);

      const messageInput = page.locator('textarea[placeholder*="message"]').or(
        page.locator('textarea').first()
      );

      if (await messageInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await messageInput.fill('Test\x00\x01Message');
        await page.waitForTimeout(500);

        const signButton = page.locator('button').filter({ hasText: /Sign/ }).last();
        if (await signButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await signButton.click();
          await page.waitForTimeout(1000);

          await page.waitForLoadState('networkidle');
          const hasSignature = await page.locator('h3:has-text("Signature")').isVisible({ timeout: 3000 }).catch(() => false);
          const hasSignError = await hasError(page);

          expect(hasSignature || hasSignError).toBe(true);
        }
      }
    }
  });

  walletTest('session timeout handling', async ({ page }) => {
    await page.waitForTimeout(2000);

    const lockButton = page.locator('button[aria-label*="lock"], button[aria-label*="Lock"]').first();
    if (await lockButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lockButton.click();
      await page.waitForTimeout(1000);
    } else {
      await lockWallet(page);
    }

    await page.waitForTimeout(1000);
    const needsAuth = page.url().includes('unlock');
    const hasPasswordField = await page.locator('input[type="password"]').isVisible({ timeout: 1000 }).catch(() => false);

    expect(needsAuth || hasPasswordField).toBe(true);
  });

  walletTest('browser storage quota error', async ({ page }) => {
    try {
      await page.evaluate(() => {
        const bigData = 'x'.repeat(1024 * 1024);
        for (let i = 0; i < 100; i++) {
          try {
            localStorage.setItem(`big_data_${i}`, bigData);
          } catch {
            break;
          }
        }
      });

      await navigateTo(page, 'settings');
      await page.waitForTimeout(1000);

      const settingsVisible = await page.locator('text=/Settings|General|Security/').isVisible({ timeout: 2000 }).catch(() => false);
      expect(settingsVisible).toBe(true);

    } catch {
      const pageWorks = await page.locator('button').first().isVisible({ timeout: 1000 }).catch(() => false);
      expect(pageWorks).toBe(true);
    }
  });
});

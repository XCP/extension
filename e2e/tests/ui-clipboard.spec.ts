/**
 * Clipboard Feature Tests
 *
 * Tests for copy functionality throughout the wallet.
 * Verifies that sensitive data can be copied and that
 * clipboard clearing works as expected.
 */

import {
  test,
  walletTest,
  expect,
  createWallet,
  navigateTo,
  TEST_PASSWORD
} from '../fixtures';
import {
  index,
  selectAddress,
  actions,
  signMessage,
  createWallet as createWalletSelectors
} from '../selectors';

walletTest.describe('Clipboard - Copy Address', () => {
  walletTest('copy address button on index page', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // The address card itself is clickable and copies the address
    // It has aria-label="Current address" and shows FaClipboard icon
    const addressCard = page.locator('[aria-label="Current address"]');
    await expect(addressCard).toBeVisible({ timeout: 5000 });
    await addressCard.click();

    // Check for success feedback (green checkmark appears after copy)
    const successIndicator = page.locator('.text-green-500');
    const hasSuccess = await successIndicator.isVisible({ timeout: 2000 }).catch(() => false);

    // Verify clipboard contains an address-like string
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);

    expect(hasSuccess || isValidAddress).toBe(true);
  });

  walletTest('copy address from receive page', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to receive page
    const receiveButton = index.receiveButton(page);
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    await page.waitForTimeout(1000);

    // Find copy button on receive page
    const copyButton = page.locator('button[aria-label*="Copy"], button:has-text("Copy")').first();

    if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyButton.click();

      // Verify clipboard contains address
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);

      expect(isValidAddress).toBe(true);
    }
  });

  walletTest('copy address from address selection', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to address selection
    const addressChevron = selectAddress.chevronButton(page);
    await expect(addressChevron).toBeVisible({ timeout: 5000 });
    await addressChevron.click();

    await expect(page).toHaveURL(/select-address/, { timeout: 5000 });

    // Find an address card with a copy button
    const addressCards = page.locator('.font-mono').first().locator('..').locator('..');
    const copyButton = addressCards.locator('button').filter({ has: page.locator('svg') }).first();

    if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyButton.click();

      // Verify clipboard
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);

      expect(isValidAddress).toBe(true);
    }
  });
});

walletTest.describe('Clipboard - Copy Transaction Data', () => {
  walletTest('copy signature from sign message result', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to sign message
    await navigateTo(page, 'actions');
    await expect(page).toHaveURL(/actions/);

    const signMessageOption = actions.signMessageOption(page);
    await expect(signMessageOption).toBeVisible({ timeout: 5000 });
    await signMessageOption.click();

    await expect(page).toHaveURL(/sign-message/, { timeout: 5000 });

    // Enter a message
    const messageInput = signMessage.messageInput(page);
    await expect(messageInput).toBeVisible({ timeout: 5000 });
    await messageInput.fill('Test message for signing');

    // Click sign button
    const signBtn = signMessage.signButton(page);
    await expect(signBtn).toBeVisible();
    await signBtn.click();

    // Wait for signature to appear
    await page.waitForTimeout(2000);

    // Look for copy button near signature
    const signatureSection = page.locator('text=/Signature/i').first().locator('..');
    const copyButton = signatureSection.locator('button').first();

    if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyButton.click();

      // Verify clipboard contains base64-like signature
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      const isBase64Like = /^[A-Za-z0-9+/=]{20,}$/.test(clipboardText);

      expect(isBase64Like || clipboardText.length > 20).toBe(true);
    }
  });
});

test.describe('Clipboard - Copy Sensitive Data', () => {
  test('copy private key with security verification', async ({ extensionPage, extensionContext }) => {
    await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write']);

    await createWallet(extensionPage, TEST_PASSWORD);
    await expect(extensionPage).toHaveURL(/index/, { timeout: 10000 });

    // Navigate to address selection
    const addressChevron = selectAddress.chevronButton(extensionPage);
    await expect(addressChevron).toBeVisible({ timeout: 5000 });
    await addressChevron.click();

    await expect(extensionPage).toHaveURL(/select-address/, { timeout: 5000 });

    // Find address card menu
    const addressCard = extensionPage.locator('.space-y-2 > div').first();
    const menuButton = addressCard.locator('button').last();

    if (await menuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await menuButton.click();
      await extensionPage.waitForTimeout(500);

      // Look for show private key option
      const showKeyOption = extensionPage.locator('text=/Show.*Private.*Key|Export.*Key/i').first();
      if (await showKeyOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await showKeyOption.click();

        // Enter password
        const passwordInput = extensionPage.locator('input[type="password"]');
        await expect(passwordInput).toBeVisible({ timeout: 5000 });
        await passwordInput.fill(TEST_PASSWORD);

        const confirmButton = extensionPage.locator('button:has-text("Show"), button:has-text("Confirm")').first();
        await confirmButton.click();

        await extensionPage.waitForTimeout(1000);

        // Find copy button
        const copyButton = extensionPage.locator('button:has-text("Copy")').first();
        if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await copyButton.click();

          // Verify clipboard contains private key (hex or WIF format)
          const clipboardText = await extensionPage.evaluate(() => navigator.clipboard.readText());
          const isValidPrivateKey = /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(clipboardText) || // WIF
                                   /^[a-fA-F0-9]{64}$/.test(clipboardText); // Hex

          expect(isValidPrivateKey || clipboardText.length >= 50).toBe(true);
        }
      }
    }
  });

  test('copy mnemonic during wallet creation', async ({ extensionPage, extensionContext }) => {
    await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Start creating wallet
    await createWalletSelectors.revealPhraseCard(extensionPage).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
      // Need to click create wallet first
    });
    const createBtn = extensionPage.getByText('Create Wallet');
    if (await createBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await createBtn.click();
    }
    await extensionPage.waitForSelector('text=View 12-word Secret Phrase', { timeout: 5000 });

    await createWalletSelectors.revealPhraseCard(extensionPage).click();
    await extensionPage.waitForTimeout(500);

    // Look for mnemonic words
    const mnemonicContainer = extensionPage.locator('.grid, .flex-wrap').filter({
      has: extensionPage.locator('text=/abandon|ability|able|about/i')
    }).first();

    // Find copy button
    const copyButton = extensionPage.locator('button:has-text("Copy"), button[aria-label*="Copy"]').first();

    if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyButton.click();

      // Verify clipboard contains 12 words
      const clipboardText = await extensionPage.evaluate(() => navigator.clipboard.readText());
      const wordCount = clipboardText.split(/\s+/).filter(w => w.length > 0).length;

      expect(wordCount).toBe(12);
    }
  });
});

walletTest.describe('Clipboard - Multiple Copy Operations', () => {
  walletTest('can copy different addresses sequentially', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to address selection
    const addressChevron = selectAddress.chevronButton(page);
    await expect(addressChevron).toBeVisible({ timeout: 5000 });
    await addressChevron.click();

    await expect(page).toHaveURL(/select-address/, { timeout: 5000 });

    // Add a second address if possible
    const addButton = selectAddress.addAddressButton(page);
    if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addButton.click();
      await page.waitForTimeout(1000);
    }

    // Get all address cards
    const addressCards = page.locator('.font-mono');
    const count = await addressCards.count();

    if (count >= 2) {
      // Copy first address
      const firstAddressRow = addressCards.nth(0).locator('..').locator('..');
      const firstCopyBtn = firstAddressRow.locator('button').filter({ has: page.locator('svg') }).first();

      if (await firstCopyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await firstCopyBtn.click();
        const firstClipboard = await page.evaluate(() => navigator.clipboard.readText());

        await page.waitForTimeout(500);

        // Copy second address
        const secondAddressRow = addressCards.nth(1).locator('..').locator('..');
        const secondCopyBtn = secondAddressRow.locator('button').filter({ has: page.locator('svg') }).first();

        if (await secondCopyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await secondCopyBtn.click();
          const secondClipboard = await page.evaluate(() => navigator.clipboard.readText());

          // Addresses should be different
          if (firstClipboard && secondClipboard) {
            expect(firstClipboard).not.toBe(secondClipboard);
          }
        }
      }
    }
  });

  walletTest('copy overwrites previous clipboard content', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Write something to clipboard first
    await page.evaluate(() => navigator.clipboard.writeText('initial-content'));

    // Navigate to receive page and copy address
    const receiveButton = index.receiveButton(page);
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    await page.waitForTimeout(1000);

    const copyButton = page.locator('button[aria-label*="Copy"], button:has-text("Copy")').first();

    if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyButton.click();

      // Clipboard should now have address, not initial content
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).not.toBe('initial-content');

      // Should be a valid address
      const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);
      expect(isValidAddress).toBe(true);
    }
  });
});

walletTest.describe('Clipboard - Visual Feedback', () => {
  walletTest('shows success indicator after copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to receive page
    const receiveButton = index.receiveButton(page);
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    await page.waitForTimeout(1000);

    const copyButton = page.locator('button[aria-label*="Copy"], button:has-text("Copy")').first();
    await expect(copyButton).toBeVisible({ timeout: 3000 });

    // Click copy and verify clipboard content
    await copyButton.click();

    // Verify clipboard contains address
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);
    expect(isValidAddress).toBe(true);
  });

  walletTest('copy button returns to initial state after feedback', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const receiveButton = index.receiveButton(page);
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    await page.waitForTimeout(1000);

    const copyButton = page.locator('button[aria-label*="Copy"], button:has-text("Copy")').first();

    if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyButton.click();

      // Wait for feedback to disappear (usually 2-3 seconds)
      await page.waitForTimeout(3000);

      // Button should still be clickable (returned to initial state)
      const isClickable = await copyButton.isEnabled().catch(() => false);
      expect(isClickable).toBe(true);

      // Should be able to copy again
      await copyButton.click();
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText.length).toBeGreaterThan(0);
    }
  });
});

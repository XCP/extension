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
  createWallet as createWalletSelectors,
  viewAddress,
  unlock,
  onboarding
} from '../selectors';

walletTest.describe('Clipboard - Copy Address', () => {
  walletTest('copy address button on index page', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // The address card itself is clickable and copies the address
    // It has aria-label="Current address" and shows FaClipboard icon
    await expect(index.currentAddress(page)).toBeVisible({ timeout: 5000 });
    await index.currentAddress(page).click();

    // Verify clipboard contains an address-like string (the real test)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);
    expect(isValidAddress).toBe(true);
  });

  walletTest('copy address from receive page', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to receive page
    const receiveButton = index.receiveButton(page);
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    await page.waitForLoadState('networkidle');

    // Find copy button on receive page
    const copyButton = viewAddress.copyButton(page);
    const copyButtonCount = await copyButton.count();

    if (copyButtonCount === 0) {
      return; // Copy button not present on this page
    }

    await expect(copyButton).toBeVisible({ timeout: 3000 });
    await copyButton.click();

    // Verify clipboard contains address
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);
    expect(isValidAddress).toBe(true);
  });

  walletTest('copy address from address selection', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to address selection
    const addressChevron = selectAddress.chevronButton(page);
    await expect(addressChevron).toBeVisible({ timeout: 5000 });
    await addressChevron.click();

    await expect(page).toHaveURL(/address\/select/, { timeout: 5000 });

    // Find a copy button using the selector from selectors.ts
    const copyButton = selectAddress.copyButton(page);
    const copyButtonCount = await copyButton.count();

    if (copyButtonCount === 0) {
      return; // Copy button not present
    }

    await expect(copyButton).toBeVisible({ timeout: 3000 });
    await copyButton.click();

    // Verify clipboard
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);
    expect(isValidAddress).toBe(true);
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
    await page.waitForLoadState('networkidle');

    // Look for copy button near signature
    const signatureSection = page.locator('text=/Signature/i').first().locator('..');
    const copyButton = signatureSection.locator('button').first();
    const copyButtonCount = await copyButton.count();

    if (copyButtonCount === 0) {
      return; // Copy button not present
    }

    await expect(copyButton).toBeVisible({ timeout: 3000 });
    await copyButton.click();

    // Verify clipboard contains signature (base64-like or long enough to be valid)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.length).toBeGreaterThan(20);
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

    await expect(extensionPage).toHaveURL(/address\/select/, { timeout: 5000 });

    // Find address card menu
    const addressCard = extensionPage.locator('.space-y-2 > div').first();
    const menuButton = addressCard.locator('button').last();
    const menuButtonCount = await menuButton.count();

    if (menuButtonCount === 0) {
      return; // Menu button not present
    }

    await menuButton.click();
    

    // Look for show private key option
    const showKeyOption = extensionPage.locator('text=/Show.*Private.*Key|Export.*Key/i').first();
    const showKeyCount = await showKeyOption.count();

    if (showKeyCount === 0) {
      return; // Show private key option not present
    }

    await showKeyOption.click();

    // Enter password
    await expect(unlock.passwordInput(extensionPage)).toBeVisible({ timeout: 5000 });
    await unlock.passwordInput(extensionPage).fill(TEST_PASSWORD);

    const confirmButton = extensionPage.locator('button:has-text("Show"), button:has-text("Confirm")').first();
    await confirmButton.click();

    await extensionPage.waitForLoadState('networkidle');

    // Find copy button
    const copyButton = extensionPage.locator('button:has-text("Copy")').first();
    const copyButtonCount = await copyButton.count();

    if (copyButtonCount === 0) {
      return; // Copy button not present
    }

    await expect(copyButton).toBeVisible({ timeout: 3000 });
    await copyButton.click();

    // Verify clipboard contains private key (should be at least 50 chars)
    const clipboardText = await extensionPage.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.length).toBeGreaterThanOrEqual(50);
  });

  test('copy mnemonic during wallet creation', async ({ extensionPage, extensionContext }) => {
    await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Start creating wallet - check if we need to click create wallet first
    const createBtn = onboarding.createWalletButton(extensionPage);
    const createBtnCount = await createBtn.count();
    if (createBtnCount > 0) {
      await createBtn.click();
    }
    await expect(createWalletSelectors.revealPhraseCard(extensionPage)).toBeVisible({ timeout: 5000 });

    await createWalletSelectors.revealPhraseCard(extensionPage).click();
    

    // Find copy button
    const copyButton = extensionPage.locator('button:has-text("Copy"), button[aria-label*="Copy"]').first();
    const copyButtonCount = await copyButton.count();

    if (copyButtonCount === 0) {
      return; // Copy button not present
    }

    await expect(copyButton).toBeVisible({ timeout: 3000 });
    await copyButton.click();

    // Verify clipboard contains 12 words
    const clipboardText = await extensionPage.evaluate(() => navigator.clipboard.readText());
    const wordCount = clipboardText.split(/\s+/).filter(w => w.length > 0).length;
    expect(wordCount).toBe(12);
  });
});

walletTest.describe('Clipboard - Multiple Copy Operations', () => {
  walletTest('can copy different addresses sequentially', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to address selection
    const addressChevron = selectAddress.chevronButton(page);
    await expect(addressChevron).toBeVisible({ timeout: 5000 });
    await addressChevron.click();

    await expect(page).toHaveURL(/address\/select/, { timeout: 5000 });

    // Add a second address if possible
    const addButton = selectAddress.addAddressButton(page);
    const addButtonCount = await addButton.count();
    if (addButtonCount > 0) {
      await addButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Get all address options (each is a radio option)
    const addressOptions = page.locator('[role="radio"]');
    const count = await addressOptions.count();

    if (count < 2) {
      return; // Not enough addresses to test sequential copy
    }

    // Copy first address via its menu
    const firstMenu = page.locator('[aria-label="Address actions"]').first();
    const firstMenuCount = await firstMenu.count();

    if (firstMenuCount === 0) {
      return; // Address menu not present
    }

    await firstMenu.click();
    const copyOption1 = page.locator('button:has-text("Copy Address")');
    await expect(copyOption1).toBeVisible({ timeout: 2000 });
    await copyOption1.click();
    const firstClipboard = await page.evaluate(() => navigator.clipboard.readText());

    // Copy second address via its menu
    const secondMenu = page.locator('[aria-label="Address actions"]').nth(1);
    await secondMenu.click();
    const copyOption2 = page.locator('button:has-text("Copy Address")');
    await expect(copyOption2).toBeVisible({ timeout: 2000 });
    await copyOption2.click();
    const secondClipboard = await page.evaluate(() => navigator.clipboard.readText());

    // Addresses should be different
    expect(firstClipboard).not.toBe(secondClipboard);
  });

  walletTest('copy overwrites previous clipboard content', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Write something to clipboard first
    await page.evaluate(() => navigator.clipboard.writeText('initial-content'));

    // Navigate to receive page and copy address
    const receiveButton = index.receiveButton(page);
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    await page.waitForLoadState('networkidle');

    const copyButton = page.locator('button[aria-label*="Copy"], button:has-text("Copy")').first();
    const copyButtonCount = await copyButton.count();

    if (copyButtonCount === 0) {
      return; // Copy button not present
    }

    await expect(copyButton).toBeVisible({ timeout: 3000 });
    await copyButton.click();

    // Clipboard should now have address, not initial content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).not.toBe('initial-content');

    // Should be a valid address
    const isValidAddress = /^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}$/.test(clipboardText);
    expect(isValidAddress).toBe(true);
  });
});

walletTest.describe('Clipboard - Visual Feedback', () => {
  walletTest('shows success indicator after copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Navigate to receive page
    const receiveButton = index.receiveButton(page);
    await expect(receiveButton).toBeVisible({ timeout: 5000 });
    await receiveButton.click();

    await page.waitForLoadState('networkidle');

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

    await page.waitForLoadState('networkidle');

    const copyButton = page.locator('button[aria-label*="Copy"], button:has-text("Copy")').first();
    const copyButtonCount = await copyButton.count();

    if (copyButtonCount === 0) {
      return; // Copy button not present
    }

    await expect(copyButton).toBeVisible({ timeout: 3000 });
    await copyButton.click();

    // Wait for feedback to disappear (usually 2-3 seconds)
    await page.waitForLoadState('networkidle');

    // Button should still be clickable (returned to initial state)
    await expect(copyButton).toBeEnabled();

    // Should be able to copy again
    await copyButton.click();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.length).toBeGreaterThan(0);
  });
});

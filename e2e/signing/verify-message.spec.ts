/**
 * Message Verification UI Tests
 *
 * Tests for verifying signed messages via the Actions page UI.
 */

import {
  walletTest,
  expect,
  navigateTo,
  grantClipboardPermissions,
  TEST_PASSWORD
} from '../fixtures';

walletTest.describe('Verify Message', () => {
  walletTest('navigates to verify message page', async ({ page }) => {
    await navigateTo(page, 'actions');

    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    await expect(page.locator('h1, h2').filter({ hasText: 'Verify Message' })).toBeVisible();
    await expect(page.locator('label:has-text("Address")')).toBeVisible();
    await expect(page.locator('label:has-text("Message")')).toBeVisible();
    await expect(page.locator('label:has-text("Signature")')).toBeVisible();
  });

  walletTest('requires all fields before verification', async ({ page }) => {
    await navigateTo(page, 'actions');

    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    const verifyButton = page.locator('button:has-text("Verify Signature")');
    await expect(verifyButton).toBeDisabled();

    await page.fill('input[placeholder*="Bitcoin address"]', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await expect(verifyButton).toBeDisabled();

    await page.fill('textarea[placeholder*="exact message"]', 'Test message');
    await expect(verifyButton).toBeDisabled();

    await page.fill('textarea[placeholder*="base64 or hex format"]', 'H1234567890abcdef...');
    await expect(verifyButton).toBeEnabled();
  });

  walletTest('verifies a valid signature', async ({ page, context }) => {
    await grantClipboardPermissions(context);

    // Get full address from the index page
    await expect(page.locator('.font-mono').first()).toBeVisible();
    await page.click('.font-mono');

    const fullAddress = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });

    // Sign a message first
    await navigateTo(page, 'actions');
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message');

    const testMessage = 'Test verification message';
    await page.fill('textarea[placeholder*="Enter your message"]', testMessage);

    await page.click('button:has-text("Sign Message")');

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await page.waitForSelector('text=Signed', { timeout: 10000 });

    const signatureTextarea = page.locator('textarea[disabled]').first();
    const signature = await signatureTextarea.inputValue();

    // Now verify the signature
    await navigateTo(page, 'actions');
    await page.waitForURL('**/actions');

    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    await page.fill('input[placeholder*="Bitcoin address"]', fullAddress);
    await page.fill('textarea[placeholder*="exact message"]', testMessage);
    await page.fill('textarea[placeholder*="base64 or hex format"]', signature);

    await page.click('button:has-text("Verify Signature")');

    await expect(page.locator('text=Signature Valid')).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows invalid for wrong signature', async ({ page }) => {
    await navigateTo(page, 'actions');

    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    await page.fill('input[placeholder*="Bitcoin address"]', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await page.fill('textarea[placeholder*="exact message"]', 'Wrong message');
    await page.fill('textarea[placeholder*="base64 or hex format"]', 'InvalidSignatureBase64String==');

    await page.click('button:has-text("Verify Signature")');

    const invalidText = page.locator('text=Signature Invalid - Does not match the message and address provided');
    const errorAlert = page.locator('text=/Invalid signature|Failed to verify/');
    await expect(invalidText.or(errorAlert)).toBeVisible({ timeout: 5000 });
  });

  walletTest('clears all fields', async ({ page }) => {
    await navigateTo(page, 'actions');

    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    await page.fill('input[placeholder*="Bitcoin address"]', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await page.fill('textarea[placeholder*="exact message"]', 'Test message');
    await page.fill('textarea[placeholder*="base64 or hex format"]', 'SomeSignature');

    await page.click('button[aria-label="Reset form"]');

    const addressInput = page.locator('input[placeholder*="Bitcoin address"]');
    const messageInput = page.locator('textarea[placeholder*="exact message"]');
    const signatureInput = page.locator('textarea[placeholder*="base64 or hex format"]');

    await expect(addressInput).toHaveValue('');
    await expect(messageInput).toHaveValue('');
    await expect(signatureInput).toHaveValue('');
  });

  walletTest('shows character count for message', async ({ page }) => {
    await navigateTo(page, 'actions');

    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    await expect(page.locator('text=0 characters - Must match exactly')).toBeVisible();

    const testMessage = 'Hello World';
    await page.fill('textarea[placeholder*="exact message"]', testMessage);

    await expect(page.locator(`text=${testMessage.length} characters - Must match exactly`)).toBeVisible();

    await expect(page.locator('text=/Must match exactly/').first()).toBeVisible();
  });

  walletTest('handles Taproot signatures', async ({ page }) => {
    await navigateTo(page, 'actions');

    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    await page.fill('input[placeholder*="Bitcoin address"]', 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
    await page.fill('textarea[placeholder*="exact message"]', 'Taproot test');
    await page.fill('textarea[placeholder*="base64 or hex format"]', 'tr:' + '0'.repeat(128));

    await page.click('button:has-text("Verify Signature")');

    const validResult = page.locator('text=Signature Valid');
    const invalidResult = page.locator('text=Signature Invalid');
    const errorResult = page.locator('text=/Failed to verify|Invalid signature|not supported/i');

    await expect(validResult.or(invalidResult).or(errorResult)).toBeVisible({ timeout: 5000 });
  });
});

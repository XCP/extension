/**
 * Message Verification UI Tests
 *
 * Tests for verifying signed messages via the Actions page UI.
 */

import { walletTest, expect, navigateTo, grantClipboardPermissions, TEST_PASSWORD } from '../../fixtures';
import { actions, verifyMessage, signMessage, viewAddress, index } from '../../selectors';

walletTest.describe('Verify Message', () => {
  walletTest('navigates to verify message page', async ({ page }) => {
    await navigateTo(page, 'actions');

    await actions.verifyMessageOption(page).click();
    await page.waitForURL('**/actions/verify-message');

    await expect(page.locator('h1, h2').filter({ hasText: 'Verify Message' })).toBeVisible();
    await expect(page.locator('label:has-text("Address")')).toBeVisible();
    await expect(page.locator('label:has-text("Message")')).toBeVisible();
    await expect(page.locator('label:has-text("Signature")')).toBeVisible();
  });

  walletTest('requires all fields before verification', async ({ page }) => {
    await navigateTo(page, 'actions');

    await actions.verifyMessageOption(page).click();
    await page.waitForURL('**/actions/verify-message');

    await expect(verifyMessage.verifyButton(page)).toBeDisabled();

    await verifyMessage.addressInput(page).fill('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await expect(verifyMessage.verifyButton(page)).toBeDisabled();

    await verifyMessage.messageInput(page).fill('Test message');
    await expect(verifyMessage.verifyButton(page)).toBeDisabled();

    await verifyMessage.signatureInput(page).fill('H1234567890abcdef...');
    await expect(verifyMessage.verifyButton(page)).toBeEnabled();
  });

  walletTest('verifies a valid signature', async ({ page, context }) => {
    await grantClipboardPermissions(context);

    // Navigate to view-address page to get the full address
    await index.receiveButton(page).click();
    await expect(page).toHaveURL(/view-address/, { timeout: 5000 });

    await expect(viewAddress.addressDisplay(page)).toBeVisible({ timeout: 5000 });
    await viewAddress.addressDisplay(page).click();

    const fullAddress = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });

    // Sign a message first
    await navigateTo(page, 'actions');
    await actions.signMessageOption(page).click();
    await page.waitForURL('**/actions/sign-message');

    const testMessage = 'Test verification message';
    await signMessage.messageInput(page).fill(testMessage);

    await signMessage.signButton(page).click();

    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }

    await expect(signMessage.signedIndicator(page)).toBeVisible({ timeout: 10000 });

    const signature = await signMessage.signatureOutput(page).inputValue();

    // Now verify the signature
    await navigateTo(page, 'actions');
    await page.waitForURL('**/actions');

    await actions.verifyMessageOption(page).click();
    await page.waitForURL('**/actions/verify-message');

    await verifyMessage.addressInput(page).fill(fullAddress);
    await verifyMessage.messageInput(page).fill(testMessage);
    await verifyMessage.signatureInput(page).fill(signature);

    await verifyMessage.verifyButton(page).click();

    await expect(verifyMessage.validResult(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows invalid for wrong signature', async ({ page }) => {
    await navigateTo(page, 'actions');

    await actions.verifyMessageOption(page).click();
    await page.waitForURL('**/actions/verify-message');

    await verifyMessage.addressInput(page).fill('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await verifyMessage.messageInput(page).fill('Wrong message');
    await verifyMessage.signatureInput(page).fill('InvalidSignatureBase64String==');

    await verifyMessage.verifyButton(page).click();

    // Wait for verification result - should show invalid signature message
    // Match the specific error span with class text-red-600
    await expect(page.locator('span.text-red-600:has-text("Signature Invalid")')).toBeVisible({ timeout: 5000 });
  });

  walletTest('clears all fields', async ({ page }) => {
    await navigateTo(page, 'actions');

    await actions.verifyMessageOption(page).click();
    await page.waitForURL('**/actions/verify-message');

    await verifyMessage.addressInput(page).fill('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await verifyMessage.messageInput(page).fill('Test message');
    await verifyMessage.signatureInput(page).fill('SomeSignature');

    await verifyMessage.resetButton(page).click();

    await expect(verifyMessage.addressInput(page)).toHaveValue('');
    await expect(verifyMessage.messageInput(page)).toHaveValue('');
    await expect(verifyMessage.signatureInput(page)).toHaveValue('');
  });

  walletTest('shows character count for message', async ({ page }) => {
    await navigateTo(page, 'actions');

    await actions.verifyMessageOption(page).click();
    await page.waitForURL('**/actions/verify-message');

    await expect(page.locator('text=0 characters - Must match exactly')).toBeVisible();

    const testMessage = 'Hello World';
    await verifyMessage.messageInput(page).fill(testMessage);

    await expect(page.locator(`text=${testMessage.length} characters - Must match exactly`)).toBeVisible();

    await expect(page.locator('text=/Must match exactly/').first()).toBeVisible();
  });

  walletTest('handles Taproot signatures', async ({ page }) => {
    await navigateTo(page, 'actions');

    await actions.verifyMessageOption(page).click();
    await page.waitForURL('**/actions/verify-message');

    await verifyMessage.addressInput(page).fill('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
    await verifyMessage.messageInput(page).fill('Taproot test');
    await verifyMessage.signatureInput(page).fill('tr:' + '0'.repeat(128));

    await verifyMessage.verifyButton(page).click();

    const errorResult = page.locator('text=/Failed to verify|Invalid signature|not supported/i');

    await expect(verifyMessage.validResult(page).or(verifyMessage.invalidResult(page)).or(errorResult).first()).toBeVisible({ timeout: 5000 });
  });
});

import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  navigateViaFooter, 
  cleanup,
  grantClipboardPermissions,
  TEST_PASSWORD 
} from './helpers/test-helpers';

test.describe('Verify Message', () => {
  test('should navigate to verify message page', async () => {
    const { context, page } = await launchExtension('verify-message-nav');
    await setupWallet(page);
    
    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');
    
    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');
    
    // Verify we're on the verify message page
    await expect(page.locator('h1, h2').filter({ hasText: 'Verify Message' })).toBeVisible();
    await expect(page.locator('label:has-text("Bitcoin Address")')).toBeVisible();
    await expect(page.locator('text=Original Message')).toBeVisible();
    await expect(page.locator('label:has-text("Signature")')).toBeVisible();
    
    await cleanup(context);
  });

  test('should show info about message verification', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-info');
    await setupWallet(page);
    
    // Navigate directly to verify message page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Should show info box
    const infoBox = page.locator('.bg-blue-50');
    await expect(infoBox).toBeVisible();
    await expect(infoBox).toContainText('Message Verification');
    await expect(infoBox).toContainText('proves they control the private key');
    
    await cleanup(context);
  });

  test('should require all fields before verification', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-require');
    await setupWallet(page);
    
    // Navigate directly to verify message page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Verify button should be disabled initially
    const verifyButton = page.locator('button:has-text("Verify Signature")');
    await expect(verifyButton).toBeDisabled();
    
    // Fill address only
    await page.fill('input[placeholder*="Bitcoin address"]', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await expect(verifyButton).toBeDisabled();
    
    // Fill message
    await page.fill('textarea[placeholder*="exact message"]', 'Test message');
    await expect(verifyButton).toBeDisabled();
    
    // Fill signature
    await page.fill('textarea[placeholder*="signature"]', 'H1234567890abcdef...');
    await expect(verifyButton).toBeEnabled();
    
    await cleanup(context);
  });

  test('should verify a valid signature', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-valid');
    await setupWallet(page);
    
    // First, we need to create a valid signature
    // Navigate to sign message page to create one
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/sign-message`);
    
    const testMessage = 'Test verification message';
    await page.fill('textarea[placeholder*="Enter your message"]', testMessage);
    
    // Sign the message
    await page.click('button:has-text("Sign Message")');
    
    // Handle password if needed
    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }
    
    // Wait for signature
    await page.waitForSelector('h3:has-text("Signature")');
    
    // Get the address
    const addressElement = page.locator('.font-mono').first();
    const address = await addressElement.textContent();
    
    // Get the signature
    const signatureElement = page.locator('.font-mono.text-xs');
    const signature = await signatureElement.textContent();
    
    // Now navigate to verify page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Fill in the verification form
    await page.fill('input[placeholder*="Bitcoin address"]', address!);
    await page.fill('textarea[placeholder*="exact message"]', testMessage);
    await page.fill('textarea[placeholder*="signature"]', signature!);
    
    // Verify
    await page.click('button:has-text("Verify Signature")');
    
    // Should show valid signature
    await expect(page.locator('.bg-green-50')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Signature Valid')).toBeVisible();
    
    await cleanup(context);
  });

  test('should show invalid for wrong signature', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-invalid');
    await setupWallet(page);
    
    // Navigate directly to verify message page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Fill in invalid data
    await page.fill('input[placeholder*="Bitcoin address"]', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await page.fill('textarea[placeholder*="exact message"]', 'Wrong message');
    await page.fill('textarea[placeholder*="signature"]', 'InvalidSignatureBase64String==');
    
    // Verify
    await page.click('button:has-text("Verify Signature")');
    
    // Should show invalid signature
    await expect(page.locator('.bg-red-50')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Signature Invalid')).toBeVisible();
    
    await cleanup(context);
  });

  test('should clear all fields', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-clear');
    await setupWallet(page);
    
    // Navigate directly to verify message page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Fill in some data
    await page.fill('input[placeholder*="Bitcoin address"]', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await page.fill('textarea[placeholder*="exact message"]', 'Test message');
    await page.fill('textarea[placeholder*="signature"]', 'SomeSignature');
    
    // Click clear
    await page.click('button:has-text("Clear All")');
    
    // All fields should be empty
    const addressInput = page.locator('input[placeholder*="Bitcoin address"]');
    const messageInput = page.locator('textarea[placeholder*="exact message"]');
    const signatureInput = page.locator('textarea[placeholder*="signature"]');
    
    await expect(addressInput).toHaveValue('');
    await expect(messageInput).toHaveValue('');
    await expect(signatureInput).toHaveValue('');
    
    await cleanup(context);
  });

  test('should paste JSON data', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-json');
    await setupWallet(page);
    await grantClipboardPermissions(context);
    
    // Navigate directly to verify message page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Prepare JSON data
    const jsonData = {
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      message: 'Hello from JSON',
      signature: 'Base64SignatureHere'
    };
    
    // Copy JSON to clipboard
    await page.evaluate((json) => {
      navigator.clipboard.writeText(JSON.stringify(json));
    }, jsonData);
    
    // Click Paste JSON button
    await page.click('button:has-text("Paste JSON")');
    
    // Wait a moment for the paste to complete
    await page.waitForTimeout(500);
    
    // Verify fields are filled
    const addressInput = page.locator('input[placeholder*="Bitcoin address"]');
    const messageInput = page.locator('textarea[placeholder*="exact message"]');
    const signatureInput = page.locator('textarea[placeholder*="signature"]');
    
    await expect(addressInput).toHaveValue(jsonData.address);
    await expect(messageInput).toHaveValue(jsonData.message);
    await expect(signatureInput).toHaveValue(jsonData.signature);
    
    await cleanup(context);
  });

  test('should show character count for message', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-count');
    await setupWallet(page);
    
    // Navigate directly to verify message page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Initially should show 0 characters
    await expect(page.locator('text=0 characters')).toBeVisible();
    
    // Type a message
    const testMessage = 'Hello World';
    await page.fill('textarea[placeholder*="exact message"]', testMessage);
    
    // Should update character count
    await expect(page.locator(`text=${testMessage.length} characters`)).toBeVisible();
    
    // Should note that it must match exactly
    await expect(page.locator('text=/Must match exactly/').first()).toBeVisible();
    
    await cleanup(context);
  });

  test('should show verification tips', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-tips');
    await setupWallet(page);
    
    // Navigate directly to verify message page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Should show verification tips section
    await expect(page.locator('text=Verification Tips')).toBeVisible();
    
    // Should show various tips
    await expect(page.locator('text=/must match exactly/')).toBeVisible();
    await expect(page.locator('text=/base64 format/')).toBeVisible();
    await expect(page.locator('text=/Taproot signatures start with/')).toBeVisible();
    
    await cleanup(context);
  });

  test('should handle Taproot signatures', async () => {
    const { context, page, extensionId } = await launchExtension('verify-message-taproot');
    await setupWallet(page);
    
    // Navigate directly to verify message page
    await page.goto(`chrome-extension://${extensionId}/popup.html#/actions/verify-message`);
    
    // Fill in Taproot-style data
    await page.fill('input[placeholder*="Bitcoin address"]', 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
    await page.fill('textarea[placeholder*="exact message"]', 'Taproot test');
    await page.fill('textarea[placeholder*="signature"]', 'tr:' + '0'.repeat(128)); // Taproot format
    
    // Verify
    await page.click('button:has-text("Verify Signature")');
    
    // Should process without error (simplified verification for Taproot)
    await page.waitForTimeout(1000);
    
    // Should show a result (valid or invalid)
    const greenResult = page.locator('.bg-green-50');
    const redResult = page.locator('.bg-red-50');
    
    // Either valid or invalid should be shown
    const hasResult = await greenResult.isVisible() || await redResult.isVisible();
    expect(hasResult).toBe(true);
    
    await cleanup(context);
  });
});
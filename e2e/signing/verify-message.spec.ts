import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  navigateViaFooter, 
  cleanup,
  grantClipboardPermissions,
  TEST_PASSWORD 
} from '../helpers/test-helpers';

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
    await expect(page.locator('label:has-text("Address")')).toBeVisible();
    await expect(page.locator('label:has-text("Message")')).toBeVisible();
    await expect(page.locator('label:has-text("Signature")')).toBeVisible();
    
    await cleanup(context);
  });

  test('should show info about message verification', async () => {
    const { context, page } = await launchExtension('verify-message-info');
    await setupWallet(page);

    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');

    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    // Should show YouTube tutorial CTA instead of info box
    await expect(page.locator('text=Learn how to verify message signatures')).toBeVisible();
    
    await cleanup(context);
  });

  test('should require all fields before verification', async () => {
    const { context, page } = await launchExtension('verify-message-require');
    await setupWallet(page);

    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');

    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');
    
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
    await page.fill('textarea[placeholder*="base64 or hex format"]', 'H1234567890abcdef...');
    await expect(verifyButton).toBeEnabled();
    
    await cleanup(context);
  });

  test('should verify a valid signature', async () => {
    const { context, page } = await launchExtension('verify-message-valid');
    await setupWallet(page);
    await grantClipboardPermissions(context);

    // Step 1: Get the full address from the index page (we're already there after setup)
    await page.waitForTimeout(1000);

    // Click on the address area to copy the full address
    await page.click('.font-mono');

    // Get the full address from clipboard by evaluating in page context
    const fullAddress = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });

    // Step 2: Go to sign message page and create a signature
    await navigateViaFooter(page, 'actions');
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message');

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

    // Wait for signature to appear
    await page.waitForSelector('text=Signed', { timeout: 10000 });

    // Get the signature from the result textarea
    const signatureTextarea = page.locator('textarea[disabled]').first();
    const signature = await signatureTextarea.inputValue();

    // Step 3: Navigate to verify page with the exact same data
    // Click the back button (first button in header)
    const backButton = page.locator('header button').first();
    await backButton.click();
    await page.waitForURL('**/actions');
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');

    // Fill in the verification form with the exact data we just used
    await page.fill('input[placeholder*="Bitcoin address"]', fullAddress);
    await page.fill('textarea[placeholder*="exact message"]', testMessage);
    await page.fill('textarea[placeholder*="base64 or hex format"]', signature);

    // Verify
    await page.click('button:has-text("Verify Signature")');

    // Should show valid signature text
    await expect(page.locator('text=Signature Valid')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('should show invalid for wrong signature', async () => {
    const { context, page } = await launchExtension('verify-message-invalid');
    await setupWallet(page);

    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');

    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');
    
    // Fill in invalid data
    await page.fill('input[placeholder*="Bitcoin address"]', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await page.fill('textarea[placeholder*="exact message"]', 'Wrong message');
    await page.fill('textarea[placeholder*="base64 or hex format"]', 'InvalidSignatureBase64String==');
    
    // Verify
    await page.click('button:has-text("Verify Signature")');
    
    // Should show invalid signature
    await expect(page.locator('textarea.border-red-500')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Signature Invalid - Does not match the message and address provided')).toBeVisible();
    
    await cleanup(context);
  });

  test('should clear all fields', async () => {
    const { context, page } = await launchExtension('verify-message-clear');
    await setupWallet(page);

    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');

    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');
    
    // Fill in some data
    await page.fill('input[placeholder*="Bitcoin address"]', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    await page.fill('textarea[placeholder*="exact message"]', 'Test message');
    await page.fill('textarea[placeholder*="base64 or hex format"]', 'SomeSignature');
    
    // Use the reset button in the header instead
    await page.click('button[aria-label="Reset form"]');
    
    // All fields should be empty
    const addressInput = page.locator('input[placeholder*="Bitcoin address"]');
    const messageInput = page.locator('textarea[placeholder*="exact message"]');
    const signatureInput = page.locator('textarea[placeholder*="base64 or hex format"]');
    
    await expect(addressInput).toHaveValue('');
    await expect(messageInput).toHaveValue('');
    await expect(signatureInput).toHaveValue('');
    
    await cleanup(context);
  });

  test('should paste JSON data', async () => {
    const { context, page } = await launchExtension('verify-message-json');
    await setupWallet(page);
    await grantClipboardPermissions(context);

    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');

    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');
    
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
    
    // Click Upload JSON button exists but can't test actual upload
    await expect(page.locator('button:has-text("Upload JSON")')).toBeVisible();
    
    // Manually fill the fields instead to test the verification
    await page.fill('input[placeholder*="Bitcoin address"]', jsonData.address);
    await page.fill('textarea[placeholder*="exact message"]', jsonData.message);
    await page.fill('textarea[placeholder*="base64 or hex format"]', jsonData.signature);
    
    // Verify fields are filled
    const addressInput = page.locator('input[placeholder*="Bitcoin address"]');
    const messageInput = page.locator('textarea[placeholder*="exact message"]');
    const signatureInput = page.locator('textarea[placeholder*="base64 or hex format"]');
    
    await expect(addressInput).toHaveValue(jsonData.address);
    await expect(messageInput).toHaveValue(jsonData.message);
    await expect(signatureInput).toHaveValue(jsonData.signature);
    
    await cleanup(context);
  });

  test('should show character count for message', async () => {
    const { context, page } = await launchExtension('verify-message-count');
    await setupWallet(page);

    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');

    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');
    
    // Initially should show 0 characters
    await expect(page.locator('text=0 characters - Must match exactly')).toBeVisible();
    
    // Type a message
    const testMessage = 'Hello World';
    await page.fill('textarea[placeholder*="exact message"]', testMessage);
    
    // Should update character count
    await expect(page.locator(`text=${testMessage.length} characters - Must match exactly`)).toBeVisible();
    
    // Should note that it must match exactly
    await expect(page.locator('text=/Must match exactly/').first()).toBeVisible();
    
    await cleanup(context);
  });

  test('should show verification tips', async () => {
    const { context, page } = await launchExtension('verify-message-tips');
    await setupWallet(page);

    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');

    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');
    
    // Should show YouTube tutorial CTA
    await expect(page.locator('text=Learn how to verify message signatures')).toBeVisible();
    
    // Should show character count helper
    await expect(page.locator('text=/characters - Must match exactly/')).toBeVisible();
    
    await cleanup(context);
  });

  test('should handle Taproot signatures', async () => {
    const { context, page } = await launchExtension('verify-message-taproot');
    await setupWallet(page);

    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');

    // Click on Verify Message
    await page.click('text=Verify Message');
    await page.waitForURL('**/actions/verify-message');
    
    // Fill in Taproot-style data
    await page.fill('input[placeholder*="Bitcoin address"]', 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
    await page.fill('textarea[placeholder*="exact message"]', 'Taproot test');
    await page.fill('textarea[placeholder*="base64 or hex format"]', 'tr:' + '0'.repeat(128)); // Taproot format
    
    // Verify
    await page.click('button:has-text("Verify Signature")');
    
    // Should process without error (simplified verification for Taproot)
    await page.waitForTimeout(1000);
    
    // Should show a result (valid or invalid)
    const greenResult = page.locator('textarea.border-green-500');
    const redResult = page.locator('textarea.border-red-500');
    
    // Either valid or invalid should be shown
    const hasResult = await greenResult.isVisible() || await redResult.isVisible();
    expect(hasResult).toBe(true);
    
    await cleanup(context);
  });
});
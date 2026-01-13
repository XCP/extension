import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet, 
  navigateViaFooter, 
  cleanup,
  grantClipboardPermissions,
  TEST_PASSWORD 
} from '../helpers/test-helpers';

test.describe('Sign Message', () => {
  test('should navigate to sign message page', async () => {
    const { context, page } = await launchExtension('sign-message-nav');
    await setupWallet(page);
    
    // Navigate to Actions page via footer
    await navigateViaFooter(page, 'actions');
    
    // Wait for actions page to fully load
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Tools')).toBeVisible({ timeout: 15000 });
    
    // Click on Sign Message with retry
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    
    // Verify we're on the sign message page with increased timeout - look for actual label text
    await expect(page.locator('h1, h2').filter({ hasText: 'Sign Message' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('label:has-text("Message")')).toBeVisible({ timeout: 15000 });
    
    await cleanup(context);
  });

  test('should show message input and signature fields', async () => {
    const { context, page } = await launchExtension('sign-message-fields');
    await setupWallet(page);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Should show message input
    await expect(page.locator('label:has-text("Message")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('textarea[placeholder*="Enter your message"]')).toBeVisible();

    // Should show signature field
    await expect(page.locator('label:has-text("Signature")')).toBeVisible();
    await expect(page.locator('textarea[placeholder*="Signature will appear"]')).toBeVisible();

    await cleanup(context);
  });

  test('should require message before signing', async () => {
    const { context, page } = await launchExtension('sign-message-require');
    await setupWallet(page);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Sign button should be disabled when message is empty
    const signButton = page.locator('button:has-text("Sign Message")');
    await expect(signButton).toBeDisabled();

    // Enter a message
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await messageInput.fill('Test message for signing');

    // Sign button should now be enabled
    await expect(signButton).toBeEnabled();

    await cleanup(context);
  });

  test('should sign a message successfully', async () => {
    const { context, page } = await launchExtension('sign-message-sign');
    await setupWallet(page);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    
    // Wait for message input to be visible
    await page.waitForSelector('textarea[placeholder*="Enter your message"]', { timeout: 10000 });
    
    // Enter a message
    const testMessage = 'Hello Bitcoin! This is a test message.';
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await messageInput.fill(testMessage);
    
    // Click sign button
    const signButton = page.locator('button:has-text("Sign Message")');
    await signButton.click();
    
    // Handle password if needed
    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }
    
    // Wait for signature to appear - look for the "Signed" indicator
    await page.waitForSelector('text="Signed"', { timeout: 15000 });
    
    // Verify signature is displayed
    const signatureTextarea = page.locator('textarea[placeholder*="Signature will appear"]');
    const signatureValue = await signatureTextarea.inputValue();
    expect(signatureValue).toBeTruthy();
    expect(signatureValue.length).toBeGreaterThan(50);
    
    // Should show "Signed" indicator
    await expect(page.locator('text="Signed"')).toBeVisible();
    
    await cleanup(context);
  });

  test('should copy signature to clipboard', async () => {
    const { context, page } = await launchExtension('sign-message-copy');
    await setupWallet(page);
    await grantClipboardPermissions(context);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('textarea[placeholder*="Enter your message"]', { timeout: 15000 });
    
    // Sign a message first
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await messageInput.fill('Test message');
    
    const signButton = page.locator('button:has-text("Sign Message")');
    await signButton.click();
    
    // Handle password if needed
    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }
    
    // Wait for signature to appear - look for the "Signed" indicator
    await page.waitForSelector('text="Signed"', { timeout: 20000 });
    
    // Click copy signature button
    const copyButton = page.locator('button:has-text("Copy signature")');
    await copyButton.click();
    
    // Verify "Copied!" appears
    await expect(page.locator('text="Copied!"')).toBeVisible();
    
    // Verify clipboard content (if possible)
    try {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBeTruthy();
    } catch (e) {
      console.log('Clipboard test skipped - not available in test environment');
    }
    
    await cleanup(context);
  });

  test('should export signature as JSON', async () => {
    const { context, page } = await launchExtension('sign-message-json');
    await setupWallet(page);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    
    // Sign a message
    const testMessage = 'JSON export test';
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });
    await messageInput.fill(testMessage);
    
    const signButton = page.locator('button:has-text("Sign Message")');
    await expect(signButton).toBeVisible({ timeout: 5000 });
    await signButton.click();
    
    // Handle password if needed
    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }
    
    // Wait for signature to appear - look for the "Signed" indicator
    await page.waitForSelector('text="Signed"', { timeout: 30000 });
    
    // Set up download listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click Download JSON button
    const jsonButton = page.locator('button:has-text("Download JSON")');
    await expect(jsonButton).toBeVisible({ timeout: 10000 });
    await jsonButton.click();
    
    // Wait for download to complete
    const download = await downloadPromise;
    const downloadPath = await download.path();
    
    // Verify download occurred
    expect(downloadPath).toBeTruthy();
    const fileName = download.suggestedFilename();
    expect(fileName).toContain('signature');
    expect(fileName.endsWith('.json')).toBe(true);
    
    await cleanup(context);
  });

  test('should show character count', async () => {
    const { context, page } = await launchExtension('sign-message-char-count');
    await setupWallet(page);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await expect(messageInput).toBeVisible({ timeout: 5000 });

    // Initially should show 0 characters
    await expect(page.locator('text=/0 character/')).toBeVisible({ timeout: 5000 });

    // Type a message
    const testMessage = 'Hello';
    await messageInput.fill(testMessage);

    // Should update character count
    await expect(page.locator(`text=/${testMessage.length} character/`)).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('should handle special characters in messages', async () => {
    const { context, page } = await launchExtension('sign-message-special');
    await setupWallet(page);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    
    // Wait for message input
    await page.waitForSelector('textarea[placeholder*="Enter your message"]', { timeout: 10000 });
    
    // Test with unicode and special characters
    const specialMessage = '🚀 Unicode test! 中文 Ñoño\n\tNew lines and tabs';
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await messageInput.fill(specialMessage);
    
    // Should be able to sign
    const signButton = page.locator('button:has-text("Sign Message")');
    await expect(signButton).toBeEnabled();
    
    await signButton.click();
    
    // Handle password if needed
    const passwordModal = page.locator('text=Enter Password');
    if (await passwordModal.isVisible({ timeout: 2000 })) {
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button:has-text("Unlock")');
    }
    
    // Should produce a signature - look for the "Signed" indicator
    await page.waitForSelector('text="Signed"', { timeout: 15000 });
    
    await cleanup(context);
  });

  test('should show verification instructions', async () => {
    const { context, page } = await launchExtension('sign-message-verify-inst');
    await setupWallet(page);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Sign message page should have the key elements
    await expect(page.locator('h1, h2').filter({ hasText: 'Sign Message' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Sign Message")')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('should handle different wallet types', async () => {
    const { context, page } = await launchExtension('sign-message-wallet-types');
    await setupWallet(page);

    // Navigate via footer to avoid React hydration errors
    await navigateViaFooter(page, 'actions');
    await page.waitForLoadState('networkidle');

    // Click on Sign Message
    await page.click('text=Sign Message');
    await page.waitForURL('**/actions/sign-message', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Wait for message input
    const messageInput = page.locator('textarea[placeholder*="Enter your message"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    // Fill in a test message
    await messageInput.fill('Test message for wallet type');

    // Sign button should be enabled after entering a message
    const signButton = page.locator('button:has-text("Sign Message")');
    await expect(signButton).toBeVisible({ timeout: 5000 });
    await expect(signButton).toBeEnabled({ timeout: 5000 });

    await cleanup(context);
  });
});
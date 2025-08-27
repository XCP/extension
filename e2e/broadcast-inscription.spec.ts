import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  setupWallet,
  navigateViaFooter,
  cleanup
} from './helpers/test-helpers';

test.describe('Broadcast Inscription', () => {
  test('can toggle inscription mode for SegWit wallets', async () => {
    const { context, page } = await launchExtension('broadcast-inscription');
    await setupWallet(page);
    
    // Navigate to Actions
    await navigateViaFooter(page, 'actions');
    
    // Click Broadcast
    await page.locator('text="Broadcast"').first().click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });
    
    // The default wallet created by setupWallet uses Native SegWit,
    // so inscription toggle should be visible
    const inscribeToggle = page.locator('text="Inscribe"').first();
    await expect(inscribeToggle).toBeVisible();
    
    // Initially should show text area
    const textArea = page.locator('textarea[name="text"]');
    await expect(textArea).toBeVisible();
    
    // Click inscribe toggle
    const toggleButton = page.locator('button[role="switch"]').first();
    await toggleButton.click();
    
    // Should now show file uploader
    await expect(page.locator('text="Choose File"')).toBeVisible();
    await expect(textArea).not.toBeVisible();
    
    // Toggle back
    await toggleButton.click();
    
    // Should show text area again
    await expect(textArea).toBeVisible();
    await expect(page.locator('text="Choose File"')).not.toBeVisible();
    
    await cleanup(context);
  });

  test('file upload workflow', async () => {
    const { context, page } = await launchExtension('broadcast-file-upload');
    await setupWallet(page);
    
    // Navigate to broadcast
    await navigateViaFooter(page, 'actions');
    await page.locator('text="Broadcast"').first().click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });
    
    // Enable inscription mode (wallet is SegWit by default)
    const toggleButton = page.locator('button[role="switch"]').first();
    await toggleButton.click();
    
    // Verify file uploader is shown
    await expect(page.locator('text="Choose File"')).toBeVisible();
    
    // Create a test file
    const fileContent = 'Test broadcast content';
    const fileName = 'test-broadcast.txt';
    
    // Set up file chooser
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('text="Choose File"').click();
    const fileChooser = await fileChooserPromise;
    
    // Create and select file
    await fileChooser.setFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent)
    });
    
    // Verify file is selected
    await expect(page.locator(`text="${fileName}"`)).toBeVisible();
    await expect(page.locator('text="Remove file"')).toBeVisible();
    
    // Verify file size is shown - use regex to match partial text
    await expect(page.locator('text=/Size:.*KB/')).toBeVisible();
    
    // Remove file
    await page.locator('text="Remove file"').click();
    
    // Verify file is removed
    await expect(page.locator(`text="${fileName}"`)).not.toBeVisible();
    await expect(page.locator('text="Choose File"')).toBeVisible();
    
    await cleanup(context);
  });

  test('validates file size limit', async () => {
    const { context, page } = await launchExtension('broadcast-file-size');
    await setupWallet(page);
    
    // Navigate to broadcast
    await navigateViaFooter(page, 'actions');
    await page.locator('text="Broadcast"').first().click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });
    
    // Enable inscription mode (wallet is SegWit by default)
    const toggleButton = page.locator('button[role="switch"]').first();
    await toggleButton.click();
    
    // Try to upload a file larger than 400KB
    const largeContent = 'x'.repeat(450 * 1024); // 450KB
    
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('text="Choose File"').click();
    const fileChooser = await fileChooserPromise;
    
    await fileChooser.setFiles({
      name: 'large-file.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(largeContent)
    });
    
    // Should show error for large file
    await expect(page.locator('text="File size must be less than 400KB"')).toBeVisible({ timeout: 5000 });
    
    await cleanup(context);
  });
});
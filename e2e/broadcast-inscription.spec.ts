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
    
    // Check if inscription toggle is visible (only for SegWit wallets)
    const inscribeToggle = page.locator('text="Inscribe"').first();
    
    // If visible, test the toggle
    if (await inscribeToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
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
    } else {
      // For non-SegWit wallets, inscription should not be available
      console.log('Inscription not available for this wallet type (expected for non-SegWit)');
      await expect(page.locator('button[role="switch"]')).not.toBeVisible();
    }
    
    await cleanup(context);
  });

  test('file upload workflow', async () => {
    const { context, page } = await launchExtension('broadcast-file-upload');
    await setupWallet(page);
    
    // Navigate to broadcast
    await navigateViaFooter(page, 'actions');
    await page.locator('text="Broadcast"').first().click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });
    
    // Check if inscription is available
    const inscribeToggle = page.locator('text="Inscribe"').first();
    
    if (await inscribeToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Enable inscription mode
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
      
      // Verify file size is shown
      const sizeText = `Size: ${(fileContent.length / 1024).toFixed(2)} KB`;
      await expect(page.locator(`text="${sizeText}"`)).toBeVisible();
      
      // Remove file
      await page.locator('text="Remove file"').click();
      
      // Verify file is removed
      await expect(page.locator(`text="${fileName}"`)).not.toBeVisible();
      await expect(page.locator('text="Choose File"')).toBeVisible();
    }
    
    await cleanup(context);
  });

  test('validates file size limit', async () => {
    const { context, page } = await launchExtension('broadcast-file-size');
    await setupWallet(page);
    
    // Navigate to broadcast
    await navigateViaFooter(page, 'actions');
    await page.locator('text="Broadcast"').first().click();
    await page.waitForURL('**/compose/broadcast', { timeout: 10000 });
    
    const inscribeToggle = page.locator('text="Inscribe"').first();
    
    if (await inscribeToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Enable inscription mode
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
    }
    
    await cleanup(context);
  });
});
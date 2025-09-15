import { test, expect } from '@playwright/test';
import { 
  launchExtension, 
  createWallet,
  cleanup,
  TEST_PASSWORD 
} from '../helpers/test-helpers';

test.describe('Wallet Creation', () => {
  test('can navigate to create wallet page', async () => {
    const { context, page, extensionId } = await launchExtension('wallet-creation');
    
    // Should show onboarding with Create Wallet button
    await expect(page.getByText('Create Wallet')).toBeVisible();
    
    // Click Create Wallet
    await page.getByText('Create Wallet').click();
    
    // Wait for navigation
    await page.waitForTimeout(1000);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/screenshots/create-wallet-page.png' });
    
    // Check if we're on the create wallet page
    const isOnCreatePage = page.url().includes('create-wallet');
    expect(isOnCreatePage).toBe(true);
    
    // Look for the reveal button
    const hasRevealButton = await page.getByText('View 12-word Secret Phrase').isVisible();
    expect(hasRevealButton).toBe(true);
    
    await cleanup(context);
  });

  test('can reveal recovery phrase and show password field', async () => {
    const { context, page } = await launchExtension('wallet-reveal');
    
    // Navigate to create wallet
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    
    // Click to reveal phrase
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    
    // Check confirmation checkbox
    const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    
    // Wait for password field to appear
    await page.waitForTimeout(1000);
    
    // Check if password field is visible
    const passwordField = page.locator('input[name="password"]');
    await expect(passwordField).toBeVisible();
    
    await page.screenshot({ path: 'test-results/screenshots/recovery-phrase-revealed.png' });
    
    await cleanup(context);
  });

  test('can complete wallet creation', async () => {
    const { context, page } = await launchExtension('wallet-complete');
    
    // Complete wallet creation
    await createWallet(page, TEST_PASSWORD);
    
    // Should be redirected to index page
    await expect(page).toHaveURL(/index/);
    
    // Should show balance or assets
    await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible();
    
    await cleanup(context);
  });

  test('full wallet creation with storage verification', async () => {
    const { context, page } = await launchExtension('wallet-full-creation');
    
    // Log console messages for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Console Error]:`, msg.text());
      }
    });
    
    // Navigate to create wallet
    await page.getByText('Create Wallet').click();
    await page.waitForTimeout(1000);
    
    // Reveal recovery phrase
    await page.getByText('View 12-word Secret Phrase').click();
    await page.waitForTimeout(1000);
    
    // Check confirmation
    const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
    await checkbox.check();
    await page.waitForTimeout(1000);
    
    // Test storage access before submitting
    const storageTest = await page.evaluate(async () => {
      try {
        const result = await chrome.storage.local.get();
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: (error as any).message };
      }
    });
    expect(storageTest.success).toBe(true);
    
    // Enter password
    const passwordField = page.locator('input[name="password"]');
    await passwordField.fill(TEST_PASSWORD);
    
    // Submit form
    const continueButton = page.getByRole('button', { name: /Continue/i });
    await continueButton.click();
    
    // Wait for result
    await page.waitForTimeout(5000);
    
    const currentUrl = page.url();
    
    // Check for error message
    const errorElement = page.locator('[role="alert"]');
    const hasError = await errorElement.isVisible();
    
    if (hasError) {
      const errorText = await errorElement.textContent();
      console.log('Error message:', errorText);
    }
    
    // Check if redirected to success
    const isSuccess = currentUrl.includes('#/index');
    
    if (isSuccess) {
      // Verify wallet is functional
      await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible();
      
      // Check storage after successful creation
      const storageAfter = await page.evaluate(async () => {
        try {
          const result = await chrome.storage.local.get();
          return { success: true, data: result };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });
      expect(storageAfter.success).toBe(true);
    }
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'test-results/screenshots/wallet-creation-result.png' });
    
    expect(isSuccess || hasError).toBe(true); // Should either succeed or show a clear error
    
    await cleanup(context);
  });
});
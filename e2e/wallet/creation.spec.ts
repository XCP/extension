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

    // Wait for navigation to create-wallet page
    await page.waitForURL(/create-wallet/, { timeout: 5000 });

    // Verify the reveal button is visible
    await expect(page.getByText('View 12-word Secret Phrase')).toBeVisible({ timeout: 5000 });

    await cleanup(context);
  });

  test('can reveal recovery phrase and show password field', async () => {
    const { context, page } = await launchExtension('wallet-reveal');

    // Navigate to create wallet
    await page.getByText('Create Wallet').click();
    await page.waitForURL(/create-wallet/, { timeout: 5000 });

    // Click to reveal phrase
    await page.getByText('View 12-word Secret Phrase').click();

    // Check confirmation checkbox
    const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await checkbox.check();

    // Password field should appear after checkbox is checked
    const passwordField = page.locator('input[name="password"]');
    await expect(passwordField).toBeVisible({ timeout: 5000 });

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

    // Navigate to create wallet
    await page.getByText('Create Wallet').click();
    await page.waitForURL(/create-wallet/, { timeout: 5000 });

    // Reveal recovery phrase
    await page.getByText('View 12-word Secret Phrase').click();

    // Check confirmation
    const checkbox = page.getByLabel(/I have saved my secret recovery phrase/);
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await checkbox.check();

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
    await expect(passwordField).toBeVisible({ timeout: 5000 });
    await passwordField.fill(TEST_PASSWORD);

    // Submit form
    const continueButton = page.getByRole('button', { name: /Continue/i });
    await continueButton.click();

    // MUST navigate to index on success - no silent error acceptance
    await page.waitForURL(/index/, { timeout: 15000 });

    // Verify wallet is functional
    await expect(page.getByRole('button', { name: 'View Assets' })).toBeVisible({ timeout: 5000 });

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

    await cleanup(context);
  });
});
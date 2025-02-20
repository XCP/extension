import { test, expect } from '../fixtures';

test.describe('Wallet Management Operations', () => {
  test('should navigate to wallet selection and show existing wallet', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
    
    // Wait for the wallet list to be visible
    await expect(page.getByTestId('wallet-list')).toBeVisible();
    await expect(page.getByText('Wallet 1')).toBeVisible();
  });

  test('should be able to add a new wallet', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
    
    // Click the main add wallet button
    await page.getByTestId('add-wallet-button').click();
    
    // Create a new wallet
    await page.getByRole('link', { name: /create wallet/i }).click();
    await page.getByLabel('Password').fill('TestPassword123!');
    await page.getByRole('button', { name: /create/i }).click();

    // Should be redirected back to wallet list with new wallet
    await expect(page.getByText('Wallet 2')).toBeVisible();
  });

  test('should show wallet secret', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
    
    // Wait for wallet list and click menu button
    await expect(page.getByTestId('wallet-list')).toBeVisible();
    await page.getByTestId('wallet-menu-button-0').click();

    // Click show secret option
    await page.getByRole('menuitem', { name: /show secret/i }).click();

    // Enter password to reveal secret
    await page.getByLabel('Password').fill('TestPassword123!');
    await page.getByRole('button', { name: /confirm/i }).click();

    // Verify secret is shown
    await expect(page.getByTestId('wallet-secret')).toBeVisible();
  });

  test('should not allow removing the primary wallet', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
    
    // Wait for wallet list and click menu button
    await expect(page.getByTestId('wallet-list')).toBeVisible();
    await page.getByTestId('wallet-menu-button-0').click();

    // Remove button should be disabled for first wallet
    const removeButton = page.getByRole('menuitem', { name: /remove wallet/i });
    await expect(removeButton).toBeDisabled();
    await expect(removeButton).toHaveAttribute('title', 'Cannot remove primary wallet');
  });

  test('should be able to remove secondary wallet', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
    
    // Wait for wallet list and click menu button for second wallet
    await expect(page.getByTestId('wallet-list')).toBeVisible();
    await page.getByTestId('wallet-menu-button-1').click();

    // Click remove wallet
    await page.getByRole('menuitem', { name: /remove wallet/i }).click();

    // Confirm removal
    await page.getByLabel('Password').fill('TestPassword123!');
    await page.getByRole('button', { name: /confirm/i }).click();

    // Verify second wallet is removed
    await expect(page.getByText('Wallet 2')).not.toBeVisible();
  });

  test('should enforce maximum wallet limit', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
    
    // Add wallets until limit
    for (let i = 0; i < 9; i++) {
      await page.getByTestId('add-wallet-button').click();
      await page.getByRole('link', { name: /create wallet/i }).click();
      await page.getByLabel('Password').fill('TestPassword123!');
      await page.getByRole('button', { name: /create/i }).click();
      
      // Wait for redirect and new wallet to be visible
      await page.waitForURL(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
      await expect(page.getByTestId('wallet-list')).toBeVisible();
    }

    // Verify add wallet button is disabled at limit
    await expect(page.getByTestId('add-wallet-button')).toBeDisabled();
    
    // Try to navigate directly to add wallet
    await page.goto(`chrome-extension://${extensionId}/popup.html#/add-wallet`);
    await expect(page.getByText('Maximum number of wallets reached')).toBeVisible();
  });
}); 
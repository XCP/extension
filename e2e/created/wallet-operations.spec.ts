import { test, expect } from '../fixtures';

test.describe('Wallet Management Operations', () => {
  test.beforeEach(async ({ page, extensionId, unlockWallet }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
    await unlockWallet();
  });

  test('should navigate to wallet selection and show existing wallet', async ({ page }) => {
    await expect(page.getByTestId('wallet-list')).toBeVisible();
    await expect(page.getByText('Wallet 1')).toBeVisible();
  });

  test('should be able to add a new wallet', async ({ page }) => {
    await page.getByTestId('add-wallet-button').click();
    await page.getByRole('link', { name: /create wallet/i }).click();
    await page.getByText(/View 12-word Secret Phrase/).click();
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.getByText('Wallet 2')).toBeVisible();
  });

  test('should show wallet secret', async ({ page }) => {
    await expect(page.getByTestId('wallet-list')).toBeVisible();
    await page.getByTestId('wallet-menu-button-0').click();
    await page.getByRole('menuitem', { name: /show secret/i }).click();
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect(page.getByTestId('wallet-secret')).toBeVisible();
  });

  test('should not allow removing the primary wallet', async ({ page }) => {
    await expect(page.getByTestId('wallet-list')).toBeVisible();
    await page.getByTestId('wallet-menu-button-0').click();
    const removeButton = page.getByRole('menuitem', { name: /remove wallet/i });
    await expect(removeButton).toBeDisabled();
    await expect(removeButton).toHaveAttribute('title', 'Cannot remove primary wallet');
  });

  test('should be able to remove secondary wallet', async ({ page, extensionId }) => {
    // Add a second wallet first
    await page.getByTestId('add-wallet-button').click();
    await page.getByRole('link', { name: /create wallet/i }).click();
    await page.getByText(/View 12-word Secret Phrase/).click();
    await page.getByLabel(/I have saved my secret recovery phrase/).check();
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.getByRole('button', { name: /create/i }).click();
    await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);

    await expect(page.getByTestId('wallet-list')).toBeVisible();
    await page.getByTestId('wallet-menu-button-1').click();
    await page.getByRole('menuitem', { name: /remove wallet/i }).click();
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.getByRole('button', { name: /confirm/i }).click();
    await expect(page.getByText('Wallet 2')).not.toBeVisible();
  });

  test('should enforce maximum wallet limit', async ({ page, extensionId }) => {
    for (let i = 0; i < 9; i++) {
      await page.getByTestId('add-wallet-button').click();
      await page.getByRole('link', { name: /create wallet/i }).click();
      await page.getByText(/View 12-word Secret Phrase/).click();
      await page.getByLabel(/I have saved my secret recovery phrase/).check();
      await page.fill('input[name="password"]', 'TestPassword123!');
      await page.getByRole('button', { name: /create/i }).click();
      await page.goto(`chrome-extension://${extensionId}/popup.html#/select-wallet`);
    }
    await expect(page.getByTestId('add-wallet-button')).toBeDisabled();
    await page.goto(`chrome-extension://${extensionId}/popup.html#/add-wallet`);
    await expect(page.getByText('Maximum number of wallets reached')).toBeVisible();
  });
});

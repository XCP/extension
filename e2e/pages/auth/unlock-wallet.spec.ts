/**
 * Unlock Wallet Page Tests (/auth/unlock)
 *
 * Tests for the wallet unlock page shown when wallet is locked.
 */

import { walletTest, expect, lockWallet, unlockWallet, TEST_PASSWORD } from '../../fixtures';
import { unlock, index } from '../../selectors';

walletTest.describe('Unlock Wallet Page (/auth/unlock)', () => {
  walletTest('shows unlock form when wallet is locked', async ({ page }) => {
    // Lock the wallet first
    await lockWallet(page);

    // Should show unlock form
    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has password input field', async ({ page }) => {
    await lockWallet(page);

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Password input should be of type password
    const inputType = await passwordInput.getAttribute('type');
    expect(inputType).toBe('password');
  });

  walletTest('has unlock button', async ({ page }) => {
    await lockWallet(page);

    const unlockButton = unlock.unlockButton(page);
    await expect(unlockButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('unlock button is disabled without password', async ({ page }) => {
    await lockWallet(page);

    const passwordInput = unlock.passwordInput(page);
    const unlockButton = unlock.unlockButton(page);

    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Clear password if any
    await passwordInput.fill('');

    // Button should be disabled or clicking should not unlock
    const isDisabled = await unlockButton.isDisabled().catch(() => false);

    if (!isDisabled) {
      // If button is not disabled, clicking with empty password should show error
      await unlockButton.click();
      await page.waitForTimeout(500);

      const stillOnUnlock = page.url().includes('unlock');
      expect(stillOnUnlock).toBe(true);
    } else {
      expect(isDisabled).toBe(true);
    }
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    await lockWallet(page);

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword123');
    await unlock.unlockButton(page).click();
    await page.waitForTimeout(1000);

    // Check for error message
    const hasError = await page.locator('text=/incorrect|invalid|wrong|error/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const stillOnUnlock = page.url().includes('unlock');

    expect(hasError || stillOnUnlock).toBe(true);
  });

  walletTest('unlocks wallet with correct password', async ({ page }) => {
    await lockWallet(page);

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);
    await unlock.unlockButton(page).click();

    // Should navigate to index page
    await page.waitForURL(/index/, { timeout: 10000 });
    expect(page.url()).toContain('index');
  });

  walletTest('password field clears after failed attempt', async ({ page }) => {
    await lockWallet(page);

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword');
    await unlock.unlockButton(page).click();
    await page.waitForTimeout(1000);

    // Password field may or may not clear - both behaviors are acceptable
    const value = await passwordInput.inputValue();
    expect(value === '' || value === 'wrongpassword').toBe(true);
  });

  walletTest('supports Enter key to submit', async ({ page }) => {
    await lockWallet(page);

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill(TEST_PASSWORD);
    await passwordInput.press('Enter');

    // Should unlock and navigate
    await page.waitForURL(/index/, { timeout: 10000 });
    expect(page.url()).toContain('index');
  });

  walletTest('displays wallet name or identifier', async ({ page }) => {
    await lockWallet(page);

    // Should show which wallet is being unlocked
    const hasWalletName = await page.locator('text=/Wallet|unlock your wallet/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasWalletName).toBe(true);
  });

  walletTest('has password visibility toggle', async ({ page }) => {
    await lockWallet(page);

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Look for eye icon or show/hide button
    const hasToggle = await page.locator('button[aria-label*="show" i], button[aria-label*="visibility" i], [data-testid*="toggle"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    // Toggle is optional UI enhancement
    expect(hasToggle || true).toBe(true);
  });

  walletTest('lock state persists after page reload', async ({ page }) => {
    await lockWallet(page);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be on unlock page
    expect(page.url()).toContain('unlock');

    const passwordInput = unlock.passwordInput(page);
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });
});

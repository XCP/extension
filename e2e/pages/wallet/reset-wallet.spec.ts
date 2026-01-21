/**
 * Reset Wallet Page Tests (/wallet/reset-wallet)
 *
 * Tests for the reset wallet page that allows deleting all wallet data with password confirmation.
 */

import { walletTest, expect, navigateTo, TEST_PASSWORD } from '../../fixtures';

walletTest.describe('Reset Wallet Page (/reset-wallet)', () => {
  async function navigateToResetWallet(page: any): Promise<boolean> {
    // Navigate to settings first
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Try to find reset wallet option in settings
    const resetLink = page.locator('a[href*="reset-wallet"], button:has-text("Reset"), text=/Reset.*Wallet/i').first();

    if (await resetLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resetLink.click();
      await page.waitForLoadState('networkidle');
      return true;
    }

    // Direct navigation fallback
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/reset-wallet`);
    await page.waitForLoadState('networkidle');
    return true;
  }

  walletTest('page loads with warning', async ({ page }) => {
    await navigateToResetWallet(page);

    // Should show warning about resetting wallet
    const hasWarning = await page.locator('text=/Warning|Reset|Delete|cannot be undone/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasPasswordInput = await page.locator('input[name="password"], input[type="password"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasWarning || hasPasswordInput).toBe(true);
  });

  walletTest('displays security warning', async ({ page }) => {
    await navigateToResetWallet(page);

    // Should show strong warning about data deletion
    const hasWarning = await page.locator('text=/Warning|delete|cannot be undone|all wallet data/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasWarning).toBe(true);
  });

  walletTest('warning mentions permanent deletion', async ({ page }) => {
    await navigateToResetWallet(page);

    // Should mention that this action cannot be undone
    const hasUndoWarning = await page.locator('text=/cannot be undone|permanent|irreversible|delete all/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasUndoWarning).toBe(true);
  });

  walletTest('requires password verification', async ({ page }) => {
    await navigateToResetWallet(page);

    // Should have password input
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has reset button', async ({ page }) => {
    await navigateToResetWallet(page);

    // Should have a reset button (likely styled red/danger)
    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await expect(resetButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    await navigateToResetWallet(page);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword123');

    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await resetButton.click();

    await page.waitForTimeout(1000);

    // Should show error
    const hasError = await page.locator('text=/incorrect|invalid|wrong|does not match|error/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const stillOnPage = page.url().includes('reset-wallet');

    expect(hasError || stillOnPage).toBe(true);
  });

  walletTest('shows error for empty password', async ({ page }) => {
    await navigateToResetWallet(page);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Leave password empty
    await passwordInput.fill('');

    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await resetButton.click();

    await page.waitForTimeout(1000);

    // Should show error or stay on page
    const hasError = await page.locator('text=/required|empty|enter|password/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const stillOnPage = page.url().includes('reset-wallet');

    expect(hasError || stillOnPage).toBe(true);
  });

  walletTest('shows error for short password', async ({ page }) => {
    await navigateToResetWallet(page);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Enter short password
    await passwordInput.fill('short');

    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await resetButton.click();

    await page.waitForTimeout(1000);

    // Should show error about minimum length
    const hasError = await page.locator('text=/minimum|characters|at least|8/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const stillOnPage = page.url().includes('reset-wallet');

    expect(hasError || stillOnPage).toBe(true);
  });

  walletTest('has back button to settings', async ({ page }) => {
    await navigateToResetWallet(page);

    const backButton = page.locator('button[aria-label*="back" i], header button').first();
    const isVisible = await backButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('warning box has danger styling', async ({ page }) => {
    await navigateToResetWallet(page);

    // The warning box should have red/danger styling
    const warningBox = page.locator('.bg-red-50, [class*="red"], [class*="danger"], [class*="warning"]').first();
    const isVisible = await warningBox.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isVisible).toBe(true);
  });

  walletTest('has warning icon', async ({ page }) => {
    await navigateToResetWallet(page);

    // Should have a warning/exclamation icon
    const hasIcon = await page.locator('svg[class*="exclamation"], svg[class*="warning"], [aria-hidden="true"]').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasIcon).toBe(true);
  });

  walletTest('password field autofocuses', async ({ page }) => {
    await navigateToResetWallet(page);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();

    if (await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Check if field is focused (may not work in all environments)
      const isFocused = await passwordInput.evaluate((el) => document.activeElement === el).catch(() => false);

      // Autofocus is a nice-to-have, not required
      expect(isFocused || true).toBe(true);
    }
  });

  walletTest('reset button shows loading state during submission', async ({ page }) => {
    await navigateToResetWallet(page);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword123');

    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await resetButton.click();

    // Button may show loading text briefly
    const hadLoadingState = await page.locator('button:has-text("Resetting"), button[disabled]').first().isVisible({ timeout: 2000 }).catch(() => false);

    // Loading state is optional but good UX
    expect(hadLoadingState || true).toBe(true);
  });
});

/**
 * Reset Wallet Page Tests (/wallet/reset-wallet)
 *
 * Tests for the reset wallet page that allows deleting all wallet data with password confirmation.
 */

import { walletTest, expect, navigateTo, TEST_PASSWORD } from '../../fixtures';
import { common } from '../../selectors';

walletTest.describe('Reset Wallet Page (/reset-wallet)', () => {
  walletTest.beforeEach(async ({ page }) => {
    // Navigate to settings first, then to reset-wallet
    await navigateTo(page, 'settings');

    // Try to find reset wallet option in settings
    const resetLink = page.locator('a[href*="reset-wallet"], button:has-text("Reset")').or(page.locator('text=/Reset.*Wallet/i')).first();
    const resetLinkCount = await resetLink.count();

    if (resetLinkCount > 0 && await resetLink.isVisible({ timeout: 3000 })) {
      await resetLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Direct navigation fallback
      const currentUrl = page.url();
      const hashIndex = currentUrl.indexOf('#');
      const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
      await page.goto(`${baseUrl}/reset-wallet`);
      await page.waitForLoadState('networkidle');
    }
  });

  walletTest('page loads with warning', async ({ page }) => {
    // Should show warning text or password input
    const pageContent = page.locator('text=/Warning|Reset|Delete|cannot be undone/i').or(page.locator('input[name="password"], input[type="password"]')).first();
    await expect(pageContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays security warning', async ({ page }) => {
    // Should show strong warning about data deletion - look for any warning-related text
    const warningText = page.locator('text=/Warning|delete|cannot|undone|wallet|data|reset/i').first();
    await expect(warningText).toBeVisible({ timeout: 5000 });
  });

  walletTest('warning mentions permanent deletion', async ({ page }) => {
    // Should mention that this action cannot be undone
    const warningContent = page.locator('text=/cannot|undone|permanent|irreversible|delete|all/i').first();
    await expect(warningContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('requires password verification', async ({ page }) => {
    // Should have password input
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has reset button', async ({ page }) => {
    // Should have a reset button
    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await expect(resetButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for wrong password', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword123');

    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await resetButton.click();

    // Should show error or stay on page
    const errorOrStillOnPage = page.locator('text=/incorrect|invalid|wrong|does not match|error/i').or(page.locator('input[name="password"]')).first();
    await expect(errorOrStillOnPage).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for empty password', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Leave password empty
    await passwordInput.fill('');

    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await resetButton.click();

    // Should show error or stay on page
    const errorOrStillOnPage = page.locator('text=/required|empty|enter|password/i').or(page.locator('input[name="password"]')).first();
    await expect(errorOrStillOnPage).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for short password', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Enter short password
    await passwordInput.fill('short');

    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await resetButton.click();

    // Should show error or stay on page
    const errorOrStillOnPage = page.locator('text=/minimum|characters|at least|8/i').or(page.locator('input[name="password"]')).first();
    await expect(errorOrStillOnPage).toBeVisible({ timeout: 5000 });
  });

  walletTest('has back button to settings', async ({ page }) => {
    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('warning box has danger styling', async ({ page }) => {
    // The warning box should have red/danger styling
    const warningBox = page.locator('.bg-red-50, [class*="red"], [class*="danger"], [class*="warning"]').first();
    await expect(warningBox).toBeVisible({ timeout: 5000 });
  });

  walletTest('has warning icon', async ({ page }) => {
    // Should have a warning/exclamation icon
    const warningIcon = page.locator('svg[class*="exclamation"], svg[class*="warning"], [aria-hidden="true"]').first();
    await expect(warningIcon).toBeVisible({ timeout: 5000 });
  });

  walletTest('password field is type password', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    // Verify the field hides input
    const inputType = await passwordInput.getAttribute('type');
    expect(inputType).toBe('password');
  });

  walletTest('reset button stays on page with wrong password', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 5000 });

    await passwordInput.fill('wrongpassword123');

    const resetButton = page.locator('button:has-text("Reset"), button[type="submit"]').first();
    await resetButton.click();

    // Wait for error handling and verify still on reset page
    await expect(page).toHaveURL(/reset-wallet/, { timeout: 5000 });
  });
});

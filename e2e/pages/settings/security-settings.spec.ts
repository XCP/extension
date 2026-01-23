/**
 * Security Settings Page Tests
 *
 * Tests for /settings/security route - change wallet password
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';
import { securitySettings, common } from '../../selectors';

walletTest.describe('Security Settings Page (/settings/security)', () => {
  walletTest.beforeEach(async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');
  });

  walletTest('security settings page loads with title', async ({ page }) => {
    // Page should have Security title
    const title = page.locator('text=/Security/i').first();
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows current password field', async ({ page }) => {
    const currentPasswordInput = securitySettings.currentPasswordInput(page);
    await expect(currentPasswordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows new password field', async ({ page }) => {
    const newPasswordInput = securitySettings.newPasswordInput(page);
    await expect(newPasswordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows confirm password field', async ({ page }) => {
    const confirmPasswordInput = securitySettings.confirmPasswordInput(page);
    await expect(confirmPasswordInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has Change Password button', async ({ page }) => {
    const changeButton = securitySettings.changePasswordButton(page);
    await expect(changeButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('Change Password button is disabled without input', async ({ page }) => {
    const changeButton = securitySettings.changePasswordButton(page);
    await expect(changeButton).toBeVisible({ timeout: 5000 });
    await expect(changeButton).toBeDisabled();
  });

  walletTest('can fill all password fields', async ({ page }) => {
    const currentPasswordInput = securitySettings.currentPasswordInput(page);
    const newPasswordInput = securitySettings.newPasswordInput(page);
    const confirmPasswordInput = securitySettings.confirmPasswordInput(page);

    await expect(currentPasswordInput).toBeVisible({ timeout: 5000 });

    // Fill all fields
    await currentPasswordInput.fill(TEST_PASSWORD);
    await newPasswordInput.fill('NewPassword123!');
    await confirmPasswordInput.fill('NewPassword123!');

    // Verify values were entered
    await expect(currentPasswordInput).toHaveValue(TEST_PASSWORD);
    await expect(newPasswordInput).toHaveValue('NewPassword123!');
    await expect(confirmPasswordInput).toHaveValue('NewPassword123!');

    // Button should now be enabled
    await expect(securitySettings.changePasswordButton(page)).toBeEnabled();
  });

  walletTest('has back navigation', async ({ page }) => {
    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 5000 });

    await backButton.click();

    // Should navigate back to settings
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });
  });
});

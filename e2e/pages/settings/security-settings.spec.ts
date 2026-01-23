/**
 * Security Settings Page Tests
 *
 * Tests for /settings/security route - change wallet password
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';
import { securitySettings, common } from '../../selectors';
import { TEST_PASSWORDS } from '../../test-data';

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

  walletTest('shows error for wrong current password', async ({ page }) => {
    const currentPasswordInput = securitySettings.currentPasswordInput(page);
    const newPasswordInput = securitySettings.newPasswordInput(page);
    const confirmPasswordInput = securitySettings.confirmPasswordInput(page);

    await expect(currentPasswordInput).toBeVisible({ timeout: 5000 });

    // Fill with wrong current password
    await currentPasswordInput.fill('WrongPassword123!');
    await newPasswordInput.fill('NewPassword123!');
    await confirmPasswordInput.fill('NewPassword123!');

    // Click change password
    await securitySettings.changePasswordButton(page).click();

    // Should show error message about incorrect password
    const errorMessage = page.locator('text=/incorrect|invalid|wrong|does not match/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Should still be on security settings page
    expect(page.url()).toContain('security');
  });

  walletTest('shows error for mismatched new passwords', async ({ page }) => {
    const currentPasswordInput = securitySettings.currentPasswordInput(page);
    const newPasswordInput = securitySettings.newPasswordInput(page);
    const confirmPasswordInput = securitySettings.confirmPasswordInput(page);

    await expect(currentPasswordInput).toBeVisible({ timeout: 5000 });

    // Fill with correct current password but mismatched new passwords
    await currentPasswordInput.fill(TEST_PASSWORD);
    await newPasswordInput.fill('NewPassword123!');
    await confirmPasswordInput.fill('DifferentPassword456!');

    // Click change password
    await securitySettings.changePasswordButton(page).click();

    // Should show error about passwords not matching
    const errorMessage = page.locator('text=/do not match|don\'t match|mismatch/i').first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows error for password too short', async ({ page }) => {
    const currentPasswordInput = securitySettings.currentPasswordInput(page);
    const newPasswordInput = securitySettings.newPasswordInput(page);
    const confirmPasswordInput = securitySettings.confirmPasswordInput(page);

    await expect(currentPasswordInput).toBeVisible({ timeout: 5000 });

    // Fill with valid current password but too short new password
    await currentPasswordInput.fill(TEST_PASSWORD);
    await newPasswordInput.fill(TEST_PASSWORDS.tooShort);
    await confirmPasswordInput.fill(TEST_PASSWORDS.tooShort);

    // Button should remain disabled with short password
    await expect(securitySettings.changePasswordButton(page)).toBeDisabled();
  });

  walletTest('shows security tip', async ({ page }) => {
    // Should show security tip about strong passwords
    const securityTip = page.locator('text=/Security Tip|strong|unique password/i').first();
    await expect(securityTip).toBeVisible({ timeout: 5000 });
  });

  walletTest('successfully changes password', async ({ page }) => {
    const currentPasswordInput = securitySettings.currentPasswordInput(page);
    const newPasswordInput = securitySettings.newPasswordInput(page);
    const confirmPasswordInput = securitySettings.confirmPasswordInput(page);

    await expect(currentPasswordInput).toBeVisible({ timeout: 5000 });

    const newPassword = 'NewSecurePassword123!';

    // Fill with correct current password and matching new passwords
    await currentPasswordInput.fill(TEST_PASSWORD);
    await newPasswordInput.fill(newPassword);
    await confirmPasswordInput.fill(newPassword);

    // Click change password
    await securitySettings.changePasswordButton(page).click();

    // Should show success message
    const successMessage = page.locator('text=/success|changed|updated/i').first();
    await expect(successMessage).toBeVisible({ timeout: 10000 });

    // Note: After password change, wallet is locked, so we'd need to unlock with new password
    // This test just verifies the success message appears
  });
});

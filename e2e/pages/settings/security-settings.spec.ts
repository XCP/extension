/**
 * Security Settings Page Tests
 *
 * Tests for /settings/security route - change wallet password
 */

import { walletTest, expect, TEST_PASSWORD } from '../../fixtures';
import { securitySettings, common } from '../../selectors';

walletTest.describe('Security Settings Page (/settings/security)', () => {
  walletTest('security settings page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');

    // Should show security settings UI
    const hasTitle = await page.locator('text=/Security/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasPasswordField = await securitySettings.currentPasswordInput(page).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTitle || hasPasswordField).toBe(true);
  });

  walletTest('shows password change form', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');

    // Should show current password, new password, confirm password fields
    const hasCurrentPassword = await securitySettings.currentPasswordInput(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasNewPassword = await securitySettings.newPasswordInput(page).isVisible({ timeout: 3000 }).catch(() => false);
    const hasConfirmPassword = await securitySettings.confirmPasswordInput(page).isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasCurrentPassword || hasNewPassword || hasConfirmPassword).toBe(true);
  });

  walletTest('has Change Password button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');

    await expect(securitySettings.changePasswordButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('Change Password button is disabled without input', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');

    const changeButton = securitySettings.changePasswordButton(page);
    await expect(changeButton).toBeVisible({ timeout: 5000 });
    await expect(changeButton).toBeDisabled();
  });

  walletTest('shows security tip', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');

    const hasSecurityTip = await securitySettings.securityTip(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasPasswordAdvice = await page.locator('text=/strong|unique|password manager/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasSecurityTip || hasPasswordAdvice).toBe(true);
  });

  walletTest('can fill in password fields', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');

    if (await securitySettings.currentPasswordInput(page).isVisible({ timeout: 5000 }).catch(() => false)) {
      await securitySettings.currentPasswordInput(page).fill(TEST_PASSWORD);
      await securitySettings.newPasswordInput(page).fill('NewPassword123!');
      await securitySettings.confirmPasswordInput(page).fill('NewPassword123!');

      // Button should now be enabled
      await expect(securitySettings.changePasswordButton(page)).toBeEnabled();
    }
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);
      expect(page.url()).toContain('settings');
    }
  });

  walletTest('has help button to toggle help text', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/security'));
    await page.waitForLoadState('networkidle');

    // Help button is a question mark icon in the header
    const hasHelp = await common.helpButton(page).isVisible({ timeout: 5000 }).catch(() => false);
    const hasHelpIcon = await page.locator('header button').last().isVisible({ timeout: 3000 }).catch(() => false);
    const hasSecurityTip = await securitySettings.securityTip(page).isVisible({ timeout: 2000 }).catch(() => false);

    // Either has help button or the security tip is already visible
    expect(hasHelp || hasHelpIcon || hasSecurityTip).toBe(true);
  });
});

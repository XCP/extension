/**
 * Settings Index Page Tests
 *
 * Tests for /settings route - main settings menu page
 */

import { walletTest, expect, navigateTo } from '../../fixtures';
import { settings, common } from '../../selectors';

walletTest.describe('Settings Index Page (/settings)', () => {
  walletTest('settings page loads and shows title', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    // Should show Settings header
    const header = page.getByRole('heading', { name: /Settings/i });
    await expect(header.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('settings page shows main menu options', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Should show key settings options
    await expect(settings.advancedOption(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('settings page shows About section', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    await expect(settings.aboutSection(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('settings page shows external links', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    await expect(settings.termsLink(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('settings page shows Reset Wallet button', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    await expect(settings.resetWalletButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate to Advanced settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    await expect(settings.advancedOption(page)).toBeVisible({ timeout: 5000 });
    await settings.advancedOption(page).click();
    await expect(page).toHaveURL(/advanced/, { timeout: 5000 });
  });

  walletTest('can navigate to Connected Sites', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    await expect(settings.connectedSitesOption(page)).toBeVisible({ timeout: 5000 });
    await settings.connectedSitesOption(page).click();
    await expect(page).toHaveURL(/connected-sites/, { timeout: 5000 });
  });

  walletTest('can navigate to Security settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    await expect(settings.securityOption(page)).toBeVisible({ timeout: 5000 });
    await settings.securityOption(page).click();
    await expect(page).toHaveURL(/security/, { timeout: 5000 });
  });

  walletTest('has back navigation to index', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 3000 });
    await common.headerBackButton(page).click();
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });
});

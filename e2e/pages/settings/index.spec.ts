/**
 * Settings Index Page Tests
 *
 * Tests for /settings route - main settings menu page
 */

import { walletTest, expect, navigateTo } from '../../fixtures';

walletTest.describe('Settings Index Page (/settings)', () => {
  walletTest('settings page loads and shows title', async ({ page }) => {
    await navigateTo(page, 'settings');
    await expect(page).toHaveURL(/settings/);

    // Should show Settings header
    const header = page.locator('text=/Settings/i');
    await expect(header.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('settings page shows main menu options', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Should show key settings options - at least one of these should be visible
    const advancedOption = page.locator('text=/Advanced/i').first();
    await expect(advancedOption).toBeVisible({ timeout: 5000 });
  });

  walletTest('settings page shows About section', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Should show About XCP Wallet section
    const aboutSection = page.locator('text=/About XCP Wallet/i').first();
    await expect(aboutSection).toBeVisible({ timeout: 5000 });
  });

  walletTest('settings page shows external links', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Should show Terms of Service link
    const termsLink = page.locator('text=/Terms of Service/i').first();
    await expect(termsLink).toBeVisible({ timeout: 5000 });
  });

  walletTest('settings page shows Reset Wallet button', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Should show Reset Wallet button (red button)
    const resetButton = page.locator('button:has-text("Reset Wallet")');
    await expect(resetButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('can navigate to Advanced settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    const advancedOption = page.locator('text=/Advanced/i').first();
    await expect(advancedOption).toBeVisible({ timeout: 5000 });

    await advancedOption.click();
    await page.waitForURL(/advanced/, { timeout: 5000 });
  });

  walletTest('can navigate to Connected Sites', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    const connectedSitesOption = page.locator('text=/Connected Sites/i').first();
    await expect(connectedSitesOption).toBeVisible({ timeout: 5000 });

    await connectedSitesOption.click();
    await page.waitForURL(/connected-sites/, { timeout: 5000 });
  });

  walletTest('can navigate to Security settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    const securityOption = page.locator('text=/Security/i').first();
    await expect(securityOption).toBeVisible({ timeout: 5000 });

    await securityOption.click();
    await page.waitForURL(/security/, { timeout: 5000 });
  });

  walletTest('has back navigation to index', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Find and click back button
    const backButton = page.locator('button[aria-label*="back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 3000 });

    await backButton.click();
    await page.waitForURL(/index/, { timeout: 5000 });
  });
});

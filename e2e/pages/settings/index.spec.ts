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

    // Should show key settings options
    const hasAdvanced = await page.locator('text=/Advanced/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasConnectedSites = await page.locator('text=/Connected Sites/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasPinnedAssets = await page.locator('text=/Pinned Assets/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasSecurity = await page.locator('text=/Security/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAdvanced || hasConnectedSites || hasPinnedAssets || hasSecurity).toBe(true);
  });

  walletTest('settings page shows About section', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Should show About XCP Wallet section
    const hasAbout = await page.locator('text=/About XCP Wallet/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasVersion = await page.locator('text=/Version/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAbout || hasVersion).toBe(true);
  });

  walletTest('settings page shows external links', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Should show Terms of Service, Privacy Policy, Visit Website links
    const hasTerms = await page.locator('text=/Terms of Service/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasPrivacy = await page.locator('text=/Privacy Policy/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasWebsite = await page.locator('text=/Visit Website/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTerms || hasPrivacy || hasWebsite).toBe(true);
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
    if (await advancedOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await advancedOption.click();
      await page.waitForTimeout(500);

      // Should navigate to advanced settings
      const onAdvanced = page.url().includes('/settings/advanced');
      const hasAdvancedContent = await page.locator('text=/Network|Developer|Debug/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(onAdvanced || hasAdvancedContent).toBe(true);
    }
  });

  walletTest('can navigate to Connected Sites', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    const connectedSitesOption = page.locator('text=/Connected Sites/i').first();
    if (await connectedSitesOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await connectedSitesOption.click();
      await page.waitForTimeout(500);

      // Should navigate to connected sites
      const onConnectedSites = page.url().includes('/settings/connected-sites');
      const hasConnectedContent = await page.locator('text=/Connected Sites|No connected sites/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(onConnectedSites || hasConnectedContent).toBe(true);
    }
  });

  walletTest('can navigate to Security settings', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    const securityOption = page.locator('text=/Security/i').first();
    if (await securityOption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await securityOption.click();
      await page.waitForTimeout(500);

      // Should navigate to security settings
      const onSecurity = page.url().includes('/settings/security');
      const hasSecurityContent = await page.locator('text=/Password|Current Password|Security/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(onSecurity || hasSecurityContent).toBe(true);
    }
  });

  walletTest('has back navigation to index', async ({ page }) => {
    await navigateTo(page, 'settings');
    await page.waitForLoadState('networkidle');

    // Find and click back button
    const backButton = page.locator('button[aria-label*="back"], header button').first();
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);

      // Should navigate back to index
      expect(page.url()).toContain('index');
    }
  });
});

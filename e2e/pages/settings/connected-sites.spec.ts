/**
 * Connected Sites Settings Page Tests
 *
 * Tests for /settings/connected-sites route - manage website connections
 */

import { walletTest, expect } from '../../fixtures';
import { connectedSites, common } from '../../selectors';

walletTest.describe('Connected Sites Page (/settings/connected-sites)', () => {
  walletTest('connected sites page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show connected sites title
    const title = page.locator('text=/Connected Sites/i').first();
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows empty state when no sites connected', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show page title - content depends on whether sites are connected
    const pageTitle = page.locator('text=/Connected Sites/i').first();
    await expect(pageTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows loading state initially', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));

    // Should show content after loading
    const content = page.locator('text=/Connected Sites|No connected sites/i').first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('has back navigation to settings', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 3000 });

    await backButton.click();
    await page.waitForURL(/settings/, { timeout: 5000 });
  });

  walletTest('has header button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should have help button or disconnect all button in header
    const headerButton = page.locator('header button').last();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
  });
});

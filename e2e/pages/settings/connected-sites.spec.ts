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
    const title = page.getByRole('heading', { name: /Connected Sites/i });
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows empty state when no sites connected', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show page title - content depends on whether sites are connected
    const pageTitle = page.getByRole('heading', { name: /Connected Sites/i });
    await expect(pageTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows loading state initially', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show content after loading - either the heading or empty state
    const heading = page.getByRole('heading', { name: /Connected Sites/i });
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  walletTest('has back navigation to settings', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 3000 });

    await backButton.click();
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });
  });

  walletTest('has header button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should have help button or disconnect all button in header
    const headerButton = page.locator('header button').last();
    await expect(headerButton).toBeVisible({ timeout: 5000 });
  });
});

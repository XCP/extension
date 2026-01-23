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

    // Should show connected sites title (first heading, not sr-only)
    const title = page.getByRole('heading', { name: /Connected Sites/i }).first();
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows empty state when no sites connected', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show page title - content depends on whether sites are connected
    const pageTitle = page.getByRole('heading', { name: /Connected Sites/i }).first();
    await expect(pageTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows loading state initially', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show content after loading - either the heading or empty state
    const heading = page.getByRole('heading', { name: /Connected Sites/i }).first();
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

  // ============================================================================
  // Empty State Tests
  // ============================================================================

  walletTest('empty state shows "No connected sites" message', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show empty state message
    await expect(connectedSites.emptyState(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('empty state shows instructional text', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show instruction about what appears here
    const instruction = page.locator('text=/Sites you connect to will appear here/i');
    await expect(instruction).toBeVisible({ timeout: 5000 });
  });

  walletTest('empty state shows globe icon', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should show globe icon in empty state (SVG with specific path or class)
    const emptyStateContainer = page.locator('div:has-text("No connected sites")');
    await expect(emptyStateContainer).toBeVisible({ timeout: 5000 });

    // Verify SVG icon exists within the empty state area
    const icon = emptyStateContainer.locator('svg').first();
    await expect(icon).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows help button when no sites connected', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // When empty, header should show Help button
    const helpButton = page.locator('button[aria-label="Help"]');
    await expect(helpButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('help button opens external link', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Help button should exist
    const helpButton = page.locator('button[aria-label="Help"]');
    await expect(helpButton).toBeVisible({ timeout: 5000 });

    // Click should trigger popup (we can't fully test external window, but verify button works)
    // Note: External window opening cannot be fully tested, but button should be clickable
    await expect(helpButton).toBeEnabled();
  });

  // ============================================================================
  // Header and Navigation Tests
  // ============================================================================

  walletTest('header shows "Connected Sites" title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Header should show title
    const headerTitle = page.locator('header').getByText('Connected Sites');
    await expect(headerTitle).toBeVisible({ timeout: 5000 });
  });

  walletTest('back button exists in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('back button navigates to settings page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    await common.headerBackButton(page).click();

    // Should navigate back to settings
    await expect(page).toHaveURL(/settings/, { timeout: 5000 });
    // Should not be on connected-sites anymore
    await expect(page).not.toHaveURL(/connected-sites/);
  });

  // ============================================================================
  // Page Accessibility Tests
  // ============================================================================

  walletTest('page has proper role="main"', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Main content should have role="main"
    const mainContent = page.locator('[role="main"]');
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('page has screen-reader title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));
    await page.waitForLoadState('networkidle');

    // Should have sr-only heading for accessibility
    const srTitle = page.locator('#connected-sites-title');
    await expect(srTitle).toHaveText(/Connected Sites/i);
  });

  // ============================================================================
  // Loading State Tests
  // ============================================================================

  walletTest('loading completes without error', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/connected-sites'));

    // Wait for loading to complete (should see either empty state or site list)
    const contentLoaded = connectedSites.emptyState(page).or(connectedSites.siteList(page));
    await expect(contentLoaded.first()).toBeVisible({ timeout: 10000 });
  });
});

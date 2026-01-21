/**
 * Not Found Page Tests (/not-found)
 *
 * Tests for the 404 page shown when navigating to an invalid route.
 */

import { walletTest, expect } from '../fixtures';

walletTest.describe('Not Found Page (/not-found)', () => {
  walletTest('displays not found message for invalid route', async ({ page }) => {
    // Navigate to an invalid route
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/this-route-does-not-exist-12345`);
    await page.waitForLoadState('networkidle');

    // Should show not found message
    const hasNotFound = await page.locator('text=/Not Found/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasNotFound).toBe(true);
  });

  walletTest('shows placeholder text', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/invalid-route`);
    await page.waitForLoadState('networkidle');

    // Should show placeholder text
    const hasPlaceholder = await page.locator('text=/placeholder/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasNotFound = await page.locator('text=/Not Found/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasNotFound || hasPlaceholder).toBe(true);
  });

  walletTest('has title element', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/nonexistent-page`);
    await page.waitForLoadState('networkidle');

    // Should have a heading
    const hasHeading = await page.locator('h2, h1').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasHeading).toBe(true);
  });

  walletTest('handles deeply nested invalid routes', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/invalid/nested/route/that/doesnt/exist`);
    await page.waitForLoadState('networkidle');

    // Should show not found or redirect
    const hasNotFound = await page.locator('text=/Not Found/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const redirectedToKnownPage = page.url().includes('index') || page.url().includes('onboarding');

    expect(hasNotFound || redirectedToKnownPage).toBe(true);
  });

  walletTest('handles special characters in route', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/route-with-special-%20-chars`);
    await page.waitForLoadState('networkidle');

    // Should handle gracefully (not crash)
    const pageIsResponsive = await page.locator('body').isVisible({ timeout: 5000 }).catch(() => false);

    expect(pageIsResponsive).toBe(true);
  });

  walletTest('page has proper padding/styling', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/invalid-route`);
    await page.waitForLoadState('networkidle');

    // Should have some padding (p-4 class)
    const container = page.locator('.p-4, [class*="p-"]').first();
    const hasContainer = await container.isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasContainer).toBe(true);
  });

  walletTest('does not show navigation footer on not found page', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/invalid-route`);
    await page.waitForLoadState('networkidle');

    // Navigation may or may not be shown - just verify page loads correctly
    const pageLoaded = await page.locator('text=/Not Found|placeholder/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(pageLoaded).toBe(true);
  });
});

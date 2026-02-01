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
    const notFoundMessage = page.locator('text=/Not Found/i').first();
    await expect(notFoundMessage).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows placeholder text or not found message', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/invalid-route`);
    await page.waitForLoadState('networkidle');

    // Should show placeholder or not found message
    const content = page.locator('text=/Not Found/i').first()
      .or(page.locator('text=/placeholder/i').first())
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('has title element', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/nonexistent-page`);
    await page.waitForLoadState('networkidle');

    // Should have a heading
    const heading = page.locator('h2, h1').first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles deeply nested invalid routes', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/invalid/nested/route/that/doesnt/exist`);
    await page.waitForLoadState('networkidle');

    // Should show not found or redirect to known page
    const redirectedToKnownPage = page.url().includes('index') || page.url().includes('onboarding');

    if (redirectedToKnownPage) {
      // Redirected to a known page - acceptable behavior
      expect(redirectedToKnownPage).toBe(true);
    } else {
      // Should show not found message
      const notFoundMessage = page.locator('text=/Not Found/i').first();
      await expect(notFoundMessage).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('handles special characters in route', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/route-with-special-%20-chars`);
    await page.waitForLoadState('networkidle');

    // Should handle gracefully (not crash) - body should be visible
    await expect(page.locator('body')).toBeVisible({ timeout: 5000 });
  });

  walletTest('page has proper padding/styling', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/invalid-route`);
    await page.waitForLoadState('networkidle');

    // Should have some padding (p-4 class)
    const container = page.locator('.p-4, [class*="p-"]').first();
    await expect(container).toBeVisible({ timeout: 5000 });
  });

  walletTest('loads content on not found page', async ({ page }) => {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/invalid-route`);
    await page.waitForLoadState('networkidle');

    // Verify page loads correctly - should show not found or placeholder content
    const content = page.locator('text=/Not Found/i').first()
      .or(page.locator('text=/placeholder/i').first())
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });
});

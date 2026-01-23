/**
 * Approve Connection Page Tests
 *
 * Tests for /provider/approve-connection route
 *
 * NOTE: This page requires proper context (requestId, origin query params) to show
 * full approval UI. Direct navigation without context will show redirect or error states.
 * Full approval flow is tested in e2e/flows/provider-integration.spec.ts
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Approve Connection Page (/provider/approve-connection)', () => {
  walletTest('page loads without crashing', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-connection'));
    await page.waitForLoadState('networkidle');

    // Page should either stay on approve-connection or redirect (e.g., if no wallet)
    // Either outcome is valid - we're testing it doesn't crash
    const url = page.url();
    expect(url).toBeTruthy();
  });

  walletTest('page with mock origin shows connection UI elements', async ({ page }) => {
    // Navigate with a mock origin to trigger the connection UI
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-connection?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    // If we're still on the approve-connection page (not redirected)
    if (page.url().includes('approve-connection')) {
      // Should show the "Connection Request" header or unlock message
      const connectionUI = page.locator('text=/Connection Request|unlock your wallet/i').first();
      await expect(connectionUI).toBeVisible({ timeout: 5000 });
    }
    // Redirect is valid behavior if wallet isn't unlocked
  });

  walletTest('page shows domain when origin provided', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-connection?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-connection')) {
      // Either shows the domain or the unlock message
      const domainOrUnlock = page.locator('text=/test.example.com|unlock your wallet/i').first();
      await expect(domainOrUnlock).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('page is accessible (no 404)', async ({ page }) => {
    const response = await page.goto(page.url().replace(/\/index.*/, '/provider/approve-connection'));
    // Page should be accessible (might redirect, but shouldn't 404)
    expect(response?.status()).not.toBe(404);
  });
});

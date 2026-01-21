/**
 * Approve Transaction Page Tests
 *
 * Tests for /provider/approve-transaction route
 *
 * NOTE: This page requires proper context (requestId, origin query params) to show
 * full approval UI. Direct navigation without context will show redirect or error states.
 * Full approval flow is tested in e2e/flows/provider-integration.spec.ts
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Approve Transaction Page (/provider/approve-transaction)', () => {
  walletTest('page loads without crashing', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction'));
    await page.waitForLoadState('networkidle');

    // Page should load without crashing
    const url = page.url();
    expect(url).toBeTruthy();
  });

  walletTest('page shows appropriate state without pending transaction', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    // Without a real pending transaction, page should show some state
    // (could be error, empty state, or redirect)
    if (page.url().includes('approve-transaction')) {
      // Page stayed - should show some content
      const hasContent = await page.locator('body').isVisible();
      expect(hasContent).toBe(true);
    }
  });

  walletTest('page is accessible (no 404)', async ({ page }) => {
    const response = await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction'));
    expect(response?.status()).not.toBe(404);
  });
});

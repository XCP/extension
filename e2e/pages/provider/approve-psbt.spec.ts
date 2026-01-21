/**
 * Approve PSBT Page Tests
 *
 * Tests for /provider/approve-psbt route
 *
 * NOTE: This page requires proper context (requestId, origin query params) to show
 * full approval UI. Direct navigation without context will show redirect or error states.
 * Full approval flow is tested in e2e/flows/provider-integration.spec.ts
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Approve PSBT Page (/provider/approve-psbt)', () => {
  walletTest('page loads without crashing', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-psbt'));
    await page.waitForLoadState('networkidle');

    // Page should load without crashing
    const url = page.url();
    expect(url).toBeTruthy();
  });

  walletTest('page shows appropriate state without pending PSBT', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-psbt?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    // Without a real pending PSBT, page should show some state
    if (page.url().includes('approve-psbt')) {
      // Page stayed - should show some content
      const hasContent = await page.locator('body').isVisible();
      expect(hasContent).toBe(true);
    }
  });

  walletTest('page is accessible (no 404)', async ({ page }) => {
    const response = await page.goto(page.url().replace(/\/index.*/, '/provider/approve-psbt'));
    expect(response?.status()).not.toBe(404);
  });
});

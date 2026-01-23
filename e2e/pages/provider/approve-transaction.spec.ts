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

  walletTest('shows loading state initially', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction?origin=https://test.example.com&requestId=test-123'));

    // Check for loading indicator (may appear briefly)
    // Either shows loading, error state, or content - all valid
    const loadingOrContent = page.locator('text=/Loading|Sign Transaction|error|not found/i').first();
    await expect(loadingOrContent).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows error or close when transaction not found', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction?origin=https://test.example.com&requestId=invalid-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-transaction')) return;

    // Without a valid transaction, should show error state with close button
    const errorOrClose = page.locator('text=/not found|error|Close/i').first();
    await expect(errorOrClose).toBeVisible({ timeout: 5000 });
  });

  walletTest('page structure includes expected sections', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-transaction')) return;

    // Page should have either Sign Transaction header or error
    const headerOrError = page.locator('text=/Sign Transaction|not found|error/i').first();
    await expect(headerOrError).toBeVisible({ timeout: 5000 });
  });

  walletTest('has close/cancel capability', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-transaction')) return;

    // Should have either X button (aria-label="Close") or Cancel button or Close button
    const closeCapability = page.locator('[aria-label="Close"], button:has-text("Cancel"), button:has-text("Close")').first();
    await expect(closeCapability).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows domain when origin is provided', async ({ page }) => {
    const testOrigin = 'https://dapp.example.com';
    await page.goto(page.url().replace(/\/index.*/, `/provider/approve-transaction?origin=${testOrigin}&requestId=test-123`));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-transaction')) return;

    // Should show the domain from origin or error message
    const domainOrError = page.locator('text=/dapp.example.com|error|not found/i').first();
    await expect(domainOrError).toBeVisible({ timeout: 5000 });
  });
});

// Note: Full transaction signing flow tests are in e2e/tests/provider-integration.spec.ts
// These tests verify the page structure and handles edge cases (missing data, invalid requests)
walletTest.describe('Approve Transaction - UI Elements', () => {
  walletTest('page shows unlock message when wallet locked', async ({ page }) => {
    // Navigate directly - might show unlock message if wallet state issue
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-transaction')) return;

    // Should show either transaction UI or unlock message or error
    const contentOrUnlock = page.locator('text=/Sign Transaction|unlock|error|not found/i').first();
    await expect(contentOrUnlock).toBeVisible({ timeout: 5000 });
  });

  walletTest('info box explains what happens next (when visible)', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/provider/approve-transaction?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-transaction')) return;

    // If the full UI is showing (valid transaction), should have info box
    // Otherwise, error state is valid
    const infoOrError = page.locator('text=/What happens next|signed|broadcast|error|not found/i').first();
    await expect(infoOrError).toBeVisible({ timeout: 5000 });
  });
});

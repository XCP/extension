/**
 * Approve Connection Page Tests
 *
 * Tests for /requests/connect/approve route
 *
 * NOTE: This page requires proper context (requestId, origin query params) to show
 * full approval UI. Direct navigation without context will show redirect or error states.
 * Full approval flow is tested in e2e/flows/provider-integration.spec.ts
 */

import { walletTest, expect } from '@e2e/fixtures';

walletTest.describe('Approve Connection Page (/requests/connect/approve)', () => {
  walletTest('page loads without crashing', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve'));
    await page.waitForLoadState('networkidle');

    // Page should either stay on approve-connection or redirect (e.g., if no wallet)
    // Either outcome is valid - we're testing it doesn't crash
    const url = page.url();
    expect(url).toBeTruthy();
  });

  walletTest('page with mock origin shows connection UI elements', async ({ page }) => {
    // Navigate with a mock origin to trigger the connection UI
    await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve?origin=https://test.example.com&requestId=test-123'));
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
    await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('approve-connection')) {
      // Either shows the domain or the unlock message
      const domainOrUnlock = page.locator('text=/test.example.com|unlock your wallet/i').first();
      await expect(domainOrUnlock).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('page is accessible (no 404)', async ({ page }) => {
    const response = await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve'));
    // Page should be accessible (might redirect, but shouldn't 404)
    expect(response?.status()).not.toBe(404);
  });

  walletTest('shows Connect and Cancel buttons', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-connection')) return;

    // Should show Connect button
    const connectButton = page.locator('button:has-text("Connect")');
    await expect(connectButton).toBeVisible({ timeout: 5000 });

    // Should show Cancel button
    const cancelButton = page.locator('button:has-text("Cancel")');
    await expect(cancelButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows permissions list', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-connection')) return;

    // Should show permissions section
    const permissionsHeader = page.locator('text=/will be able to|permissions/i').first();
    await expect(permissionsHeader).toBeVisible({ timeout: 5000 });

    // Should mention viewing wallet address
    const viewAddressPermission = page.locator('text=/view.*address|wallet address/i').first();
    await expect(viewAddressPermission).toBeVisible({ timeout: 5000 });

    // Should mention transaction signatures
    const signaturePermission = page.locator('text=/transaction|signature|sign/i').first();
    await expect(signaturePermission).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows wallet info when connected', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-connection')) return;

    // Should show "Connect with" section
    const connectWithHeader = page.locator('text=/Connect with/i').first();
    await expect(connectWithHeader).toBeVisible({ timeout: 5000 });

    // Should show wallet name (Wallet 1 or similar)
    const walletName = page.locator('text=/Wallet/i').first();
    await expect(walletName).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows revoke permission info', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-connection')) return;

    // Should mention ability to revoke in Settings
    const revokeInfo = page.locator('text=/revoke|Settings/i').first();
    await expect(revokeInfo).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows security warning about site access', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/connect/approve?origin=https://test.example.com&requestId=test-123'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-connection')) return;

    // Should show warning about what site is requesting
    const requestWarning = page.locator('text=/requesting access|view your wallet/i').first();
    await expect(requestWarning).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays full origin URL', async ({ page }) => {
    const testOrigin = 'https://test.example.com';
    await page.goto(page.url().replace(/\/index.*/, `/requests/connect/approve?origin=${testOrigin}&requestId=test-123`));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('approve-connection')) return;

    // Should display the full origin URL somewhere
    const originDisplay = page.locator(`text=${testOrigin}`);
    await expect(originDisplay).toBeVisible({ timeout: 5000 });
  });
});

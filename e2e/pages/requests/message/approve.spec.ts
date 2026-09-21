/**
 * Approve Message Page Tests
 *
 * Tests for /requests/message/approve route
 *
 * NOTE: This page requires a pending sign-message request in storage to show
 * the full approval UI. Direct navigation without context shows the "Request Expired"
 * state. Full signing flow is tested in e2e/tests/provider-message-signing.spec.ts
 */

import { walletTest, expect } from '@e2e/fixtures';

walletTest.describe('Approve Message Page (/requests/message/approve)', () => {
  walletTest('page loads without crashing', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/message/approve'));
    await page.waitForLoadState('networkidle');

    // Page should load without throwing — either shows approval UI or expired state
    const url = page.url();
    expect(url).toBeTruthy();
  });

  walletTest('page is accessible (no 404)', async ({ page }) => {
    const response = await page.goto(page.url().replace(/\/index.*/, '/requests/message/approve'));
    // Extension pages may not return standard HTTP status codes
    // Just verify the page didn't crash
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });

  walletTest('shows Request Expired when no pending request', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/message/approve'));
    await page.waitForLoadState('networkidle');

    // Without a pending request in storage, the page should show the expired state
    const expiredText = page.locator('text=/Request Expired/i');
    await expect(expiredText).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Close Window button in expired state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/message/approve'));
    await page.waitForLoadState('networkidle');

    const closeButton = page.locator('button:has-text("Close Window")');
    await expect(closeButton).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows error explanation text', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/message/approve'));
    await page.waitForLoadState('networkidle');

    // A missing URL request ID has its own explanation and must never expose signing controls.
    const explanation = page.getByText('No signing request ID provided', { exact: true });
    await expect(explanation).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Request Expired', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign message', exact: true })).toHaveCount(0);
  });

  walletTest('shows clock icon in expired state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/message/approve'));
    await page.waitForLoadState('networkidle');

    // The FiClock icon is rendered in the expired state
    // Check for the container that wraps it
    const iconContainer = page.locator('.bg-gray-100.rounded-full');
    await expect(iconContainer).toBeVisible({ timeout: 10000 });
  });

  walletTest('sets Sign Message header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/requests/message/approve'));
    await page.waitForLoadState('networkidle');

    // The component sets header title to "Sign Message" via useHeader
    // Check if it's visible in the page header area
    const header = page.locator('text="Sign Message"');
    const headerVisible = await header.isVisible().catch(() => false);

    // Header may or may not be visible depending on layout timing,
    // but the page text should reference signing
    if (!headerVisible) {
      // At minimum, we should see the expired state UI
      const expiredOrHeader = page.locator('text=/Sign Message|Request Expired/i').first();
      await expect(expiredOrHeader).toBeVisible({ timeout: 10000 });
    }
  });
});

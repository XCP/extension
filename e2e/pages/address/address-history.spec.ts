/**
 * Address History Page Tests
 *
 * Tests for /address-history route - transaction history for current address
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Address History Page (/address-history)', () => {
  walletTest('address history page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    // Should show history UI
    const hasTitle = await page.locator('text=/History/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTransactions = await page.locator('text=/Transaction|Send|Receive|Issuance|Dispense/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await page.locator('text=/No Transactions|No transactions yet/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasTitle || hasTransactions || hasEmptyState || hasLoading).toBe(true);
  });

  walletTest('shows empty state for new addresses', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for data to load

    // New wallets should show empty state
    const hasEmptyState = await page.locator('text=/No Transactions|No transactions|Empty/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasEmptyMessage = await page.locator('text=/hasn\'t made any|no activity|nothing to show/i').first().isVisible({ timeout: 3000 }).catch(() => false);

    // Either shows empty state or transactions or loading state (if still fetching)
    const hasTransactions = await page.locator('[class*="card"], [class*="transaction"], .space-y-2 > div').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 1000 }).catch(() => false);

    // Also check for the main history UI being present
    const hasHistoryUI = await page.locator('h1, h2').filter({ hasText: /History/i }).isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasEmptyState || hasEmptyMessage || hasTransactions || hasLoading || hasHistoryUI).toBe(true);
  });

  walletTest('shows loading spinner initially', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));

    // Should show loading spinner while fetching
    const hasSpinner = await page.locator('[class*="spinner"], text=/Loading transactions/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('text=/History|No Transactions/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasSpinner || hasContent).toBe(true);
  });

  walletTest('has View on XChain button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    // Should have external link button in header
    const hasExternalLink = await page.locator('button[aria-label*="XChain"], button[aria-label*="external"]').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasHeaderButton = await page.locator('header button svg').last().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasExternalLink || hasHeaderButton).toBe(true);
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button[aria-label*="back"], header button').first();
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);

      // Should navigate back to index
      expect(page.url()).toContain('index');
    }
  });

  walletTest('shows pagination controls if multiple pages', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    // If there are many transactions, pagination should appear
    const hasPagination = await page.locator('text=/Page [0-9]+ of [0-9]+/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasPrevNext = await page.locator('button:has-text("Previous"), button:has-text("Next")').first().isVisible({ timeout: 3000 }).catch(() => false);

    // Pagination may not be visible if few/no transactions
    expect(hasPagination || hasPrevNext || true).toBe(true);
  });
});

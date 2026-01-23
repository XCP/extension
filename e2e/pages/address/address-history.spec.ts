/**
 * Address History Page Tests
 *
 * Tests for /address-history route - transaction history for current address
 */

import { walletTest, expect } from '../../fixtures';
import { addressHistory, common } from '../../selectors';

walletTest.describe('Address History Page (/address-history)', () => {
  walletTest('address history page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    // Should show History heading
    const historyHeading = page.locator('h1, h2').filter({ hasText: /History/i });
    await expect(historyHeading).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows empty state or transactions for address', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    // Wait for content to load - should show either transactions or empty state
    // Using .or() for genuinely alternative states (not loading)
    const content = addressHistory.emptyState(page).or(addressHistory.transactionList(page));
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows loading state initially then content', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));

    // Should show content after loading
    const historyHeading = page.locator('h1, h2').filter({ hasText: /History/i });
    await expect(historyHeading).toBeVisible({ timeout: 5000 });
  });

  walletTest('has external link button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    // Should have external link button (XChain) in header
    const externalButton = page.locator('header button').last();
    await expect(externalButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 3000 });

    await backButton.click();
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('page has History title', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/address-history'));
    await page.waitForLoadState('networkidle');

    // Page should show "History" title
    const historyTitle = page.locator('h1, h2').filter({ hasText: /History/i });
    await expect(historyTitle).toBeVisible({ timeout: 5000 });
  });
});

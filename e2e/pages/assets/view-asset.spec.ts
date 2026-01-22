/**
 * View Asset Page Tests (/asset/:asset)
 *
 * Tests for viewing detailed information about a specific Counterparty asset.
 * Component: src/pages/assets/view-asset.tsx
 *
 * The page shows:
 * - Loading state: "Loading asset details…"
 * - Error state: "Failed to load asset information"
 * - Success state: "Asset Details" heading with Supply, Divisible, Locked, Issuer fields
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('View Asset Page (/asset/:asset)', () => {
  // Helper to navigate to asset page and wait for content to load
  async function navigateToAsset(page: any, asset: string) {
    await page.goto(page.url().replace(/\/index.*/, `/asset/${asset}`));
    await page.waitForLoadState('domcontentloaded');
    // Wait for any of the three states: loading, error, or success
    const loading = page.getByText('Loading asset details');
    const error = page.getByText('Failed to load asset information');
    const success = page.getByText('Asset Details');
    await expect(loading.or(error).or(success)).toBeVisible({ timeout: 15000 });
  }

  walletTest('page loads and shows content for XCP asset', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    // Should show "Asset Details" section on success
    const assetDetailsHeading = page.locator('text="Asset Details"');
    await expect(assetDetailsHeading).toBeVisible({ timeout: 10000 });
  });

  walletTest('displays Supply field in Asset Details', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    // Wait for Asset Details section
    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Check for Supply field
    const supplyLabel = page.locator('text="Supply"');
    await expect(supplyLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays Divisible field in Asset Details', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    // Wait for Asset Details section
    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Check for Divisible field
    const divisibleLabel = page.locator('text="Divisible"');
    await expect(divisibleLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays Locked field in Asset Details', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    // Wait for Asset Details section
    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Check for Locked field
    const lockedLabel = page.locator('text="Locked"');
    await expect(lockedLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays Issuer field in Asset Details', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    // Wait for Asset Details section
    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Check for Issuer field
    const issuerLabel = page.locator('text="Issuer"');
    await expect(issuerLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('handles invalid asset with error state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/asset/INVALID_ASSET_12345'));
    await page.waitForLoadState('networkidle');

    // Should show error message for invalid asset
    const errorMessage = page.locator('text="Failed to load asset information"');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  walletTest('shows Dividend History section', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    // Wait for page to load
    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Dividend History section should be visible (collapsible)
    const dividendHistory = page.locator('text="Dividend History"');
    await expect(dividendHistory).toBeVisible({ timeout: 5000 });
  });
});

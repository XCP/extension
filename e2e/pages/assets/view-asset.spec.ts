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
    await expect(loading.or(error).or(success).first()).toBeVisible({ timeout: 15000 });
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

  // ============================================================================
  // Asset Details Fields Tests
  // ============================================================================

  walletTest('displays Your Balance field in Asset Details', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Check for Your Balance field
    const balanceLabel = page.locator('text="Your Balance"');
    await expect(balanceLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('Supply shows numeric value', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Supply row should have a value (number or "0")
    const supplyRow = page.locator('div:has-text("Supply")').first();
    await expect(supplyRow).toBeVisible({ timeout: 5000 });

    // The value should exist next to Supply label
    const supplyValue = supplyRow.locator('span').last();
    const value = await supplyValue.textContent();
    expect(value).toBeTruthy();
  });

  walletTest('Divisible shows Yes or No', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Divisible should show Yes or No or —
    const divisibleValue = page.locator('text="Divisible"').locator('..').locator('span').last();
    const value = await divisibleValue.textContent();
    expect(['Yes', 'No', '—'].some(v => value?.includes(v))).toBe(true);
  });

  walletTest('Locked shows Yes or No', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Locked should show Yes or No
    const lockedValue = page.locator('text="Locked"').locator('..').locator('span').last();
    const value = await lockedValue.textContent();
    expect(['Yes', 'No'].some(v => value?.includes(v))).toBe(true);
  });

  walletTest('Issuer shows valid Bitcoin address or Unknown', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Issuer label should be visible
    await expect(page.locator('text="Issuer"')).toBeVisible({ timeout: 5000 });

    // XCP was created via proof-of-burn and may not have a traditional issuer
    // The issuer value is displayed in a font-mono span next to the Issuer label
    // It can be either:
    // 1. A truncated address like "1A1zP1...DivfNa" (6 chars + ... + 6 chars)
    // 2. "Unknown" if no issuer exists
    const issuerRow = page.locator('div').filter({ hasText: /^Issuer/ }).first();
    const issuerValue = issuerRow.locator('span.font-mono');
    await expect(issuerValue).toBeVisible({ timeout: 5000 });

    // Verify the value is either a truncated address or "Unknown"
    const value = await issuerValue.textContent();
    const isAddress = /^(1|3|bc1)[a-zA-Z0-9]{2,5}\.\.\.[a-zA-Z0-9]{6}$/.test(value || '');
    const isUnknown = value === 'Unknown';
    expect(isAddress || isUnknown).toBe(true);
  });

  // ============================================================================
  // Actions Tests
  // ============================================================================

  walletTest('shows action buttons for XCP', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // XCP should have common actions - at minimum Lock Description and Update Description
    const lockDescriptionAction = page.locator('text="Lock Description"');
    const updateDescriptionAction = page.locator('text="Update Description"');

    await expect(lockDescriptionAction).toBeVisible({ timeout: 5000 });
    await expect(updateDescriptionAction).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows Transfer Ownership action', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    const transferAction = page.locator('text="Transfer Ownership"');
    await expect(transferAction).toBeVisible({ timeout: 5000 });
  });

  walletTest('Lock Description action navigates to compose/issuance/lock-description', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    const lockDescriptionAction = page.locator('button:has-text("Lock Description"), div[role="button"]:has-text("Lock Description")').first();
    await expect(lockDescriptionAction).toBeVisible({ timeout: 5000 });
    await lockDescriptionAction.click();

    await expect(page).toHaveURL(/compose\/issuance\/lock-description\/XCP/, { timeout: 5000 });
  });

  walletTest('Update Description action navigates to compose/issuance/update-description', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    const updateDescriptionAction = page.locator('button:has-text("Update Description"), div[role="button"]:has-text("Update Description")').first();
    await expect(updateDescriptionAction).toBeVisible({ timeout: 5000 });
    await updateDescriptionAction.click();

    await expect(page).toHaveURL(/compose\/issuance\/update-description\/XCP/, { timeout: 5000 });
  });

  walletTest('Transfer Ownership action navigates to compose/issuance/transfer-ownership', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    const transferAction = page.locator('button:has-text("Transfer Ownership"), div[role="button"]:has-text("Transfer Ownership")').first();
    await expect(transferAction).toBeVisible({ timeout: 5000 });
    await transferAction.click();

    await expect(page).toHaveURL(/compose\/issuance\/transfer-ownership\/XCP/, { timeout: 5000 });
  });

  // ============================================================================
  // Dividend History Tests
  // ============================================================================

  walletTest('Dividend History is collapsible', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Dividend History should be a button (collapsible)
    const dividendButton = page.locator('button:has-text("Dividend History")');
    await expect(dividendButton).toBeVisible({ timeout: 5000 });

    // Should have aria-expanded attribute
    const ariaExpanded = await dividendButton.getAttribute('aria-expanded');
    expect(['true', 'false']).toContain(ariaExpanded);
  });

  walletTest('clicking Dividend History expands the section', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Click to expand
    const dividendButton = page.locator('button:has-text("Dividend History")');
    await dividendButton.click();

    // Should now be expanded
    await expect(dividendButton).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });

    // Content area should be visible
    const dividendContent = page.locator('#dividend-history');
    await expect(dividendContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('Dividend History shows loading or content after expansion', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Expand dividend history
    const dividendButton = page.locator('button:has-text("Dividend History")');
    await dividendButton.click();

    // Should show loading, content, or "No dividends" message
    const loadingOrContent = page.locator('text=/Loading dividend history|No dividends|per unit/i');
    await expect(loadingOrContent.first()).toBeVisible({ timeout: 10000 });
  });

  // ============================================================================
  // Navigation Tests
  // ============================================================================

  walletTest('back button navigates to index with Assets tab', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Click back button
    const backButton = page.locator('header button').first();
    await backButton.click();

    // Should navigate to index with Assets tab
    await expect(page).toHaveURL(/index.*tab=Assets/, { timeout: 5000 });
  });

  walletTest('header shows "Asset" title', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Header should show "Asset"
    const headerTitle = page.locator('header').getByText('Asset');
    await expect(headerTitle).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // Page Structure Tests
  // ============================================================================

  walletTest('page has proper role="main"', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Main content should have role="main"
    const mainContent = page.locator('[role="main"]');
    await expect(mainContent).toBeVisible({ timeout: 5000 });
  });

  walletTest('Asset Details section is in a card', async ({ page }) => {
    await navigateToAsset(page, 'XCP');

    await expect(page.locator('text="Asset Details"')).toBeVisible({ timeout: 10000 });

    // Asset Details should be in a card with shadow
    const detailsCard = page.locator('.shadow-sm:has-text("Asset Details")');
    await expect(detailsCard).toBeVisible({ timeout: 5000 });
  });
});

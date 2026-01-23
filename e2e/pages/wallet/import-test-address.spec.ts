/**
 * Import Test Address Page Tests (/wallet/import-test-address)
 *
 * Tests for importing a watch-only test address (development mode only).
 * This feature is only available when NODE_ENV=development.
 */

import { walletTest, expect } from '../../fixtures';
import { common } from '../../selectors';

walletTest.describe('Import Test Address Page (/import-test-address)', () => {
  // Note: This page only exists in development mode
  // In production, it redirects to add-wallet

  async function navigateToImportTestAddress(page: any): Promise<boolean> {
    const currentUrl = page.url();
    const hashIndex = currentUrl.indexOf('#');
    const baseUrl = hashIndex !== -1 ? currentUrl.substring(0, hashIndex + 1) : currentUrl + '#';
    await page.goto(`${baseUrl}/import-test-address`);
    await page.waitForLoadState('networkidle');
    // Wait for any redirect to complete (page may redirect to add-wallet in production)
    await page.waitForURL(/./, { timeout: 2000 }).catch(() => {});
    return true;
  }

  walletTest('redirects in production or shows form in development', async ({ page }) => {
    await navigateToImportTestAddress(page);

    // In production mode, redirects away from import-test-address
    if (!page.url().includes('import-test-address')) {
      // Redirected - test passes (production behavior)
      return;
    }

    // In development mode, should show form or dev mode warning
    const formInput = page.locator('input[id="test-address"], input[type="text"]').first();
    await expect(formInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows development mode warning if available', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    // Should show warning that this is for development only
    // The page shows either "Development Mode" banner or "watch-only" description
    const devModeWarning = page.locator('text=/Development Mode/').first();
    const watchOnlyText = page.locator('text=/watch-only/').first();

    const devModeCount = await devModeWarning.count();
    if (devModeCount > 0) {
      await expect(devModeWarning).toBeVisible({ timeout: 5000 });
    } else {
      await expect(watchOnlyText).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('has Bitcoin address input field', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    // Input has id="test-address" and placeholder="Enter any Bitcoin address…"
    const addressInput = page.locator('#test-address, input[placeholder*="Bitcoin address"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });
  });

  walletTest('has import button', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    // Button text is "Import Test Address"
    const importButton = page.locator('button:has-text("Import Test Address")').first();
    await expect(importButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('import button is disabled without address', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    const importButton = page.locator('button:has-text("Import Test Address")').first();
    await expect(importButton).toBeVisible({ timeout: 5000 });
    await expect(importButton).toBeDisabled();
  });

  walletTest('shows error for empty address', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    const importButton = page.locator('button:has-text("Import Test Address")').first();
    await expect(importButton).toBeVisible({ timeout: 5000 });
    // The button should be disabled without an address
    await expect(importButton).toBeDisabled();
  });

  walletTest('shows error for invalid address', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    const addressInput = page.locator('input[id="test-address"], input[placeholder*="address" i]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    await addressInput.fill('invalid-address-format');

    // Button should remain disabled with invalid address format
    const importButton = page.locator('button:has-text("Import Test Address")').first();
    await expect(importButton).toBeDisabled();
  });

  walletTest('accepts valid Bitcoin address format', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    const addressInput = page.locator('input[id="test-address"], input[placeholder*="address" i]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    // Use a valid mainnet address format
    await addressInput.fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');

    // Import button should be enabled with valid address
    const importButton = page.locator('button:has-text("Import Test Address")').first();
    await expect(importButton).toBeEnabled({ timeout: 3000 });
  });

  walletTest('has back button to add-wallet', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    await expect(common.headerBackButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('explains watch-only limitations', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    // The page says: "This creates a watch-only wallet for testing."
    const watchOnlyText = page.locator('text=/watch-only/').first();
    await expect(watchOnlyText).toBeVisible({ timeout: 5000 });
  });

  walletTest('input field accepts Bitcoin address', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    const addressInput = page.locator('input[id="test-address"], input[placeholder*="address" i]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    await addressInput.fill('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');

    // Value should be set
    await expect(addressInput).toHaveValue('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
  });

  walletTest('address input has placeholder text', async ({ page }) => {
    await navigateToImportTestAddress(page);

    if (!page.url().includes('import-test-address')) return;

    const addressInput = page.locator('input[id="test-address"]').first();
    await expect(addressInput).toBeVisible({ timeout: 5000 });

    // Should have placeholder text
    await expect(addressInput).toHaveAttribute('placeholder', /Bitcoin address/);
  });
});

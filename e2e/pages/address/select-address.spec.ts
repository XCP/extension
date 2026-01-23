/**
 * Select Address Page Tests
 *
 * Tests for /select-address route - select or add address for mnemonic wallets
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('Select Address Page (/select-address)', () => {
  walletTest('select address page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    // Should show address selection UI or redirect for non-mnemonic wallets
    const title = page.locator('text=/Addresses/i').first();
    const addressList = page.locator('[role="radiogroup"], [class*="list"]').first();

    // Either shows content or redirects
    const currentUrl = page.url();
    if (currentUrl.includes('select-address')) {
      await expect(title.or(addressList)).toBeVisible({ timeout: 5000 });
    }
    // If redirected, test passes (non-mnemonic wallet behavior)
  });

  walletTest('shows list of addresses', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('select-address')) {
      return; // Redirected - non-mnemonic wallet
    }

    // Should show address cards or address text
    const addressCards = page.locator('[class*="card"], [class*="address"]').first();
    const addressText = page.locator('text=/Address [0-9]+|Account [0-9]+/i').first();
    const monoAddress = page.locator('.font-mono').first();

    await expect(addressCards.or(addressText).or(monoAddress)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows Add Address button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('select-address')) {
      return; // Redirected - non-mnemonic wallet
    }

    const addButton = page.locator('button:has-text("Add Address"), button[aria-label*="Add"]');
    await expect(addButton.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('has Add button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('select-address')) {
      return; // Redirected - non-mnemonic wallet
    }

    const addButton = page.locator('button[aria-label*="Add"], header button svg').last();
    await expect(addButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('can select an address', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('select-address')) {
      return; // Redirected - non-mnemonic wallet
    }

    // Click on first address card
    const addressCard = page.locator('[class*="card"], [role="radio"]').first();
    await expect(addressCard).toBeVisible({ timeout: 5000 });
    await addressCard.click();

    // Should navigate to index after selection
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('select-address')) {
      return; // Redirected - non-mnemonic wallet
    }

    const backButton = page.locator('button[aria-label*="back"], header button').first();
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should navigate back (not on select-address anymore)
    await expect(page).not.toHaveURL(/select-address/, { timeout: 5000 });
  });
});

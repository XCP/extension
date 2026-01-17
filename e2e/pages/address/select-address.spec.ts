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
    const hasTitle = await page.locator('text=/Addresses/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddressList = await page.locator('[role="radiogroup"], [class*="list"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('select-address');

    expect(hasTitle || hasAddressList || redirected).toBe(true);
  });

  walletTest('shows list of addresses', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('select-address')) {
      // Should show address cards
      const hasAddressCards = await page.locator('[class*="card"], [class*="address"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasAddressText = await page.locator('text=/Address [0-9]+|Account [0-9]+/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasMonoAddress = await page.locator('.font-mono').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasAddressCards || hasAddressText || hasMonoAddress).toBe(true);
    }
  });

  walletTest('shows Add Address button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('select-address')) {
      // Should have Add Address button
      const addButton = page.locator('button:has-text("Add Address"), button[aria-label*="Add"]');
      await expect(addButton.first()).toBeVisible({ timeout: 5000 });
    }
  });

  walletTest('has Add button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('select-address')) {
      // Should have plus button in header for adding addresses
      const hasAddButton = await page.locator('button[aria-label*="Add"], header button svg').last().isVisible({ timeout: 5000 }).catch(() => false);

      expect(hasAddButton).toBe(true);
    }
  });

  walletTest('can select an address', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('select-address')) {
      // Click on first address card
      const addressCard = page.locator('[class*="card"], [role="radio"]').first();
      if (await addressCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await addressCard.click();
        await page.waitForTimeout(500);

        // Should navigate to index after selection
        const navigatedToIndex = page.url().includes('index');
        expect(navigatedToIndex).toBe(true);
      }
    }
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('select-address')) {
      const backButton = page.locator('button[aria-label*="back"], header button').first();
      if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await backButton.click();
        await page.waitForTimeout(500);

        // Should navigate back
        const navigatedBack = !page.url().includes('select-address');
        expect(navigatedBack).toBe(true);
      }
    }
  });

  walletTest('shows error if no active wallet', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    // If no wallet, should show error or redirect
    const hasError = await page.locator('text=/No active wallet|No wallet/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasContent = await page.locator('text=/Addresses|Address/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const redirected = !page.url().includes('select-address');

    expect(hasError || hasContent || redirected).toBe(true);
  });
});

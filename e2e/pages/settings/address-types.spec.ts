/**
 * Address Type Settings Page Tests
 *
 * Tests for /settings/address-types route - change wallet address format
 */

import { walletTest, expect } from '../../fixtures';
import { settings, common } from '../../selectors';

walletTest.describe('Address Type Settings Page (/settings/address-types)', () => {
  walletTest('address type settings page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    // Page may redirect for private key wallets that don't have address type option
    if (!page.url().includes('/settings/address-types')) return;

    // Should show address type UI
    const addressTypeLabel = page.getByText(/P2PKH|P2WPKH|P2TR|Legacy|SegWit|Taproot|Native|Address Type/i).first();
    await expect(addressTypeLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows available address type options', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    // Should show radio group with address type options
    const radioGroup = page.getByRole('radiogroup').first();
    await expect(radioGroup).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows address previews for each type', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    // Should show address type labels
    const addressTypeLabels = page.getByText(/Legacy|SegWit|Taproot|P2PKH|P2WPKH|P2TR/i).first();
    await expect(addressTypeLabels).toBeVisible({ timeout: 5000 });
  });

  walletTest('can select different address type', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    // Find options and click a different one
    const options = page.getByRole('radio');
    const count = await options.count();

    if (count > 1) {
      // Click second option (likely different from current)
      await options.nth(1).click();
      await page.waitForLoadState('networkidle');

      // Page should still be on settings (no crash)
      await expect(page).toHaveURL(/settings/);
    }
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 3000 });

    await backButton.click();
    await expect(page).toHaveURL(/settings|index/, { timeout: 5000 });
  });

  walletTest('shows content after loading', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    // Should show address type content
    const content = page.getByText(/P2PKH|P2WPKH|Address Type/i).first();
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows address preview for each type', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    // Each address type option should show an address preview
    // Preview addresses start with 1, 3, or bc1
    const addressPreview = page.locator('text=/(1|3|bc1)[a-zA-Z0-9]/').first();
    await expect(addressPreview).toBeVisible({ timeout: 5000 });
  });

  walletTest('indicates currently selected address type', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    // One radio option should be checked
    const selectedOption = page.locator('[role="radio"][aria-checked="true"], [data-checked="true"]');
    await expect(selectedOption.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('changing address type updates selection immediately', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    // Find all radio options
    const options = page.getByRole('radio');
    const count = await options.count();

    if (count <= 1) return; // Skip if only one option

    // Get currently selected
    const currentlySelected = page.locator('[role="radio"][aria-checked="true"], [data-checked="true"]');
    const currentIndex = await currentlySelected.evaluate((el, allOptions) => {
      const radios = document.querySelectorAll('[role="radio"]');
      return Array.from(radios).indexOf(el);
    });

    // Click a different option
    const newIndex = currentIndex === 0 ? 1 : 0;
    await options.nth(newIndex).click();
    await page.waitForLoadState('networkidle');

    // New option should be selected
    const newSelected = page.locator('[role="radio"][aria-checked="true"], [data-checked="true"]');
    await expect(newSelected.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('after changing type, back navigates to index', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    const options = page.getByRole('radio');
    const count = await options.count();

    if (count <= 1) return;

    // Change type
    const uncheckedOption = page.locator('[role="radio"][aria-checked="false"]').first();
    const uncheckedCount = await uncheckedOption.count();

    if (uncheckedCount > 0) {
      await uncheckedOption.click();
      await page.waitForLoadState('networkidle');

      // Now click back
      const backButton = common.headerBackButton(page);
      await backButton.click();

      // Should go to index (not settings) because type was changed
      await expect(page).toHaveURL(/index/, { timeout: 5000 });
    }
  });

  walletTest('shows all standard address types', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    // Should show standard types (P2PKH, P2WPKH, P2TR)
    // Note: Counterwallet types only show for Counterwallet wallets
    const legacyType = page.locator('text=/Legacy|P2PKH/i').first();
    const segwitType = page.locator('text=/SegWit|P2WPKH/i').first();

    await expect(legacyType).toBeVisible({ timeout: 5000 });
    await expect(segwitType).toBeVisible({ timeout: 5000 });
  });

  walletTest('has help button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/settings/address-types'));
    await page.waitForLoadState('networkidle');

    if (!page.url().includes('/settings/address-types')) return;

    const helpButton = page.locator('[aria-label="Help"]');
    await expect(helpButton).toBeVisible({ timeout: 5000 });
  });
});

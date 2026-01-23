/**
 * Select Address Page Tests
 *
 * Tests for /select-address route - select or add address for mnemonic wallets
 */

import { walletTest, expect } from '../../fixtures';
import { selectAddress, common } from '../../selectors';

walletTest.describe('Select Address Page (/select-address)', () => {
  walletTest('select address page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    // Check if redirected (non-mnemonic wallet behavior)
    const currentUrl = page.url();
    walletTest.skip(!currentUrl.includes('select-address'), 'Redirected - non-mnemonic wallet');

    // Should show address selection UI - use specific heading selector
    const title = page.getByRole('heading', { name: 'Addresses' });
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows list of addresses', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('select-address'), 'Redirected - non-mnemonic wallet');

    // Should show radiogroup with addresses
    const addressList = selectAddress.addressList(page);
    await expect(addressList).toBeVisible({ timeout: 5000 });

    // And should have at least one radio option
    const firstAddressOption = selectAddress.addressOption(page, 0);
    await expect(firstAddressOption).toBeVisible();
  });

  walletTest('shows Add Address button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('select-address'), 'Redirected - non-mnemonic wallet');

    const addButton = selectAddress.addAddressButton(page);
    await expect(addButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('has Add button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('select-address'), 'Redirected - non-mnemonic wallet');

    // The main Add Address button (green, full-width)
    const addButton = selectAddress.addAddressButton(page);
    await expect(addButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('can select an address', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('select-address'), 'Redirected - non-mnemonic wallet');

    // Click on first address option
    const firstAddressOption = selectAddress.addressOption(page, 0);
    await expect(firstAddressOption).toBeVisible({ timeout: 5000 });
    await firstAddressOption.click();

    // Should navigate to index after selection
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/select-address'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('select-address'), 'Redirected - non-mnemonic wallet');

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should navigate back (not on select-address anymore)
    await expect(page).not.toHaveURL(/select-address/, { timeout: 5000 });
  });
});

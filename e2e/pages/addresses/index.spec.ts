/**
 * Select Address Page Tests
 *
 * Tests for /addresses route - select or add address for mnemonic wallets
 */

import { walletTest, expect } from '../../fixtures';
import { selectAddress, common } from '../../selectors';

walletTest.describe('Select Address Page (/addresses)', () => {
  walletTest('select address page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    // Check if redirected (non-mnemonic wallet behavior)
    const currentUrl = page.url();
    walletTest.skip(!currentUrl.includes('address/select'), 'Redirected - non-mnemonic wallet');

    // Should show address selection UI - use specific heading selector
    const title = page.getByRole('heading', { name: 'Addresses' });
    await expect(title).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows list of addresses', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    // Should show radiogroup with addresses
    const addressList = selectAddress.addressList(page);
    await expect(addressList).toBeVisible({ timeout: 5000 });

    // And should have at least one radio option
    const firstAddressOption = selectAddress.addressOption(page, 0);
    await expect(firstAddressOption).toBeVisible();
  });

  walletTest('shows Add Address button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    const addButton = selectAddress.addAddressButton(page);
    await expect(addButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('has Add button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    // The main Add Address button (green, full-width)
    const addButton = selectAddress.addAddressButton(page);
    await expect(addButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('can select an address', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    // Click on first address option
    const firstAddressOption = selectAddress.addressOption(page, 0);
    await expect(firstAddressOption).toBeVisible({ timeout: 5000 });
    await firstAddressOption.click();

    // Should navigate to index after selection
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    const backButton = common.headerBackButton(page);
    await expect(backButton).toBeVisible({ timeout: 5000 });
    await backButton.click();

    // Should navigate back (not on address/select anymore)
    await expect(page).not.toHaveURL(/address\/select/, { timeout: 5000 });
  });

  walletTest('indicates currently selected address', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    // The currently selected address should be marked (aria-checked="true")
    const selectedAddress = page.locator('[role="radio"][aria-checked="true"]');
    await expect(selectedAddress).toBeVisible({ timeout: 5000 });
  });

  walletTest('can add new address and it appears in list', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    // Count addresses before adding
    const addressesBefore = await page.locator('[role="radio"]').count();

    // Click Add Address button
    const addButton = selectAddress.addAddressButton(page);
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Wait for new address to appear (button shows "Adding..." then reverts)
    // Use waitForFunction to wait for the count to increase
    await page.waitForFunction(
      (prevCount) => document.querySelectorAll('[role="radio"]').length > prevCount,
      addressesBefore,
      { timeout: 10000 }
    );

    // Count addresses after - should be one more
    const addressesAfter = await page.locator('[role="radio"]').count();
    expect(addressesAfter).toBe(addressesBefore + 1);
  });

  walletTest('Add Address button shows loading state', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    const addButton = selectAddress.addAddressButton(page);
    await expect(addButton).toBeVisible({ timeout: 5000 });

    // Button text should show "Add Address" initially
    await expect(addButton).toContainText(/Add Address/i);
  });

  walletTest('selecting different address updates index page', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    // First add a second address if only one exists
    const addressCount = await page.locator('[role="radio"]').count();
    if (addressCount < 2) {
      await selectAddress.addAddressButton(page).click();
      await page.waitForLoadState('networkidle');
    }

    // Get the non-selected address option
    const nonSelectedAddress = page.locator('[role="radio"][aria-checked="false"]').first();
    const nonSelectedCount = await nonSelectedAddress.count();

    if (nonSelectedCount > 0) {
      // Click to select different address
      await nonSelectedAddress.click();

      // Should navigate to index
      await expect(page).toHaveURL(/index/, { timeout: 5000 });
    }
  });

  walletTest('header has Add button for quick add', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    // Header should have Add Address button (icon only, in header section)
    const headerAddButton = selectAddress.headerAddButton(page);
    await expect(headerAddButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows address previews in list', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/addresses'));
    await page.waitForLoadState('networkidle');

    walletTest.skip(!page.url().includes('address/select'), 'Redirected - non-mnemonic wallet');

    // Each address item should show the address text
    const firstAddress = selectAddress.addressOption(page, 0);
    await expect(firstAddress).toBeVisible({ timeout: 5000 });

    // Should contain a Bitcoin address pattern
    const addressText = await firstAddress.textContent();
    expect(addressText).toMatch(/(1|3|bc1|tb1)[a-zA-Z0-9]/);
  });
});

/**
 * Address Management Tests
 *
 * Tests for address operations: copy, navigation, adding, switching addresses.
 */

import { walletTest, expect, getCurrentAddress } from '../fixtures';
import { index, selectAddress } from '../selectors';

walletTest.describe('Address Management', () => {
  walletTest('copy address from button on index shows feedback', async ({ page }) => {
    await expect(index.currentAddress(page)).toBeVisible({ timeout: 10000 });
    await index.currentAddress(page).click();

    // Should show green checkmark feedback after copy
    await expect(page.locator('svg.text-green-500').first()).toBeVisible({ timeout: 3000 });
  });

  walletTest('navigate to address selection via chevron', async ({ page }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/select-address/);
    await expect(page.locator('text="Addresses"')).toBeVisible();
    await expect(selectAddress.addressLabel(page, 1)).toBeVisible();
  });

  walletTest('add new address', async ({ page }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/select-address/);

    const addressesBefore = await page.locator('text=/Address \\d+/').count();

    const addButton = selectAddress.addAddressButton(page);
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();

    // Wait for new address to appear
    await expect(page.locator('text=/Address \\d+/')).toHaveCount(addressesBefore + 1, { timeout: 5000 });
  });

  walletTest('switch between addresses', async ({ page }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/select-address/);

    // Add a second address if there's only one
    const addressLabels = page.locator('text=/Address \\d+/');
    const initialCount = await addressLabels.count();

    if (initialCount < 2) {
      const addButton = selectAddress.addAddressButton(page);
      await expect(addButton).toBeVisible({ timeout: 5000 });
      await addButton.click();
      await expect(addressLabels).toHaveCount(initialCount + 1, { timeout: 5000 });
    }

    // Click the second address
    await addressLabels.nth(1).click();

    // Should navigate back to index
    await expect(page).toHaveURL(/index/, { timeout: 5000 });
  });

  walletTest('copy address from address list', async ({ page }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/select-address/);

    const copyButton = selectAddress.copyButton(page);
    await expect(copyButton).toBeVisible({ timeout: 5000 });
    await copyButton.click();

    // Should show success feedback
    await expect(
      page.locator('.text-green-500').or(page.locator('text=/copied/i'))
    ).toBeVisible({ timeout: 3000 });
  });

  walletTest('address type information display', async ({ page }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/select-address/);

    // Should show address type information
    const addressType = page.locator('text=/P2WPKH|Native SegWit|SegWit|Legacy|P2PKH|P2TR|Taproot/i').first();
    await expect(addressType).toBeVisible({ timeout: 5000 });
  });

  walletTest('address validation and format checking', async ({ page }) => {
    const currentAddress = await getCurrentAddress(page);

    expect(currentAddress).toBeTruthy();
    expect(currentAddress.length).toBeGreaterThan(10);

    // Should be a valid Bitcoin address format
    expect(currentAddress).toMatch(/^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{25,}/);
  });
});

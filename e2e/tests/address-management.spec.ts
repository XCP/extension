/**
 * Address Management Tests
 *
 * Tests for address operations: copy, navigation, adding, switching addresses.
 */

import { walletTest, expect, getCurrentAddress } from '../fixtures';
import { index, selectAddress } from '../selectors';

walletTest.describe('Address Management', () => {
  walletTest('copy address from button on index shows feedback', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await expect(index.currentAddress(page)).toBeVisible({ timeout: 10000 });

    // Clear clipboard first
    await page.evaluate(() => navigator.clipboard.writeText(''));

    await index.currentAddress(page).click();

    // Verify copy succeeded by checking clipboard content
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent.length).toBeGreaterThan(10); // Should contain an address
    expect(clipboardContent).toMatch(/^(bc1|tb1|1|3|m|n)[a-zA-Z0-9]+$/); // Valid Bitcoin address format
  });

  walletTest('navigate to address selection via chevron', async ({ page }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/addresses/);
    await expect(page.locator('text="Addresses"')).toBeVisible();
    await expect(selectAddress.addressLabel(page, 1)).toBeVisible();
  });

  walletTest('add new address', async ({ page }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/addresses/);

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

    await expect(page).toHaveURL(/addresses/);

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

  walletTest('copy address from address list', async ({ page, context }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/addresses/);

    // Open the address menu (three dots) to access copy
    const addressMenu = page.locator('[aria-label="Address actions"]').first();
    await expect(addressMenu).toBeVisible({ timeout: 5000 });
    await addressMenu.click();

    // Click "Copy Address" from the menu
    const copyOption = page.locator('button:has-text("Copy Address")');
    await expect(copyOption).toBeVisible({ timeout: 3000 });

    // Grant clipboard permissions and clear it
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText(''));

    await copyOption.click();

    // Verify copy succeeded by checking clipboard content
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent.length).toBeGreaterThan(10);
    expect(clipboardContent).toMatch(/^(bc1|tb1|1|3|m|n)[a-zA-Z0-9]+$/);
  });

  walletTest('address type information display', async ({ page }) => {
    const chevronButton = selectAddress.chevronButton(page);
    await expect(chevronButton).toBeVisible({ timeout: 5000 });
    await chevronButton.click();

    await expect(page).toHaveURL(/addresses/);

    // Select-address page shows derivation path (e.g., m/84'/0'/0'/0/0) not address type name
    // Check that derivation path is displayed for each address
    const derivationPath = page.locator('text=/m\\/\\d+/').first();
    await expect(derivationPath).toBeVisible({ timeout: 5000 });
  });

  walletTest('address validation and format checking', async ({ page }) => {
    const currentAddress = await getCurrentAddress(page);

    expect(currentAddress).toBeTruthy();
    expect(currentAddress.length).toBeGreaterThan(10);

    // Should be a valid Bitcoin address format (full or truncated with ... in middle)
    // Full: bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq
    // Truncated: bc1ptm...8g756q
    expect(currentAddress).toMatch(/^(bc1|1|3|tb1|m|n|2)[a-zA-Z0-9]{2,}(\.{3}[a-zA-Z0-9]+|[a-zA-Z0-9]{20,})$/);
  });
});

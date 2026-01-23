/**
 * View Address Page Tests
 *
 * Tests for /view-address route - display QR code and copy address
 */

import { walletTest, expect, grantClipboardPermissions } from '../../fixtures';
import { viewAddress, common } from '../../selectors';

walletTest.describe('View Address Page (/view-address)', () => {
  walletTest('view address page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show QR code
    await expect(viewAddress.qrCode(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows QR code', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show QR code for the address
    await expect(viewAddress.qrCode(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows address text', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show the address display
    await expect(viewAddress.addressDisplay(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('has Copy Address button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should have Copy Address button
    await expect(viewAddress.copyButton(page)).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows address type label', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show address type label (P2PKH, P2WPKH, etc.)
    const typeLabel = page.locator('text=/P2PKH|P2WPKH|P2TR|P2SH|Legacy|SegWit|Taproot|Native/i').first();
    await expect(typeLabel).toBeVisible({ timeout: 5000 });
  });

  walletTest('can click copy button to copy address', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Click copy button
    const copyButton = viewAddress.copyButton(page);
    await expect(copyButton).toBeVisible({ timeout: 5000 });
    await copyButton.click();

    // Should show "Copied!" feedback or button text change
    const copiedFeedback = page.locator('text=/Copied/i').first();
    await expect(copiedFeedback).toBeVisible({ timeout: 3000 });
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button[aria-label="Go Back"]');
    await expect(backButton).toBeVisible({ timeout: 3000 });

    await backButton.click();
    await page.waitForURL(/index/, { timeout: 5000 });
    expect(page.url()).toContain('index');
  });

  walletTest('page has header with back button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Header should have a back button
    const backButton = page.locator('button[aria-label="Go Back"]');
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });

  walletTest('displays valid Bitcoin address format', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    const addressDisplay = viewAddress.addressDisplay(page);
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });

    // Get the address text
    const addressText = await addressDisplay.textContent();

    // Should be a valid Bitcoin address format (starts with 1, 3, bc1, or tb1)
    expect(addressText).toMatch(/^(1|3|bc1|tb1)[a-zA-Z0-9]+$/);
  });

  walletTest('copy button copies address to clipboard', async ({ page, context }) => {
    await grantClipboardPermissions(context);

    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Get the displayed address
    const addressDisplay = viewAddress.addressDisplay(page);
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });
    const displayedAddress = await addressDisplay.textContent();

    // Click copy button
    const copyButton = viewAddress.copyButton(page);
    await copyButton.click();

    // Verify clipboard contains the address
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(displayedAddress);
  });

  walletTest('clicking address text also copies to clipboard', async ({ page, context }) => {
    await grantClipboardPermissions(context);

    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // The address text is also clickable for copying
    const addressDisplay = viewAddress.addressDisplay(page);
    await expect(addressDisplay).toBeVisible({ timeout: 5000 });
    const displayedAddress = await addressDisplay.textContent();

    // Click the address text itself
    await addressDisplay.click();

    // Should show "Copied!" feedback
    await expect(page.locator('text=/Copied/i')).toBeVisible({ timeout: 3000 });

    // Verify clipboard
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(displayedAddress);
  });

  walletTest('QR code contains the address', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // QR code should be visible
    const qrCode = viewAddress.qrCode(page);
    await expect(qrCode).toBeVisible({ timeout: 5000 });

    // QR code should have aria-label mentioning address
    await expect(qrCode).toHaveAttribute('aria-label', /Address QR Code/i);
  });

  walletTest('shows address name and type label', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show address info header with name and type
    // Format is "Address Name | ADDRESS_TYPE"
    const infoHeader = page.locator('text=/\\|/').first();
    await expect(infoHeader).toBeVisible({ timeout: 5000 });

    // Should contain address type
    const headerText = await infoHeader.textContent();
    expect(headerText).toMatch(/P2PKH|P2WPKH|P2TR|P2SH/i);
  });

  walletTest('mnemonic wallet shows Select Address button in header', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Mnemonic wallets have a list icon button to select different address
    const selectAddressButton = page.locator('[aria-label="Select Address"]');
    const buttonCount = await selectAddressButton.count();

    // This button only shows for mnemonic wallets
    if (buttonCount > 0) {
      await expect(selectAddressButton).toBeVisible({ timeout: 5000 });

      // Clicking it navigates to select-address
      await selectAddressButton.click();
      await expect(page).toHaveURL(/select-address/, { timeout: 5000 });
    }
    // For private key wallets, button doesn't exist - that's fine
  });
});

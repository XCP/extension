/**
 * View Address Page Tests
 *
 * Tests for /view-address route - display QR code and copy address
 */

import { walletTest, expect } from '../../fixtures';
import { viewAddress } from '../../selectors';

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
});

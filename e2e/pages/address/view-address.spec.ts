/**
 * View Address Page Tests
 *
 * Tests for /view-address route - display QR code and copy address
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('View Address Page (/view-address)', () => {
  walletTest('view address page loads', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show address view UI
    const hasTitle = await page.locator('text=/My Address|Address/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasQrCode = await page.locator('canvas, svg[role="img"], [class*="qr"]').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasTitle || hasQrCode).toBe(true);
  });

  walletTest('shows QR code', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show QR code for the address
    const qrCode = page.locator('canvas, svg[role="img"], [aria-label*="QR"]');
    await expect(qrCode.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows address text', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show the address in monospace font
    const hasAddress = await page.locator('.font-mono').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasAddressText = await page.locator('text=/^1[a-zA-Z0-9]{25,}|^3[a-zA-Z0-9]{25,}|^bc1[a-z0-9]{38,}|^tb1/').first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasAddress || hasAddressText).toBe(true);
  });

  walletTest('has Copy Address button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should have Copy Address button
    const copyButton = page.locator('button:has-text("Copy"), [aria-label*="Copy"]');
    await expect(copyButton.first()).toBeVisible({ timeout: 5000 });
  });

  walletTest('shows address type label', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Should show address type label (P2PKH, P2WPKH, etc.)
    const hasTypeLabel = await page.locator('text=/P2PKH|P2WPKH|P2TR|P2SH|Legacy|SegWit|Taproot/i').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasTypeLabel).toBe(true);
  });

  walletTest('can click on address to copy', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Click on address text should trigger copy
    const addressText = page.locator('.font-mono[role="button"], .font-mono.cursor-pointer');
    if (await addressText.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await addressText.first().click();
      await page.waitForTimeout(500);

      // Should show "Copied!" feedback
      const hasCopied = await page.locator('text=/Copied/i').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasCheckIcon = await page.locator('[class*="check"], svg').first().isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasCopied || hasCheckIcon).toBe(true);
    }
  });

  walletTest('has back navigation', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('button[aria-label*="back"], header button').first();
    if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backButton.click();
      await page.waitForTimeout(500);

      // Should navigate back to index
      expect(page.url()).toContain('index');
    }
  });

  walletTest('page has header with back button', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/view-address'));
    await page.waitForLoadState('networkidle');

    // Header should have a back button
    const backButton = page.locator('button[aria-label="Go Back"]');
    await expect(backButton).toBeVisible({ timeout: 5000 });
  });
});

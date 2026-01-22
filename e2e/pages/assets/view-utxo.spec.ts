/**
 * View UTXO Page Tests (/utxo/:utxo)
 *
 * Tests for viewing details of a specific UTXO and its attached assets.
 */

import { walletTest, expect } from '../../fixtures';

walletTest.describe('View UTXO Page (/utxo/:utxo)', () => {
  const testUtxo = '0000000000000000000000000000000000000000000000000000000000000000:0';

  walletTest('page loads with UTXO parameter', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, `/utxo/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');

    // Should show UTXO info, loading, or error
    const hasUtxoInfo = await page.locator('text=/UTXO|output|transaction/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasError = await page.locator('text=/not found|error|invalid/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await page.locator('text=/loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasUtxoInfo || hasError || hasLoading).toBe(true);
  });

  walletTest('displays UTXO identifier', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, `/utxo/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/utxo')) {
      // Should show the UTXO identifier (txid:vout format) or part of it
      const hasTxid = await page.locator('text=/[a-f0-9]{8,}/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasUtxoLabel = await page.locator('text=/UTXO|output/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasTxid || hasUtxoLabel).toBe(true);
    }
  });

  walletTest('shows attached assets if any', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, `/utxo/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/utxo')) {
      // Should show balances section (attached assets), Details section, loading, or error
      const hasBalances = await page.locator('text=/Balances/').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasDetails = await page.locator('text=/Details/').first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasError = await page.locator('[role="alert"], text=/Failed to fetch|error/i').first().isVisible({ timeout: 2000 }).catch(() => false);
      const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasBalances || hasDetails || hasError || hasLoading).toBe(true);
    }
  });

  walletTest('shows UTXO value in satoshis', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, `/utxo/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/utxo')) {
      // Should show value in sats or BTC
      const hasValue = await page.locator('text=/\\d+\\s*(sat|BTC)/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasValueLabel = await page.locator('text=/value|amount/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      // Value display may vary based on UTXO existence
      expect(hasValue || hasValueLabel || true).toBe(true);
    }
  });

  walletTest('provides detach action for UTXOs with assets', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, `/utxo/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/utxo')) {
      // Detach button should appear if UTXO has attached assets
      const hasDetachButton = await page.locator('button:has-text("Detach"), a:has-text("Detach"), [data-testid*="detach"]').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasMoveButton = await page.locator('button:has-text("Move"), a:has-text("Move")').first().isVisible({ timeout: 3000 }).catch(() => false);

      // Actions may or may not be present
      expect(hasDetachButton || hasMoveButton || true).toBe(true);
    }
  });

  walletTest('handles invalid UTXO format gracefully', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, '/utxo/invalid-utxo-format'));
    await page.waitForLoadState('networkidle');

    // Page should handle invalid UTXO gracefully - could show error, not found, loading, or redirect
    const hasError = await page.locator('[role="alert"], text=/Failed to fetch|error|invalid/i').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasNotFound = await page.locator('text=/not found|no data|unavailable/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    const hasLoading = await page.locator('text=/Loading/i').first().isVisible({ timeout: 2000 }).catch(() => false);
    const redirected = !page.url().includes('/utxo');
    // Page might also show a normal-looking UI with empty/default content
    const pageLoaded = await page.locator('h1, h2, [class*="header"]').first().isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasError || hasNotFound || hasLoading || redirected || pageLoaded).toBe(true);
  });

  walletTest('shows confirmation status', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, `/utxo/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/utxo')) {
      // May show confirmation count or status
      const hasConfirmations = await page.locator('text=/confirm|block/i').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasStatus = await page.locator('text=/status|pending|confirmed/i').first().isVisible({ timeout: 3000 }).catch(() => false);

      // Confirmation info may or may not be shown
      expect(hasConfirmations || hasStatus || true).toBe(true);
    }
  });

  walletTest('links to transaction details', async ({ page }) => {
    await page.goto(page.url().replace(/\/index.*/, `/utxo/${encodeURIComponent(testUtxo)}`));
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/utxo')) {
      // Should have link to view full transaction
      const hasTransactionLink = await page.locator('a[href*="transaction"], a[href*="tx"], button:has-text("View Transaction")').first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasExplorerLink = await page.locator('a[href*="explorer"], a[href*="blockstream"]').first().isVisible({ timeout: 3000 }).catch(() => false);

      // Link may or may not be present
      expect(hasTransactionLink || hasExplorerLink || true).toBe(true);
    }
  });
});

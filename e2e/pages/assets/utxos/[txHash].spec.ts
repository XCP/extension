/**
 * View UTXO Page Tests (/assets/utxos/:txHash)
 *
 * Tests for viewing details of a specific UTXO and its attached assets.
 * Component: src/pages/assets/utxos/[txHash].tsx
 *
 * The page shows:
 * - Loading state: "Loading UTXO details…"
 * - Error state: ErrorAlert with role="alert"
 * - Success state: "Details" heading with UTXO info
 */

import type { Page } from '@playwright/test';
import { expect, walletTest } from '@e2e/fixtures';

walletTest.describe('View UTXO Page (/assets/utxos/:txHash)', () => {
  const testTxid = '0000000000000000000000000000000000000000000000000000000000000000';
  const testUtxo = `${testTxid}:0`;

  async function installUtxoStubs(page: Page) {
    await page.route(/\/v2\/utxos\/.*\/balances/, (route) =>
      route.fulfill({ json: { result: [], result_count: 0, next_cursor: null } })
    );
    await page.route(/\/v2\/bitcoin\/transactions\//, (route) =>
      route.fulfill({
        json: {
          result: {
            tx_hash: testTxid,
            block_index: 1,
            block_time: 1_700_000_000,
            confirmations: 1,
            vout_list: [{ value_int: 10_000 }],
          },
        },
      })
    );
    await page.route(`https://mempool.space/api/tx/${testTxid}/status`, (route) =>
      route.fulfill({ json: { confirmed: true, block_time: 1_700_000_000 } })
    );
  }

  async function navigateToUtxo(page: Page, utxo: string) {
    const path = `/assets/utxos/${encodeURIComponent(utxo)}`;
    await page.evaluate((nextPath) => {
      window.location.hash = nextPath;
    }, path);
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe(`#${path}`);
  }

  walletTest.beforeEach(async ({ page }) => {
    await installUtxoStubs(page);
  });

  walletTest('page loads and shows details', async ({ page }) => {
    await navigateToUtxo(page, testUtxo);

    await expect(page.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  });

  walletTest('displays Output field with UTXO identifier', async ({ page }) => {
    await navigateToUtxo(page, testUtxo);

    await expect(page.getByText('Output', { exact: true })).toBeVisible();
  });

  walletTest('shows Move and Detach action buttons', async ({ page }) => {
    await navigateToUtxo(page, testUtxo);

    await expect(page.getByRole('button', { name: /Move/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Detach/ })).toBeVisible();
  });

  walletTest('handles invalid UTXO format gracefully', async ({ page }) => {
    await navigateToUtxo(page, 'invalid-utxo-format');

    await expect(page.getByRole('alert')).toContainText('Invalid UTXO identifier');
  });
});

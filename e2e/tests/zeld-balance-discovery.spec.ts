import { expect, walletTest } from '../fixtures';
import { callGalleryService } from '../utils/provider-gallery';

const TXID = '000000' + 'ab'.repeat(29);
const HOLDING = [{ txid: TXID, vout: 0, balance: 409_600_000_000 }];

walletTest('ZELD stays discoverable through an outage and is distinct from Counterparty search', async ({ context, page }, testInfo) => {
  let unavailable = true;
  await context.route(/^https?:/, route => route.abort());
  await context.route('**/v2/**', route => route.fulfill({ json: { result: [], result_count: 0 } }));
  await context.route('**/api/address/**', route => route.fulfill({ json: route.request().url().endsWith('/utxo')
    ? [{ txid: TXID, vout: 0, value: 546, status: { confirmed: true } }] : {
    chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
  } }));
  await context.route('https://api.xcp.io/v2/assets?*', route => route.fulfill({ json: { result: [{ asset: 'ZELD' }] } }));
  await context.route('https://api.zeldhash.com/**', route => route.fulfill({
    status: unavailable ? 503 : 200,
    json: route.request().url().includes('/utxos') ? HOLDING : [],
  }));
  // The outage row is for a hunter (or an address the wallet's record says holds ZELD).
  await callGalleryService(page, 'updateSettings', [{ zeldHuntSeconds: 20 }]);
  await page.reload();
  await expect(page.getByText('Balance unavailable. Try again shortly.')).toBeVisible();
  await page.getByPlaceholder('Search balances…').fill('zeld');
  const native = page.getByRole('button', { name: 'View ZELD (ZeldHash)' });
  await expect(native).toBeVisible();
  await expect(page.getByRole('button', { name: 'View ZELD (Counterparty)' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('zeld-search.png') });
  await native.click();
  await expect(page).toHaveURL(/#\/zeld$/);
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  await expect(page.getByText('Balance: 0.00000000')).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await expect(page.getByText('Balance: 4,096.00000000')).toBeVisible();
});

walletTest('shows ZELD for a 1501-output address using explorer fallback and complete batches', async ({ context, page, extensionId }) => {
  const moved = 'cd'.repeat(32);
  const batches: string[][] = [];
  const coins = Array.from({ length: 1512 }, (_, vout) => ({
    txid: moved, vout, value: 546, status: { confirmed: vout < 1501 },
  }));
  await callGalleryService(page, 'updateSettings', [{ zeldHuntSeconds: 0 }]);
  await context.route(/^https?:/, route => route.abort());
  await context.route('**/v2/**', route => route.fulfill({ json: { result: [], result_count: 0 } }));
  await context.route('**/api/address/**', route => {
    if (route.request().url().endsWith('/utxo')) return route.fulfill(route.request().url().includes('mempool.space')
      ? { status: 400, body: 'Too many unspent transaction outputs (>500).' }
      : { json: coins });
    return route.fulfill({ json: {
      chain_stats: { funded_txo_sum: 825552, spent_txo_sum: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
    } });
  });
  await context.route('https://api.zeldhash.com/**', route => {
    if (route.request().method() === 'POST') {
      const { utxos } = route.request().postDataJSON() as { utxos: string[] };
      batches.push(utxos);
      return route.fulfill({ json: utxos.map(outpoint => ({
        txid: moved, vout: Number(outpoint.split(':')[1]), balance: outpoint === `${moved}:1500` ? 409600000000 : 0,
      })) });
    }
    return route.fulfill({ status: 400, json: { error: 'More than 500 confirmed UTXOs for the address.' } });
  });
  // With hunting off, an earned/transferred balance must still appear on the home screen.
  await page.reload();
  await expect(page.getByText('4,096.00000000', { exact: true })).toBeVisible();
  expect(batches).toHaveLength(16);
  expect(batches.every(batch => batch.length <= 100)).toBe(true);
  expect(batches.flat()).toHaveLength(1501);
  await page.goto(`chrome-extension://${extensionId}/popup.html#/zeld`);
  await expect(page.getByText('Balance: 4,096.00000000')).toBeVisible();
  await expect(page.getByText('546 sats', { exact: true })).toBeVisible();
});

walletTest('refresh replaces a cached zero ZELD balance immediately', async ({ context, page }) => {
  let funded = false;
  let reads = 0;
  await context.route(/^https?:/, route => route.abort());
  await context.route('**/v2/**', route => route.fulfill({ json: { result: [], result_count: 0 } }));
  await context.route('**/api/address/**', route => route.fulfill({ json: {
    chain_stats: { funded_txo_sum: 0, spent_txo_sum: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 },
  } }));
  await context.route('https://api.zeldhash.com/**', route => {
    reads++;
    return route.fulfill({ json: funded ? HOLDING : [] });
  });
  await callGalleryService(page, 'updateSettings', [{ zeldHuntSeconds: 20 }]);
  await page.reload();
  const zeldRow = page.getByRole('button').filter({ has: page.getByText('ZELD', { exact: true }) });
  await expect(zeldRow).toContainText('0.00000000');
  const beforeRefresh = reads;
  funded = true;
  await page.getByRole('button', { name: 'Refresh balances' }).click();
  await expect(page.getByText('4,096.00000000')).toBeVisible();
  expect(reads).toBeGreaterThan(beforeRefresh);
});

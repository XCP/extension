import { expect, walletTest } from '../fixtures';
import { authorizeGalleryOrigin, callGalleryService } from '../utils/provider-gallery';

for (const btcHasZeld of [false, true]) {
walletTest(`BTC Max reserves only for selected ZELD (${btcHasZeld}) and ZELD Max respects protections`, async ({ page, context, extensionId }) => {
  const { address } = await authorizeGalleryOrigin(page, 'https://max.example');
  const locked = 'aa'.repeat(32);
  const available = 'bb'.repeat(32);
  const pending = 'cc'.repeat(32);
  const attached = 'dd'.repeat(32);
  const unrelated = 'ee'.repeat(32);
  const checks: string[][] = [];
  let includeAvailableZeld = btcHasZeld;
  await context.route(/^https?:\/\//, async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (url.hostname === 'api.zeldhash.com') return json([
      { txid: locked, vout: 0, balance: '4000000000' },
      ...(includeAvailableZeld ? [{ txid: available, vout: 0, balance: '6000000000' }] : []),
      { txid: pending, vout: 0, balance: '2000000000' },
      { txid: attached, vout: 0, balance: '3000000000' },
    ]);
    if (path === '/v2/utxos/withbalances') {
      const candidates = url.searchParams.get('utxos')!.split(',');
      checks.push(candidates);
      return json({ result: Object.fromEntries(candidates.map(key => [key, key.startsWith(attached) || key.startsWith(unrelated)])) });
    }
    if (/\/api\/address\/[^/]+\/utxo$/.test(path)) return json([
      ...[locked, available, pending, attached].map(txid => ({ txid, vout: 0, value: 80_000, status: { confirmed: txid !== pending } })),
      ...Array.from({ length: 500 }, (_, vout) => ({ txid: unrelated, vout, value: 600, status: { confirmed: true } })),
    ]);
    if (path.endsWith('/outspend/0')) return json({ spent: false });
    if (path === '/api/blocks/tip/height') return route.fulfill({ body: '900000' });
    if (/\/api\/address\/[^/]+$/.test(path)) return json({
      chain_stats: { funded_txo_sum: 620000, spent_txo_sum: 0, tx_count: 1 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    });
    if (path.includes('/fees/')) return json({ fastestFee: 1, halfHourFee: 1, hourFee: 1 });
    if (path.startsWith('/v2/')) return json({ result: [], next_cursor: null, result_count: 0 });
    return route.abort();
  });
  await callGalleryService(page, 'updateSettings', [{ allowUnconfirmedTxs: false, zeldHuntSeconds: 5 }]);
  await callGalleryService(page, 'updateCoinLocks', [address, { lock: [{ outpoint: `${locked}:0`, valueSats: 80000 }] }]);

  await page.goto(`chrome-extension://${extensionId}/popup.html#/compose/send/BTC`);
  // Fixture setup cached an empty indexer response before the routes above were installed.
  await page.reload();
  await expect(page.locator('input[name="sat_per_vbyte"]')).toHaveValue('1');
  await page.getByRole('button', { name: 'Use maximum available amount' }).click();
  await expect(page.locator('input[name="quantity"]')).toHaveValue(btcHasZeld ? '0.00079196' : '0.00079743');

  includeAvailableZeld = true;
  await page.goto(`chrome-extension://${extensionId}/popup.html#/zeld/send`);
  // Clear the empty indexer answer cached during wallet fixture setup, before these routes.
  await page.reload();
  await expect(page.getByText('60.00000000 ZELD', { exact: true })).toBeVisible();
  // All subsequent checks target just two coins, despite the 500 unrelated attachments.
  checks.length = 0;
  await page.getByRole('button', { name: 'Max', exact: true }).click();
  await expect(page.locator('input[name="zeld_display_amount"]')).toHaveValue('60');
  expect(checks).toEqual([[`${available}:0`, `${attached}:0`]]);
  await page.screenshot({ path: 'test-results/protected-max/zeld-max.png', fullPage: true });

  // A protection added while the form is open must be reflected on the next Max click.
  await callGalleryService(page, 'updateCoinLocks', [address, { lock: [{ outpoint: `${available}:0`, valueSats: 80000 }] }]);
  await page.getByRole('button', { name: 'Max', exact: true }).click();
  await expect(page.locator('input[name="zeld_display_amount"]')).toHaveValue('0');
  await expect(page.getByText('0.00000000 ZELD', { exact: true })).toBeVisible();
});
}

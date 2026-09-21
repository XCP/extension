import * as btc from '@scure/btc-signer';
import { arc4, hexToBytes } from '../../src/core/counterparty/unpack/binary';
import { walletTest, expect } from '../fixtures';

const destination = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const txid = 'ab'.repeat(32);

for (const tampered of [false, true]) {
  walletTest(`BTC send ${tampered ? 'rejects a changed dispenser payment' : 'reviews a dispenser payment'}`, async ({ page, context }) => {
    let composed = false;
    await context.route(/^https?:\/\//, async route => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const json = (body: unknown) => route.fulfill({ json: body });
      if (/\/v2\/addresses\/[^/]+\/compose\/send$/.test(path)) {
        const params = url.searchParams;
        expect(params.get('asset')).toBe('BTC');
        expect(params.get('quantity')).toBe('5788');
        expect(params.get('destination')).toBe(destination);
        const source = path.split('/')[3]!;
        const amount = tampered ? 5789n : 5788n;
        const tx = new btc.Transaction({ allowUnknownOutputs: true });
        tx.addInput({ txid, index: 0 });
        tx.addOutput({ script: btc.OutScript.encode(btc.Address().decode(destination)), amount });
        const data = arc4(hexToBytes(txid), hexToBytes('434e5452505254590d00'));
        tx.addOutput({ script: btc.Script.encode(['RETURN', data]), amount: 0n });
        tx.addOutput({ script: btc.OutScript.encode(btc.Address().decode(source)), amount: 99600n - amount });
        composed = true;
        return json({ result: { rawtransaction: tx.hex, btc_fee: 400,
          params: { asset: 'BTC', destination, quantity: 5788 }, name: 'send',
        } });
      }
      if (path === `/api/tx/${txid}`) return json({ vout: [{ value: 100000 }] });
      if (/\/api\/address\/[^/]+\/utxo$/.test(path)) return json([]);
      if (/\/api\/address\/[^/]+$/.test(path)) return json({
        chain_stats: { funded_txo_sum: 100000, spent_txo_sum: 0, tx_count: 1 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
      });
      if (path.includes('/fees/')) return json({ fastestFee: 1.6, halfHourFee: 1.6, hourFee: 1.6 });
      if (path.startsWith('/v2/')) return json({ result: [], next_cursor: null, result_count: 0 });
      return route.abort();
    });
    await page.goto(`${page.url().split('#')[0]}#/compose/send/BTC`);
    await page.reload();
    await page.locator('input[placeholder*="destination" i]').first().fill(destination);
    await page.locator('input[name="quantity"]').fill('0.00005788');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    if (tampered) {
      await expect(page.getByRole('alert').filter({ hasText: /amount|value|output/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Sign/ })).toHaveCount(0);
    } else {
      await expect(page.getByText('Dispenser payment', { exact: true })).toBeVisible();
      await expect(page.getByText('0.00005788 BTC', { exact: true })).toBeVisible();
      await expect(page.getByText(destination, { exact: true })).toBeVisible();
    }
    expect(composed).toBe(true);
  });
}

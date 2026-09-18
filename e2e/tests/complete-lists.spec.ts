import { walletTest, expect } from '../fixtures';

const fairminters = Array.from({ length: 125 }, (_, i) => ({
  tx_hash: i.toString(16).padStart(64, '0'), asset: `PAGETEST${String(i).padStart(3, '0')}`,
  status: 'open', price: 0, quantity_by_price: 1, price_normalized: '0',
  quantity_by_price_normalized: '1', divisible: false, description: `Sale ${i}`,
}));

walletTest('fairmint form browses beyond 100 listings in 20-row pages', async ({ page, context }) => {
  const offsets: number[] = [];
  await context.route('**/cdn.xcp.io/**', route => route.abort());
  await context.route('**/v2/fairminters?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get('offset') ?? 0);
    expect(Number(params.get('limit'))).toBe(20);
    offsets.push(offset);
    await route.fulfill({ json: { result: fairminters.slice(offset, offset + 20), result_count: 125 } });
  });
  await page.goto(`${page.url().split('#')[0]}#/compose/fairmint`);
  await expect(page.getByRole('button', { name: 'Load more fairminters' })).toBeVisible();
  await page.getByRole('combobox').press('ArrowDown');
  await expect(page.getByRole('option')).toHaveCount(20);
  expect(offsets).toEqual([0]);
  for (let count = 40; count < 141; count += 20) {
    await page.getByRole('listbox').evaluate(list => {
      list.scrollTop = list.scrollHeight;
    });
    await expect(page.getByRole('option')).toHaveCount(Math.min(count, 125));
  }
  await page.getByRole('option', { name: /PAGETEST124/ }).click();
  await expect(page.getByRole('combobox')).toHaveValue('PAGETEST124');
  expect(offsets).toEqual([0, 20, 40, 60, 80, 100, 120]);
});

walletTest('UTXO move form reports every attached asset, including subsequent API pages', async ({ page, context }) => {
  const cursors: number[] = [];
  const utxo = `${'a'.repeat(64)}:0`;
  const rows = Array.from({ length: 125 }, (_, i) => ({
    utxo, asset: `ASSET${i}`, quantity: 1, quantity_normalized: '1', utxo_address: 'address',
  }));
  await context.route('**/v2/utxos/*/balances?**', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('cursor') ?? 0);
    cursors.push(offset);
    await route.fulfill({ json: { result: rows.slice(offset, offset + 100), result_count: 125,
      next_cursor: offset === 0 ? 100 : null } });
  });
  await page.goto(`${page.url().split('#')[0]}#/compose/utxo/move/${utxo}`);
  await expect(page.getByText('125 Balances', { exact: true })).toBeVisible();
  expect(cursors).toEqual([0, 100]);
});

for (const fairmint of [true, false]) {
  walletTest(`balance ${fairmint ? 'hides unreliable pool fairmint credits' : 'nets self-payments and shows independent receipts'}`, async ({ page, context }) => {
    const assetInfo = { asset: 'XCP', asset_longname: null, divisible: true,
      description: 'Counterparty', issuer: '', locked: true, supply: '260000000000000',
      supply_normalized: '2600000' };
    await context.route('**/v2/assets/XCP?**', route => route.fulfill({ json: { result: assetInfo } }));
    await context.route('**/v2/addresses/*/balances/XCP?**', route => route.fulfill({ json: {
      result: [{ asset: 'XCP', quantity: 3000000000, quantity_normalized: '30', asset_info: assetInfo }],
      result_count: 1, next_cursor: null,
    } }));
    await context.route('**/v2/addresses/mempool?**', route => {
      const params = new URL(route.request().url()).searchParams;
      const address = params.get('addresses');
      const movement = (event: string, tx: string, quantity: number, normalized: string) => ({
        tx_hash: tx.repeat(64), event,
        params: { address, asset: 'XCP', quantity, quantity_normalized: normalized,
          action: fairmint ? 'fairmint payment' : 'send', calling_function: fairmint ? 'fairmint payment' : 'send' },
      });
      return route.fulfill({ json: { result: [
        movement('DEBIT', 'a', 1000000000, '10'), movement('CREDIT', 'a', 1000000000, '10'),
        movement('DEBIT', 'b', 1000000000, '10'),
        ...['c', 'd', 'e'].map(tx => movement('CREDIT', tx, 10000000, '0.1')),
      ], next_cursor: null } });
    });
    await page.goto(`${page.url().split('#')[0]}#/assets/XCP/balance`);
    if (fairmint) {
      await expect(page.getByText(/Balance: 10\.00000000/)).toBeVisible();
      await expect(page.getByText(/incoming\)/)).toHaveCount(0);
    } else {
      await expect(page.getByText('(+0.3 incoming)', { exact: true })).toBeVisible();
    }
    // The existing spendable figure still reserves both 10 XCP pending payments.
    await expect(page.getByText(/Balance: 10\.00000000/)).toBeVisible();
    await expect(page.getByText('(+10.3 incoming)', { exact: true })).toHaveCount(0);
  });
}

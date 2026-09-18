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

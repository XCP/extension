import { walletTest, expect } from '../fixtures';

const address = '1ALLSET1VJQqiDNTpHbKVJQY8qa4KofMr8';
const dispensers = Array.from({ length: 237 }, (_, i) => ({
  tx_hash: i.toString(16).padStart(64, '0'), source: address,
  asset: `PAGETEST${String(i).padStart(3, '0')}`, status: 0,
  give_quantity: 1, give_remaining: 5, escrow_quantity: 5, satoshirate: 1000,
  give_quantity_normalized: '1', give_remaining_normalized: '5',
  escrow_quantity_normalized: '5', satoshirate_normalized: '0.00001000',
  asset_info: { divisible: false, asset_longname: null }, oracle_address: null,
}));

walletTest('close selector and buyer discovery lazily load 20 at a time beyond 200', async ({ page, context }) => {
  const offsets: number[] = [];
  await context.route('**/cdn.xcp.io/**', route => route.abort());
  await context.route('**/v2/addresses/*/dispensers?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get('offset') ?? 0);
    const limit = Number(params.get('limit') ?? 10);
    offsets.push(offset);
    await route.fulfill({ json: { result: dispensers.slice(offset, offset + limit), result_count: dispensers.length } });
  });
  const popup = page.url().split('#')[0];
  await page.goto(`${popup}#/compose/dispenser/close`);
  await page.getByRole('button', { name: 'Select a dispenser' }).click();
  await expect(page.getByRole('option')).toHaveCount(20);
  expect(offsets).toEqual([0]);
  for (let count = 40; count < 257; count += 20) {
    await page.getByRole('listbox').evaluate(list => {
      list.scrollTop = list.scrollHeight;
    });
    await expect(page.getByRole('option')).toHaveCount(Math.min(count, 237));
  }
  await page.getByRole('option', { name: 'PAGETEST236', exact: true }).click();
  await expect(page.locator('input[name="asset"]')).toHaveValue('PAGETEST236');
  expect(offsets).toEqual(Array.from({ length: 12 }, (_, i) => i * 20));

  // A different address gives discovery its own paginated HTTP reads rather than cached rows.
  offsets.length = 0;
  await page.goto(`${popup}#/compose/dispenser/dispense`);
  await page.getByLabel('Dispenser Address', { exact: false }).fill(address);
  await expect(page.getByRole('radio')).toHaveCount(20);
  expect(offsets).toEqual([0]);
  for (let count = 40; count < 257; count += 20) {
    await page.getByRole('button', { name: 'Load more dispensers' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('radio')).toHaveCount(Math.min(count, 237));
    await expect(page.getByRole('radio', { name: 'Select dispenser for PAGETEST000', exact: true })).toBeChecked();
  }
  await page.getByRole('radio', { name: 'Select dispenser for PAGETEST236', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'Select dispenser for PAGETEST236', exact: true })).toBeChecked();
  expect(offsets).toEqual(Array.from({ length: 12 }, (_, i) => i * 20));
});

walletTest('close selector preserves earlier options and reports a later-page failure', async ({ page, context }) => {
  await context.route('**/v2/addresses/*/dispensers?**', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0);
    await route.fulfill(offset === 0
      ? { json: { result: dispensers.slice(0, 20), result_count: dispensers.length } }
      : { status: 400, json: { error: 'Second page unavailable' } });
  });
  await page.goto(`${page.url().split('#')[0]}#/compose/dispenser/close`);
  await page.getByRole('button', { name: 'Load more dispensers' }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to load more dispensers');
  await page.getByRole('button', { name: 'Select a dispenser' }).click();
  await expect(page.getByRole('option')).toHaveCount(20);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeDisabled();
});

walletTest('purchase retry keeps the selected dispenser from a later page', async ({ page, context }) => {
  const offsets: number[] = [];
  let failNextPage = true;
  await context.route('**/cdn.xcp.io/**', route => route.abort());
  await context.route('**/v2/addresses/*/dispensers?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get('offset') ?? 0);
    offsets.push(offset);
    if (offset === 40 && failNextPage) {
      failNextPage = false;
      await route.fulfill({ status: 400, json: { error: 'Page unavailable' } });
      return;
    }
    await route.fulfill({ json: { result: dispensers.slice(offset, offset + 20), result_count: dispensers.length } });
  });
  await page.goto(`${page.url().split('#')[0]}#/compose/dispenser/dispense`);
  await page.getByLabel('Dispenser Address', { exact: false }).fill(address);
  await expect(page.getByRole('radio')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more dispensers' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('radio')).toHaveCount(40);
  const chosen = page.getByRole('radio', { name: 'Select dispenser for PAGETEST039', exact: true });
  // Checking the last visible row scrolls the sentinel into view and requests page three.
  await chosen.check();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to load more' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('radio')).toHaveCount(60);
  await expect(chosen).toBeChecked();
  expect(offsets).toEqual([0, 20, 40, 40]);
});

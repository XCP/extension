import { expect, walletTest } from '../fixtures';

walletTest('dispenser market requests price/age ordering before twenty-row pagination', async ({ page, context }) => {
  const offers = Array.from({ length: 23 }, (_, i) => ({
    tx_hash: (i + 1).toString(16).padStart(64, '0'), tx_index: i + 1,
    source: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', asset: 'XCP', status: 0,
    oracle_address: null, give_quantity: 100000000, give_quantity_normalized: '1',
    give_remaining: (100 + i) * 100000000, give_remaining_normalized: String(100 + i),
    escrow_quantity: (100 + i) * 100000000, escrow_quantity_normalized: String(100 + i),
    satoshirate: i === 0 ? 100 : 200, satoshirate_normalized: i === 0 ? '0.000001' : '0.000002',
    price: i === 0 ? 100 : 200, satoshi_price: i === 0 ? 100 : 200,
    block_index: 900000 - i, block_time: 1700000000,
  }));
  const offsets: number[] = [];
  await context.route(/^https?:\/\//, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/v2/assets/XCP/dispensers') {
      expect(url.searchParams.get('sort')).toBe('price:asc,tx_index:asc');
      expect(url.searchParams.get('status')).toBe('open');
      expect(url.searchParams.get('exclude_with_oracle')).toBe('true');
      expect(url.searchParams.get('limit')).toBe('20');
      const offset = Number(url.searchParams.get('offset'));
      offsets.push(offset);
      return route.fulfill({ json: { result: offers.slice(offset, offset + 20), result_count: 23 } });
    }
    if (url.pathname.startsWith('/v2/')) {
      return route.fulfill({ json: { result: [], result_count: 0 } });
    }
    return route.abort();
  });
  await page.goto(`${page.url().split('#')[0]}#/market/dispensers/XCP`);
  const cards = page.locator('div[role="button"]').filter({ hasText: /remaining/ });
  await expect(cards).toHaveCount(20);
  expect(offsets).toEqual([0]);
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards).toHaveCount(23);
  expect(offsets).toEqual([0, 20]);
  const remaining = await cards.locator('div').filter({ hasText: /^\d+ remaining$/ }).allTextContents();
  expect(remaining).toEqual(offers.map(row => `${row.give_remaining_normalized} remaining`));
});

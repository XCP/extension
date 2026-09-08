/** Bounded browser coverage for global searches from an unfunded wallet. All HTTP data is synthetic. */
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, navigateTo, walletTest } from '../fixtures';

const UNOWNED_ASSET = 'A95428956661682177';
const MARKET_ASSET = 'UNOWNED';
const SOURCE = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';
const assetInfo = {
  asset_longname: null, description: 'Synthetic browser test asset', issuer: SOURCE,
  divisible: true, locked: true, supply: '10000000000', supply_normalized: '100',
};

const orders = Array.from({ length: 21 }, (_, index) => ({
  tx_hash: (index + 1).toString(16).padStart(64, '0'), source: SOURCE,
  give_asset: MARKET_ASSET, get_asset: 'XCP',
  give_quantity: '10000000000', get_quantity: String((index + 1) * 10000000000),
  give_quantity_normalized: '100', get_quantity_normalized: String((index + 1) * 100),
  give_remaining_normalized: String(100 + index), get_remaining_normalized: String((100 + index) * (index + 1)),
  give_asset_info: assetInfo, get_asset_info: assetInfo,
  status: 'open', confirmed: true, block_index: 900000, block_time: 1700000000,
}));

const dispensers = Array.from({ length: 21 }, (_, index) => ({
  tx_hash: (index + 100).toString(16).padStart(64, '0'), source: SOURCE,
  asset: MARKET_ASSET, asset_info: assetInfo,
  give_quantity: '100000000', give_quantity_normalized: '1',
  give_remaining: String((100 + index) * 100000000), give_remaining_normalized: String(100 + index),
  escrow_quantity: '20000000000', escrow_quantity_normalized: '200',
  satoshirate: String(1000 + index), satoshirate_normalized: '0.00001',
  oracle_address: null, status: 0, confirmed: true, block_index: 900000, block_time: 1700000000,
}));

const utxoBalances = Array.from({ length: 21 }, (_, index) => ({
  asset: index === 20 ? 'LATEATTACHED' : 'EARLYATTACHED', asset_info: assetInfo,
  quantity: '100000000', quantity_normalized: '1',
  utxo: `${(index + 500).toString(16).padStart(64, '0')}:0`, utxo_address: SOURCE,
}));

interface SearchApi {
  failAssetSearch: boolean;
  failSecondPage: boolean;
  assetSearchRequests: string[];
  listingRequests: { kind: string; offset: number; limit: number }[];
  utxoPageRequests: number[];
  releaseUtxoPage: () => void;
}

const test = walletTest.extend<{ searchApi: SearchApi }>({
  searchApi: [async ({ context }, use, testInfo) => {
    let releaseUtxoPage!: () => void;
    const utxoPage = new Promise<void>((resolve) => { releaseUtxoPage = resolve; });
    const includesUtxos = testInfo.title.startsWith('UTXOs:');
    const api: SearchApi = {
      failAssetSearch: true, failSecondPage: true,
      assetSearchRequests: [], listingRequests: [],
      utxoPageRequests: [], releaseUtxoPage,
    };
    await context.route(/^https?:\/\//, async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const json = (body: unknown) => route.fulfill({ status: 200, json: body });

      if (pathname === '/v2/assets' && url.searchParams.has('query')) {
        api.assetSearchRequests.push(url.searchParams.get('query')!);
        if (api.failAssetSearch) return route.fulfill({ status: 503, json: { error: 'Synthetic search outage' } });
        return json({ result: [{ asset: UNOWNED_ASSET, ...assetInfo }], result_count: 1 });
      }
      const listing = pathname.match(/^\/v2\/assets\/UNOWNED\/(orders|dispensers)$/);
      if (listing) {
        const kind = listing[1]!;
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 20);
        api.listingRequests.push({ kind, offset, limit });
        // A valid API error envelope fails once without transport-level retry ambiguity.
        if (offset > 0 && api.failSecondPage) return json({ error: 'Synthetic page-two outage' });
        const rows = kind === 'orders' ? orders : dispensers;
        return json({ result: rows.slice(offset, offset + limit), result_count: rows.length });
      }
      if (includesUtxos && /^\/v2\/addresses\/[^/]+\/balances$/.test(pathname) && url.searchParams.get('type') === 'utxo') {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 20);
        if (limit === 20) api.utxoPageRequests.push(offset);
        if (offset > 0) await utxoPage;
        return json({ result: utxoBalances.slice(offset, offset + limit), result_count: utxoBalances.length });
      }
      // The fresh wallet owns no ledger assets, orders, dispensers or pool positions.
      if (pathname.startsWith('/v2/addresses/')) return json({ result: [], result_count: 0 });
      if (/^\/v2\/assets\/[^/]+$/.test(pathname)) {
        return json({ result: { asset: pathname.split('/').at(-1), ...assetInfo } });
      }
      if (pathname === '/v2/price/ticker') {
        return json({ result: { xcp: { usd: 2, change_pct: 0, sats: 3333, quote: 'XCP/BTC' } } });
      }
      if (pathname.includes('/prices/BTC-USD/spot')) return json({ data: { amount: '60000', currency: 'USD' } });
      if (pathname === '/api/v1/prices') return json({ USD: 60000 });
      if (pathname.endsWith('/fees/recommended')) {
        return json({ fastestFee: 2, halfHourFee: 1, hourFee: 1, economyFee: 1, minimumFee: 1 });
      }
      if (/\/api\/address\/[^/]+$/.test(pathname)) {
        const stats = { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 };
        return json({ chain_stats: stats, mempool_stats: stats });
      }
      if (route.request().resourceType() === 'image') {
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#dbeafe"/><text x="16" y="21" text-anchor="middle" font-size="15" fill="#2563eb">S</text></svg>',
        });
      }
      if (pathname.startsWith('/v2')) return json({ result: [], result_count: 0 });
      return json([]);
    });
    try {
      await use(api);
    } finally {
      releaseUtxoPage();
    }
  }, { auto: true }],
});

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const filename = `synthetic-${name}.png`;
  const screenshot = testInfo.outputPath(filename);
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach(`Synthetic data: ${name}`, { path: screenshot, contentType: 'image/png' });
  if (process.env.POOL_QA_SCREENSHOT_DIR) {
    await mkdir(process.env.POOL_QA_SCREENSHOT_DIR, { recursive: true });
    await copyFile(screenshot, path.join(process.env.POOL_QA_SCREENSHOT_DIR, filename));
  }
}

for (const list of ['Assets', 'Balances'] as const) {
  test(`${list}: unowned global asset search recovers through Retry`, async ({ page, searchApi }, testInfo) => {
    await page.setViewportSize({ width: 350, height: 600 });
    await page.getByRole('button', { name: `View ${list}`, exact: true }).click();
    const input = page.getByPlaceholder(`Search ${list.toLowerCase()}…`, { exact: true });
    await input.fill(UNOWNED_ASSET);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Search failed. Please try again.');
    await expect(page.getByText('No results found', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('status', { name: /Searching/ })).toHaveCount(0);
    await capture(page, testInfo, `${list.toLowerCase()}-search-error`);

    searchApi.failAssetSearch = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    const result = page.getByRole('button', { name: `View ${UNOWNED_ASSET}`, exact: true });
    await expect(result).toBeVisible();
    await expect(input).toHaveValue(UNOWNED_ASSET);
    await expect(alert).toHaveCount(0);
    expect(searchApi.assetSearchRequests.every(query => query === UNOWNED_ASSET)).toBe(true);
    await capture(page, testInfo, `${list.toLowerCase()}-unowned-search-result`);
    await result.click();
    const expectedHash = `#/assets/${UNOWNED_ASSET}${list === 'Balances' ? '/balance' : ''}`;
    await expect.poll(() => new URL(page.url()).hash).toBe(expectedHash);
  });
}

for (const kind of ['orders', 'dispensers'] as const) {
  test(`Market ${kind}: searches a second page and recovers a failed page with an empty wallet`, async ({ page, searchApi }, testInfo) => {
    await page.setViewportSize({ width: 350, height: 600 });
    await navigateTo(page, 'market');
    await page.getByRole('tab', { name: kind === 'orders' ? 'Orders' : 'Dispensers', exact: true }).click();
    await page.getByPlaceholder(`Search asset ${kind}...`, { exact: true }).fill(MARKET_ASSET);
    const cards = page.getByRole('button', { name: /UNOWNED.*remaining/ });
    await expect(cards).toHaveCount(20);
    await cards.last().scrollIntoViewIfNeeded();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Failed to load listings. Please try again.');
    await expect(cards).toHaveCount(20);
    await expect(page.getByText(`No ${kind} matching "${MARKET_ASSET}"`, { exact: true })).toHaveCount(0);
    expect(searchApi.listingRequests).toEqual([{ kind, offset: 0, limit: 20 }, { kind, offset: 20, limit: 20 }]);
    await alert.scrollIntoViewIfNeeded();
    await capture(page, testInfo, `${kind}-second-page-error`);

    searchApi.failSecondPage = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(cards.first()).toBeVisible();
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(21);
    await expect(cards.filter({ hasText: '120 remaining' })).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expect(page.getByRole('status', { name: /Loading|Searching/ })).toHaveCount(0);
    expect(searchApi.listingRequests.at(-1)).toEqual({ kind, offset: 20, limit: 20 });
    await capture(page, testInfo, `${kind}-second-page-search-complete`);
  });
}

test('UTXOs: a search with no first-page match waits for a delayed second page', async ({ page, searchApi }, testInfo) => {
  await page.setViewportSize({ width: 350, height: 600 });
  await page.getByRole('button', { name: 'View UTXOs', exact: true }).click();
  await expect(page.getByText('EARLYATTACHED', { exact: true })).toHaveCount(20);
  await page.getByPlaceholder('Search utxos…', { exact: true }).fill('LATEATTACHED');
  await expect.poll(() => searchApi.utxoPageRequests).toEqual([0, 20]);
  await expect(page.getByRole('status', { name: 'Searching UTXO balances…', exact: true })).toBeVisible();
  await expect(page.getByText('No matching UTXOs', { exact: true })).toHaveCount(0);
  await capture(page, testInfo, 'utxo-search-pending-second-page');

  searchApi.releaseUtxoPage();
  await expect(page.getByText('LATEATTACHED', { exact: true })).toBeVisible();
  await expect(page.getByText('EARLYATTACHED', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status', { name: /Loading|Searching/ })).toHaveCount(0);
  await capture(page, testInfo, 'utxo-search-second-page-complete');
});

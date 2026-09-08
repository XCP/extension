/** Global pool search must finish paging even when filtering hides the scroll sentinel. */
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { expect, navigateTo, walletTest } from '../../fixtures';

const makePool = (index: number, assetA: string, assetB: string) => ({
  asset_a: assetA,
  asset_b: assetB,
  lp_asset: `A${95428956661682177n + BigInt(index)}`,
  reserve_a: 25_000_000_000,
  reserve_b: 10_000_000_000,
  reserve_a_normalized: '250',
  reserve_b_normalized: '100',
  status: 'open',
  confirmed: true,
});

const POOLS = Array.from({ length: 34 }, (_, index) => {
  if (index === 0) return makePool(index, 'CAPTAINDAN', 'PEPEMEMECOIN');
  if (index === 20) return makePool(index, 'PEPEMEMECOIN', 'XCP');
  if (index === 21) return makePool(index, 'LATEPOOL', 'XCP');
  const suffix = String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26);
  return makePool(index, `TESTPOOL${suffix}`, 'XCP');
});

interface PoolApi {
  pageRequests: { offset: number; limit: number }[];
  pairRequests: string[];
  positionRequests: number;
  releaseSecondPage: () => void;
}

const test = walletTest.extend<{ poolApi: PoolApi }>({
  // Start routing before wallet setup. All API data, prices and icons are synthetic.
  poolApi: [async ({ context }, use) => {
    let releaseSecondPage!: () => void;
    const secondPage = new Promise<void>((resolve) => { releaseSecondPage = resolve; });
    const api: PoolApi = {
      pageRequests: [],
      pairRequests: [],
      positionRequests: 0,
      releaseSecondPage,
    };

    await context.route(/^https?:\/\//, async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const json = (body: unknown) => route.fulfill({ status: 200, json: body });

      if (pathname === '/v2/pools') {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 20);
        api.pageRequests.push({ offset, limit });
        if (offset > 0) await secondPage;
        return json({ result: POOLS.slice(offset, offset + limit), result_count: POOLS.length });
      }
      if (/^\/v2\/pools\/[^/]+\/[^/]+$/.test(pathname)) {
        api.pairRequests.push(pathname);
        const [, , , assetA, assetB] = pathname.split('/').map(decodeURIComponent);
        return json({ result: POOLS.find(pool => pool.asset_a === assetA && pool.asset_b === assetB) ?? null });
      }
      if (/^\/v2\/addresses\/[^/]+\/pools$/.test(pathname)) {
        api.positionRequests += 1;
        return json({ result: [], result_count: 0 });
      }
      if (/^\/v2\/addresses\/[^/]+\/balances/.test(pathname)) {
        return json({ result: [], result_count: 0 });
      }
      if (pathname.includes('/prices/BTC-USD/spot')) {
        return json({ data: { amount: '60000', currency: 'USD' } });
      }
      if (pathname === '/v2/price/ticker') {
        return json({ result: { xcp: { usd: 2, change_pct: 0, sats: 3333, quote: 'XCP/BTC' } } });
      }
      if (pathname === '/api/v1/prices') return json({ USD: 60000 });
      if (pathname.endsWith('/fees/recommended')) {
        return json({ fastestFee: 2, halfHourFee: 1, hourFee: 1, economyFee: 1, minimumFee: 1 });
      }
      if (/\/api\/address\/[^/]+$/.test(pathname)) {
        const emptyStats = { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 };
        return json({ chain_stats: emptyStats, mempool_stats: emptyStats });
      }
      if (route.request().resourceType() === 'image') {
        return route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#dbeafe"/><text x="16" y="21" text-anchor="middle" font-size="15" fill="#2563eb">T</text></svg>',
        });
      }
      if (pathname.startsWith('/v2')) return json({ result: [], result_count: 0 });
      return json([]);
    });

    try {
      await use(api);
    } finally {
      releaseSecondPage();
    }
  }, { auto: true }],
});

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const screenshot = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach(name, { path: screenshot, contentType: 'image/png' });
  const externalDirectory = process.env.POOL_QA_SCREENSHOT_DIR;
  if (externalDirectory) {
    await mkdir(externalDirectory, { recursive: true });
    await copyFile(screenshot, path.join(externalDirectory, `${name}.png`));
  }
}

async function openPools(page: Page, api: PoolApi): Promise<void> {
  await page.setViewportSize({ width: 350, height: 600 });
  await navigateTo(page, 'market');
  await page.getByRole('tab', { name: 'Pools', exact: true }).click();
  await expect(page.getByRole('button', { name: /CAPTAINDAN \/ PEPEMEMECOIN/ })).toBeVisible();
  // A tab change may prefetch page two using the previous sentinel's visibility.
  // Its response stays blocked, so search must still show pending work and finish correctly.
  expect(api.pageRequests[0]).toEqual({ offset: 0, limit: 20 });
}

test.describe('Global pool search pagination', () => {
  test('finds both PEPEMEMECOIN pairs across 34 pools and opens the unowned pair', async ({ page, poolApi }, testInfo) => {
    await openPools(page, poolApi);
    await page.getByPlaceholder('Search pools...', { exact: true }).fill('PEPEMEMECOIN');
    await expect.poll(() => poolApi.pageRequests).toEqual([{ offset: 0, limit: 20 }, { offset: 20, limit: 20 }]);
    await expect(page.getByRole('status', { name: 'Searching pools…', exact: true })).toBeVisible();
    poolApi.releaseSecondPage();

    await expect(page.getByRole('button', { name: /CAPTAINDAN \/ PEPEMEMECOIN/ })).toBeVisible();
    const pair = page.getByRole('button', { name: /PEPEMEMECOIN \/ XCP/ });
    await expect(pair).toBeVisible();
    await expect(page.getByRole('status', { name: /Loading|Searching/ })).toHaveCount(0);
    expect(poolApi.pageRequests).toEqual([{ offset: 0, limit: 20 }, { offset: 20, limit: 20 }]);
    await capture(page, testInfo, '01-pepememecoin-search-complete');

    await pair.click();
    await expect(page).toHaveURL(/#\/pools\/PEPEMEMECOIN\/XCP$/);
    await expect(page.getByRole('heading', { name: 'PEPEMEMECOIN / XCP', exact: true })).toBeVisible();
    await expect(page.getByText('Reserve PEPEMEMECOIN', { exact: true })).toBeVisible();
    await expect(page.getByText('Reserve XCP', { exact: true })).toBeVisible();
    await expect.poll(() => poolApi.positionRequests).toBeGreaterThan(0);
    expect(poolApi.pairRequests).toEqual(['/v2/pools/PEPEMEMECOIN/XCP']);
    await expect(page.getByRole('button', { name: 'Deposit', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Withdraw', exact: true })).toHaveCount(0);
    await capture(page, testInfo, '02-unowned-pepememecoin-xcp-pool');
  });

  test('finds a second-page pool when the first page has no search matches', async ({ page, poolApi }, testInfo) => {
    await openPools(page, poolApi);
    await page.getByPlaceholder('Search pools...', { exact: true }).fill('LATEPOOL');
    await expect.poll(() => poolApi.pageRequests).toEqual([{ offset: 0, limit: 20 }, { offset: 20, limit: 20 }]);
    await expect(page.getByRole('status', { name: 'Searching pools…', exact: true })).toBeVisible();
    await expect(page.getByText('No pools matching "LATEPOOL"', { exact: true })).toHaveCount(0);
    poolApi.releaseSecondPage();

    await expect(page.getByRole('button', { name: /LATEPOOL \/ XCP/ })).toBeVisible();
    await expect(page.getByRole('status', { name: /Loading|Searching/ })).toHaveCount(0);
    await expect(page.getByText('No pools matching "LATEPOOL"', { exact: true })).toHaveCount(0);
    expect(poolApi.pageRequests).toEqual([{ offset: 0, limit: 20 }, { offset: 20, limit: 20 }]);
    await capture(page, testInfo, '03-search-with-no-first-page-matches');
  });
});

/**
 * BTC Price Page Tests
 *
 * Tests for /market/btc - the Bitcoin price chart, fee market, and the ticker route into it.
 *
 * Upstream responses are stubbed so the rendered figures are assertable rather than whatever Bitcoin
 * happens to be doing. The failure path is exercised against real error responses, not a mock of our
 * own error handling.
 */

import type { Page } from '@playwright/test';
import { walletTest, expect } from '../../fixtures';
import { market, common } from '../../selectors';

const BTC_PRICE = 64_358;

/** CoinGecko simple/price — the page's primary source for the headline figure. */
const STATS = { bitcoin: { usd: BTC_PRICE, usd_24h_change: 0.11 } };

/** CoinGecko market_chart — [timestamp, price] pairs. Spread over the last day so 24H keeps them. */
const HOUR = 3_600_000;
const CHART = {
  prices: Array.from({ length: 24 }, (_, i) => [Date.now() - (23 - i) * HOUR, 63_000 + i * 60] as [number, number]),
};

const FEES = { fastestFee: 2, halfHourFee: 1, hourFee: 1, economyFee: 1, minimumFee: 1 };

/** XCP ticker, used for the "1 BTC = N XCP" line in the fee-market card. */
const XCP_TICKER = { result: { as_of: 1785465191, xcp: { usd: 1.25, change_pct: 3.5 }, btc: { usd: BTC_PRICE } } };

async function stubBtcApis(page: Page, overrides: { statsStatus?: number; chartStatus?: number } = {}) {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/api/v3/simple/price**', (route) =>
    route.fulfill(json(overrides.statsStatus ? { error: 'unavailable' } : STATS, overrides.statsStatus ?? 200)),
  );
  await page.route('**/api/v3/coins/bitcoin/market_chart**', (route) =>
    route.fulfill(json(overrides.chartStatus ? { error: 'unavailable' } : CHART, overrides.chartStatus ?? 200)),
  );
  await page.route('**/v1/fees/precise', (route) => route.fulfill(json(FEES)));
  await page.route('**/v2/price/ticker*', (route) => route.fulfill(json(XCP_TICKER)));
  // The stats fetcher falls back to other providers; fail them so a stubbed outage stays an outage.
  await page.route('**/api.coincap.io/**', (route) => route.fulfill(json({ error: 'unavailable' }, 503)));
}

const gotoBtcPrice = async (page: Page) => {
  await page.goto(page.url().replace(/\/index.*/, '/market/btc'));
  await expect(market.btcPriceTitle(page)).toBeVisible({ timeout: 15000 });
};

walletTest.describe('BTC Price Page (/market/btc)', () => {
  walletTest('shows the current price and 24h change', async ({ page }) => {
    await stubBtcApis(page);
    await gotoBtcPrice(page);

    await expect(page.getByText('$64,358')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('+0.11%')).toBeVisible();
    await expect(page.getByText(/Bitcoin \(USD\)/i)).toBeVisible();
  });

  walletTest('draws the price chart', async ({ page }) => {
    await stubBtcApis(page);
    await gotoBtcPrice(page);

    await expect(market.priceChart(page)).toBeVisible({ timeout: 10000 });
  });

  walletTest('offers both intraday ranges', async ({ page }) => {
    await stubBtcApis(page);
    await gotoBtcPrice(page);

    await expect(market.timeRange1h(page)).toBeVisible({ timeout: 10000 });
    await expect(market.timeRange24h(page)).toBeVisible();
  });

  walletTest('switching to 1H keeps the chart on the page', async ({ page }) => {
    await stubBtcApis(page);
    await gotoBtcPrice(page);

    await market.timeRange1h(page).click();

    await expect(market.priceChart(page)).toBeVisible();
    await expect(page).toHaveURL(/market\/btc/);
  });

  walletTest('reports the mempool fee market', async ({ page }) => {
    await stubBtcApis(page);
    await gotoBtcPrice(page);

    await expect(page.getByText(/TX Fee Market/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Fast')).toBeVisible();
    await expect(page.getByText('Medium')).toBeVisible();
    await expect(page.getByText('Slow')).toBeVisible();
    // 64,358 / 1.25 = 51,486 XCP to the bitcoin.
    await expect(page.getByText(/1 BTC = 51,486 XCP/)).toBeVisible();
  });

  walletTest('back returns to the market', async ({ page }) => {
    await stubBtcApis(page);
    await gotoBtcPrice(page);

    await common.headerBackButton(page).click();

    await expect(page).toHaveURL(/market/, { timeout: 10000 });
  });

  walletTest('an unavailable price offers a retry rather than a blank figure', async ({ page }) => {
    await stubBtcApis(page, { statsStatus: 503 });
    await gotoBtcPrice(page);

    await expect(page.getByText(/Unable to load price/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });

  walletTest('an unavailable chart offers a retry and leaves the price intact', async ({ page }) => {
    await stubBtcApis(page, { chartStatus: 503 });
    await gotoBtcPrice(page);

    await expect(page.getByText(/Unable to load chart data/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Try Again/i })).toBeVisible();
    await expect(page.getByText('$64,358')).toBeVisible();
  });
});

walletTest.describe('BTC ticker routing', () => {
  walletTest('the BTC ticker opens the price page', async ({ page }) => {
    await stubBtcApis(page);
    await page.goto(page.url().replace(/\/index.*/, '/market'));

    const ticker = market.btcTickerCard(page);
    await expect(ticker).toBeVisible({ timeout: 15000 });
    await ticker.click();

    await expect(page).toHaveURL(/market\/btc/, { timeout: 10000 });
    await expect(market.btcPriceTitle(page)).toBeVisible();
  });
});

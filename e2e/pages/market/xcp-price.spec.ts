/**
 * XCP Price Page Tests
 *
 * Tests for /market/xcp - the Counterparty price chart, and the ticker route into it.
 *
 * The explorer responses are stubbed so the rendered figures are assertable rather than whatever the
 * market happens to be doing. The failure path is exercised against a real error response, not a mock
 * of our own error handling.
 */

import type { Page } from '@playwright/test';
import { expect, walletTest } from '../../fixtures';
import { common, market } from '../../selectors';

const TICKER = {
  result: {
    as_of: 1785465191,
    xcp: { usd: 1.25, change_pct: 3.5 },
    btc: { usd: 64312.95, change_pct: -0.7 },
  },
};

const PRICE_HISTORY = {
  result: {
    as_of: 1785465215,
    sats: { price_btc: 0.000022, day: '2026-07-30', trades: 2 },
    ath: { day: '2018-01-10', usd: 88.93 },
    history: [
      { day: '2026-07-25', usd: 1.1 },
      { day: '2026-07-27', usd: 1.4 },
      { day: '2026-07-29', usd: 1.2 },
      { day: '2026-07-31', usd: 1.25 },
    ],
  },
};

/** Serve the endpoints the page reads. Registered most-specific-last so it wins. */
async function stubPriceApi(
  page: Page,
  overrides: { tickerStatus?: number; ticker?: object } = {},
) {
  await page.route('**/v2/price', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRICE_HISTORY) }),
  );
  await page.route('**/v2/price/ticker*', (route) =>
    route.fulfill({
      status: overrides.tickerStatus ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(overrides.tickerStatus ? { error: 'unavailable' } : (overrides.ticker ?? TICKER)),
    }),
  );
}

const gotoXcpPrice = async (page: Page) => {
  await page.goto(page.url().replace(/\/index.*/, '/market/xcp'));
  await expect(market.xcpPriceTitle(page)).toBeVisible({ timeout: 15000 });
};

walletTest.describe('XCP Price Page (/market/xcp)', () => {
  walletTest('shows the current price and 24h change from the explorer', async ({ page }) => {
    await stubPriceApi(page);
    await gotoXcpPrice(page);

    await expect(page.getByText('$1.25')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('+3.5%')).toBeVisible();
    await expect(page.getByText(/Counterparty \(USD\)/i)).toBeVisible();
  });

  walletTest('falls back to the historical DEX rate when the ticker has no sats quote', async ({ page }) => {
    await stubPriceApi(page);
    await gotoXcpPrice(page);

    await expect(market.dexRate(page)).toBeVisible({ timeout: 10000 });
    // 0.000022 BTC per XCP is 2,200 sats.
    await expect(page.getByText(/2,200 sats/)).toBeVisible();
    await expect(market.allTimeHigh(page)).toBeVisible();
    await expect(page.getByText(/\$88\.93/)).toBeVisible();
  });

  walletTest('reports the live mempool-adjusted floor from the ticker', async ({ page }) => {
    await stubPriceApi(page, {
      ticker: {
        ...TICKER,
        result: {
          ...TICKER.result,
          xcp: { ...TICKER.result.xcp, sats: 2400, quote: 'confirmed_unit_dispenser_ask' },
        },
      },
    });
    await gotoXcpPrice(page);

    await expect(market.floorPrice(page)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/2,400 sats/)).toBeVisible();
  });

  walletTest('draws the price chart', async ({ page }) => {
    await stubPriceApi(page);
    await gotoXcpPrice(page);

    await expect(market.priceChart(page)).toBeVisible({ timeout: 10000 });
  });

  walletTest('offers day, month, year and full-history ranges', async ({ page }) => {
    await stubPriceApi(page);
    await gotoXcpPrice(page);

    await expect(market.xcpRange7d(page)).toBeVisible({ timeout: 10000 });
    await expect(market.xcpRange30d(page)).toBeVisible();
    await expect(market.xcpRangeAll(page)).toBeVisible();
  });

  walletTest('switching range keeps the chart on the page', async ({ page }) => {
    await stubPriceApi(page);
    await gotoXcpPrice(page);

    await market.xcpRange7d(page).click();

    await expect(market.priceChart(page)).toBeVisible();
    await expect(page).toHaveURL(/market\/xcp/);
  });

  walletTest('Buy XCP leads to the XCP dispensers', async ({ page }) => {
    await stubPriceApi(page);
    await gotoXcpPrice(page);

    await market.buyXcpButton(page).click();

    await expect(page).toHaveURL(/market\/dispensers\/XCP/, { timeout: 10000 });
  });

  walletTest('back returns to the market', async ({ page }) => {
    await stubPriceApi(page);
    await gotoXcpPrice(page);

    await common.headerBackButton(page).click();

    await expect(page).toHaveURL(/market/, { timeout: 10000 });
  });

  walletTest('an unavailable price offers a retry rather than a blank figure', async ({ page }) => {
    await stubPriceApi(page, { tickerStatus: 503 });
    await gotoXcpPrice(page);

    await expect(page.getByText(/Unable to load price/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });
});

walletTest.describe('XCP ticker routing', () => {
  walletTest('the XCP ticker opens the price page, not the dispenser list', async ({ page }) => {
    await stubPriceApi(page);
    await page.goto(page.url().replace(/\/index.*/, '/market'));

    const ticker = market.xcpTickerCard(page);
    await expect(ticker).toBeVisible({ timeout: 15000 });
    await ticker.click();

    await expect(page).toHaveURL(/market\/xcp/, { timeout: 10000 });
    await expect(market.xcpPriceTitle(page)).toBeVisible();
  });
});

/** Packaged read-side gallery. Authored display fixtures; never compose, sign, or reveal secrets. */
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Locator } from '@playwright/test';
import { expect, walletTest } from '../fixtures';
import { approvalCatalog } from '../utils/approval-locale';
import { callGalleryService } from '../utils/provider-gallery';

const OUT = process.env.XCP_DEPTH_OUT_DIR ?? 'test-results/localization-depth';
const LANGUAGES = ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
const WIDTHS = [350, 360, 1100] as const;
interface NetworkFixture { priceFailure: boolean; reads: string[]; blockedWrites: string[] }

const HISTORY_ORDER_HASH = 'd1'.repeat(32);
const HISTORY_MPMA_HASH = 'e2'.repeat(32);
const HISTORY_ADDRESS_A = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const HISTORY_ADDRESS_B = '1CounterpartyXXXXXXXXXXXXXXXUWLpVr';
const HISTORY_BLOCK = 960000;
const HISTORY_TIME = Date.parse('2026-09-07T12:00:00Z') / 1000;
const historyBase = {
  block_index: HISTORY_BLOCK, block_time: HISTORY_TIME, source: HISTORY_ADDRESS_A, destination: '',
  data: {}, supported: true, confirmed: true, status: 'valid', fee: 1234, btc_amount: 0,
};
const orderTerms = {
  give_asset: 'RAREPEPE', give_quantity: '1000', give_quantity_normalized: '1000', give_asset_info: { asset: 'RAREPEPE', divisible: false },
  get_asset: 'PEPECASH', get_quantity: '250000000', get_quantity_normalized: '2.5', get_asset_info: { asset: 'PEPECASH', divisible: true },
  expiration: 100, fee_required: 0, status: 'open',
};
const orderHistory = {
  ...historyBase, tx_hash: HISTORY_ORDER_HASH, transaction_type: 'order',
  unpacked_data: { message_type: 'order', message_data: orderTerms },
  events: [
    { event_index: 1, event: 'OPEN_ORDER', tx_hash: HISTORY_ORDER_HASH, block_index: HISTORY_BLOCK, block_time: HISTORY_TIME,
      params: { ...orderTerms, tx_hash: HISTORY_ORDER_HASH, give_remaining: '1000', get_remaining: '250000000', expire_index: HISTORY_BLOCK + 99 } },
    { event_index: 2, event: 'ORDER_UPDATE', tx_hash: HISTORY_ORDER_HASH, block_index: HISTORY_BLOCK, block_time: HISTORY_TIME,
      params: { tx_hash: 'ff'.repeat(32), status: 'filled', give_remaining: '0', get_remaining: '0' } },
    { event_index: 3, event: 'ORDER_UPDATE', tx_hash: HISTORY_ORDER_HASH, block_index: HISTORY_BLOCK, block_time: HISTORY_TIME,
      params: { tx_hash: HISTORY_ORDER_HASH, status: 'open', give_remaining: '600', get_remaining: '150000000' } },
  ],
};
const mpmaRows = [
  { asset: 'PEPECASH', destination: HISTORY_ADDRESS_A, quantity: '125000000', quantity_normalized: '1.25', asset_info: { asset: 'PEPECASH', divisible: true } },
  { asset: 'PEPECASH', destination: HISTORY_ADDRESS_B, quantity: '275000000', quantity_normalized: '2.75', asset_info: { asset: 'PEPECASH', divisible: true } },
  { asset: 'RAREPEPE', destination: HISTORY_ADDRESS_A, quantity: '2', quantity_normalized: '2', asset_info: { asset: 'RAREPEPE', divisible: false } },
  { asset: 'RAREPEPE', destination: HISTORY_ADDRESS_B, quantity: '10', quantity_normalized: '10', asset_info: { asset: 'RAREPEPE', divisible: false } },
];
const mpmaHistory = {
  ...historyBase, tx_hash: HISTORY_MPMA_HASH, transaction_type: 'mpma_send',
  // This mirrors the current Core unpack projection; complete MPMA_SEND events must win.
  unpacked_data: { message_type: 'mpma_send', message_data: [mpmaRows[0], mpmaRows[2]] },
  events: mpmaRows.map((row, index) => ({ event_index: index + 1, event: 'MPMA_SEND', tx_hash: HISTORY_MPMA_HASH,
    block_index: HISTORY_BLOCK, block_time: HISTORY_TIME, params: { ...row, tx_hash: HISTORY_MPMA_HASH, status: 'valid' } })),
};


async function installNetwork(context: BrowserContext): Promise<NetworkFixture> {
  const state: NetworkFixture = { priceFailure: false, reads: [], blockedWrites: [] };
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue();
    if (!['GET', 'HEAD'].includes(request.method()) || /\/(compose|broadcast)(\/|\?|$)/.test(url.pathname)) {
      state.blockedWrites.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    state.reads.push(url.hostname + url.pathname);
    const now = Date.now();
    if (url.pathname.includes('/market_chart')) {
      return route.fulfill(state.priceFailure ? json({ error: 'fixture unavailable' }, 503) : json({
        prices: Array.from({ length: 24 }, (_, i) => [now - (23 - i) * 3_600_000, 64000 + i * 10]),
      }));
    }
    if (url.pathname.includes('/simple/price')) return route.fulfill(state.priceFailure
      ? json({ error: 'fixture unavailable' }, 503) : json({ bitcoin: { usd: 64358, usd_24h_change: 0.11 } }));
    if (url.hostname === 'api.coincap.io') return route.fulfill(json({ error: 'fixture unavailable' }, 503));
    if (url.hostname === 'api.coinbase.com') return route.fulfill(json({ data: { amount: '64358', currency: 'USD' } }));
    if (url.hostname === 'api.kraken.com') return route.fulfill(json({ result: { XXBTZUSD: { c: ['64358'] } } }));
    if (url.pathname.endsWith('/v1/prices')) return route.fulfill(json({ USD: 64358 }));
    if (/\/fees\/(precise|recommended)$/.test(url.pathname)) return route.fulfill(json({
      fastestFee: 2.5, halfHourFee: 1.25, hourFee: 0.12345678, economyFee: 0.1, minimumFee: 0.1,
    }));
    if (url.hostname === 'api.xcp.io' && url.pathname === '/v2/price/ticker') return route.fulfill(state.priceFailure
      ? json({ error: 'fixture unavailable' }, 503)
      : json({ result: { as_of: Math.floor(now / 1000), xcp: { usd: 1.25, change_pct: 3.5, sats: 1942 }, btc: { usd: 64358 } } }));
    if (url.hostname === 'api.xcp.io' && url.pathname === '/v2/price') return route.fulfill(state.priceFailure
      ? json({ error: 'fixture unavailable' }, 503) : json({ result: {
        sats: { price_btc: 0.00001942, day: '2026-09-07' }, ath: { day: '2026-09-06', usd: 1.5 },
        history: Array.from({ length: 7 }, (_, i) => ({ day: new Date(now - (6 - i) * 86_400_000).toISOString().slice(0, 10), usd: 1.2 + i / 100 })),
      } }));
    if (url.pathname.endsWith('/blocks/tip/height')) return route.fulfill({ body: '970000' });
    if (/\/v2\/?$/.test(url.pathname)) return route.fulfill(json({ result: {
      server_ready: true, network: 'mainnet', version: '11.3.0', backend_height: 970000, counterparty_height: 970000,
    } }));
    // fetchTransaction uses the singular result envelope from /v2/transactions/:hash?verbose=true.
    if (url.pathname === `/v2/transactions/${HISTORY_ORDER_HASH}`) return route.fulfill(json({ result: orderHistory }));
    if (url.pathname === `/v2/transactions/${HISTORY_MPMA_HASH}`) return route.fulfill(json({ result: mpmaHistory }));
    const asset = url.pathname.match(/\/v2\/assets\/([^/]+)\/?$/)?.[1];
    if (asset) return route.fulfill(json({ result: { asset, asset_longname: null, divisible: true, locked: true, description: 'Gallery asset', supply: 10000000000, supply_normalized: '100', issuer: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' } }));
    if (url.pathname.includes('/v2/')) return route.fulfill(json({ result: [], next_cursor: null, result_count: 0 }));
    if (/\/address\/[^/]+$/.test(url.pathname)) return route.fulfill(json({
      chain_stats: { funded_txo_sum: 100000000, spent_txo_sum: 0, tx_count: 1 },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    }));
    if (url.pathname.endsWith('/utxo') || url.pathname.includes('/txs')) return route.fulfill(json([]));
    if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="16" fill="#7c3aed"/></svg>' });
    // Every remaining external request fails closed. This gallery never uses live market/API data.
    return route.fulfill(json({ error: 'unconfigured gallery read' }, 503));
  });
  return state;
}

const depthTest = walletTest.extend<{ network: NetworkFixture }>({
  network: [async ({ context }, use) => { await use(await installNetwork(context)); }, { auto: true }],
});

depthTest('depth', async ({ page, network }, testInfo) => {
  depthTest.setTimeout(300_000);
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const results: Array<{ language: string; scene: string; width: number; horizontalOverflow: boolean }> = [];
  const entry = new URL(page.url());
  let navigation = 0;
  const goto = async (route: string) => {
    // A new document reads persisted settings and discards earlier chart caches for outage cases.
    entry.search = `?depth=${++navigation}`;
    entry.hash = route;
    await page.goto(entry.href);
  };
  const capture = async (language: string, scene: string, focus?: Locator) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 760 });
      if (focus) await focus.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1
        || document.body.scrollWidth > window.innerWidth + 1);
      results.push({ language, scene, width, horizontalOverflow });
      expect(horizontalOverflow, `${language} ${scene} ${width}: page overflow`).toBe(false);
      if (focus) await expect(focus).toBeInViewport();
      await page.screenshot({ path: path.join(OUT, `${language}-${scene}-${width}.png`) });
    }
  };
  try {
    for (const language of LANGUAGES) {
      const message = approvalCatalog(language);
      await callGalleryService(page, 'updateSettings', [{ language, numberLocale: 'de-DE', fiat: 'usd', showHelpText: true }]);
      await goto('/settings/advanced');
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      const apiInput = page.getByRole('textbox', { name: message('settings_advanced_counterparty_api') });
      await apiInput.fill('not-a-url');
      await apiInput.blur();
      const invalidUrl = page.getByText(message('api_validation_invalid_url'), { exact: false });
      await expect(invalidUrl).toBeVisible();
      await expect(apiInput).toHaveValue('not-a-url');
      await capture(language, 'api-error', invalidUrl);

      await goto('/keychain/wallets');
      await page.getByRole('button', { name: message('wallet_wallet_menu_wallet_options') }).first().click();
      const recovery = page.getByText(message('wallet_wallet_menu_show_passphrase'), { exact: true });
      await expect(recovery).toBeVisible();
      await capture(language, 'recovery-menu', recovery);
      await page.keyboard.press('Escape');

      await goto('/compose/order/BTC?type=buy&quote=XCP');
      await page.getByRole('button', { name: message('order_form_order_settings') }).click();
      const feeHelp = page.getByText(message('settings_order_settings_the_minimum_tx_fee_required'), { exact: true });
      await expect(feeHelp).toBeVisible();
      await expect(page.getByText(message('settings_order_settings_blocks', ['8.064', message('settings_order_duration_months', ['1,9'])]), { exact: true })).toBeVisible();
      await expect(page.locator('#fee-required')).toHaveValue('0');
      await capture(language, 'order-fee', feeHelp);

      network.priceFailure = false;
      await goto('/market/btc');
      await expect(page.getByRole('img', { name: message('charts_price_chart_price_chart') })).toBeVisible();
      const hour = page.getByRole('button', { name: message('charts_range_hours', ['1']), exact: true });
      await hour.click();
      await expect(hour).toHaveAttribute('aria-pressed', 'true');
      await capture(language, 'btc-chart', hour);

      await goto('/market/xcp');
      await expect(page.getByRole('img', { name: message('charts_price_chart_price_chart') })).toBeVisible();
      const all = page.getByRole('button', { name: message('market_xcp_all'), exact: true });
      await all.click();
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      await capture(language, 'xcp-chart', all);

      network.priceFailure = true;
      for (const asset of ['btc', 'xcp']) {
        await goto(`/market/${asset}`);
        const chartError = page.getByText(message('common_unable_to_load_chart_data'), { exact: true });
        await expect(chartError).toBeVisible();
        await capture(language, `${asset}-error`, chartError);
      }
      network.priceFailure = false;

      await goto('/market/orders/XCP/BTC');
      const emptySell = page.getByText(message('baseasset_quoteasset_no_sell_orders', ['XCP', 'BTC']), { exact: true });
      await expect(emptySell).toBeVisible();
      await capture(language, 'order-empty', emptySell);
      await page.getByRole('tab', { name: message('common_buy'), exact: true }).click();
      await expect(page.getByText(message('baseasset_quoteasset_no_buy_orders', ['XCP', 'BTC']), { exact: true })).toBeVisible();

      await goto('/transactions/' + HISTORY_ORDER_HASH);
      await expect(page.getByRole('heading', { name: message('tx_action_order'), exact: true })).toBeVisible();
      await expect(page.getByText(message('consolidate_history_confirmed'), { exact: true })).toBeVisible();
      const recordedState = page.getByText(message('messages_order_snapshot_notice'), { exact: true });
      await expect(recordedState).toBeVisible();
      await expect(page.getByText('🟢 ' + message('messages_order_status_open'), { exact: true })).toBeVisible();
      await expect(page.getByText('1.000 RAREPEPE', { exact: true })).toBeVisible();
      await expect(page.getByText('2,50000000 PEPECASH', { exact: true })).toBeVisible();
      await expect(page.getByText('600 RAREPEPE', { exact: true })).toBeVisible();
      await expect(page.getByText('1,50000000 PEPECASH', { exact: true })).toBeVisible();
      await expect(page.getByText('40,0%', { exact: true })).toBeVisible();
      await expect(page.getByText(message('messages_order_expires_after_block', ['960.099']), { exact: true })).toBeVisible();
      await capture(language, 'order-history', recordedState.locator('..'));

      await goto('/transactions/' + HISTORY_MPMA_HASH);
      await expect(page.getByRole('heading', { name: message('tx_action_multi_send'), exact: true })).toBeVisible();
      const mpmaSummary = message('messages_mpma_multi_send_to', [message('messages_mpma_assets', ['2']), message('messages_mpma_addresses', ['2'])]);
      await expect(page.getByText(mpmaSummary, { exact: true })).toBeVisible();
      const firstTransfer = page.getByText('1,25000000 PEPECASH', { exact: true });
      await expect(firstTransfer).toBeVisible();
      await expect(page.getByText('2,75000000 PEPECASH', { exact: true })).toBeVisible();
      await expect(page.getByText('4,00000000', { exact: true })).toBeVisible();
      await expect(page.getByText('2 RAREPEPE', { exact: true })).toBeVisible();
      await expect(page.getByText('10 RAREPEPE', { exact: true })).toBeVisible();
      await expect(page.getByText('12', { exact: true })).toBeVisible();
      await expect(page.getByTitle(HISTORY_ADDRESS_A, { exact: true })).toHaveCount(2);
      await expect(page.getByTitle(HISTORY_ADDRESS_B, { exact: true })).toHaveCount(2);
      await expect(page.getByText(message('messages_mpma_per_address', ['PEPECASH']) + ':', { exact: true })).toHaveCount(0);
      await expect(page.getByText(message('messages_mpma_details_unavailable'), { exact: true })).toHaveCount(0);
      await capture(language, 'mpma-history', firstTransfer.locator('..').locator('..'));

    }
    expect(errors).toEqual([]);
    expect(network.blockedWrites.filter(request => /compose|broadcast|sign|send/i.test(request))).toEqual([]);
  } finally {
    const report = { fixtureOnly: true, catalogSource: 'source catalogs; packaged app must be freshly built', historicalFixtures: { order: HISTORY_ORDER_HASH, mpma: HISTORY_MPMA_HASH, recordedBlock: HISTORY_BLOCK }, results, pageErrors: errors, network };
    fs.writeFileSync(path.join(OUT, 'verification.json'), JSON.stringify(report, null, 2));
    await testInfo.attach('depth-verification', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  }
});

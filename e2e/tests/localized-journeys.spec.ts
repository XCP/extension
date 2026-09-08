import type { Page, TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { walletTest, expect } from '../fixtures';
import { callGalleryService, createGalleryApi } from '../utils/provider-gallery';
import { estimateVsize } from '../../src/core/bitcoin/feeEstimation';

const locales = ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
const catalogs = Object.fromEntries(['en', ...locales].map(locale => [locale,
  JSON.parse(readFileSync(`public/_locales/${locale.replace('-', '_')}/messages.json`, 'utf8')),
]));
const message = (locale: string, key: string) => catalogs[locale][key].message as string;
const asset = (name: string) => ({ asset: name, divisible: name !== 'TOKEN', asset_longname: null, description: 'Layout fixture', supply: name === 'TOKEN' ? '1000' : '100000000000', supply_normalized: '1000', locked: false });
const pool = { asset_a: 'XCP', asset_b: 'TOKEN', lp_asset: 'LPTOKEN', quantity: '1000000000', reserve_a: 10000000000, reserve_b: 100, reserve_a_normalized: '100', reserve_b_normalized: '100', lp_asset_info: asset('LPTOKEN') };

async function go(page: Page, route: string) {
  await page.evaluate(path => { window.location.hash = '/' + path; }, route);
  await expect(page).toHaveURL(new RegExp('#/' + route.replace('?', '\\?') + '$'));
}

async function capture(page: Page, info: TestInfo, name: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    clipped: [...document.querySelectorAll('label,[role="alert"],button[type="submit"]')].filter(element => {
      const style = getComputedStyle(element);
      return element.clientHeight > 0 && style.overflow === 'hidden' && element.scrollHeight > element.clientHeight + 1;
    }).map(element => element.textContent),
  }));
  expect(metrics.scroll, name).toBeLessThanOrEqual(metrics.width + 1);
  expect(metrics.clipped, name).toEqual([]);
  expect(await page.locator('body').innerText()).not.toMatch(/\$[1-9]|\$p[1-9]\$/);
  expect(await page.locator('body').innerText()).not.toContain('undefined/undefined');
  const path = info.outputPath(`${name}-${width}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(`${name}-${width}`, { path, contentType: 'image/png' });
}

walletTest('canonical slippage and BTC Max survive display preferences', async ({ context, page }, info) => {
  walletTest.setTimeout(240_000);
  const composeRequests: URL[] = [];
  let quoteMode: 'ready' | 'loading' | 'limited' = 'ready';
  let releaseQuote: (() => void) | undefined;
  const api = await createGalleryApi(context, page, 'localized-journeys');
  await api.route(/\/v2\//, async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.split('/v2/')[1]!;
    if (path.includes('/compose/')) {
      composeRequests.push(url);
      await route.fulfill({ status: 400, json: { error: 'Test stops before signing' } });
      return;
    }
    if (path.includes('/quote')) {
      if (quoteMode === 'loading') await new Promise<void>(resolve => { releaseQuote = resolve; });
      if (quoteMode === 'limited') { await route.fulfill({ status: 429, headers: { 'Retry-After': '1' }, json: { error: 'fixture rate limit' } }); return; }
      const result = path.endsWith('/deposit')
        ? { first_deposit: false, asset_a: 'XCP', asset_b: 'TOKEN', quantity_b_required: 2, quantity_minted_estimate: 100000000 }
        : path.endsWith('/withdraw') ? { pool_exists: true, quantity_a_estimate: 100000000, quantity_b_estimate: 2 }
        : { estimated_output: 10, pool_output: 10, give_remaining: 0, pool_exists: true, fee_bps: 30, price_impact: 0 };
      await route.fulfill({ json: { result } }); return;
    }
    if (/^markets\/[^/]+\/[^/]+$/.test(path)) {
      const [, baseAsset, quoteAsset] = path.split('/').map(decodeURIComponent);
      await route.fulfill({ json: { result: { baseAsset, quoteAsset, lastPrice: null } } }); return;
    }
    if (/^assets\/[^/]+$/.test(path)) { await route.fulfill({ json: { result: asset(path.split('/')[1]!) } }); return; }
    if (/^pools\/[^/]+\/[^/]+$/.test(path)) { await route.fulfill({ json: { result: pool } }); return; }
    if (/addresses\/[^/]+\/pools$/.test(path)) { await route.fulfill({ json: { result: [pool], result_count: 1 } }); return; }
    if (/\/balances\/[^/]+$/.test(path)) {
      const name = path.split('/').at(-1)!;
      await route.fulfill({ json: { result: [{ asset: name, quantity: name === 'TOKEN' ? '100' : '10000000000', quantity_normalized: '100', asset_info: asset(name) }], result_count: 1 } }); return;
    }
    await route.fulfill({ json: { result: [], result_count: 0 } });
  });
  await context.route('**/api/v1/fees/**', route => route.fulfill({ json: { fastestFee: 1, halfHourFee: 0.5, hourFee: 0.2 } }));
  await context.route('**/api/address/**', route => route.fulfill({ json: route.request().url().endsWith('/utxo')
    ? [{ txid: '11'.repeat(32), vout: 0, value: 123456789, status: { confirmed: true } }]
    : { chain_stats: { funded_txo_sum: 123456789, spent_txo_sum: 0 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } } }));
  await callGalleryService(page, 'updateSettings', [{ showHelpText: true, defaultPoolSlippage: '1' }]);
  await page.reload();
  const settings = await context.newPage();
  await settings.goto(page.url().split('#')[0] + '#/settings');
  const controls = settings.locator('section[aria-label] select');
  await expect(controls).toHaveCount(3);
  try {
    for (const locale of (process.env.XCP_LAYOUT_LOCALES?.split(',') ?? ['en'])) {
      await controls.nth(0).selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const beforeAddressSettings = await callGalleryService<{ address: string }>(page, 'getActiveAddress');
      await go(page, 'settings/address-types');
      await expect(page.getByText(`${message(locale, 'address_type_native_segwit')} (P2WPKH)`, { exact: true })).toBeVisible();
      for (const width of [360, 1100]) await capture(page, info, `${locale}-address-types`, width);
      expect(await callGalleryService(page, 'getActiveAddress')).toEqual(beforeAddressSettings);
      await go(page, 'settings/advanced');
      await expect(page.getByText(message(locale, 'settings_advanced_5_minutes'), { exact: true })).toBeVisible();
      await capture(page, info, `${locale}-advanced-settings`, 360);
      await go(page, 'compose/send/XCP');
      const sendAmount = page.locator('input[name="quantity"]');
      await expect(sendAmount).toBeVisible();
      await sendAmount.fill('1.00000001');
      for (const width of [360, 1100]) await capture(page, info, `${locale}-send-normal`, width);
      await sendAmount.fill(''); await sendAmount.pressSequentially('1e5');
      await expect(sendAmount).toHaveValue('1e5');
      await expect(sendAmount).toHaveAttribute('aria-invalid', 'true');
      await page.setViewportSize({ width: 360, height: 900 });
      const guidance = page.getByText(message(locale, 'safety_amount_syntax'), { exact: true });
      await expect(guidance).toBeVisible();
      expect(await guidance.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight))).toBeLessThanOrEqual(2.05);
      await capture(page, info, `${locale}-send-invalid`, 360);
      await sendAmount.evaluate(input => (input as HTMLInputElement).form?.requestSubmit());
      expect(composeRequests).toHaveLength(0);

      await go(page, 'compose/order/TOKEN?type=buy&quote=XCP');
      const orderAmount = page.locator('input[name="amount"]');
      await expect(orderAmount).toBeVisible();
      await expect(page.getByRole('button', { name: message(locale, 'inputs_price_with_suggest_input_flip_trading_pair_to').replace('$1', 'TOKEN/XCP'), exact: true })).toHaveText('XCP/TOKEN');
      await orderAmount.fill('1'); await page.locator('input[name="price"]').fill('2.5');
      for (const width of [360, 1100]) await capture(page, info, `${locale}-order-normal`, width);
      await orderAmount.fill(''); await orderAmount.pressSequentially('0.5');
      await expect(orderAmount).toHaveValue('0.5');
      await expect(orderAmount).toHaveAttribute('aria-invalid', 'true');
      await capture(page, info, `${locale}-indivisible-invalid`, 360);

      for (const kind of ['swap', 'deposit', 'withdraw'] as const) {
        const route = kind === 'swap' ? 'compose/swap/XCP/TOKEN' : kind === 'deposit' ? 'compose/pool/deposit/XCP/TOKEN' : 'compose/pool/withdraw/LPTOKEN';
        await go(page, route);
        const amount = page.locator(kind === 'swap' ? 'input[name="amount_display"]' : kind === 'deposit' ? 'input[name="quantity_a_display"]' : 'input[name="quantity_display"]');
        await expect(amount).toBeVisible();
        await amount.fill('1');
        if (kind === 'deposit') await page.locator('input[name="quantity_b_display"]').fill('2');
        if (kind === 'swap') await page.getByRole('button', { name: message(locale, 'swap_form_show_swap_details'), exact: true }).click();
        await expect(page.locator('button[type="submit"]')).toBeEnabled();
        for (const width of [360, 1100]) await capture(page, info, `${locale}-${kind}-normal`, width);
        const openSettings = () => page.getByRole('button', { name: message(locale, kind === 'swap' ? 'swap_form_show_swap_details' : 'common_pool_settings'), exact: true }).click();
        if (kind !== 'swap') await openSettings();
        const slippage = page.getByPlaceholder(message(locale, 'pool_slippage_input_custom'), { exact: true });
        await slippage.pressSequentially('-5');
        await expect(slippage).toHaveValue('-5');
        await expect(slippage).toHaveAttribute('aria-invalid', 'true');
        await capture(page, info, `${locale}-${kind}-slippage-invalid`, 360);
        if (kind !== 'swap') await page.getByRole('button', { name: message(locale, 'pool_pool_slippage_settings_done'), exact: true }).click();
        await expect(page.locator('button[type="submit"]')).toBeDisabled();
        await page.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit());
        expect(composeRequests).toHaveLength(0);
      }
    }
    // A pending quote and an actual 429 response use the real request/render path.
    await controls.nth(0).selectOption('ja');
    await go(page, 'compose/swap/XCP/TOKEN');
    quoteMode = 'loading';
    await page.locator('input[name="amount_display"]').fill('2');
    await expect(page.getByText(message('ja', 'swap_form_fetching_quote'), { exact: true })).toBeVisible();
    await capture(page, info, 'ja-swap-loading', 360);
    await expect.poll(() => Boolean(releaseQuote)).toBe(true);
    quoteMode = 'limited'; releaseQuote!();
    await expect(page.getByRole('alert').filter({ hasText: message('ja', 'layout_api_status_banner_api_rate_limited_requests_may') })).toBeVisible();
    for (const width of [360, 1100]) await capture(page, info, 'ja-rate-limited', width);
    quoteMode = 'ready';

    // BTC Max stays canonical through a German number format and a USD-to-CNY change.
    await controls.nth(1).selectOption('de-DE');
    await go(page, 'compose/send/BTC');
    const btc = page.locator('input[name="quantity"]');
    await expect(btc).toBeVisible();
    await page.locator('input[type="text"]').first().fill('1CounterpartyXXXXXXXXXXXXXXXUWLpVr');
    const identity = await callGalleryService<{ address: string }>(page, 'getActiveAddress');
    const expectedRaw = 123456789 - (estimateVsize(1, 2, identity.address) + 30);
    for (const fiat of ['usd', 'cny']) {
      await controls.nth(2).selectOption(fiat);
      await page.getByRole('button', { name: message('ja', 'balance_amount_with_max_input_use_maximum_available_amount'), exact: true }).click();
      await expect(btc).toHaveValue((expectedRaw / 100000000).toFixed(8));
      await page.locator('form').evaluate(form => (form as HTMLFormElement).requestSubmit());
      await expect.poll(() => composeRequests.length).toBe(fiat === 'usd' ? 1 : 2);
      expect(composeRequests.at(-1)!.searchParams.get('quantity')).toBe(String(expectedRaw));
    }
  } finally {
    releaseQuote?.();
    await settings.close();
    await api.dispose();
  }
});

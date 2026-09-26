import { writeFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { Address, OutScript } from '@scure/btc-signer';
import { expect, walletTest } from '../fixtures';
import { approvalCatalog } from '../utils/approval-locale';
import { callGalleryService } from '../utils/provider-gallery';

const TXID = 'ab'.repeat(32);
const RECIPIENT = Address().encode({ type: 'wpkh', hash: new Uint8Array(20).fill(17) });

async function capture(page: Page, info: TestInfo, scene: string) {
  const main = page.locator('main');
  const metrics = await main.evaluate(element => ({ height: element.clientHeight, total: element.scrollHeight }));
  const stop = Math.max(0, metrics.total - metrics.height);
  const positions = [...new Set([0, ...Array.from({ length: Math.ceil(stop / (metrics.height * 0.85)) }, (_, i) => Math.min(stop, (i + 1) * Math.floor(metrics.height * 0.85))), stop])];
  const screenshots = [];
  for (const [index, offset] of positions.entries()) {
    await main.evaluate(async (element, top) => {
      element.scrollTop = top;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, offset);
    expect(await main.evaluate(element => element.scrollWidth <= element.clientWidth + 1), scene).toBe(true);
    expect(await page.locator('button, label, [role="alert"]').evaluateAll(elements => elements.filter(element =>
      element.getClientRects().length && element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1).map(element => element.textContent)), scene).toEqual([]);
    const path = info.outputPath(`${scene}-${index}.png`);
    await page.screenshot({ path });
    screenshots.push(path);
  }
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\$[1-9]|\$p[1-9]\$/);
  writeFileSync(info.outputPath(`${scene}.json`), JSON.stringify({ scene, metrics, screenshots, text }, null, 2));
}

for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const) walletTest.describe(language, () => {
  walletTest.use({ browserLocale: language });
  walletTest('new main screens retain localized text, canonical drafts and review controls', async ({ page, context, extensionId }, info) => {
    walletTest.setTimeout(240_000);
    const message = approvalCatalog(language);
    const active = await callGalleryService<{ address: string }>(page, 'getActiveAddress');
    await callGalleryService(page, 'updateSettings', [{ showHelpText: true, zeldHuntSeconds: 0, analyticsAllowed: false }]);
    const script = Buffer.from(OutScript.encode(Address().decode(active.address))).toString('hex');
    let unavailable = false;
    let fairminterFailure = false;
    let writes = 0;
    await context.route(/^https?:/, async route => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (url.hostname === 'cdn.usefathom.com') return route.abort();
      if (request.method() !== 'GET' || /\/broadcast/.test(path)) { writes++; return route.abort(); }
      if (url.hostname === 'api.zeldhash.com') {
        if (unavailable) return route.fulfill({ status: 503, json: { error: 'fixture unavailable' } });
        if (path.endsWith('/rewards')) return route.fulfill({ json: [{ txid: '000000' + 'ab'.repeat(29), vout: 0, reward: '409600000000', zero_count: 6, block_index: 965470 }] });
        return route.fulfill({ json: [{ txid: TXID, vout: 0, balance: '409600000001' }] });
      }
      if (path === `/api/tx/${TXID}`) return route.fulfill({ json: { vout: [{ value: 100000, scriptpubkey: script, scriptpubkey_address: active.address }] } });
      if (path.endsWith('/utxo')) return route.fulfill({ json: [{ txid: TXID, vout: 0, value: 100000, status: { confirmed: true } }] });
      if (path.includes('/api/address/')) return route.fulfill({ json: { chain_stats: { funded_txo_sum: 100000, spent_txo_sum: 0, tx_count: 1 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 } } });
      if (path.includes('/fees/')) return route.fulfill({ json: { fastestFee: 2, halfHourFee: 1, hourFee: 1 } });
      if (/\/v2\/?$/.test(path)) return route.fulfill({ json: { result: { server_ready: true, network: 'mainnet', version: '11.3.0', backend_height: 970000, counterparty_height: 970000 } } });
      if (path === '/v2/fairminters' && fairminterFailure) return route.fulfill({ status: 400, json: { error: 'fixture unavailable' } });
      if (path.includes('/v2/')) return route.fulfill({ json: { result: [], result_count: 0, next_cursor: null } });
      return route.abort();
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [entry, width, height] of [['popup.html',350,600],['sidepanel.html',520,760]] as const) {
      await page.setViewportSize({ width, height });
      const prefix = `${language}-${entry.replace('.html','')}-${width}`;
      const goto = async (route: string) => {
        // Hash-only navigation keeps the prior document's short-lived balance cache.
        await page.goto('about:blank');
        await page.goto(`chrome-extension://${extensionId}/${entry}#${route}`);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        expect(await page.locator('body').evaluate(element => element.clientWidth)).toBe(width);
      };
      await goto('/zeld');
      await expect(page.getByRole('heading', { name: message('zeld_recent_rewards') })).toBeVisible();
      await expect(page.getByText('100,000 sats', { exact: true })).toBeVisible();
      await capture(page, info, `${prefix}-zeld-balance`);
      const seconds = page.getByRole('textbox', { name: message('zeld_hunt_seconds_label') });
      await seconds.fill('61');
      await seconds.blur();
      await expect(page.locator('main').getByRole('alert')).toHaveText(message('zeld_hunt_invalid_seconds', ['60']));
      await capture(page, info, `${prefix}-hunt-invalid`);

      await goto('/zeld/send');
      await page.locator('input[name="destination"]').fill(RECIPIENT);
      const amount = page.locator('input[name="zeld_display_amount"]');
      await page.getByRole('button', { name: message('common_max'), exact: true }).click();
      await expect(amount).toHaveValue('4096.00000001');
      await amount.fill('0,5');
      await expect(page.getByRole('button', { name: message('common_continue'), exact: true })).toBeDisabled();
      await capture(page, info, `${prefix}-zeld-send-invalid`);
      await amount.fill('1.00000001');
      await capture(page, info, `${prefix}-zeld-send`);
      await page.getByRole('button', { name: message('common_continue'), exact: true }).click();
      await expect(page.getByText('1.00000001 ZELD', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: message('screens_review_screen_sign_and_broadcast_transaction'), exact: true })).toBeEnabled();
      await capture(page, info, `${prefix}-zeld-send-review`);

      await goto('/zeld/park');
      await expect(page.getByText(message('zeld_park_help'), { exact: true })).toBeVisible();
      await capture(page, info, `${prefix}-zeld-park`);
      await page.getByRole('button', { name: message('common_continue'), exact: true }).click();
      await expect(page.getByText(message('zeld_small_output') + ':', { exact: true })).toBeVisible();
      await capture(page, info, `${prefix}-zeld-park-review`);

      unavailable = true;
      await goto('/zeld');
      await expect(page.locator('main').getByRole('alert')).toContainText(message('zeld_indexer_unavailable'));
      await capture(page, info, `${prefix}-zeld-unavailable`);
      unavailable = false;
      fairminterFailure = true;
      await goto('/compose/fairmint');
      await expect(page.locator('main').getByRole('alert')).toContainText(message('fairminter_available_failed'));
      await capture(page, info, `${prefix}-fairminter-failed`);
      fairminterFailure = false;
      await page.getByRole('button', { name: message('common_retry'), exact: true }).click();
      await expect(page.getByText(message('fairminter_no_matches'), { exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
    expect(writes).toBe(0);
  });
});

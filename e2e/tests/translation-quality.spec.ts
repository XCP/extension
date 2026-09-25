/** Real browser catalogs and extension surfaces, with authored read fixtures. No signing. */
import { writeFileSync } from 'node:fs';
import { Address, OutScript, Transaction } from '@scure/btc-signer';
import type { Page, TestInfo } from '@playwright/test';
import { expect, walletTest } from '../fixtures';
import { approvalCatalog } from '../utils/approval-locale';
import { authorizeGalleryOrigin, callGalleryService } from '../utils/provider-gallery';

const LANGUAGES = ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
const SURFACES = [
  { entry: 'popup.html', width: 350, height: 600 },
  { entry: 'sidepanel.html', width: 350, height: 760 },
  { entry: 'sidepanel.html', width: 520, height: 760 },
] as const;
// Public test phrase from import-mnemonic.test.tsx, never a user wallet.
const GIFT_PHRASE = 'like just love know never want time out there make look eye';
const GIFT_ADDRESS = '1Ari9oC1zTWyWFK5fnfhxvTMKx5eeWCH2p';
const ORIGIN = 'https://translation-review.example';
/** Raw parents the stubbed node serves: the wallet checks that an input's parent hashes to its txid. */
const PARENTS = new Map<string, string>();

const qualityTest = walletTest.extend<{ network: void }>({
  network: [async ({ context }, use) => {
    await context.route(/^https?:/, async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'GET' || /\/(compose|broadcast)(\/|$)/.test(url.pathname)) return route.abort();
      if (url.pathname.includes('/v2/')) {
        const parentTxid = url.pathname.match(/\/v2\/bitcoin\/transactions\/([0-9a-f]{64})$/)?.[1];
        if (parentTxid && PARENTS.has(parentTxid)) return route.fulfill({ json: { result: {
          hex: PARENTS.get(parentTxid), confirmations: 1000,
        } } });
        if (/\/v2\/?$/.test(url.pathname)) return route.fulfill({ json: { result: {
          server_ready: true, network: 'mainnet', version: '11.3.0', backend_height: 970000, counterparty_height: 970000,
        } } });
        if (url.pathname.includes(GIFT_ADDRESS) && url.pathname.endsWith('/balances')) return route.fulfill({ json: {
          result: [{ asset: 'XCP', quantity: 100000000, quantity_normalized: '1', asset_info: { divisible: true } }], result_count: 1,
        } });
        const asset = url.pathname.match(/\/assets\/([^/]+)$/)?.[1];
        if (asset) return route.fulfill({ json: { result: { asset, divisible: true, asset_longname: null, supply: 100000000, supply_normalized: '1' } } });
        return route.fulfill({ json: { result: [], result_count: 0 } });
      }
      if (url.pathname.includes('/api/address/')) return route.fulfill({ json: {
        chain_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 },
        mempool_stats: { tx_count: 0, funded_txo_sum: 0, spent_txo_sum: 0 },
      } });
      if (/\/fees\//.test(url.pathname)) return route.fulfill({ json: { fastestFee: 2, halfHourFee: 1, hourFee: 0.5 } });
      return route.abort();
    });
    await use();
  }, { auto: true }],
});

/** A full-page screenshot does not capture main's offscreen content. Scroll the real container. */
async function captureFlow(page: Page, info: TestInfo, scene: string) {
  const scroll = page.locator('[data-testid="approval-content"], main').first();
  const metrics = await scroll.evaluate(element => ({ height: element.clientHeight, total: element.scrollHeight }));
  expect(metrics.height).toBeGreaterThan(0);
  const step = Math.max(1, Math.floor(metrics.height * 0.85));
  const stops = Array.from(new Set([0, ...Array.from({ length: Math.ceil(metrics.total / step) }, (_, i) =>
    Math.min(i * step, metrics.total - metrics.height))])).filter(n => n >= 0);
  const screenshots: string[] = [];
  for (const [index, offset] of stops.entries()) {
    await scroll.evaluate(async (element, top) => {
      element.scrollTop = top;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, offset);
    expect(await scroll.evaluate(element => element.scrollWidth <= element.clientWidth + 1), scene).toBe(true);
    const clippedControls = await page.locator('button, label, [role="alert"]').evaluateAll(elements =>
      elements.filter(element => element.getClientRects().length && element.clientWidth > 0
        && element.scrollWidth > element.clientWidth + 1).map(element => element.textContent));
    expect(clippedControls, scene).toEqual([]);
    const file = info.outputPath(`${scene}-${index}.png`);
    await page.screenshot({ path: file });
    screenshots.push(file);
  }
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\$[1-9]|\$p[1-9]\$|\{address\}|\{path\}/);
  writeFileSync(info.outputPath(`${scene}.json`), JSON.stringify({ scene, metrics, text, screenshots }, null, 2));
}

for (const language of LANGUAGES) qualityTest.describe(language, () => {
  qualityTest.use({ browserLocale: language });
  qualityTest('translation wording and scroll flow on popup and sidepanel', async ({ page, extensionId }, info) => {
    qualityTest.setTimeout(240_000);
    const message = approvalCatalog(language);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await callGalleryService(page, 'updateSettings', [{ showHelpText: true }]);
    const identity = await authorizeGalleryOrigin(page, ORIGIN);
    const recipient = Address().encode({ type: 'wpkh', hash: new Uint8Array(20).fill(17) });
    // A real parent for the payment's input, served by the stubbed node.
    const parent = new Transaction({ version: 2, allowUnknownInputs: true });
    parent.addInput({ txid: '30'.repeat(32), index: 0 });
    parent.addOutputAddress(identity.address, 100000n);
    PARENTS.set(parent.id, Buffer.from(parent.toBytes(true, false)).toString('hex'));
    const payment = new Transaction({ version: 2 });
    payment.addInput({ txid: parent.id, index: 0, witnessUtxo: {
      script: OutScript.encode(Address().decode(identity.address)), amount: 100000n,
    } });
    payment.addOutputAddress(recipient, 21600n);
    payment.addOutputAddress(identity.address, 77400n);
    const psbtHex = Buffer.from(payment.toPSBT(0)).toString('hex');
    const pageRoot = `chrome-extension://${extensionId}/`;
    for (const surface of SURFACES) {
      await page.setViewportSize({ width: surface.width, height: surface.height });
      const label = `${language}-${surface.entry.replace('.html', '')}-${surface.width}`;
      const goto = async (route: string) => {
        await page.goto(`${pageRoot}${surface.entry}#${route}`);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        expect(await page.locator('body').evaluate(element => element.clientWidth)).toBe(surface.width);
      };
      await goto('/keychain/setup/import-mnemonic');
      await expect(page.getByRole('heading', { name: message('setup_import_mnemonic_import_your_mnemonic') })).toBeVisible();
      const headerTitle = page.getByRole('heading', { level: 1 });
      expect(await headerTitle.evaluate(element => element.scrollWidth <= element.clientWidth + 1
        && element.scrollHeight <= element.clientHeight + 1), 'translated import title must be fully readable').toBe(true);
      await captureFlow(page, info, `${label}-import-empty`);
      for (const [index, word] of GIFT_PHRASE.split(' ').entries()) await page.locator(`input[name="word-${index}"]`).fill(word);
      await expect(page.getByRole('status')).toContainText(message('setup_import_mnemonic_this_looks_like_a_rare'));
      await expect(page.getByRole('status')).toContainText("m/0'/0/500");
      await expect(page.getByRole('button', { name: message('setup_import_mnemonic_import_gift_card'), exact: true })).toBeDisabled();
      await captureFlow(page, info, `${label}-gift-card`);
      await goto('/settings');
      await expect(page.locator('section[aria-label] select')).toHaveCount(1);
      await captureFlow(page, info, `${label}-settings`);
      await goto('/compose/order/BTC?type=buy&quote=XCP');
      await page.getByRole('button', { name: message('order_form_order_settings'), exact: true }).click();
      await expect(page.locator('#fee-required')).toBeVisible();
      await captureFlow(page, info, `${label}-order-settings`);

      for (const [direction, declared, key] of [
        ['more', 21599, 'approval_bitcoin_payment_card_pays_more_than_requested'],
        ['less', 21601, 'approval_bitcoin_payment_card_pays_less_than_requested'],
      ] as const) {
        const id = `${language}-${surface.entry}-${surface.width}-${direction}`;
        await page.evaluate(async record => { await chrome.storage.session.set({ pending_sign_flow: [record] }); }, {
          id, ...identity, origin: ORIGIN, timestamp: Date.now(), status: 'pending',
          requestKey: `xcp_signBitcoinPsbt:${id}`, kind: 'sign-psbt', psbtHex,
          signInputs: { [identity.address]: [0] }, sighashTypes: [0x01], signingPurpose: 'bitcoin-payment',
          bitcoinPaymentIntent: { standard: 'xcp-wallet/bitcoin-payment', version: 1, action: 'pay', outputs: [{ address: recipient, amountSats: declared }] },
        });
        await goto(`/requests/psbt/approve?requestId=${id}`);
        await expect(page.getByTestId('approval-notice').first()).toContainText(message(key, ['1', 'sat']));
        const footer = page.getByTestId('approval-footer');
        await expect(footer.getByRole('button', { name: message('approval_blocked'), exact: true })).toBeDisabled();
        await expect(footer).toBeInViewport({ ratio: 1 });
        await captureFlow(page, info, `${label}-payment-${direction}`);
        await page.getByRole('button', { name: message('approval_bitcoin_payment_card_compare_payment_details'), exact: true }).click();
        await expect(page.getByText(recipient, { exact: true })).toBeVisible();
        await expect(page.getByRole('listitem')).toContainText(message('approval_bitcoin_payment_outputs_mismatch'));
        await expect(page.locator('body')).not.toContainText('the external payment outputs do not exactly match the site intent');
        await captureFlow(page, info, `${label}-payment-${direction}-details`);
      }
    }
    expect(errors).toEqual([]);
    // The gallery never presses an authorization button or submits an import.
  });
});

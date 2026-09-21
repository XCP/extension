// Real built Chrome wallet -> encrypted vault -> existing background signer -> regtest.
// npm run build; node scripts/prove-zeld-wallet.mjs
// Requires the isolated e2e/zeld/docker-compose.yml stack. Only transport responses are adapted.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { p2pkh } from '@scure/btc-signer';

process.env.ZELD_REGTEST_BITCOIND ??= 'http://127.0.0.1:28443';
process.env.ZELD_REGTEST_COUNTERPARTY ??= 'http://127.0.0.1:34000';
mkdirSync('.output/zeld-proof', { recursive: true });
mkdirSync('test-results', { recursive: true });
const helper = resolve('.output/zeld-proof/harness.mjs');
await build({ entryPoints: ['e2e/zeld/regtestHarness.ts'], outfile: helper, bundle: true,
  platform: 'node', format: 'esm', target: 'es2022', alias: { '@': resolve('src') } });
const { ensureMinerWallet, legacyKeyFor, fund, compose, scanUnspents, rpc, broadcastAndMine, parsedTransaction } = await import(pathToFileURL(helper));
const miner = await ensureMinerWallet(); // Refuses any chain except regtest before funding.
const key = legacyKeyFor('built-chrome');
const inputCount = Number(process.env.ZELD_PROOF_INPUTS ?? 1);
assert([1, 3].includes(inputCount));
await fund(miner, Array.from({ length: inputCount }, () => key), 3);
const address = p2pkh(Buffer.from(key.publicKeyHex, 'hex')).address;
const composed = await compose(key.address, 'broadcast', { text: 'Built Chrome ZELD proof', value: '0',
  fee_fraction: '0', timestamp: String(Math.floor(Date.now() / 1000)), sat_per_vbyte: '2', encoding: 'opreturn', use_all_inputs_set: 'true' });
const responses = {};
const utxos = await scanUnspents(key.address);
const publicUtxos = utxos.map(u => ({ txid: u.txid, vout: u.vout, value: Math.round(u.amount * 1e8),
  status: { confirmed: true, block_height: u.height, block_hash: '', block_time: 0 } }));
responses[`/api/address/${address}/utxo`] = publicUtxos;
for (const u of utxos) {
  const hex = await rpc('getrawtransaction', [u.txid], null);
  responses[`/api/tx/${u.txid}/hex`] = hex;
  responses[`/v2/bitcoin/transactions/${u.txid}`] = { result: { hex } };
}
const extension = resolve('.output/chrome-mv3');
const manifest = JSON.parse(readFileSync(`${extension}/manifest.json`, 'utf8'));
assert.deepEqual([...manifest.permissions].sort(), ['sidePanel', 'storage', 'alarms'].sort());
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  // No public-network requests from this throwaway wallet profile.
  await context.route(/^https?:/, route => route.abort());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15_000 });
  console.log('Hunt runtime:', await worker.evaluate(() => ({ workerAvailable: typeof Worker !== 'undefined' })));
  await worker.evaluate(map => {
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString());
      const value = map[url.pathname];
      if (value === undefined) throw new Error(`Regtest transport has no response for ${url.pathname}`);
      return new Response(typeof value === 'string' ? value : JSON.stringify(value), { status: 200,
        headers: { 'content-type': typeof value === 'string' ? 'text/plain' : 'application/json' } });
    };
  }, responses);
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  const installRpc = () => page.evaluate(() => {
    const port = chrome.runtime.connect({ name: 'proxy:WalletService' });
    let id = 0;
    const pending = new Map();
    const decode = ([tag, value]) => {
      if (tag === 'undefined') return undefined;
      if (tag === 'value') return value;
      if (tag === 'bigint') return BigInt(value);
      if (tag === 'bytes') return Uint8Array.from(value);
      if (tag === 'array') return value.map(decode);
      return Object.fromEntries(value.map(([key, item]) => [key, decode(item)]));
    };
    port.onMessage.addListener(message => {
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      if (message.error) call.reject(new Error(JSON.stringify(message.error)));
      else call.resolve(message.resultEncoding ? decode(message.result) : message.result);
    });
    globalThis.walletRpc = (methodName, ...args) => new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      port.postMessage({ id, methodName, args });
    });
  });
  await installRpc();
  const call = (method, ...args) => page.evaluate(([method, args]) => globalThis.walletRpc(method, ...args), [method, args]);
  const wallet = await call('createPrivateKeyWallet', Buffer.from(key.privateKey).toString('hex'),
    'Regtest-only-password-42!', 'Regtest ZELD proof', 'p2pkh');
  assert.equal(wallet.previewAddress, address);
  if (process.env.ZELD_PROOF_UI === '1') {
    await page.setViewportSize({ width: 380, height: 700 });
    await page.goto(`chrome-extension://${id}/popup.html#/index`);
    await page.reload();
    await installRpc();
    await page.getByText('Wallet Dashboard', { exact: true }).waitFor();
    await page.evaluate(() => { location.hash = '#/settings/advanced'; });
    const toggle = page.getByRole('switch', { name: 'Enable ZELD Hunting', exact: true });
    try { await toggle.waitFor({ timeout: 10_000 }); }
    catch (error) {
      console.log('Popup state:', await page.locator('body').innerText());
      await page.screenshot({ path: 'test-results/zeld-settings.png' });
      throw error;
    }
    await toggle.scrollIntoViewIfNeeded();
    assert.equal((await call('getSettings')).zeldHuntSeconds, 0, 'Mining must be opt-in');
    assert.equal(await page.getByLabel('Seconds to hunt for a ZELD transaction ID').count(), 0);
    await toggle.click();
    await page.waitForFunction(async () => (await globalThis.walletRpc('getSettings')).zeldHuntSeconds === 15);
    await toggle.click();
    await page.waitForFunction(async () => (await globalThis.walletRpc('getSettings')).zeldHuntSeconds === 0);
    await toggle.click();
    await page.waitForFunction(async () => (await globalThis.walletRpc('getSettings')).zeldHuntSeconds === 15);
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
    await page.screenshot({ path: 'test-results/zeld-settings.png', animations: 'disabled' });
    await page.evaluate(() => { location.hash = '#/zeld'; });
    await page.getByLabel('Seconds to hunt for a ZELD transaction ID').waitFor();
    assert.equal(await page.getByLabel('Seconds to hunt for a ZELD transaction ID').inputValue(), '15');
    await page.screenshot({ path: 'test-results/zeld-balance-settings.png', animations: 'disabled' });
  }
  console.log('Created encrypted throwaway wallet; testing normal signing.');
  const ordinary = await call('signTransaction', composed.result.rawtransaction, address,
    { inputValues: composed.result.inputs_values, lockScripts: composed.result.lock_scripts });
  const normalTx = await rpc('decoderawtransaction', [ordinary], null);
  console.log('Normal signing passed; testing the bounded hunt.');
  const started = performance.now();
  await worker.evaluate(() => {
    globalThis.huntYields = 0;
    const original = globalThis.setTimeout.bind(globalThis);
    globalThis.setTimeout = (callback, delay, ...args) => {
      if (delay === 0) globalThis.huntYields++;
      return original(callback, delay, ...args);
    };
  });
  let signingDone = false;
  const signing = call('signTransaction', composed.result.rawtransaction, address,
    { inputValues: composed.result.inputs_values, lockScripts: composed.result.lock_scripts, zeldHuntSeconds: 60 },
    { walletId: wallet.id, address }).finally(() => { signingDone = true; });
  const observed = { offscreen: false, maxWorkers: 0 };
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Target.setDiscoverTargets', { discover: true });
  while (!signingDone) {
    const contexts = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }));
    observed.offscreen ||= contexts.length > 0;
    const { targetInfos } = await cdp.send('Target.getTargets');
    observed.maxWorkers = Math.max(observed.maxWorkers, targetInfos.filter(t => t.type === 'worker').length);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const signed = await signing;
  const elapsedMs = Math.round(performance.now() - started);
  const decoded = await rpc('decoderawtransaction', [signed], null);
  const yieldedBatches = await worker.evaluate(() => globalThis.huntYields);
  assert(yieldedBatches > 0, 'The production signer must yield while hunting inline');
  assert.equal(observed.offscreen, false);
  assert.deepEqual(decoded.vout, normalTx.vout);
  assert.equal(decoded.vin.length, inputCount);
  assert(decoded.vin.every(input => input.sequence === 0xffffffff));
  const feeSats = composed.result.inputs_values.reduce((a, b) => a + b, 0)
    - decoded.vout.reduce((a, b) => a + Math.round(b.value * 1e8), 0);
  assert.equal(feeSats, composed.result.btc_fee);
  const mempool = await rpc('testmempoolaccept', [[signed]], null);
  assert.equal(mempool[0].allowed, true, JSON.stringify(mempool));
  assert.equal((await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }))).length, 0);
  console.log('Built wallet sign completed:', { txid: decoded.txid, elapsedMs, feeSats, ...observed });
  // A second invocation on this still-unspent input must die when the wallet is locked.
  await worker.evaluate(() => { globalThis.huntYields = 0; });
  const cancelled = call('signTransaction', composed.result.rawtransaction, address,
    { inputValues: composed.result.inputs_values, lockScripts: composed.result.lock_scripts, zeldHuntSeconds: 60 },
    { walletId: wallet.id, address }).then(() => 'signature released', error => error.message);
  const lockDeadline = Date.now() + 10_000;
  while (!(await worker.evaluate(() => globalThis.huntYields))) {
    assert(Date.now() < lockDeadline, 'Cancellation hunt never started');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await call('lockKeychain');
  const cancellation = await cancelled;
  assert.notEqual(cancellation, 'signature released');
  assert.equal((await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }))).length, 0);
  const txid = await broadcastAndMine(signed, miner);
  const parsed = await parsedTransaction(txid);
  assert.equal(parsed.supported, true);
  assert.equal(parsed.unpacked_data.message_type, 'broadcast');
  const report = { runtime: await worker.evaluate(() => navigator.userAgent), txid, inputCount, yieldedBatches,
    permissions: manifest.permissions, mode: inputCount > 1 ? 'background-signature-combinations' : 'background-fixed-k',
    locktime: decoded.locktime,
    foundSixZeros: txid.startsWith('000000'), elapsedMs, feeSats, normalVsize: normalTx.vsize,
    huntedVsize: decoded.vsize, ...observed, cancellation, confirmed: true, counterpartyMessage: parsed.unpacked_data.message_type };
  writeFileSync(`test-results/zeld-background-wallet-proof-${inputCount}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await context.close(); }

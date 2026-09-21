// Compare the actual coordinators in a Chrome extension service worker, including preparation.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const bundled = await build({ stdin: { contents: `
  export { prepareLegacyHunt } from '@/core/zeld/legacyHunt';
  export { createLegacySignaturePoolJob } from '@/core/zeld/legacySignaturePool';
  export { huntTxid } from '@/core/zeld/hunt';
  export { p2pkh, Transaction } from '@scure/btc-signer';
  export { getPublicKey } from '@noble/secp256k1';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'bench', platform: 'browser', target: 'es2022',
  alias: { '@': resolve('src') }, logLevel: 'silent' });
const fixture = readFileSync('test-results/zeld-wallet-cases.jsonl', 'utf8').trim().split('\n').map(JSON.parse).find(f => f.format === 'p2pkh');
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(`(() => { ${bundled.outputFiles[0].text}\nglobalThis.zeldBench = bench; })()`);
  const reports = [];
  for (const inputs of [1, 2, 3]) {
    for (const pool of inputs === 1 ? [false] : [false, true]) {
      const report = await worker.evaluate(async ({ fixture, inputs, pool }) => {
        const { prepareLegacyHunt, createLegacySignaturePoolJob, huntTxid, p2pkh, Transaction, getPublicKey } = globalThis.zeldBench;
        const original = Transaction.fromRaw(Uint8Array.from(fixture.rawTxHex.match(/../g).map(b => parseInt(b, 16))), { allowUnknownOutputs: true });
        const key = Uint8Array.from({ length: 32 }, () => 17);
        const script = p2pkh(getPublicKey(key)).script;
        const tx = new Transaction({ allowUnknownOutputs: true });
        for (let i = 0; i < inputs; i++) tx.addInput({ ...original.getInput(0), index: i });
        for (let i = 0; i < original.outputsLength; i++) tx.addOutput(original.getOutput(i));
        const started = performance.now();
        const template = prepareLegacyHunt(tx.toBytes(true, false), Array.from({ length: inputs }, () => script), key, true);
        const result = await huntTxid(pool ? createLegacySignaturePoolJob(template, key) : template,
          { seconds: 20, targetZeros: 64, createWorker: () => null });
        const elapsedMs = performance.now() - started;
        key.fill(0);
        return { inputs, mode: pool ? 'signature-combinations' : 'fixed-k-locktime', attempts: result.attempts,
          elapsedMs: Math.round(elapsedMs), hps: Math.round(result.attempts * 1000 / elapsedMs),
          sixZeroChance20s: 1 - Math.exp(-result.attempts / 16 ** 6), runtime: navigator.userAgent };
      }, { fixture, inputs, pool });
      reports.push(report);
      console.log(JSON.stringify(report));
    }
  }
  writeFileSync('test-results/zeld-pool-production-bench.json', JSON.stringify(reports, null, 2));
} finally { await context.close(); }

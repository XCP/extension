// Measure permission-free inline hunting in the actual Chrome service-worker runtime.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const bundled = await build({ stdin: { contents: `
  export { prepareLegacyHunt } from '@/core/zeld/legacyHunt';
  export { huntTxid } from '@/core/zeld/hunt';
  export { p2pkh, Transaction } from '@scure/btc-signer';
  export { getPublicKey } from '@noble/secp256k1';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'bench', platform: 'browser', target: 'es2022',
  alias: { '@': resolve('src') }, logLevel: 'silent' });
const fixtures = readFileSync('test-results/zeld-wallet-cases.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const fixture = fixtures.find(f => f.format === 'p2pkh');
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(`(() => { ${bundled.outputFiles[0].text}\nglobalThis.zeldBench = bench; })()`);
  const results = await worker.evaluate(async fixture => {
    const { prepareLegacyHunt, huntTxid, p2pkh, Transaction, getPublicKey } = globalThis.zeldBench;
    const raw = Uint8Array.from(fixture.rawTxHex.match(/../g).map(b => parseInt(b, 16)));
    const original = Transaction.fromRaw(raw, { allowUnknownOutputs: true });
    const key = Uint8Array.from({ length: 32 }, () => 17); // Unfunded benchmark key.
    const script = p2pkh(getPublicKey(key)).script;
    const reports = [];
    for (const inputs of [1, 3]) {
      const tx = new Transaction({ allowUnknownOutputs: true });
      for (let i = 0; i < inputs; i++) tx.addInput({ ...original.getInput(0), index: i });
      for (let i = 0; i < original.outputsLength; i++) tx.addOutput(original.getOutput(i));
      const job = prepareLegacyHunt(tx.toBytes(true, false), Array.from({ length: inputs }, () => script), key, true);
      const modes = [{ name: 'fixed-1000', batchSize: 1000 }, { name: 'fixed-5000', batchSize: 5000 }, { name: 'adaptive-16ms' }];
      const samples = modes.map(() => []);
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < modes.length; i++) {
          const index = (i + round) % modes.length;
          const result = await huntTxid(job, { seconds: 1, targetZeros: 64, createWorker: () => null,
            batchSize: modes[index].batchSize });
          samples[index].push(Math.round(result.attempts * 1000 / result.elapsedMs));
        }
      }
      reports.push({ inputs, results: modes.map((mode, i) => ({ name: mode.name, samples: samples[i],
        medianHps: samples[i].toSorted((a, b) => a - b)[1] })) });
    }
    return { runtime: navigator.userAgent, workerAvailable: typeof Worker !== 'undefined', reports };
  }, fixture);
  writeFileSync('test-results/zeld-background-bench.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await context.close(); }

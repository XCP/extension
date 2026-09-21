// Isolate legacy optimizations on the same signing template and nonce ranges.
// Uses a Counterparty-composed transaction recorded by the real regtest wallet proof.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { p2pkh, Transaction } from '@scure/btc-signer';
import { getPublicKey } from '@noble/secp256k1';
import { chromium } from 'playwright-core';

const destination = resolve('.output/zeld-legacy-bench');
mkdirSync(destination, { recursive: true });
const current = readFileSync('src/core/zeld/legacyHunt.ts', 'utf8');
const baseline = execFileSync('git', ['show', '79c4c0af:src/core/zeld/legacyHunt.ts'], { encoding: 'utf8' });
writeFileSync(`${destination}/original-sha.ts`, execFileSync('git', ['show', '79c4c0af:src/core/zeld/sha256d.ts'], { encoding: 'utf8' }));
const variants = {
  original: baseline.replace("'@/core/zeld/sha256d'", "'./original-sha'"),
  'unroll8-only': baseline,
  'prefix-only': baseline.replace('new MutableSha256d(template.signed)', 'new MutableSha256d(template.signed, template.inputs[0]?.sOffset)'),
  'prefix-and-views': current,
};
const modules = {};
const browserSources = {};
for (const [name, source] of Object.entries(variants)) {
  const input = `${destination}/${name}.ts`;
  const output = `${destination}/${name}.mjs`;
  writeFileSync(input, source);
  await build({ entryPoints: [input], outfile: output, bundle: true, format: 'esm', platform: 'neutral',
    target: 'es2022', alias: { '@': resolve('src') } });
  modules[name] = await import(pathToFileURL(output));
  const bundled = await build({ entryPoints: [input], write: false, bundle: true, format: 'iife',
    globalName: 'legacy', platform: 'browser', target: 'es2022', alias: { '@': resolve('src') } });
  browserSources[name] = bundled.outputFiles[0].text;
}
const cases = readFileSync(process.argv[2] ?? 'test-results/zeld-wallet-cases.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const fixture = cases.find(c => c.format === 'p2pkh');
assert(fixture, 'Run the regtest wallet proof first');
const original = Transaction.fromRaw(Buffer.from(fixture.rawTxHex, 'hex'), { allowUnknownOutputs: true });
// Public deterministic benchmark key, never used by the wallet or funded.
const key = Uint8Array.from({ length: 32 }, () => 17);
const script = p2pkh(getPublicKey(key, true)).script;
const templates = [1, 3].map(inputs => {
  const tx = new Transaction({ allowUnknownOutputs: true });
  for (let i = 0; i < inputs; i++) tx.addInput({ ...original.getInput(0), index: i });
  for (let i = 0; i < original.outputsLength; i++) tx.addOutput(original.getOutput(i));
  return modules['prefix-and-views'].prepareLegacyHunt(tx.toBytes(true, false), Array.from({ length: inputs }, () => script), key, true);
});
const count = Number(process.env.ZELD_BENCH_ATTEMPTS ?? 150_000);
function measure(modules, templates, count) {
  const reports = [];
  for (const template of templates) {
    const runners = Object.entries(modules).map(([name, module]) => ({ name, module, samples: [], state: module.createLegacyMinerState(template) }));
    for (const r of runners) r.module.mineLegacyRange(template, 0, 20_000, 0, 64, r.state);
    let expected;
    for (let round = 0; round < 5; round++) {
      for (let position = 0; position < runners.length; position++) {
        const r = runners[(position + round) % runners.length];
        const started = performance.now();
        const result = r.module.mineLegacyRange(template, 0, count, 0, 64, r.state);
        r.samples.push(Math.round(result.attempts * 1000 / (performance.now() - started)));
        expected ??= JSON.stringify(result);
        if (JSON.stringify(result) !== expected) throw new Error(`${r.name} found a different transaction`);
      }
    }
    reports.push({ inputs: template.inputs.length, bytes: template.signed.length, count,
      results: runners.map(r => ({ name: r.name, samples: r.samples, medianHps: [...r.samples].sort((a, b) => a - b)[2] })) });
  }
  return reports;
}
const node = measure(modules, templates, count);
console.log('Node:', JSON.stringify(node));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
let chrome;
try {
  const page = await browser.newPage();
  // Benchmark modules only. The separate built-wallet proof exercises the production worker path.
  for (const [name, source] of Object.entries(browserSources)) {
    await page.addScriptTag({ content: `${source}\nglobalThis.benchModules ??= {}; globalThis.benchModules[${JSON.stringify(name)}] = legacy;` });
  }
  const serialized = templates.map(t => ({ ...t, signed: [...t.signed], pubkey: [...t.pubkey],
    inputs: t.inputs.map(i => ({ ...i, preimage: [...i.preimage], r: String(i.r), a: String(i.a), b: String(i.b) })) }));
  await page.evaluate(templates => { globalThis.benchTemplates = templates.map(t => ({ ...t,
    signed: Uint8Array.from(t.signed), pubkey: Uint8Array.from(t.pubkey),
    inputs: t.inputs.map(i => ({ ...i, preimage: Uint8Array.from(i.preimage), r: BigInt(i.r), a: BigInt(i.a), b: BigInt(i.b) })) })); }, serialized);
  chrome = await page.evaluate(`(${measure})(globalThis.benchModules, globalThis.benchTemplates, ${count})`);
  console.log('Chrome:', JSON.stringify(chrome));
  const workers = await page.evaluate(async ({ sources, count }) => {
    const reports = [];
    for (const template of globalThis.benchTemplates) {
      const rows = [];
      for (const [name, source] of Object.entries(sources)) {
        const url = URL.createObjectURL(new Blob([source, `\nonmessage = ({ data }) => {
          const result = legacy.mineLegacyRange(data.template, data.start, data.count, 0, 64);
          postMessage(result);
        };`], { type: 'text/javascript' }));
        try {
          for (const width of [1, 4, 8]) {
            const samples = [];
            for (let round = 0; round < 3; round++) {
              const started = performance.now();
              const pool = [];
              try {
                const results = await Promise.all(Array.from({ length: width }, (_, index) => new Promise((resolve, reject) => {
                  const worker = new Worker(url);
                  pool.push(worker);
                  worker.onmessage = ({ data }) => resolve(data);
                  worker.onerror = reject;
                  const start = Math.floor(index * count / width);
                  worker.postMessage({ template, start, count: Math.floor((index + 1) * count / width) - start });
                })));
                const attempts = results.reduce((sum, r) => sum + r.attempts, 0);
                samples.push(Math.round(attempts * 1000 / (performance.now() - started)));
              } finally { pool.forEach(worker => worker.terminate()); }
            }
            rows.push({ name, width, samples, medianHps: [...samples].sort((a, b) => a - b)[1] });
          }
        } finally { URL.revokeObjectURL(url); }
      }
      reports.push({ inputs: template.inputs.length, count, results: rows });
    }
    return reports;
  }, { sources: { original: browserSources.original, optimized: browserSources['prefix-and-views'] }, count: 500_000 });
  console.log('Chrome workers (startup included):', JSON.stringify(workers));
  writeFileSync('test-results/zeld-legacy-optimization-bench.json', JSON.stringify({
    nodeVersion: process.version, chromeVersion: await browser.version(), node, chrome, workers,
  }, null, 2));
} finally { await browser.close(); }

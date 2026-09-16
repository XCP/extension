// Experiment: keep the transaction fixed, vary two valid input signatures independently.
// All signatures and keys here are unfunded benchmark data; nothing is broadcast.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const bundled = await build({ stdin: { contents: `
  export { prepareLegacyHunt, legacySignedTransaction, mineLegacyRange, createLegacyMinerState } from '@/core/zeld/legacyHunt';
  export { MutableSha256d } from '@/core/zeld/sha256d';
  export { sha256 } from '@noble/hashes/sha2.js';
  export { p2pkh, Transaction } from '@scure/btc-signer';
  export { getPublicKey, sign } from '@noble/secp256k1';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'bench', platform: 'browser', target: 'es2022',
  alias: { '@': resolve('src') }, logLevel: 'silent' });
const fixture = readFileSync('test-results/zeld-wallet-cases.jsonl', 'utf8').trim().split('\n').map(JSON.parse).find(f => f.format === 'p2pkh');
const extension = resolve('.output/chrome-mv3');
const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  await worker.evaluate(`(() => { ${bundled.outputFiles[0].text}\nglobalThis.zeldBench = bench; })()`);
  const reports = await worker.evaluate(async fixture => {
    const { prepareLegacyHunt, legacySignedTransaction, MutableSha256d, sha256, p2pkh, Transaction, getPublicKey, sign,
      mineLegacyRange, createLegacyMinerState } = globalThis.zeldBench;
    const raw = Uint8Array.from(fixture.rawTxHex.match(/../g).map(b => parseInt(b, 16)));
    const original = Transaction.fromRaw(raw, { allowUnknownOutputs: true });
    const key = Uint8Array.from({ length: 32 }, () => 17);
    const script = p2pkh(getPublicKey(key)).script;
    const reports = [];
    for (const inputs of [2, 3]) {
      const tx = new Transaction({ allowUnknownOutputs: true });
      for (let i = 0; i < inputs; i++) tx.addInput({ ...original.getInput(0), index: i });
      for (let i = 0; i < original.outputsLength; i++) tx.addOutput(original.getOutput(i));
      const template = prepareLegacyHunt(tx.toBytes(true, false), Array.from({ length: inputs }, () => script), key, true);
      let locktime = 0;
      let signed;
      while (!(signed = legacySignedTransaction(template, locktime))) locktime++;
      const hashes = template.inputs.map(input => {
        const preimage = input.preimage.slice();
        new DataView(preimage.buffer).setUint32(input.preimageLockTimeOffset, locktime, true);
        return sha256(sha256(preimage));
      });
      const makeSignature = z => {
        for (;;) {
          const sig = sign(z, key, { prehash: false, lowS: true, extraEntropy: true });
          if (sig[0] > 0 && sig[0] < 128 && sig[32] > 0) return { r: sig.slice(0, 32), s: sig.slice(32) };
        }
      };
      const outer = template.inputs[inputs - 2], inner = template.inputs[inputs - 1];
      const results = [];
      for (const size of [2048, 8192]) {
        const started = performance.now();
        const pool = Array.from({ length: size }, () => makeSignature(hashes.at(-1)));
        const preparationMs = performance.now() - started;
        let attempts = 0, checksum = 0;
        const deadline = performance.now() + 5000;
        let lastYield = performance.now();
        while (performance.now() < deadline) {
          const next = makeSignature(hashes.at(-2));
          signed.set(next.r, outer.sOffset - 34); signed.set(next.s, outer.sOffset);
          const hasher = new MutableSha256d(signed, inner.sOffset - 34);
          for (const sig of pool) {
            hasher.setBytes(inner.sOffset - 34, sig.r); hasher.setBytes(inner.sOffset, sig.s);
            checksum += hasher.hashLeadingZeroNibbles();
            attempts++;
          }
          if (performance.now() - lastYield >= 16) {
            await new Promise(resolve => setTimeout(resolve, 0));
            lastYield = performance.now();
          }
        }
        const elapsed = performance.now() - started;
        results.push({ size, preparationMs: Math.round(preparationMs), rateIncludingPreparation: Math.round(attempts * 1000 / elapsed),
          steadyHps: Math.round(attempts * 1000 / (elapsed - preparationMs)), checksum });
      }
      const state = createLegacyMinerState(template);
      const started = performance.now();
      let attempts = 0, nonce = 0;
      while (performance.now() - started < 1500) {
        const r = mineLegacyRange(template, nonce, 2000, 64, 64, state);
        nonce += 2000; attempts += r.attempts;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      reports.push({ inputs, bytes: signed.length, fixedNonceHps: Math.round(attempts * 1000 / (performance.now() - started)), results });
    }
    return reports;
  }, fixture);
  writeFileSync('test-results/zeld-signature-pool-bench.json', JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
} finally { await context.close(); }

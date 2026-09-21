// Compare candidate compressors on transactions produced by the regtest wallet flow.
// Run after the regtest proof: node scripts/bench-zeld.mjs test-results/zeld-wallet-cases.jsonl
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { sha256 } from '@noble/hashes/sha2.js';

const destination = resolve('.output/zeld-bench');
mkdirSync(destination, { recursive: true });
const current = readFileSync('src/core/zeld/sha256d.ts', 'utf8');
const baseline = execFileSync('git', ['show', '79c4c0af:src/core/zeld/sha256d.ts'], { encoding: 'utf8' });
const loopStart = current.indexOf('  for (let i = 0; i < 64; i += 8) {');
const loopEnd = current.indexOf('\n  state[0] =', loopStart);
const body = current.slice(loopStart, loopEnd).split('\n').slice(1, -1).join('\n');
const full = current.slice(0, loopStart) + Array.from({ length: 8 }, (_, group) => `  {\n${body.replace(/\[i(?: \+ (\d+))?\]/g,
  (_, offset) => `[${group * 8 + Number(offset ?? 0)}]`)}\n  }`).join('\n') + current.slice(loopEnd);
const variants = { original: baseline, unroll8: current, unroll64: full };
const constructors = {};
for (const [name, source] of Object.entries(variants)) {
  const input = `${destination}/${name}.ts`;
  const output = `${destination}/${name}.mjs`;
  writeFileSync(input, source);
  await build({ entryPoints: [input], outfile: output, format: 'esm', platform: 'neutral', target: 'es2022' });
  constructors[name] = (await import(pathToFileURL(output).href)).MutableSha256d;
}
// Use production eligibility/serialization so nested SegWit includes the signer's scriptSig.
await build({ entryPoints: ['src/core/zeld/huntTemplate.ts'], outfile: `${destination}/templates.mjs`,
  bundle: true, format: 'esm', platform: 'node', target: 'es2022' });
const { assessZeldHunt } = await import(pathToFileURL(`${destination}/templates.mjs`).href);
const cases = readFileSync(process.argv[2] ?? 'test-results/zeld-wallet-cases.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const reports = [];
const attempts = Number(process.env.ZELD_BENCH_ATTEMPTS ?? 500_000);
for (const fixture of cases) {
  const assessment = assessZeldHunt({ rawTxHex: fixture.rawTxHex, sourceAddress: fixture.address,
    addressFormat: fixture.format, publicKeyHex: fixture.publicKeyHex });
  if (!assessment.eligible) continue;
  const { message, nonceOffset } = assessment.template;
  const runners = Object.entries(constructors).map(([name, Ctor]) => {
    const hasher = new Ctor(message, nonceOffset);
    // Independent digest checks at varied nonces, including the timestamp half of locktime.
    for (const nonce of [0, 1, 0x80000000, 0xffffffff]) {
      const bytes = message.slice();
      new DataView(bytes.buffer).setUint32(nonceOffset, nonce, true);
      hasher.setUint32LE(nonceOffset, nonce);
      hasher.hashLeadingZeroNibbles();
      if (Buffer.compare(hasher.digest(), sha256(sha256(bytes)))) throw new Error(`${name} digest mismatch`);
    }
    return { name, samples: [], run(count) {
      let zeros = 0;
      for (let nonce = 0; nonce < count; nonce++) {
        hasher.setUint32LE(nonceOffset, nonce);
        zeros += hasher.hashLeadingZeroNibbles();
      }
      return zeros;
    } };
  });
  // Noble's reusable, audited state with a cached immutable prefix: no fresh objects per nonce.
  const prefixLength = Math.floor(nonceOffset / 64) * 64;
  const prefix = sha256.create().update(message.subarray(0, prefixLength));
  const tail = message.slice(prefixLength);
  const tailView = new DataView(tail.buffer);
  const inner = sha256.create();
  const outerBase = sha256.create();
  const outer = sha256.create();
  const digest = new Uint8Array(32);
  runners.push({ name: 'noble-midstate', samples: [], run(count) {
    let zeros = 0;
    for (let nonce = 0; nonce < count; nonce++) {
      tailView.setUint32(nonceOffset - prefixLength, nonce, true);
      prefix._cloneInto(inner).update(tail).digestInto(digest);
      outerBase._cloneInto(outer).update(digest).digestInto(digest);
      for (let byte = 31; byte >= 0; byte--) {
        if (digest[byte] === 0) zeros += 2;
        else { if (digest[byte] < 16) zeros++; break; }
      }
    }
    return zeros;
  } });
  for (const runner of runners) runner.run(50_000);
  let expected;
  // Rotate order between rounds to reduce thermal/order bias. Compare identical nonce ranges.
  for (let round = 0; round < 5; round++) {
    for (let position = 0; position < runners.length; position++) {
      const runner = runners[(position + round) % runners.length];
      const start = performance.now();
      const checksum = runner.run(attempts);
      const rate = attempts * 1000 / (performance.now() - start);
      expected ??= checksum;
      if (checksum !== expected) throw new Error(`${runner.name} nonce-range checksum mismatch`);
      runner.samples.push(Math.round(rate));
    }
  }
  const results = runners.map(({ name, samples }) => ({ name, samples, medianHps: samples.toSorted((a, b) => a - b)[2] }));
  reports.push({ format: fixture.format, bytes: message.length, nonceOffset, attempts, results });
  console.log(JSON.stringify(reports.at(-1)));
}
writeFileSync('test-results/zeld-optimization-bench.json', JSON.stringify({ runtime: process.version, reports }, null, 2));
// The same entry is used by the browser benchmark; generated sources remain outside production.
writeFileSync(`${destination}/variants.json`, JSON.stringify(Object.keys(variants)));

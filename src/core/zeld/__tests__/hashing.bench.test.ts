/**
 * Compare hashing techniques for the hunt on one thread, on this machine. Off by default:
 *
 *   ZELD_BENCH=1 ZELD_BENCH_OUT=bench.json npx vitest run src/core/zeld/__tests__/hashing.bench.test.ts
 *
 * Each technique hashes the same enhanced send a fixed number of times with a moving nonce and
 * reports hashes per second. The txid is the same function of the bytes whichever field moves,
 * so the comparison is purely about where the nonce sits and how much of the message that lets
 * the hasher reuse.
 */

import { writeFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';
import { parseConsensusTransaction } from '@/core/bitcoin/rawTransaction';
import { locateInputSequences } from '@/core/zeld/huntTemplate';
import { MutableSha256d } from '@/core/zeld/sha256d';
import { enhancedSendRawTx, opReturnScript, PREV_TXID, SOURCE_P2WPKH, unsignedRawTx } from './fixtures';

const enabled = process.env.ZELD_BENCH === '1';
const ATTEMPTS = Number(process.env.ZELD_BENCH_ATTEMPTS ?? 3_000_000);

interface Technique {
  name: string;
  attempts: number;
  run: (attempts: number) => number;
}

function rate(technique: Technique): { name: string; hashesPerSecond: number; zerosSeen: number } {
  // Warm the JIT on a short run, then time the real one.
  technique.run(Math.min(50_000, technique.attempts));
  const started = performance.now();
  const zerosSeen = technique.run(technique.attempts);
  const elapsed = (performance.now() - started) / 1000;
  return { name: technique.name, hashesPerSecond: Math.round(technique.attempts / elapsed), zerosSeen };
}

describe.runIf(enabled)('hunt hashing techniques', () => {
  // The fixture is a one-input, two-output send; a wallet that consolidated several outputs, or
  // an asset send with extra BTC outputs, is longer, and the more blocks the message spans the
  // more the midstate saves.
  const twoInputSend = unsignedRawTx({
    inputs: [{ txid: PREV_TXID, index: 0 }, { txid: PREV_TXID, index: 1 }],
    outputs: [
      { script: opReturnScript(60), amount: 0n },
      { script: SOURCE_P2WPKH.script, amount: 5_000n },
      { script: SOURCE_P2WPKH.script, amount: 90_000n },
    ],
  });

  it.each([
    ['one input, two outputs', enhancedSendRawTx()],
    ['two inputs, three outputs', twoInputSend],
  ])('reports hashes per second for each nonce placement: %s', (_label, rawTxHex) => {
    const message = parseConsensusTransaction(rawTxHex).toBytes(true, false);
    const sequenceOffset = locateInputSequences(message).sequenceOffsets[0]!;
    const lockTimeOffset = message.length - 4;

    const grind = (hasher: MutableSha256d, offset: number) => (attempts: number) => {
      let zeros = 0;
      for (let nonce = 0; nonce < attempts; nonce++) {
        hasher.setUint32LE(offset, nonce);
        if (hasher.hashLeadingZeroNibbles() >= 2) zeros++;
      }
      return zeros;
    };

    const techniques: Technique[] = [
      {
        name: 'nSequence nonce, whole message rehashed (shipped so far)',
        attempts: ATTEMPTS,
        run: grind(new MutableSha256d(message), sequenceOffset),
      },
      {
        name: 'nLockTime nonce, whole message rehashed',
        attempts: ATTEMPTS,
        run: grind(new MutableSha256d(message), lockTimeOffset),
      },
      {
        name: 'nLockTime nonce, prefix blocks hashed once (midstate)',
        attempts: ATTEMPTS,
        run: grind(new MutableSha256d(message, lockTimeOffset), lockTimeOffset),
      },
      {
        name: '@noble/hashes sha256(sha256()) per attempt, for reference',
        attempts: Math.min(ATTEMPTS, 300_000),
        run: (attempts) => {
          const bytes = new Uint8Array(message);
          const view = new DataView(bytes.buffer);
          let zeros = 0;
          for (let nonce = 0; nonce < attempts; nonce++) {
            view.setUint32(lockTimeOffset, nonce, true);
            const digest = sha256(sha256(bytes));
            if (digest[31] === 0) zeros++;
          }
          return zeros;
        },
      },
    ];

    const results = techniques.map(rate);
    const baseline = results[0]!.hashesPerSecond;
    const report = results.map((result) => ({
      ...result,
      relative: `${(result.hashesPerSecond / baseline).toFixed(2)}x`,
    }));
    const json = JSON.stringify({
      messageBytes: message.length,
      blocksPerInnerHash: Math.ceil((message.length + 9) / 64),
      prefixBlocksReusedForLockTime: Math.floor(lockTimeOffset / 64),
      attempts: ATTEMPTS,
      results: report,
    }, null, 2);
    console.log(json);
    if (process.env.ZELD_BENCH_OUT) writeFileSync(process.env.ZELD_BENCH_OUT, json, { flag: 'a' });
    // Both nLockTime runs try the same nonces in the same field, so the midstate hasher must see
    // exactly the zeros the whole-message hasher saw; the nSequence run moves a different field.
    expect(results[2]!.zerosSeen).toBe(results[1]!.zerosSeen);
    expect(results[2]!.hashesPerSecond).toBeGreaterThan(results[1]!.hashesPerSecond);
  }, 600_000);
});

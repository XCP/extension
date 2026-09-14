/**
 * A real hunt, single-threaded, to measure what the miner does on this machine.
 *
 * Off by default because it takes as long as a hunt takes. Run with:
 *
 *   ZELD_BENCH=1 ZELD_BENCH_ZEROS=6 npx vitest run src/core/zeld/__tests__/hunt.bench.test.ts
 *
 * Set ZELD_BENCH_OUT to a path to also write the JSON report there. The Web Worker path splits
 * the same loop across cores, so multiply the reported single-thread rate by the worker count to
 * estimate wallet throughput.
 */

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { huntTxid } from '@/core/zeld/hunt';
import { assessZeldHunt } from '@/core/zeld/huntTemplate';
import { expectedAttempts } from '@/core/zeld/protocol';
import { enhancedSendRawTx, SOURCE_ADDRESS } from './fixtures';

const enabled = process.env.ZELD_BENCH === '1';
const targetZeros = Number(process.env.ZELD_BENCH_ZEROS ?? 5);

describe('ZELD hunt benchmark', () => {
  it.runIf(enabled)(`hunts ${targetZeros} zeros on one thread`, async () => {
    const assessment = assessZeldHunt({
      rawTxHex: enhancedSendRawTx(),
      sourceAddress: SOURCE_ADDRESS,
      addressFormat: AddressFormat.P2WPKH,
    });
    if (!assessment.eligible) throw new Error(assessment.reason);

    let lastRate = 0;
    const result = await huntTxid(assessment.template, {
      seconds: 600,
      targetZeros,
      createWorker: () => null,
      batchSize: 200_000,
      onProgress: (progress) => {
        lastRate = progress.hashRate;
      },
    });
    const rate = result.attempts / (result.elapsedMs / 1000);
    const report = JSON.stringify({
      status: result.status,
      targetZeros,
      expectedAttempts: expectedAttempts(targetZeros),
      attempts: result.attempts,
      elapsedSeconds: (result.elapsedMs / 1000).toFixed(2),
      hashesPerSecond: Math.round(rate),
      lastReportedRate: Math.round(lastRate),
      ...(result.status === 'found' ? { txid: result.txid, nonce: result.nonce } : {}),
    }, null, 2);
    console.log(report);
    if (process.env.ZELD_BENCH_OUT) writeFileSync(process.env.ZELD_BENCH_OUT, report);
    expect(result.status).toBe('found');
  }, 700_000);
});

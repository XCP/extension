/**
 * For two or more legacy inputs, SIGHASH_ALL lets us combine independently valid signatures
 * without changing the message any input signs. Keep a small pool for the last input and vary
 * the penultimate signature between passes. The inner loop only hashes, and its immutable
 * prefix includes all earlier inputs. No inputs, outputs, amounts or signature lengths change.
 *
 * This job contains a signing closure and must stay in the existing background context. It is
 * never posted to a worker. Noble generates fresh randomized, low-S signatures; there is no
 * custom nonce arithmetic here. Preparation and timer yields count against the same deadline.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import * as secp from '@noble/secp256k1';
import type { HuntTxidOptions, HuntTxidResult } from '@/core/zeld/hunt';
import { type LegacyHuntTemplate, legacySignedTransaction } from '@/core/zeld/legacyHunt';
import { MutableSha256d } from '@/core/zeld/sha256d';

export interface LegacySignaturePoolJob {
  kind: 'legacy-signature-pool';
  signed: Uint8Array;
  nonce: number;
  outerSOffset: number;
  innerSOffset: number;
  /** Bound to the two approved input sighashes and the caller-owned key bytes. */
  sign: (input: 'outer' | 'inner') => Uint8Array;
}

export function createLegacySignaturePoolJob(template: LegacyHuntTemplate, key: Uint8Array): LegacySignaturePoolJob {
  if (template.inputs.length < 2) throw new RangeError('Signature combinations require at least two inputs.');
  let nonce = 0;
  let signed = legacySignedTransaction(template, nonce);
  while (!signed) signed = legacySignedTransaction(template, ++nonce);
  const [outer, inner] = template.inputs.slice(-2);
  const hashes = [outer!, inner!].map(input => {
    const preimage = input.preimage.slice();
    new DataView(preimage.buffer).setUint32(input.preimageLockTimeOffset, nonce, true);
    return sha256(sha256(preimage));
  });
  return {
    kind: 'legacy-signature-pool', signed, nonce,
    outerSOffset: outer!.sOffset, innerSOffset: inner!.sOffset,
    sign: input => secp.sign(hashes[input === 'outer' ? 0 : 1]!, key,
      { prehash: false, lowS: true, extraEntropy: true }),
  };
}

/** Both DER integers must occupy exactly 32 bytes without sign padding. */
function fullLength(signature: Uint8Array): boolean {
  return signature.length === 64 && signature[0]! > 0 && signature[0]! < 128
    && signature[32]! > 0 && signature[32]! < 128;
}

export async function huntLegacySignaturePool(job: LegacySignaturePoolJob, options: HuntTxidOptions): Promise<HuntTxidResult> {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const budget = Math.max(0, options.seconds) * 1000;
  if (options.signal?.aborted) return { status: 'aborted', attempts: 0, elapsedMs: 0 };
  if (!(budget > 0)) return { status: 'not_found', attempts: 0, elapsedMs: 0 };
  const deadline = started + budget;
  const signed = job.signed.slice();
  const pool: Uint8Array[] = [];
  let hasher: MutableSha256d | undefined;
  let position = 0;
  let attempts = 0;
  let lastReport = started;
  let best: Extract<HuntTxidResult, { status: 'found' }> | undefined;
  const elapsed = () => now() - started;
  const settled = (): HuntTxidResult => best
    ? { ...best, attempts, elapsedMs: elapsed() }
    : { status: 'not_found', attempts, elapsedMs: elapsed() };
  for (;;) {
    if (options.signal?.aborted) return { status: 'aborted', attempts, elapsedMs: elapsed() };
    if (now() >= deadline || options.acceptEarly?.aborted) return settled();
    const sliceEnd = Math.min(deadline, now() + 16);
    do {
      if (pool.length < 2048) {
        const signature = job.sign('inner');
        if (fullLength(signature)) pool.push(signature);
      } else if (!hasher) {
        const signature = job.sign('outer');
        if (!fullLength(signature)) continue;
        signed.set(signature.subarray(0, 32), job.outerSOffset - 34);
        signed.set(signature.subarray(32), job.outerSOffset);
        hasher = new MutableSha256d(signed, job.innerSOffset - 34);
        position = 0;
      } else {
        // Check time every 64 hashes, keeping timer slices short without a clock read per hash.
        const end = Math.min(pool.length, position + 64);
        while (position < end) {
          const signature = pool[position++]!;
          hasher.setBytes(job.innerSOffset - 34, signature.subarray(0, 32));
          hasher.setBytes(job.innerSOffset, signature.subarray(32));
          const zeroCount = hasher.hashLeadingZeroNibbles();
          attempts++;
          if (zeroCount < options.targetZeros || (best && zeroCount <= best.zeroCount)) continue;
          const winner = signed.slice();
          winner.set(signature.subarray(0, 32), job.innerSOffset - 34);
          winner.set(signature.subarray(32), job.innerSOffset);
          best = { status: 'found', signedTx: winner, nonce: job.nonce, txid: hasher.txid(),
            zeroCount, attempts, elapsedMs: elapsed() };
          if (zeroCount >= (options.stopZeros ?? options.targetZeros)) return settled();
        }
        if (position === pool.length) hasher = undefined;
      }
    } while (now() < sliceEnd);
    if (now() - lastReport >= 200) {
      lastReport = now();
      const elapsedMs = elapsed();
      options.onProgress?.({ attempts, elapsedMs, hashRate: elapsedMs > 0 ? attempts * 1000 / elapsedMs : 0,
        seconds: options.seconds, targetZeros: options.targetZeros,
        ...(best ? { bestZeroCount: best.zeroCount } : {}) });
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

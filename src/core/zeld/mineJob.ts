/**
 * The two kinds of work a hunt worker does, behind one interface.
 *
 * A `locktime` job hashes an unsigned SegWit or Taproot transaction with nLockTime as the nonce.
 * A `legacy` job signs a P2PKH transaction per attempt with a fixed ECDSA nonce and hashes the
 * result; see `legacyHunt.ts`. Both search the same 32-bit locktime space and report the same
 * shape of result, so the coordinator does not care which it is running.
 */

import { createLegacyMinerState, type LegacyHuntTemplate, mineLegacyRange } from '@/core/zeld/legacyHunt';
import { type MineRangeResult, mineRange } from '@/core/zeld/mineRange';
import { MutableSha256d } from '@/core/zeld/sha256d';

export interface LockTimeJob {
  kind: 'locktime';
  /** Non-witness serialization with every sequence final. */
  message: Uint8Array;
  /** Byte offset of nLockTime inside `message`. */
  nonceOffset: number;
}

export type HuntJob = LockTimeJob | LegacyHuntTemplate;

export interface Miner {
  mine(startNonce: number, count: number, targetZeros: number, stopZeros: number): MineRangeResult;
}

/** A miner holding whatever state the job reuses between batches. */
export function createMiner(job: HuntJob): Miner {
  if (job.kind === 'locktime') {
    const hasher = new MutableSha256d(job.message, job.nonceOffset);
    return {
      mine: (start, count, target, stop) => mineRange(job.message, job.nonceOffset, start, count, target, hasher, stop),
    };
  }
  const state = createLegacyMinerState(job);
  return { mine: (start, count, target, stop) => mineLegacyRange(job, start, count, target, stop, state) };
}

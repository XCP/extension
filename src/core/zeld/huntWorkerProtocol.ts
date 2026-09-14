/** Messages between the hunt coordinator and a hunt worker. Type-only; shared by both sides. */

import type { HuntJob } from '@/core/zeld/mineJob';
import type { MineRangeFound } from '@/core/zeld/mineRange';

export interface HuntWorkerRequest {
  job: HuntJob;
  /** First nonce to try, inclusive. */
  startNonce: number;
  /** Last nonce to try, exclusive. */
  endNonce: number;
  /** Leading zeros a txid needs to be worth keeping. */
  targetZeros: number;
  /** Leading zeros that end the hunt at once. */
  stopZeros: number;
  /** Hashes between progress reports. */
  batchSize: number;
}

/** Every message carries this worker's running attempt total, so a lost message cannot skew the count. */
export type HuntWorkerResponse =
  | { type: 'progress'; attempts: number; best?: MineRangeFound }
  | { type: 'found'; attempts: number; best: MineRangeFound }
  | { type: 'exhausted'; attempts: number; best?: MineRangeFound }
  | { type: 'error'; message: string };

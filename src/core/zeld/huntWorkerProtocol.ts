/** Messages between the hunt coordinator and a hunt worker. Type-only; shared by both sides. */

export interface HuntWorkerRequest {
  message: Uint8Array;
  nonceOffset: number;
  /** First nonce to try, inclusive. */
  startNonce: number;
  /** Last nonce to try, exclusive. */
  endNonce: number;
  targetZeros: number;
  /** Hashes between progress reports. */
  batchSize: number;
}

export type HuntWorkerResponse =
  | { type: 'progress'; attempts: number }
  | { type: 'found'; nonce: number; txid: string; zeroCount: number; attempts: number }
  | { type: 'exhausted'; attempts: number }
  | { type: 'error'; message: string };

/** Kept dependency-free so `compose.ts` can name it without pulling the miner into the API layer. */

export type ZeldHuntStatus = 'found' | 'not_found' | 'skipped';

/**
 * What a hunt did to a composed transaction, attached to the compose result as `zeld_hunt` so
 * every review screen can describe it from the same object it renders the fee from.
 */
export interface ZeldHuntMetadata {
  status: ZeldHuntStatus;
  /** Leading hex zeros the hunt was looking for. */
  target_zeros: number;
  /** The budget the user configured, in seconds. */
  seconds: number;
  elapsed_ms: number;
  attempts: number;
  /** Present when found: the nonce written into input 0's sequence and the txid it produced. */
  nonce?: number;
  txid?: string;
  zero_count?: number;
  /** Present when skipped: why this transaction could not be hunted. */
  reason?: string;
}

export interface ZeldHuntProgress {
  attempts: number;
  elapsedMs: number;
  /** Hashes per second over the hunt so far. */
  hashRate: number;
  seconds: number;
  targetZeros: number;
}

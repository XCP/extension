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

/**
 * What the ZELD guard did to a composed transaction: which ZELD-bearing inputs it kept out so
 * their ZELD would not leave with the payment, and whether the indexer answered.
 */
export interface ZeldProtectionMetadata {
  excluded: string[];
  carried_forward: string[];
  api_unavailable: boolean;
  /** The wallet moved its change to output 0 so ZELD lands there rather than on the recipient. */
  change_first?: boolean;
}

/** A locally composed ZELD send, for the review screen. Amounts are base units as strings. */
export interface ZeldSendMetadata {
  amount_base_units: string;
  remainder_base_units: string;
  spent_outpoints: string[];
  change_vout: number;
  recipient_vout: number;
  /**
   * Parking: all ZELD moves to a small output of the wallet's own so the rest of the BTC is
   * clean. `recipient_vout` is that small output.
   */
  park?: boolean;
}

export interface ZeldHuntProgress {
  attempts: number;
  elapsedMs: number;
  /** Hashes per second over the hunt so far. */
  hashRate: number;
  seconds: number;
  targetZeros: number;
}

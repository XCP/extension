/** Persisted coin locks and updates shared across wallet layers. */

export type CoinLockKind = 'manual' | 'offer_slot' | 'collection_offer';
export type OfferCoinLockKind = Exclude<CoinLockKind, 'manual'>;

export interface CoinLock {
  /** `txid:vout`, txid in lowercase hex. */
  outpoint: string;
  /** The owning address, as `normalizeAddressForComparison` writes it. */
  address: string;
  /** Why it is locked: by hand, or for an offer (which wins when both apply). */
  kind: CoinLockKind;
  /** The user also locked it by hand. Always true for `manual`; kept when an offer adds its own. */
  manual: boolean;
  /** Offer, authorization or policy-offer ids the coin backs, when the signed intent named them. */
  refs: string[];
  valueSats: number;
  /** The site whose signature request committed the coin. Null for a lock made by hand. */
  origin: string | null;
  /** Unix seconds, the latest expiry across the offers it backs, capped when written. Null for a hand lock. */
  expiresAt: number | null;
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds when the coin was last seen unspent, or null before it ever was. */
  seenAt: number | null;
  /** Unix seconds since a UTXO read first missed the coin. Absent while reads find it. */
  candidateSince?: number;
  /** The user unlocked it. The record stays while the offer lives, so it can be locked again. */
  unlocked: boolean;
}

/** One offer commitment a signature proved, as the background records it. */
export interface OfferCoinCommitment {
  outpoint: string;
  kind: OfferCoinLockKind;
  refs: string[];
  valueSats: number;
  origin: string;
  expiresAt: number | null;
}

/** What an extension page may change: its own coin control, and what its UTXO read observed. */
export interface CoinLockUpdate {
  /** Lock these coins by hand. */
  lock?: Array<{ outpoint: string; valueSats: number }>;
  /** Unlock: a hand lock is removed, an offer lock is marked unlocked. */
  unlock?: string[];
  /** Lock an unlocked offer coin again while its offer lives. */
  relock?: string[];
  /** What a page learned of the address's locked coins. */
  observed?: CoinLockObservation;
}

/**
 * Each list names outpoints of locks the reader had loaded, and only those change: a lock made
 * while the read was in flight is in neither `present` nor `absent`, so the read never judges it.
 */
export interface CoinLockObservation {
  /** A successful UTXO read found these unspent. */
  present?: string[];
  /** That read missed these. Candidates only: nothing comes off for this alone. */
  absent?: string[];
  /** An outspend lookup showed these spent by a confirmed transaction. */
  spent?: string[];
  /** Neither indexer knows these coins' funding transactions. */
  unknown?: string[];
}


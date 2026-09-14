import { MutableSha256d } from '@/core/zeld/sha256d';

export interface MineRangeFound {
  nonce: number;
  txid: string;
  zeroCount: number;
}

export interface MineRangeResult {
  /** Hashes computed, including the winning one. */
  attempts: number;
  found?: MineRangeFound;
}

/**
 * Try `count` consecutive nonces starting at `startNonce`, stopping at the first txid with at least
 * `targetZeros` leading hex zeros. Pure and synchronous: the worker and the in-page fallback both
 * call it in batches so they can report progress and honour a deadline between batches.
 *
 * Pass the same hasher back in for consecutive batches over the same message; constructing one
 * pads and copies the message.
 */
export function mineRange(
  message: Uint8Array,
  nonceOffset: number,
  startNonce: number,
  count: number,
  targetZeros: number,
  hasher: MutableSha256d = new MutableSha256d(message),
): MineRangeResult {
  const end = startNonce + count;
  if (startNonce < 0 || end > 0x1_0000_0000) {
    throw new RangeError('nonce range must fit in 32 bits');
  }
  let attempts = 0;
  for (let nonce = startNonce; nonce < end; nonce++) {
    hasher.setUint32LE(nonceOffset, nonce);
    attempts++;
    if (hasher.hashLeadingZeroNibbles() >= targetZeros) {
      const txid = hasher.txid();
      let zeroCount = 0;
      while (zeroCount < txid.length && txid[zeroCount] === '0') zeroCount++;
      return { attempts, found: { nonce, txid, zeroCount } };
    }
  }
  return { attempts };
}

import { MutableSha256d } from '@/core/zeld/sha256d';

export interface MineRangeFound {
  nonce: number;
  txid: string;
  zeroCount: number;
}

export interface MineRangeResult {
  /** Hashes computed, including the last one. */
  attempts: number;
  /** The best qualifying txid seen (at least `targetZeros`), if any. */
  best?: MineRangeFound;
  /** True when a txid with at least `stopZeros` ended the range early. */
  stopped: boolean;
}

/**
 * Try `count` consecutive nonces starting at `startNonce`. A txid with at least `stopZeros`
 * leading hex zeros ends the range at once; otherwise the best txid with at least `targetZeros`
 * is remembered and the whole range is tried. Pure and synchronous: the worker and the in-page
 * fallback both call it in batches so they can report progress and honour a deadline between
 * batches.
 *
 * Pass the same hasher back in for consecutive batches over the same message; constructing one
 * pads and copies the message and hashes every block before the nonce once.
 */
export function mineRange(
  message: Uint8Array,
  nonceOffset: number,
  startNonce: number,
  count: number,
  targetZeros: number,
  hasher: MutableSha256d = new MutableSha256d(message, nonceOffset),
  stopZeros: number = targetZeros,
): MineRangeResult {
  const end = startNonce + count;
  if (startNonce < 0 || end > 0x1_0000_0000) {
    throw new RangeError('nonce range must fit in 32 bits');
  }
  let attempts = 0;
  let best: MineRangeFound | undefined;
  for (let nonce = startNonce; nonce < end; nonce++) {
    hasher.setUint32LE(nonceOffset, nonce);
    attempts++;
    const zeros = hasher.hashLeadingZeroNibbles();
    if (zeros < targetZeros || (best && zeros <= best.zeroCount)) continue;
    const txid = hasher.txid();
    let zeroCount = 0;
    while (zeroCount < txid.length && txid[zeroCount] === '0') zeroCount++;
    best = { nonce, txid, zeroCount };
    if (zeroCount >= stopZeros) return { attempts, best, stopped: true };
  }
  return { attempts, best, stopped: false };
}

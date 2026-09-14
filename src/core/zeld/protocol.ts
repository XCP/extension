/**
 * ZELD protocol facts the wallet relies on. Source: `zeldhash-protocol` (config.rs, helpers.rs,
 * protocol.rs) at https://github.com/zeldhash/zeldhash-protocol.
 *
 * - A non-coinbase transaction whose txid starts with at least `ZELD_MIN_ZERO_COUNT` hex zeros
 *   earns ZELD. The block's best txid earns 4,096 ZELD; every fewer zero divides that by 16.
 * - The reward attaches to the transaction's first non-OP_RETURN output, and so does any ZELD
 *   carried in by the inputs unless an OP_RETURN starting with `ZELD` redistributes it.
 * - Nothing else about the transaction matters: only the txid. That is why the wallet can hunt
 *   by varying nLockTime rather than adding an OP_RETURN nonce as the reference miner does: no
 *   extra bytes, and no second data output for Counterparty to trip on.
 */

/** Mainnet minimum leading hex zeros for a txid to earn ZELD. */
export const ZELD_MIN_ZERO_COUNT = 6;

/**
 * Once a qualifying txid is in hand the hunt keeps going for one with an extra zero, up to the
 * budget. A six-zero txid earns the full reward only when no seven-zero txid lands in the same
 * block, and that is common: over 219 recent rewarded blocks (`api.zeldhash.com/rewards`) the
 * best txid had six zeros in 60%, seven in 29% and eight or more in 11%, so the average six-zero
 * reward was 1,745 ZELD against 3,374 for seven. Eight over seven adds about a tenth for sixteen
 * times the work, so seven ends the hunt.
 */
export const ZELD_STOP_ZERO_COUNT = 7;

/** ZELD paid to the block's best txid, in base units (8 decimals). */
export const ZELD_BASE_REWARD = 4_096n * 10n ** 8n;

/** Longest hunt the wallet will run before signing, in seconds. */
export const MAX_ZELD_HUNT_SECONDS = 60;

/**
 * The nonce is nLockTime, with every input's nSequence set final. Consensus ignores nLockTime
 * entirely when all inputs are final (`IsFinalTx`), so any of the 2^32 values is valid, no
 * relative timelock can arise, and nothing signals replaceability. nLockTime is also the last
 * four bytes of the serialization, so the hasher keeps the SHA-256 state over everything before
 * it and each attempt costs one block plus the outer hash.
 */
export const FINAL_SEQUENCE = 0xffff_ffff;
export const LOCKTIME_NONCE_COUNT = 0x1_0000_0000;

/** Whether a seconds value is one the hunt setting accepts: a whole number from 0 to the cap. */
export function isValidZeldHuntSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    && value <= MAX_ZELD_HUNT_SECONDS;
}

/** Leading hex zeros of a txid as displayed. */
export function countLeadingZeroNibbles(txidHex: string): number {
  let count = 0;
  for (const char of txidHex.toLowerCase()) {
    if (char !== '0') break;
    count += 1;
  }
  return count;
}

/** Expected hashes to reach a zero count: 16 to the power of the count. */
export function expectedAttempts(zeroCount: number): number {
  return 16 ** zeroCount;
}

/**
 * ZELD protocol facts the wallet relies on. Source: `zeldhash-protocol` (config.rs, helpers.rs,
 * protocol.rs) at https://github.com/zeldhash/zeldhash-protocol.
 *
 * - A non-coinbase transaction whose txid starts with at least `ZELD_MIN_ZERO_COUNT` hex zeros
 *   earns ZELD. The block's best txid earns 4,096 ZELD; every fewer zero divides that by 16.
 * - The reward attaches to the transaction's first non-OP_RETURN output, and so does any ZELD
 *   carried in by the inputs unless an OP_RETURN starting with `ZELD` redistributes it.
 * - Nothing else about the transaction matters. In particular the protocol never reads
 *   nSequence, which is why the wallet can hunt by varying one input's sequence number rather
 *   than adding an OP_RETURN: no extra bytes, and no second data output for Counterparty to
 *   trip on.
 */

/** Mainnet minimum leading hex zeros for a txid to earn ZELD. */
export const ZELD_MIN_ZERO_COUNT = 6;

/** ZELD paid to the block's best txid, in base units (8 decimals). */
export const ZELD_BASE_REWARD = 4_096n * 10n ** 8n;

/** Longest hunt the wallet will run before signing, in seconds. */
export const MAX_ZELD_HUNT_SECONDS = 60;

/**
 * Nonces live in the top half of the 32-bit sequence space. Bit 31 set disables BIP68 relative
 * timelocks for every transaction version, so no nonce can accidentally impose one. Values below
 * 0xfffffffe also signal opt-in replaceability (BIP125), which a wallet-signed transaction can
 * tolerate: only its own signer can replace it.
 */
export const SEQUENCE_NONCE_BASE = 0x8000_0000;
export const SEQUENCE_NONCE_COUNT = 0x8000_0000;

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

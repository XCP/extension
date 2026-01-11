/**
 * Sweep Message Unpacker
 *
 * Message ID: 4
 * Legacy Format: ">21sB" + optional memo (22+ bytes)
 *   - destination (21s): 21 bytes - Packed destination address
 *   - flags (B): 1 byte - Sweep flags
 *   - memo: 0-34 bytes - Optional memo
 *
 * Flags:
 *   0x01 (FLAG_BALANCES): Include token balances
 *   0x02 (FLAG_OWNERSHIP): Include asset ownership
 *   0x04 (FLAG_BINARY_MEMO): Memo is binary (not text)
 *
 * Modern (Taproot) Format: CBOR2 encoded
 */

import { BinaryReader } from '../binary';
import { unpackAddress, PACKED_ADDRESS_LENGTH } from '../address';

/** Minimum length of sweep message (destination + flags) */
const SWEEP_MIN_LENGTH = 22;
/** Maximum memo length */
const MAX_MEMO_LENGTH = 34;

/** Sweep flags */
export const SweepFlags = {
  BALANCES: 0x01,      // Include token balances
  OWNERSHIP: 0x02,     // Include asset ownership
  BINARY_MEMO: 0x04,   // Memo is binary
} as const;

/**
 * Unpacked sweep data
 */
export interface SweepData {
  /** Destination Bitcoin address */
  destination: string;
  /** Raw flags byte */
  flags: number;
  /** Include token balances in sweep */
  sweepBalances: boolean;
  /** Include asset ownership in sweep */
  sweepOwnership: boolean;
  /** Memo is binary */
  memoIsBinary: boolean;
  /** Optional memo (as string if text, hex if binary) */
  memo?: string;
  /** Raw memo bytes */
  memoBytes?: Uint8Array;
}

/**
 * Unpack a sweep message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked sweep data
 * @throws Error if payload is invalid
 */
export function unpackSweep(payload: Uint8Array): SweepData {
  if (payload.length < SWEEP_MIN_LENGTH) {
    throw new Error(`Invalid sweep payload length: ${payload.length} (minimum ${SWEEP_MIN_LENGTH})`);
  }

  const memoLength = payload.length - SWEEP_MIN_LENGTH;
  if (memoLength > MAX_MEMO_LENGTH) {
    throw new Error(`Memo too long: ${memoLength} bytes (maximum ${MAX_MEMO_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const packedAddress = reader.readBytes(PACKED_ADDRESS_LENGTH);
  const flags = reader.readUint8();

  // Unpack destination address
  const destination = unpackAddress(packedAddress);

  // Parse flags
  const sweepBalances = (flags & SweepFlags.BALANCES) !== 0;
  const sweepOwnership = (flags & SweepFlags.OWNERSHIP) !== 0;
  const memoIsBinary = (flags & SweepFlags.BINARY_MEMO) !== 0;

  const result: SweepData = {
    destination,
    flags,
    sweepBalances,
    sweepOwnership,
    memoIsBinary,
  };

  // Read optional memo
  if (memoLength > 0) {
    result.memoBytes = reader.readBytes(memoLength);

    if (memoIsBinary) {
      // Binary memo - store as hex
      result.memo = Array.from(result.memoBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Try to decode as UTF-8 text
      try {
        result.memo = new TextDecoder('utf-8', { fatal: true }).decode(result.memoBytes);
      } catch {
        // Not valid UTF-8, store as hex
        result.memo = Array.from(result.memoBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    }
  }

  return result;
}

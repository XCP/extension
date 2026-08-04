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
 * Modern (taproot_support) Format: CBOR array
 *   [short_address_bytes, flags, memo_bytes]
 */

import { PACKED_ADDRESS_LENGTH, unpackAddress } from '@/core/counterparty/unpack/address';
import { BinaryReader, bytesToHex } from '@/core/counterparty/unpack/binary';
import { tryDecodeCborArray } from '@/core/counterparty/unpack/cbor';

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

/** Build the flag-derived fields shared by both decode paths. */
function sweepFromParts(destination: string, flags: number, memoBytes?: Uint8Array): SweepData {
  const memoIsBinary = (flags & SweepFlags.BINARY_MEMO) !== 0;

  const result: SweepData = {
    destination,
    flags,
    sweepBalances: (flags & SweepFlags.BALANCES) !== 0,
    sweepOwnership: (flags & SweepFlags.OWNERSHIP) !== 0,
    memoIsBinary,
  };

  if (memoBytes && memoBytes.length > 0) {
    result.memoBytes = memoBytes;
    // The flag says how to read the memo. Core decodes a non-binary one as strict UTF-8 and
    // aborts on invalid bytes; let it throw rather than masking with a hex fallback.
    result.memo = memoIsBinary
      ? bytesToHex(memoBytes)
      : new TextDecoder('utf-8', { fatal: true }).decode(memoBytes);
  }

  return result;
}

/**
 * Try to decode a CBOR-encoded sweep (taproot_support era).
 *
 * Format: [short_address_bytes, flags, memo_bytes]
 *
 * Returns null if the payload is not CBOR, so the caller falls back to legacy.
 */
function tryCborDecode(payload: Uint8Array): SweepData | null {
  const decoded = tryDecodeCborArray(payload, 3);
  if (!decoded) return null;

  const [addressValue, flagsValue, memoValue] = decoded;
  if (!(addressValue instanceof Uint8Array) || typeof flagsValue !== 'bigint') return null;

  const memoBytes = memoValue instanceof Uint8Array ? memoValue : undefined;
  return sweepFromParts(unpackAddress(addressValue), Number(flagsValue), memoBytes);
}

/**
 * Unpack a sweep message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked sweep data
 * @throws Error if payload is invalid
 */
export function unpackSweep(payload: Uint8Array): SweepData {
  // CBOR (taproot_support era) first, matching core's unpack order.
  const cborResult = tryCborDecode(payload);
  if (cborResult) {
    return cborResult;
  }

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
  const memoBytes = memoLength > 0 ? reader.readBytes(memoLength) : undefined;

  return sweepFromParts(unpackAddress(packedAddress), flags, memoBytes);
}

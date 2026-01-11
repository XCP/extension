/**
 * Broadcast Message Unpacker
 *
 * Message ID: 30
 * Format: ">IdI" (16 bytes minimum) + text
 *   - timestamp (I): 4 bytes unsigned int
 *   - value (d): 8 bytes double
 *   - fee_fraction_int (I): 4 bytes unsigned int
 *   - text: Variable length string
 *
 * Modern format uses CBOR encoding with additional fields.
 * Legacy format uses Pascal strings or variable-length encoding.
 */

import { BinaryReader } from '../binary';

/** Minimum length of broadcast message (timestamp + value + fee_fraction) */
const BROADCAST_MIN_LENGTH = 16; // 4 + 8 + 4

/**
 * Unpacked Broadcast data
 */
export interface BroadcastData {
  /** Unix timestamp of the broadcast */
  timestamp: number;
  /** Broadcast value (float) */
  value: number;
  /** Fee fraction as integer (divide by 1e8 for actual fraction) */
  feeFractionInt: number;
  /** Broadcast text content */
  text: string;
  /** MIME type (for modern CBOR format) */
  mimeType?: string;
}

/**
 * Try to decode CBOR-encoded broadcast (modern format)
 * Returns null if not CBOR format
 */
function tryDecodeCBOR(payload: Uint8Array): BroadcastData | null {
  try {
    // Basic CBOR array detection - starts with 0x85 (5-element array)
    if (payload[0] !== 0x85) {
      return null;
    }

    // For now, skip CBOR parsing and return null to fall back to legacy
    // Full CBOR parsing would require a CBOR library
    return null;
  } catch {
    return null;
  }
}

/**
 * Unpack a Broadcast message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked Broadcast data
 * @throws Error if payload is invalid
 */
export function unpackBroadcast(payload: Uint8Array): BroadcastData {
  if (payload.length < BROADCAST_MIN_LENGTH) {
    throw new Error(
      `Invalid broadcast payload length: ${payload.length} (minimum ${BROADCAST_MIN_LENGTH})`
    );
  }

  // Try CBOR first (modern format)
  const cborResult = tryDecodeCBOR(payload);
  if (cborResult) {
    return cborResult;
  }

  // Legacy format: ">IdI" + text
  const reader = new BinaryReader(payload);

  // Read struct fields
  const timestamp = reader.readUint32BE();

  // Read 8-byte double (IEEE 754)
  const valueBytes = reader.readBytes(8);
  const dataView = new DataView(valueBytes.buffer, valueBytes.byteOffset, 8);
  const value = dataView.getFloat64(0, false); // big-endian

  const feeFractionInt = reader.readUint32BE();

  // Read text - may use VarInt length prefix or Pascal string format
  let text = '';
  if (reader.remaining > 0) {
    // Try to read text with VarInt length prefix
    const remainingBytes = reader.readRemaining();

    // Check if first byte could be a VarInt length
    if (remainingBytes.length > 0) {
      const firstByte = remainingBytes[0];

      // If first byte + 1 equals remaining length, it's a Pascal string
      if (firstByte + 1 === remainingBytes.length) {
        // Pascal string format: length byte + content
        text = new TextDecoder('utf-8').decode(remainingBytes.slice(1, 1 + firstByte));
      } else if (firstByte < 0xfd && firstByte + 1 <= remainingBytes.length) {
        // VarInt format with single-byte length
        text = new TextDecoder('utf-8').decode(remainingBytes.slice(1, 1 + firstByte));
      } else {
        // Just decode all remaining as text
        text = new TextDecoder('utf-8').decode(remainingBytes);
      }
    }
  }

  return {
    timestamp,
    value,
    feeFractionInt,
    text,
  };
}

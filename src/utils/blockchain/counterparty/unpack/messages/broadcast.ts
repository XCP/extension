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
 * Modern (taproot_support) Format: CBOR array
 *   [timestamp, value, fee_fraction_int, mime_type, text]
 *
 * Legacy format uses Pascal strings or variable-length encoding.
 */

import { BinaryReader, bytesToTextOrHex } from '../binary';
import { tryDecodeCborArray } from '../cbor';

/** Minimum length of legacy broadcast message (timestamp + value + fee_fraction) */
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
 * Try to decode a CBOR-encoded broadcast (taproot_support era).
 *
 * Format: [timestamp, value, fee_fraction_int, mime_type, text]
 * where text is bytes (or null) and value may be an integer or float.
 *
 * Returns null if the payload is not CBOR, so the caller falls back to legacy.
 */
function tryDecodeCBOR(payload: Uint8Array): BroadcastData | null {
  const decoded = tryDecodeCborArray(payload, 5);
  if (!decoded) return null;

  const [timestampValue, valueValue, feeFractionValue, mimeTypeValue, textValue] = decoded;
  if (typeof timestampValue !== 'bigint' || typeof feeFractionValue !== 'bigint') return null;
  if (typeof valueValue !== 'bigint' && typeof valueValue !== 'number') return null;

  // Core encodes the text as bytes; a null means the broadcast carries none.
  let text = '';
  if (textValue instanceof Uint8Array) {
    text = bytesToTextOrHex(textValue);
  } else if (typeof textValue === 'string') {
    text = textValue;
  }

  return {
    timestamp: Number(timestampValue),
    value: Number(valueValue),
    feeFractionInt: Number(feeFractionValue),
    text,
    mimeType: typeof mimeTypeValue === 'string' && mimeTypeValue !== '' ? mimeTypeValue : undefined,
  };
}

/**
 * Unpack a Broadcast message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked Broadcast data
 * @throws Error if payload is invalid
 */
export function unpackBroadcast(payload: Uint8Array): BroadcastData {
  // CBOR (taproot_support era) first; it can be shorter than the legacy minimum.
  const cborResult = tryDecodeCBOR(payload);
  if (cborResult) {
    return cborResult;
  }

  if (payload.length < BROADCAST_MIN_LENGTH) {
    throw new Error(
      `Invalid broadcast payload length: ${payload.length} (minimum ${BROADCAST_MIN_LENGTH})`
    );
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
      const firstByte = remainingBytes[0]!;

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

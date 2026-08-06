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

import { BinaryReader, bytesToTextOrHex } from '@/core/counterparty/unpack/binary';
import { tryDecodeCborArray } from '@/core/counterparty/unpack/cbor';
import { toFiniteNumber } from "@/core/numeric";

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
/**
 * Read a Bitcoin varint from the front of `bytes`, the encoding core's VarIntSerializer uses:
 * a byte below 0xfd is the value itself, otherwise 0xfd/0xfe/0xff introduce a 2/4/8 byte
 * little-endian value.
 *
 * Returns prefixSize 0 when the prefix is truncated, which the caller treats as unreadable rather
 * than guessing a length.
 */
function readVarInt(bytes: Uint8Array): { textLength: number; prefixSize: number } {
  if (bytes.length === 0) return { textLength: 0, prefixSize: 0 };
  const first = bytes[0]!;
  if (first < 0xfd) return { textLength: first, prefixSize: 1 };

  const width = first === 0xfd ? 2 : first === 0xfe ? 4 : 8;
  if (bytes.length < 1 + width) return { textLength: 0, prefixSize: 0 };

  let value = 0n;
  for (let i = width; i >= 1; i -= 1) value = (value << 8n) | BigInt(bytes[i]!);
  // A length beyond what a transaction can carry cannot be honoured; report it as unreadable.
  if (value > BigInt(bytes.length)) return { textLength: Number.MAX_SAFE_INTEGER, prefixSize: 1 + width };
  return { textLength: Number(value), prefixSize: 1 + width };
}

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
    feeFractionInt: toFiniteNumber(feeFractionValue) ?? 0,
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

  // Read the text exactly as core does since broadcast_pack_text (block 423888): read a Bitcoin
  // varint length, then take the LAST `textlen` bytes — `text = rawtext[-textlen:]` in
  // broadcast.py, followed by `assert len(text) == textlen`.
  //
  // Taking the bytes immediately after the length prefix instead — which is what this did — agrees
  // with core only when the payload is exactly a prefix followed by its text. Pad it and the two
  // diverge while core still accepts the message: for varint(3) || "ABCDEF" the chain records
  // "DEF" and this screen displayed "ABC", both chosen by whoever built the transaction. The
  // API cross-check could not catch it either, because verifyBroadcast never compares the text.
  let text = '';
  if (reader.remaining > 0) {
    const rawText = reader.readRemaining();
    const { textLength, prefixSize } = readVarInt(rawText);

    if (textLength === 0) {
      text = '';
    } else if (prefixSize === 0 || textLength > rawText.length - prefixSize) {
      // Core's assert would fail here, so there is no honest reading of these bytes as text.
      throw new Error(
        `Broadcast text length ${textLength} does not fit in ${rawText.length - prefixSize} bytes`
      );
    } else {
      text = new TextDecoder('utf-8').decode(rawText.slice(rawText.length - textLength));
    }
  }

  return {
    timestamp,
    value,
    feeFractionInt,
    text,
  };
}

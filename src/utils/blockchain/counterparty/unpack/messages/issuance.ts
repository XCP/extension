/**
 * Issuance Message Unpacker
 *
 * Message IDs: 20, 21, 22, 23
 *   20 = Standard issuance
 *   21 = Subasset issuance
 *   22 = Lock/Reset issuance
 *   23 = Lock/Reset subasset
 *
 * Multiple formats exist depending on protocol version:
 *
 * FORMAT_1: ">QQ?" (17 bytes) - Very old
 *   - asset_id, quantity, divisible
 *
 * FORMAT_2: ">QQ??If" (26 bytes) - With callable/call_date/call_price
 *   - asset_id, quantity, divisible, callable, call_date, call_price, description
 *
 * SUBASSET_FORMAT: ">QQ?B" + compacted_subasset + description
 *   - asset_id, quantity, divisible, compacted_length, compacted_name, description
 *
 * Modern (taproot_support): CBOR array
 *   Standard: [asset_id, quantity, divisible, lock, reset, mime_type, description]
 *   Subasset: [asset_id, quantity, divisible, lock, reset,
 *              compacted_length, compacted_name, mime_type, description]
 */

import { BinaryReader, bytesToTextOrHex } from '../binary';
import { assetIdToName } from '../assetId';
import { MessageTypeId } from '../messageTypes';
import { tryDecodeCborArray, type CborValue } from '../cbor';

/** Minimum length of issuance (FORMAT_1) */
const MIN_ISSUANCE_LENGTH = 17;

/**
 * Unpacked issuance data
 */
export interface IssuanceData {
  /** Asset name (e.g., "MYASSET", "A12345678") */
  asset: string;
  /** Asset ID (numeric) */
  assetId: bigint;
  /** Quantity to issue in base units */
  quantity: bigint;
  /** Whether the asset is divisible */
  divisible: boolean;
  /** Whether the asset is callable (deprecated) */
  callable?: boolean;
  /** Call date for callable assets (deprecated) */
  callDate?: number;
  /** Call price for callable assets (deprecated) */
  callPrice?: number;
  /** Asset description */
  description?: string;
  /** Subasset long name (for subasset issuances) */
  subassetLongname?: string;
  /** Whether this is a lock operation */
  isLock?: boolean;
  /** Whether this is a reset operation */
  isReset?: boolean;
  /** Message type ID */
  messageTypeId: number;
}

/**
 * Decode compacted subasset name.
 * Subassets use a variable-length encoding.
 */
function decodeCompactedSubasset(bytes: Uint8Array): string {
  // Compacted subasset names are a base-68 big-endian integer over the
  // SUBASSET_DIGITS charset, where digit value d maps to SUBASSET_DIGITS[d-1]
  // and d === 0 maps to the final character (Python's DIGITS[-1]).
  const SUBASSET_DIGITS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_@!';

  let integer = 0n;
  for (const byte of bytes) {
    integer = (integer << 8n) | BigInt(byte);
  }

  let result = '';
  while (integer !== 0n) {
    const digit = Number(integer % 68n);
    result = SUBASSET_DIGITS[digit === 0 ? SUBASSET_DIGITS.length - 1 : digit - 1] + result;
    integer /= 68n;
  }
  return result;
}

/** Coerce a CBOR boolean-or-integer flag (core encodes both) to boolean. */
function cborFlag(value: CborValue): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value !== 0n;
  return null;
}

/** A CBOR description field is bytes, or null when the issuance carries none. */
function cborDescription(value: CborValue): string | undefined {
  return value instanceof Uint8Array ? bytesToTextOrHex(value) : undefined;
}

/**
 * Try to decode a CBOR-encoded issuance (taproot_support era).
 *
 * Standard (IDs 20/22): [asset_id, quantity, divisible, lock, reset, mime_type, description]
 * Subasset (IDs 21/23): [asset_id, quantity, divisible, lock, reset,
 *                        compacted_length, compacted_name, mime_type, description]
 *
 * Returns null if the payload is not CBOR, so the caller falls back to legacy parsing.
 */
function tryCborDecode(payload: Uint8Array, messageTypeId: number): IssuanceData | null {
  const isSubasset = messageTypeId === MessageTypeId.SUBASSET_ISSUANCE ||
                     messageTypeId === MessageTypeId.LR_SUBASSET;

  const decoded = tryDecodeCborArray(payload, isSubasset ? 9 : 7);
  if (!decoded) return null;

  const [assetIdValue, quantityValue, divisibleValue, lockValue, resetValue] = decoded;
  if (typeof assetIdValue !== 'bigint' || typeof quantityValue !== 'bigint') return null;
  const divisible = cborFlag(divisibleValue ?? null);
  const lock = cborFlag(lockValue ?? null);
  const reset = cborFlag(resetValue ?? null);
  if (divisible === null || lock === null || reset === null) return null;

  const result: IssuanceData = {
    asset: assetIdToName(assetIdValue),
    assetId: assetIdValue,
    quantity: quantityValue,
    divisible,
    isLock: lock,
    isReset: reset,
    messageTypeId,
  };

  if (isSubasset) {
    const compactedName = decoded[6];
    if (compactedName instanceof Uint8Array) {
      result.subassetLongname = decodeCompactedSubasset(compactedName);
    }
    result.description = cborDescription(decoded[8] ?? null);
  } else {
    result.description = cborDescription(decoded[6] ?? null);
  }

  return result;
}

/**
 * Unpack an issuance message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @param messageTypeId - The message type ID (20, 21, 22, or 23)
 * @returns Unpacked issuance data
 * @throws Error if payload is invalid
 */
export function unpackIssuance(payload: Uint8Array, messageTypeId: number): IssuanceData {
  // CBOR (taproot_support era) first, matching core's unpack order.
  const cborResult = tryCborDecode(payload, messageTypeId);
  if (cborResult) {
    return cborResult;
  }

  if (payload.length < MIN_ISSUANCE_LENGTH) {
    throw new Error(`Invalid issuance payload length: ${payload.length} (minimum ${MIN_ISSUANCE_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const assetId = reader.readUint64BE();
  const quantity = reader.readUint64BE();
  const divisibleByte = reader.readUint8();
  const divisible = divisibleByte !== 0;

  // Convert asset ID to name
  const asset = assetIdToName(assetId);

  const result: IssuanceData = {
    asset,
    assetId,
    quantity,
    divisible,
    messageTypeId,
  };

  // Check for subasset format (ID 21 or 23)
  const isSubasset = messageTypeId === MessageTypeId.SUBASSET_ISSUANCE ||
                     messageTypeId === MessageTypeId.LR_SUBASSET;

  // Check for lock/reset format (ID 22 or 23)
  const isLockReset = messageTypeId === MessageTypeId.LR_ISSUANCE ||
                      messageTypeId === MessageTypeId.LR_SUBASSET;

  result.isLock = isLockReset;
  result.isReset = isLockReset;

  if (isSubasset && reader.remaining > 0) {
    // Read subasset compacted name length
    const compactedLength = reader.readUint8();
    if (compactedLength > 0 && reader.remaining >= compactedLength) {
      const compactedBytes = reader.readBytes(compactedLength);
      result.subassetLongname = decodeCompactedSubasset(compactedBytes);
    }
  } else if (!isSubasset && reader.remaining > 0) {
    // Try to read callable fields (FORMAT_2)
    // callable (1 byte), call_date (4 bytes), call_price (4 bytes float)
    if (reader.remaining >= 9) {
      const callableByte = reader.readUint8();
      result.callable = callableByte !== 0;
      result.callDate = reader.readUint32BE();

      // Read call_price as 4-byte float
      const callPriceBytes = reader.readBytes(4);
      const view = new DataView(callPriceBytes.buffer, callPriceBytes.byteOffset, 4);
      result.callPrice = view.getFloat32(0, false); // big-endian
    }
  }

  // Read remaining bytes as description
  if (reader.remaining > 0) {
    const descBytes = reader.readRemaining();
    try {
      result.description = new TextDecoder('utf-8', { fatal: true }).decode(descBytes);
    } catch {
      // Not valid UTF-8, store as hex
      result.description = Array.from(descBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }

  return result;
}

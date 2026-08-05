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

import { assetIdToName } from '@/core/counterparty/unpack/assetId';
import { BinaryReader, bytesToTextOrHex } from '@/core/counterparty/unpack/binary';
import { type CborValue, tryDecodeCborArray } from '@/core/counterparty/unpack/cbor';
import { MessageTypeId } from '@/core/counterparty/unpack/messageTypes';

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
  /** MIME type of the description content (CBOR formats carry it; legacy formats have none) */
  mimeType?: string;
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
  // Bound the input before the O(n^2) bigint fold below. The legacy encoding caps this at a single
  // length byte (255); the CBOR path has no such cap, so an attacker could hand a 250 KB byte
  // string and hang the popup's main thread for minutes. A real subasset longname is far under 255
  // bytes, so anything larger is malformed — throw, and the unpacker's caller treats it as a failed
  // decode (fail closed) rather than an ordinary transfer.
  if (bytes.length > 255) {
    throw new Error(`Subasset name too long: ${bytes.length} bytes`);
  }

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

  // The wire carries "" for the default MIME type; only a stated one is reported.
  const mimeType = decoded[isSubasset ? 7 : 5];
  if (typeof mimeType === 'string' && mimeType !== '') {
    result.mimeType = mimeType;
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

  // Mainnet's legacy serialization has been ">QQ???" (19 bytes: asset_id, quantity, divisible,
  // lock, reset) for standard issuances and ">QQ???B" (20 bytes, name length last) for subassets
  // since block 753500 — protocol_changes.json issuance_asset_serialization_format /
  // issuance_subasset_serialization_format. The callable/call_date/call_price triple belongs to
  // the pre-753500 ">QQ??If" format and has not been on the wire for years.
  //
  // Reading the old shape here consumed lock and reset plus the first seven bytes of the
  // description as call fields, so the description was truncated and the call values were
  // invented from unrelated bytes. lock and reset were taken from the message type id instead of
  // from the wire, which is wrong in both directions: a type 20 carrying lock=1 reported false,
  // and a type 22 carrying lock=0 reported true. For subassets the name-length byte was read at
  // offset 17 — the lock byte — rather than at 19.
  const lockByte = reader.remaining > 0 ? reader.readUint8() : 0;
  const resetByte = reader.remaining > 0 ? reader.readUint8() : 0;
  result.isLock = lockByte !== 0;
  result.isReset = resetByte !== 0;

  if (isSubasset) {
    // Length of the compacted name, then the name itself. Core treats a length that overruns the
    // payload as invalid (description_length < 0 raises UnpackError), so it is refused here too
    // rather than silently skipped.
    if (reader.remaining < 1) {
      throw new Error('Subasset issuance missing compacted name length');
    }
    const compactedLength = reader.readUint8();
    if (compactedLength > reader.remaining) {
      throw new Error(
        `Subasset compacted name length ${compactedLength} exceeds ${reader.remaining} remaining bytes`
      );
    }
    if (compactedLength > 0) {
      const compactedBytes = reader.readBytes(compactedLength);
      result.subassetLongname = decodeCompactedSubasset(compactedBytes);
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

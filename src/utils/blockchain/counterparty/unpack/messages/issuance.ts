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
 * Modern (Taproot): CBOR2 encoded
 *
 * This unpacker handles the most common formats.
 */

import { BinaryReader } from '../binary';
import { assetIdToName } from '../assetId';
import { MessageTypeId } from '../messageTypes';

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
  // Subasset names are encoded as a series of bytes where each character
  // is mapped to a value 1-68 (for the SUBASSET_DIGITS charset)
  const SUBASSET_DIGITS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_@!';

  let result = '';
  for (const byte of bytes) {
    if (byte === 0) break; // Null terminator
    if (byte <= SUBASSET_DIGITS.length) {
      result += SUBASSET_DIGITS[byte - 1];
    }
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

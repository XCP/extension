/**
 * Enhanced Send Message Unpacker
 *
 * Message ID: 2
 * Legacy Format: ">QQ21s" + memo (37+ bytes)
 *   - asset_id (Q): 8 bytes - Numeric asset identifier
 *   - quantity (Q): 8 bytes - Amount in base units
 *   - destination (21s): 21 bytes - Packed destination address
 *   - memo: 0-34 bytes - Optional memo
 *
 * Modern (Taproot) Format: CBOR2 encoded array
 *   [asset_id, quantity, short_address_bytes, memo_bytes]
 *
 * The unpacker attempts CBOR2 first, then falls back to legacy format.
 */

import { BinaryReader } from '../binary';
import { assetIdToName } from '../assetId';
import { unpackAddress, PACKED_ADDRESS_LENGTH } from '../address';

/** Minimum length of legacy enhanced send (without memo) */
const MIN_LEGACY_LENGTH = 8 + 8 + 21; // 37 bytes
/** Maximum memo length */
const MAX_MEMO_LENGTH = 34;

/**
 * Unpacked enhanced send data
 */
export interface EnhancedSendData {
  /** Asset name (e.g., "XCP", "PEPECASH") */
  asset: string;
  /** Asset ID (numeric) */
  assetId: bigint;
  /** Quantity in base units */
  quantity: bigint;
  /** Destination Bitcoin address */
  destination: string;
  /** Optional memo (as string if text, hex if binary) */
  memo?: string;
  /** Raw memo bytes */
  memoBytes?: Uint8Array;
}

/**
 * Try to decode CBOR2 format (modern Taproot-era messages).
 * Returns null if not valid CBOR2.
 */
function tryCbor2Decode(payload: Uint8Array): EnhancedSendData | null {
  // CBOR2 arrays start with specific bytes:
  // 0x84 = array of 4 elements
  // 0x83 = array of 3 elements
  if (payload.length < 4) return null;
  if (payload[0] !== 0x84 && payload[0] !== 0x83) return null;

  try {
    // Simple CBOR2 decoder for the specific format we expect
    // Full CBOR2 parsing would require a library, but we can handle
    // the specific case of [bigint, bigint, bytes, bytes]

    // For now, return null and use legacy parsing
    // TODO: Implement CBOR2 parsing if needed
    return null;
  } catch {
    return null;
  }
}

/**
 * Unpack an enhanced send message using legacy format.
 */
function unpackLegacy(payload: Uint8Array): EnhancedSendData {
  if (payload.length < MIN_LEGACY_LENGTH) {
    throw new Error(`Invalid enhanced send payload length: ${payload.length} (minimum ${MIN_LEGACY_LENGTH})`);
  }

  const memoLength = payload.length - MIN_LEGACY_LENGTH;
  if (memoLength > MAX_MEMO_LENGTH) {
    throw new Error(`Memo too long: ${memoLength} bytes (maximum ${MAX_MEMO_LENGTH})`);
  }

  const reader = new BinaryReader(payload);

  const assetId = reader.readUint64BE();
  const quantity = reader.readUint64BE();
  const packedAddress = reader.readBytes(PACKED_ADDRESS_LENGTH);

  let memoBytes: Uint8Array | undefined;
  let memo: string | undefined;

  if (memoLength > 0) {
    memoBytes = reader.readBytes(memoLength);
    // Try to decode as UTF-8 text
    try {
      memo = new TextDecoder('utf-8', { fatal: true }).decode(memoBytes);
    } catch {
      // Not valid UTF-8, store as hex
      memo = Array.from(memoBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }

  // Convert asset ID to name
  const asset = assetIdToName(assetId);

  // Unpack destination address
  const destination = unpackAddress(packedAddress);

  return {
    asset,
    assetId,
    quantity,
    destination,
    memo,
    memoBytes,
  };
}

/**
 * Unpack an enhanced send message.
 *
 * @param payload - Message payload (after prefix and type ID)
 * @returns Unpacked enhanced send data
 * @throws Error if payload is invalid
 */
export function unpackEnhancedSend(payload: Uint8Array): EnhancedSendData {
  // Try CBOR2 format first (modern Taproot-era)
  const cbor2Result = tryCbor2Decode(payload);
  if (cbor2Result) {
    return cbor2Result;
  }

  // Fall back to legacy format
  return unpackLegacy(payload);
}
